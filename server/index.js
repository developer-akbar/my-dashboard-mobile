/**
 * My Dashboard — Local API Server
 *
 * Runs at http://localhost:4100 alongside the Vite dev server.
 * The Vite proxy forwards /api/* → http://localhost:4100/api/*.
 *
 * On Android (Capacitor), point VITE_API_URL to this machine's LAN IP,
 * e.g. http://192.168.1.x:4100/api — or run the server on the same machine
 * you deploy to.
 *
 * REST endpoints:
 *   GET  /api/services              → list all active services (slim DTO)
 *   GET  /api/services/trash        → list trash
 *   POST /api/services/validate     → validate a service number (1 APSPDCL call)
 *   POST /api/services/:id/refresh  → fetch + process bill data (2 APSPDCL calls)
 *   POST /api/services/refresh-all  → refresh all (sequential, 2 calls each)
 *
 * NOTE: This server has NO database. It is a pure processing proxy.
 * Persistence (IndexedDB / SQLite) stays in the client as before.
 * The server only:
 *   1. Calls raw APSPDCL endpoints
 *   2. Processes + normalises the response
 *   3. Returns a clean, minimal DTO
 */

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { solveCaptchaImage } from './utils/billdesk/ocr.js';
import { scrapeBillDeskSession } from './utils/billdesk/session.js';

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 4100;

app.use(cors());
app.use(express.json());

// ── APSPDCL raw client (server-side only) ─────────────────────────────────────

const APSPDCL_BASE = 'https://apspdcl.in/ConsumerDashboard/public';
const BILLDESK_URL = 'https://payments.billdesk.com/MercOnline/SPDCLController';

/**
 * Standard POST helper for APSPDCL Consumer Dashboard endpoints.
 */
async function apspdclPost(endpoint, serviceNumber) {
  const res = await fetch(`${APSPDCL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ uscno: String(serviceNumber) }).toString(),
  });
  if (!res.ok) throw new Error(`APSPDCL ${endpoint} responded with ${res.status}`);
  const text = await res.text();
  if (!text || !text.trim()) return { data: [] };
  try { 
    const data = JSON.parse(text);
    if (data.status === 'error' && data.message) {
      const err = new Error(data.message);
      err.apiStatus = 'error';
      throw err;
    }
    return data;
  }
  catch (err) {
    if (err.apiStatus === 'error') throw err;
    throw new Error(`APSPDCL ${endpoint} returned invalid response`);
  }
}

/**
 * High-level BillDesk fetcher with auto-solve fallback.
 */
async function fetchBillDeskBill(serviceNumber, billdeskSession) {
  if (billdeskSession) {
    const { reqtoken, captcha, cookie } = billdeskSession;
    return await executeBillDeskRequest(serviceNumber, reqtoken, captcha, cookie);
  }

  // Auto-solve with retries if no session provided (e.g. background refresh)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const baseCookie = process.env.BILLDESK_COOKIE || process.env.BILLDESK_COOKIES || '';
      const session = await scrapeBillDeskSession(baseCookie);
      const captchaText = await solveCaptchaImage(session.cookie);
      
      if (!captchaText || captchaText.length < 5) continue;

      const html = await executeBillDeskRequestRaw(serviceNumber, session.reqtoken, captchaText, session.cookie);
      const htmlLower = html.toLowerCase();
      
      if (htmlLower.includes('wrong captcha') || htmlLower.includes('invalid captcha') || htmlLower.includes('incorrect captcha') || htmlLower.includes('enter valid captcha')) {
         continue;
      }
      return parseBillDeskHtml(html);
    } catch (err) {
      console.error(`[api] fetchBillDeskBill attempt ${attempt} error:`, err);
    }
  }
  return null;
}

/**
 * Raw POST request to BillDesk SPDCL controller.
 */
async function executeBillDeskRequestRaw(serviceNumber, reqtoken, jcaptchaVal, cookie) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://payments.billdesk.com',
    'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController',
    'User-Agent': 'Mozilla/5.0',
  };
  if (cookie) headers.Cookie = cookie;

  const body = new URLSearchParams({
    reqid: 'confirm',
    reqtoken: reqtoken || '',
    txtCustomerID: String(serviceNumber),
    jcaptchaVal: jcaptchaVal || '',
  }).toString();

  const res = await fetch(BILLDESK_URL, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`BillDesk responded with ${res.status}`);
  return await res.text();
}

/**
 * Execute BillDesk request and parse the result.
 */
async function executeBillDeskRequest(serviceNumber, reqtoken, jcaptchaVal, cookie) {
  const html = await executeBillDeskRequestRaw(serviceNumber, reqtoken, jcaptchaVal, cookie);
  return parseBillDeskHtml(html);
}

/**
 * Regex-based parser for BillDesk consumer detail HTML.
 */
function parseBillDeskHtml(html) {
  const parseField = (label) => {
    const patterns = [
      // 1. Label in TD, Value in next TD (with or without colon)
      new RegExp(`<td[^>]*>\\s*${label}\\s*[:\\-]?\\s*</td>\\s*<td[^>]*>([^<]+)</td>`, 'i'),
      // 2. Label in TH, Value in next TD
      new RegExp(`<th[^>]*>\\s*${label}\\s*[:\\-]?\\s*</th>\\s*<td[^>]*>([^<]+)</td>`, 'i'),
      // 3. Label and Value in same cell or text block (e.g. "Label: Value")
      // Must follow a tag closing or newline to avoid attribute matching
      new RegExp(`(?:>|\\n)\\s*${label}\\s*[:\\-]\\s*([^<\\n\\(]+)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1].trim()) {
        const val = match[1].trim().replace(/\s+/g, ' ');
        // Final safety check: if it looks like HTML code, skip it
        if (val.includes('<') || val.includes('="') || val.includes('viewport')) continue;
        return val;
      }
    }
    return null;
  };

  const parseNumber = (value) => {
    if (value == null) return null;
    const normalized = String(value).replace(/[^0-9.]/g, '').trim();
    return normalized === '' ? null : Number(normalized);
  };

  const customerName = parseField('Customer Name') || parseField('Consumer Name');
  const uniqueServiceNumber = parseField('Unique Service Number') || parseField('Service Number');
  const divisionCode = parseField('Division Code');
  const circleName = parseField('Circle Name');
  const billAmount = parseNumber(parseField('Bill Amount'));
  const currentDemand = parseNumber(parseField('Current Demand'));
  const rawBillDate = parseField('Bill Date');
  const rawBillTime = parseField('Bill Time') || parseField('Generation Time') || parseField('Reading Time') || parseField('Reading Date');
  const rawDueDate = parseField('Due Date');

  // Deep extract time (HHMM) from available fields for UPI QR accuracy
  let extractedTime = null;
  const timeRegex = /(\d{1,2})[:](\d{2})/;
  if (rawBillTime && timeRegex.test(rawBillTime)) {
    const match = rawBillTime.match(timeRegex);
    extractedTime = match[0].replace(':', '');
  } else if (rawBillDate && timeRegex.test(rawBillDate)) {
    const match = rawBillDate.match(timeRegex);
    extractedTime = match[0].replace(':', '');
  }

  console.log('[api] BillDesk parse candidates', {
    customerName,
    uniqueServiceNumber,
    divisionCode,
    circleName,
    billAmount,
    currentDemand,
    rawBillDate,
    rawBillTime,
    extractedTime,
  });

  const billDeskAmount = currentDemand === 0 ? 0 : (currentDemand ?? billAmount ?? null);

  return {
    customerName,
    uniqueServiceNumber,
    divisionCode,
    circleName,
    billDeskAmount,
    billDeskBillAmount: billAmount,
    billDeskCurrentDemand: currentDemand,
    billDeskIsPaid: currentDemand === 0,
    billDeskBillDate: rawBillDate,
    billDeskBillTime: extractedTime,
    billDeskDueDate: rawDueDate,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_MAP = {
  JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,
  JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11,
};

/**
 * Intelligent date parser for APSPDCL (DD-MMM-YY) and BillDesk (DD/MM/YY) formats.
 * Prevents locale-dependent day/month swapping.
 */
function parseDate(v, timeStr) {
  if (!v) return null;
  const original = String(v).trim();
  const fullStr = original.toUpperCase();

  let d, m, y;

  // 1. Match DD-MMM-YY (e.g. 02-MAY-26) or DD-MMM-YYYY
  const mmmMatch = fullStr.match(/^(\d{1,2})-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{2,4})/);
  if (mmmMatch) {
    d = parseInt(mmmMatch[1], 10);
    m = MONTH_MAP[mmmMatch[2]];
    y = parseInt(mmmMatch[3], 10);
    if (y < 100) y += 2000;
  } 
  // 2. Match DD/MM/YY (e.g. 02/05/26) or DD/MM/YYYY
  else {
    const slashMatch = fullStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (slashMatch) {
      d = parseInt(slashMatch[1], 10);
      m = parseInt(slashMatch[2], 10) - 1;
      y = parseInt(slashMatch[3], 10);
      if (y < 100) y += 2000;
    }
  }

  // If manual parsing succeeded, create Date object in UTC
  if (d !== undefined && m !== undefined && m >= 0 && m <= 11 && y !== undefined) {
    const date = new Date(Date.UTC(y, m, d));
    if (timeStr) {
      const tMatch = String(timeStr).match(/(\d{1,2})[:](\d{2})/);
      if (tMatch) date.setUTCHours(parseInt(tMatch[1], 10), parseInt(tMatch[2], 10));
    }
    return date;
  }

  // 3. Fallback to standard JS parsing for anything else (e.g. YYYY-MM-DD)
  let fallbackStr = original;
  if (timeStr && !fallbackStr.includes(':')) fallbackStr += ' ' + String(timeStr).trim();
  const ts = Date.parse(fallbackStr.replace(/-/g, ' '));
  return isNaN(ts) ? null : new Date(ts);
}

function toNum(v) {
  const n = Number(String(v || '0').replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

/**
 * Maps raw APSPDCL bill row to unified DTO.
 */
function normaliseBill(row) {
  // Deep search for time in APSPDCL raw fields
  const rawDateWithTime = row.reading_date || row.readingdate || row.bill_gen_time || row.closingDate || '';
  const timeMatch = rawDateWithTime.match(/(\d{1,2})[:](\d{2})/);
  const extractedTime = timeMatch ? timeMatch[0].replace(':', '') : null;

  return {
    closingDate:  parseDate(row.closingDate || row.reading_date),
    closingTime:  extractedTime,
    dueDate:      parseDate(row.duedate || row.due_date),
    billedUnits:  toNum(row.billedUnits || row.units),
    billAmount:   toNum(row.billAmount || row.amount),
    ec:    toNum(row.ec),
    fixchg:toNum(row.fixchg),
    cc:    toNum(row.cc),
    ed:    toNum(row.ed),
    fsa:   toNum(row.fsa),
    irda:  toNum(row.irda),
    othchg:toNum(row.othchg),
    sur:   toNum(row.sur),
    isd:   toNum(row.isd),  // Initial Security Deposit
    category: row.category,
    closingRdg: toNum(row.closingRdg),
    ctrLoad: toNum(row.ctrLoad),
  };
}

/**
 * Matches payment records against bills to determine real-time status.
 */
function analysePayments(rawPayments, bills, currentBillAmountOverride = null) {
  const empty = { isPaid:false, paidDate:null, receiptNumber:null, paidAmount:null, currentPaymentTotal:0, arrears:[], arrearsTotal:0, divname: null, secname: null };
  if (!Array.isArray(rawPayments) || !rawPayments.length || !bills?.length) {
    if (Array.isArray(rawPayments) && rawPayments.length > 0) {
       return { ...empty, divname: rawPayments[0].divname, secname: rawPayments[0].secname };
    }
    return empty;
  }

  const latest     = bills[0];
  const billDate   = latest.closingDate;
  const billAmount = currentBillAmountOverride ?? latest.billAmount;

  const payments = rawPayments
    .map(p => ({
      date:      parseDate(p.prdate),
      amount:    toNum(p.billamt),
      counter:   p.counter,
      receiptNo: p.prno || null
    }))
    .filter(p => p.date)
    .sort((a, b) => b.date - a.date);

  // ── Is current bill fully paid? ──────────────────────────────────────────
  const paymentsAsc = [...payments].sort((a, b) => a.date - b.date);
  let currentTotal = 0;
  let currentPaidDate = null;
  let currentReceiptNo = null;
  for (const p of paymentsAsc) {
    if (p.date < billDate) continue;  // Ignore payments before bill closes
    currentTotal += p.amount;
    currentPaidDate = p.date;
    currentReceiptNo = p.receiptNo;
  }

  // If there are any payments after the bill closes, we consider it paid.
  // This handles cases where the paid amount is slightly less than the bill amount due to ISD adjustments
  // (e.g. paid 2139 for a 2174 bill) and the BillDesk API is unavailable to provide the exact demand.
  if (currentTotal > 0) {
    return {
      isPaid: true,
      paidDate: currentPaidDate,
      receiptNumber: currentReceiptNo,
      paidAmount: currentTotal,
      currentPaymentTotal: currentTotal,
      arrears: [],
      arrearsTotal: 0,
      divname: rawPayments[0].divname,
      secname: rawPayments[0].secname
    };
  }

  // ── Current bill not paid. Find arrears (advance payments for current bill). ──
  let arrears = [];
  if (bills.length > 1) {
    const prevBill = bills[1];
    const prevDate = prevBill.closingDate;
    const prevAmount = prevBill.billAmount;

    // Find which payments settle the previous bill
    // These are payments after prev bill closed but before current bill closes,
    // accumulated until reaching prev bill's amount
    const prevSettlePayments = [];
    let prevAccum = 0;
    for (const p of paymentsAsc) {
      if (p.date <= prevDate || p.date >= billDate) continue;
      prevSettlePayments.push(p);
      prevAccum += p.amount;
      if (prevAccum >= prevAmount) break;
    }

    const prevSettleSet = new Set(prevSettlePayments);
    arrears = payments.filter(p => {
      if (p.date <= prevDate || p.date >= billDate) return false;
      return !prevSettleSet.has(p);
    });
  }

  const arrearsTotal = arrears.reduce((s, p) => s + p.amount, 0);
  const latestPayment = payments[0];

  return {
    isPaid: false,
    paidDate: currentPaidDate || latestPayment?.date || null,
    receiptNumber: currentReceiptNo || latestPayment?.receiptNo || null,
    paidAmount: currentTotal > 0 ? currentTotal : latestPayment?.amount || null,
    currentPaymentTotal: currentTotal,
    arrears,
    arrearsTotal,
    divname: rawPayments[0].divname,
    secname: rawPayments[0].secname
  };
}

/**
 * Detailed bill breakup calculator.
 */
function buildBreakup(bill, arrearPayments, arrearsTotal, currentPaymentTotal = 0, finalBillAmount = null, isdAmount = 0) {
  // Calculate Gross Total as sum of components
  const grossTotal = toNum(bill.ec) + toNum(bill.fixchg) + toNum(bill.cc) + toNum(bill.ed) + toNum(bill.fsa);
  const roundedGrossTotal = Math.round(grossTotal);

  // Net Due = Gross Total - Arrears + isdAmount
  const netDue = Math.max(0, roundedGrossTotal - arrearsTotal + isdAmount);

  return {
    ec:      bill.ec,
    fixchg:  bill.fixchg,
    cc:      bill.cc,
    ed:      bill.ed,
    fsa:     bill.fsa,
    isd:     isdAmount,                        // Reconciled Initial Security Deposit
    isdOriginal: toNum(bill.isd),             // APSPDCL-reported deposit value
    grossTotal:        roundedGrossTotal,
    currentMonthBill:  roundedGrossTotal,
    arrears:           arrearsTotal,
    arrearPayments,
    arrearsTotal,
    isdAmount,
    totalBill:         netDue,
    netDue:            netDue,
  };
}

/**
 * Migration helper for old 23233... series.
 */
function getMigratedNumber(sn) {
  if (!sn || sn.length !== 13) return null;
  // The user specifically requested: 23233... -> 55513...
  if (sn.startsWith('23233')) {
    return '55513' + sn.substring(5);
  }
  return null;
}

/**
 * Core processor: given a service number, fetch from APSPDCL and return a clean snapshot DTO.
 * Returns null if the service number is unknown / has no data.
 * Throws only on network failures.
 */
async function buildSnapshot(serviceNumber, billdeskSession) {
  // 1. Initial BillDesk check with original number
  let billDeskData = null;
  let billDeskError = null;
  let activeNumber = serviceNumber;
  let migratedServiceNumber = null;

  try {
    billDeskData = await fetchBillDeskBill(serviceNumber, billdeskSession);
  } catch (error) {
    billDeskError = 'Connection failed';
  }

  // 2. Migration Logic: If original fails, try migrated number
  if (!billDeskData) {
    const candidate = getMigratedNumber(serviceNumber);
    if (candidate) {
      console.log(`[api] Attempting migration check: ${serviceNumber} -> ${candidate}`);
      try {
        const migratedData = await fetchBillDeskBill(candidate, billdeskSession);
        if (migratedData) {
          billDeskData = migratedData;
          activeNumber = candidate;
          migratedServiceNumber = candidate;
          console.log(`[api] Migration confirmed: ${serviceNumber} -> ${activeNumber}`);
        }
      } catch (err) {
        console.warn(`[api] Migration check failed for ${candidate}`, err);
      }
    }
  }

  // Also check if the successful BillDesk call itself suggested a migration
  const billDeskUnique = billDeskData?.uniqueServiceNumber;
  if (billDeskUnique && billDeskUnique !== activeNumber && billDeskUnique !== serviceNumber) {
    migratedServiceNumber = billDeskUnique;
    activeNumber = billDeskUnique;
    console.log(`[api] BillDesk internal migration detected: ${serviceNumber} -> ${activeNumber}`);
  }

  // 2.5 Validation: If BillDesk found nothing meaningful, ABORT.
  // This prevents adding invalid numbers that just happen to be 13 digits.
  const isPlaceholder = (name) => {
    if (!name) return true;
    const n = name.toUpperCase().trim();
    return n === 'UNKNOWN' || n === 'N/A' || n === 'NA' || n === '-' || n === '—' || n === '.';
  };

  if (!billDeskData || isPlaceholder(billDeskData.customerName) || !billDeskData.uniqueServiceNumber) {
    console.warn(`[api] Snapshot aborted: BillDesk data incomplete or placeholder for ${serviceNumber}`, { 
      hasData: !!billDeskData, 
      name: billDeskData?.customerName,
      uniqueNo: billDeskData?.uniqueServiceNumber 
    });
    return null;
  }

  // 3. Fetch History using the active (potentially migrated) number
  const targetNumber = activeNumber;
  const [billResult, paymentResult] = await Promise.allSettled([
    apspdclPost('publicbillhistory', targetNumber),
    apspdclPost('publicpaymenthistory', targetNumber),
  ]);

  const billData    = billResult.status === 'fulfilled' ? billResult.value : null;
  const paymentData = paymentResult.status === 'fulfilled' ? paymentResult.value : { data: [] };

  let apspdclError = null;
  let bills = [];
  if (!billData || !Array.isArray(billData.data) || !billData.data.length) {
    const errorMsg = billData?.message || billData?.error || (billResult.status === 'rejected' ? billResult.reason?.message : '');
    apspdclError = errorMsg.toLowerCase().includes('not found') 
      ? 'APSPDCL history servers are down. Please try again later.'
      : (errorMsg ? `APSPDCL Sync Failed: ${errorMsg}` : 'APSPDCL history servers are down. Please try again later.');
  } else {
    bills = billData.data
      .map(normaliseBill)
      .filter(b => b.closingDate)
      .sort((a, b) => b.closingDate - a.closingDate);
  }

  if (paymentResult.status === 'rejected' && !apspdclError) {
    apspdclError = 'APSPDCL history servers are down. Please try again later.';
  }

  if (!bills.length && !billDeskData) {
    throw new Error(apspdclError || billDeskError || 'Validation failed. All upstream servers are down. Please try again later.');
  }

  // 4. Extract data and build DTO
  const billDeskAmount = billDeskData?.billDeskAmount ?? null;
  const billDeskBillAmount = billDeskData?.billDeskBillAmount ?? null;
  const billDeskIsPaid = billDeskData?.billDeskIsPaid === true;
  const billDeskBillDate = billDeskData?.billDeskBillDate;
  const billDeskDueDate = billDeskData?.billDeskDueDate;

  const latest       = bills[0] || null;
  const now          = new Date();
  const currentYear  = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  const hasCurrentMonthBill = bills.some(
    b => b.closingDate.getUTCFullYear() === currentYear && b.closingDate.getUTCMonth() === currentMonth
  );

  const pay = analysePayments(paymentData.data || [], bills, billDeskAmount ?? undefined);

  let status;
  if (!bills.length)          status = billDeskIsPaid ? 'PAID' : ((billDeskAmount > 0) ? 'DUE' : 'UNKNOWN');
  else if (!hasCurrentMonthBill) status = 'NO_DUES';
  else if (pay.isPaid)        status = 'PAID';
  else if (billDeskIsPaid)    status = 'PAID';
  else if ((billDeskAmount ?? latest.billAmount) > 0) status = 'DUE';
  else                        status = 'UNKNOWN';

  const finalDueAmount = billDeskAmount ?? latest?.billAmount ?? 0;
  const publicDueAmount = latest?.billAmount ?? 0;
  const billDeskSource = billDeskAmount != null ? 'BILLDESK' : (bills.length ? 'APSPDCL' : 'UNKNOWN');

  let breakup = null;
  let isdAmount = 0;
  let amountDue = 0;

  if (latest) {
    const grossTotal = toNum(latest.ec) + toNum(latest.fixchg) + toNum(latest.cc) + toNum(latest.ed) + toNum(latest.fsa);
    const roundedGrossTotal = Math.round(grossTotal);
    const originalBillAmountForIsd = billDeskAmount ?? latest.billAmount;
    isdAmount = originalBillAmountForIsd != null ? originalBillAmountForIsd - (roundedGrossTotal - pay.arrearsTotal) : 0;
    breakup = buildBreakup(latest, pay.arrears, pay.arrearsTotal, pay.currentPaymentTotal || 0, finalDueAmount, isdAmount);
    amountDue = status === 'DUE' ? (breakup?.netDue ?? finalDueAmount) : 0;
  } else {
    amountDue = status === 'DUE' ? finalDueAmount : 0;
  }

  // ── Parse all payments ────────────────────────────────────────────────────
  const allPayments = (paymentData.data || [])
    .map(p => ({ date: parseDate(p.prdate), amount: toNum(p.billamt), counter: p.counter, receiptNo: p.prno || null }))
    .filter(p => p.date)
    .sort((a, b) => b.date - a.date); // newest first

  const paymentsAsc = [...allPayments].reverse(); // oldest first for settlement calc

  // ── Build bill history (up to 12 months, excl. current) ──────────────────
  const pastBills = bills.filter(
    b => !(b.closingDate.getUTCFullYear() === currentYear && b.closingDate.getUTCMonth() === currentMonth)
  );

  function findSettlementDate(bill, nextBillClosingDate) {
    const windowEnd = nextBillClosingDate ?? new Date(8640000000000000);
    let accum = 0;
    let lastDate = null;
    for (const p of paymentsAsc) {
      if (p.date <= bill.closingDate || p.date >= windowEnd) continue;
      accum += p.amount;
      lastDate = p.date;
      if (accum >= bill.billAmount) break;
    }
    return lastDate;
  }

  const history = pastBills.slice(0, 3).map((bill, i) => {
    const nextClose = pastBills[i - 1]?.closingDate ?? (hasCurrentMonthBill ? latest.closingDate : null);
    const paidDate = findSettlementDate(bill, nextClose);
    return {
      billDate:    bill.closingDate.toISOString(),
      paidDate:    paidDate?.toISOString() || null,
      billAmount:  bill.billAmount,
      billedUnits: bill.billedUnits,
    };
  });

  const billHistory18 = pastBills.slice(0, 18).map((bill, i) => {
    const nextClose = pastBills[i - 1]?.closingDate ?? (hasCurrentMonthBill ? latest.closingDate : null);
    const paidDate = findSettlementDate(bill, nextClose);
    return {
      billDate:    bill.closingDate.toISOString(),
      dueDate:     bill.dueDate?.toISOString() || null,
      paidDate:    paidDate?.toISOString() || null,
      billAmount:  bill.billAmount,
      billedUnits: bill.billedUnits,
      isPaid:      paidDate !== null,
    };
  });

  const paymentHistory12 = allPayments.slice(0, 12).map((p, i) => ({
    counter:   p.counter,
    date:      p.date.toISOString(),
    amount:    p.amount,
    receiptNo: p.receiptNo,
  }));

  const hasCurrentMonthBillData = hasCurrentMonthBill || billDeskBillAmount != null;
  const trendMonths = [
    ...(hasCurrentMonthBill ? [{
      month:       `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
      billAmount:  billDeskBillAmount ?? latest.billAmount,
      amountDue:   amountDue,
      billedUnits: latest.billedUnits,
      status,
    }] : (billDeskBillAmount != null ? [{
      month:       `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
      billAmount:  billDeskBillAmount,
      amountDue:   amountDue,
      billedUnits: 0,
      status,
    }] : [])),
    ...pastBills.slice(0, hasCurrentMonthBillData ? 17 : 18).map(b => ({
      month:       `${b.closingDate.getUTCFullYear()}-${String(b.closingDate.getUTCMonth() + 1).padStart(2, '0')}`,
      billAmount:  b.billAmount,
      amountDue:   b.billAmount,
      billedUnits: b.billedUnits,
      status:      'PAID',
    })),
  ].reverse();

  // ── Insights ──────────────────────────────────────────────────────────────
  const pastAmounts  = trendMonths.map((m) => m.billAmount);
  const pastUnits    = trendMonths.map((m) => m.billedUnits);
  const historicalAmounts = hasCurrentMonthBillData ? pastAmounts.slice(0, -1) : pastAmounts;
  const historicalUnits   = hasCurrentMonthBillData ? pastUnits.slice(0, -1) : pastUnits;

  function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
  function max(arr) { return arr.length ? Math.max(...arr) : 0; }
  function min(arr) { return arr.length ? Math.min(...arr) : 0; }

  const avgAmount   = avg(pastAmounts);
  const avgAmount6m = avg(historicalAmounts.slice(-6));
  const avgAmount12m = avg(historicalAmounts.slice(-12));
  const avgUnits    = avg(pastUnits);
  const avgUnits6m  = avg(historicalUnits.slice(-6));
  const avgUnits12m = avg(historicalUnits.slice(-12));
  const maxAmount   = max(pastAmounts);
  const minAmount   = min(pastAmounts);
  const maxUnits    = max(pastUnits);
  const minUnits    = min(pastUnits);
  const avgCostPerUnit = avgUnits > 0 ? avgAmount / avgUnits : 0;

  const currentInsightAmount = billDeskBillAmount ?? latest?.billAmount ?? 0;
  const currentInsightUnits  = hasCurrentMonthBill ? latest.billedUnits : 0;

  const recent3Avg  = avg(pastAmounts.slice(-3));
  const unitSpike   = avgUnits > 0 && currentInsightUnits > avgUnits * 1.25;
  const amountSpike = recent3Avg > 0 && currentInsightAmount > recent3Avg * 1.25;

  const targetMonthNumber = ((currentMonth + 1) % 12) + 1;
  const targetMonthYear = currentMonth === 11 ? currentYear : currentYear - 1;
  const sameMonthHistory = trendMonths.filter((m) => {
    const [yr, mo] = m.month.split('-').map(Number);
    return mo === targetMonthNumber && yr === targetMonthYear;
  });

  function rangeFor(values) {
    if (!values.length) return null;
    const minValue = Math.round(Math.min(...values));
    const maxValue = Math.round(Math.max(...values));
    return minValue === maxValue ? `${minValue}` : `${minValue} - ${maxValue}`;
  }

  const fallbackMonths = trendMonths.slice(-3);
  const fallbackBillValues = fallbackMonths.map((m) => m.billAmount).filter((v) => typeof v === 'number');
  const fallbackUnitValues = fallbackMonths.map((m) => m.billedUnits).filter((v) => typeof v === 'number');

  const predictedNextBill = sameMonthHistory.length
    ? Math.round(avg(sameMonthHistory.map((m) => m.billAmount)))
    : fallbackBillValues.length >= 2
      ? Math.round(avg(fallbackBillValues))
      : null;

  const predictedNextUnits = sameMonthHistory.length
    ? Math.round(avg(sameMonthHistory.map((m) => m.billedUnits)))
    : fallbackUnitValues.length >= 2
      ? Math.round(avg(fallbackUnitValues))
      : null;

  const predictedNextBillRange = rangeFor(sameMonthHistory.length ? sameMonthHistory.map(m => m.billAmount) : fallbackBillValues);
  const predictedNextUnitsRange = rangeFor(sameMonthHistory.length ? sameMonthHistory.map(m => m.billedUnits) : fallbackUnitValues);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabel = `${MONTHS[targetMonthNumber - 1]}-${targetMonthYear}`;
  const predictedBasis = sameMonthHistory.length ? `based on ${monthLabel} last year` : 'based on recent trend';

  const maxBill = trendMonths.reduce((best, month) => !best || month.billAmount > best.billAmount ? month : best, null);
  const minBill = trendMonths.reduce((best, month) => !best || month.billAmount < best.billAmount ? month : best, null);

  const prevMonthBill = pastBills[0] || null;
  const sameMonthLastYear = pastBills.find(b => {
    const d = b.closingDate;
    return d.getUTCMonth() === currentMonth && d.getUTCFullYear() === currentYear - 1;
  }) || null;

  function pct(change, base) {
    if (!base || typeof base !== 'number' || base === 0) return null;
    return Number(((change / base) * 100).toFixed(0));
  }

  const insights = {
    avgAmount: Math.round(avgAmount), avgAmount6m: Math.round(avgAmount6m), avgAmount12m: Math.round(avgAmount12m),
    avgUnits: Math.round(avgUnits), avgUnits6m: Math.round(avgUnits6m), avgUnits12m: Math.round(avgUnits12m),
    maxAmount, minAmount, maxUnits, minUnits, avgCostPerUnit: Number(avgCostPerUnit.toFixed(2)),
    predictedNextBill, predictedNextBillRange, predictedNextUnits, predictedNextUnitsRange, predictedBasis,
    maxAmountMonth: maxBill?.month || null, minAmountMonth: minBill?.month || null,
    unitSpike, amountSpike,
    vsLastMonth: prevMonthBill ? {
      amount: latest.billAmount - prevMonthBill.billAmount,
      amountPct: pct(latest.billAmount - prevMonthBill.billAmount, prevMonthBill.billAmount),
      units: latest.billedUnits - prevMonthBill.billedUnits,
      unitsPct: pct(latest.billedUnits - prevMonthBill.billedUnits, prevMonthBill.billedUnits),
    } : null,
    vsSameMonthLastYear: sameMonthLastYear ? {
      amount: latest.billAmount - sameMonthLastYear.billAmount,
      amountPct: pct(latest.billAmount - sameMonthLastYear.billAmount, sameMonthLastYear.billAmount),
      units: latest.billedUnits - sameMonthLastYear.billedUnits,
      unitsPct: pct(latest.billedUnits - sameMonthLastYear.billedUnits, sameMonthLastYear.billedUnits),
    } : null,
  };

  const finalCustomerName = billDeskData?.customerName ?? latest?.customerName ?? null;
  
  // FINAL HARD VALIDATION: If we have no customer name AND no bill history, 
  // it is not a valid APSPDCL service number. ABORT.
  if (isPlaceholder(finalCustomerName) && bills.length === 0) {
    console.warn(`[api] Final validation failed for ${serviceNumber}: No customer name and no history.`);
    return null;
  }

  return {
    serviceNumber,
    migratedServiceNumber,
    customerName: finalCustomerName,
    billDate: (billDeskBillDate && parseDate(billDeskBillDate)) ? parseDate(billDeskBillDate).toISOString() : (latest ? latest.closingDate.toISOString() : new Date().toISOString()),
    billTime: billDeskData?.billDeskBillTime || latest?.closingTime || null,
    dueDate: (billDeskDueDate && parseDate(billDeskDueDate)) ? parseDate(billDeskDueDate).toISOString() : (latest?.dueDate?.toISOString() || null),
    billedUnits: latest?.billedUnits ?? null,
    billAmount: finalDueAmount,
    publicBillAmount: publicDueAmount,
    billDeskAmount: billDeskAmount ?? null,
    billDeskBillAmount: billDeskBillAmount ?? null,
    billDeskCurrentDemand: billDeskData?.billDeskCurrentDemand ?? null,
    billDeskError,
    apspdclError,
    amountDue,
    status,
    isPaid: status === 'PAID' || status === 'NO_DUES',
    paidDate: pay.paidDate?.toISOString() || null,
    receiptNumber: pay.receiptNumber,
    paidAmount: pay.isPaid ? pay.paidAmount : (status === 'PAID' ? (billDeskBillAmount ?? latest?.billAmount ?? 0) : null),
    billBreakup: breakup,
    category:    latest?.category ?? null,
    closingRdg:  latest?.closingRdg ?? null,
    ctrLoad:     latest?.ctrLoad ?? null,
    divisionCode: billDeskData?.divisionCode ?? pay.divname ?? null,
    circleName:  billDeskData?.circleName ?? null,
    divisionName: pay.divname ?? null,
    sectionName: pay.secname ?? null,
    uniqueServiceNumber: billDeskData?.uniqueServiceNumber ?? serviceNumber,
    lastThreeAmounts: history,
    billHistory: billHistory18,
    paymentHistory: paymentHistory12,
    trendData: trendMonths,
    isdAmount,
    billDeskSource,
    insights,
    fetchedAt: new Date().toISOString(),
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/services
 * No-op on this server — persistence is in the client.
 * Returns empty list so the client knows the server is alive.
 */
app.get('/api/services', (_req, res) => {
  res.json({ ok: true, services: [] });
});

/**
 * GET /api/services/trash
 * No-op — persistence is client-side.
 */
app.get('/api/services/trash', (_req, res) => {
  res.json({ ok: true, services: [] });
});

/**
 * POST /api/services/validate
 * Body: { serviceNumber: "1234567890123", billdeskSession?: { reqtoken, captcha, cookie } }
 *
 * Validates a service number against APSPDCL.
 * Returns the full snapshot DTO on success so the client can use it immediately
 * (no separate refresh needed after add).
 *
 * APSPDCL calls: 2 (bill + payment)
 */
app.post('/api/services/validate', async (req, res) => {
  const { serviceNumber, billdeskSession } = req.body || {};
  if (!serviceNumber || !/^\d{13}$/.test(serviceNumber)) {
    return res.status(400).json({ ok: false, error: 'Service number must be 13 digits' });
  }
  try {
    const snapshot = await buildSnapshot(serviceNumber, billdeskSession);
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: 'Invalid APSPDCL service number — no bill history found' });
    }
    res.json({ ok: true, snapshot });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message || 'APSPDCL unavailable' });
  }
});

/**
 * POST /api/services/:serviceNumber/refresh
 * Body: { billdeskSession?: { reqtoken, captcha, cookie } }
 *
 * Fetches fresh data for one service number from APSPDCL.
 * The :serviceNumber param is the 13-digit APSPDCL number (not a DB id —
 * the server has no DB).
 *
 * APSPDCL calls: 2 (bill + payment, parallel)
 *
 * Response: { ok: true, snapshot: { ...DTO } }
 */
app.post('/api/services/:serviceNumber/refresh', async (req, res) => {
  const { serviceNumber } = req.params;
  const { billdeskSession } = req.body || {};
  if (!/^\d{13}$/.test(serviceNumber)) {
    return res.status(400).json({ ok: false, error: 'Invalid service number' });
  }
  try {
    const snapshot = await buildSnapshot(serviceNumber, billdeskSession);
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: 'No data found for this service number' });
    }
    res.json({ ok: true, snapshot });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message || 'APSPDCL unavailable' });
  }
});

/**
 * POST /api/services/refresh-all
 * Body: { services: [{ id, serviceNumber }, ...], serviceNumbers: ["123..."], billdeskSession?: { reqtoken, captcha, cookie } }
 *
 * Refreshes a list of service numbers.
 * Processed sequentially to avoid hammering APSPDCL.
 *
 * APSPDCL calls: 2 per service number
 */
app.post('/api/services/refresh-all', async (req, res) => {
  const { services: inputServices, serviceNumbers, billdeskSession } = req.body || {};
  
  let servicesToProcess = [];
  if (Array.isArray(inputServices)) {
    servicesToProcess = inputServices;
  } else if (Array.isArray(serviceNumbers)) {
    servicesToProcess = serviceNumbers.map(sn => ({ serviceNumber: sn }));
  } else {
    return res.status(400).json({ ok: false, error: 'CRITICAL_ERROR: services or serviceNumbers array is required' });
  }

  const results = [];
  for (const s of servicesToProcess) {
    try {
      const snapshot = await buildSnapshot(s.serviceNumber, billdeskSession);
      results.push(snapshot
        ? { id: s.id, serviceNumber: s.serviceNumber, ok: true, snapshot }
        : { id: s.id, serviceNumber: s.serviceNumber, ok: false, error: 'No data returned' });
    } catch (err) {
      results.push({ id: s.id, serviceNumber: s.serviceNumber, ok: false, error: err.message || 'Fetch failed' });
    }
  }

  res.json({
    ok: true,
    succeeded: results.filter(r => r.ok).length,
    failed:    results.filter(r => !r.ok).length,
    results,
  });
});

/**
 * POST /api/billdesk/validate-session
 * Body: { serviceNumber, billdeskSession: { reqtoken, captcha, cookie } }
 */
app.post('/api/billdesk/validate-session', async (req, res) => {
  const { serviceNumber, billdeskSession } = req.body || {};
  if (!serviceNumber || !billdeskSession) {
    return res.status(400).json({ ok: false, error: 'Missing parameters' });
  }

  const { reqtoken, captcha, cookie } = billdeskSession;
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://payments.billdesk.com',
    'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController',
    'User-Agent': 'Mozilla/5.0',
  };
  if (cookie) headers.Cookie = cookie;

  const body = new URLSearchParams({
    reqid: 'confirm',
    reqtoken: reqtoken || '',
    txtCustomerID: String(serviceNumber),
    jcaptchaVal: captcha || '',
  }).toString();

  try {
    const bdRes = await fetch(BILLDESK_URL, { method: 'POST', headers, body });
    if (!bdRes.ok) throw new Error(`BillDesk returned ${bdRes.status}`);
    const html = await bdRes.text();

    const errorMatch = html.match(/<div id="error_msg"[^>]*>[\s\S]*?<p>([^<]+)<\/p>/i);
    if (errorMatch) {
      return res.json({ ok: false, error: errorMatch[1].trim() });
    }

    const htmlLower = html.toLowerCase();
    if (htmlLower.includes('wrong captcha') || htmlLower.includes('invalid captcha') || htmlLower.includes('incorrect captcha') || htmlLower.includes('enter valid captcha')) {
      return res.json({ ok: false, error: 'Invalid Captcha' });
    }

    // If we're still seeing the captcha form and no customer/bill amount, it failed.
    if (!htmlLower.includes('customer name') && !htmlLower.includes('consumer name') && !htmlLower.includes('bill amount') && htmlLower.includes('please enter captcha here')) {
      const errTrMatch = html.match(/<div id="errTr"[^>]*>([^<]+)<\/div>/i);
      const colorRedMatch = html.match(/<div[^>]*class="[^"]*color_red[^"]*"[^>]*>([^<]+)<\/div>/i);
      const errText = (errTrMatch && errTrMatch[1].trim()) || (colorRedMatch && colorRedMatch[1].trim()) || 'Validation failed';
      return res.json({ ok: false, error: errText });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/billdesk/init-session

 * 
 * Scrapes BillDesk for a fresh reqtoken and generates the dynamic cookie
 * needed for the Captcha image request.
 */
app.get('/api/billdesk/init-session', async (req, res) => {
  try {
    const baseCookie = process.env.BILLDESK_COOKIE || process.env.BILLDESK_COOKIES || '';
    const session = await scrapeBillDeskSession(baseCookie);
    res.json({ ok: true, ...session });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/billdesk/captcha-image
 * Query: ?cookie=<dynamic_cookie_string>
 * 
 * Proxies the Captcha image to bypass CORS and third-party cookie restrictions.
 */
app.get('/api/billdesk/captcha-image', async (req, res) => {
  try {
    const cookie = req.query.cookie;
    if (!cookie) return res.status(400).send('Missing cookie parameter');
    
    const imgRes = await fetch('https://payments.billdesk.com/MercOnline/NumericCaptchaServlet', {
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController'
      }
    });
    
    if (!imgRes.ok) throw new Error(`Image fetch failed with status ${imgRes.status}`);
    
    res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    
    // fetch body is a ReadableStream which can be converted to an array buffer or piped.
    // In Node 18+, we can convert to array buffer and send as buffer.
    const arrayBuffer = await imgRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('[api] Captcha image fetch failed:', err);
    res.status(502).send('Failed to fetch captcha image');
  }
});



app.post('/api/billdesk/auto-session', async (req, res) => {
  const { serviceNumber } = req.body || {};
  if (!serviceNumber) {
    return res.status(400).json({ ok: false, error: 'Missing serviceNumber' });
  }

  let lastError = 'Failed to solve captcha';
  // Try up to 3 times to account for OCR inaccuracies
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const baseCookie = process.env.BILLDESK_COOKIE || process.env.BILLDESK_COOKIES || '';
      const session = await scrapeBillDeskSession(baseCookie);
      
      const captchaText = await solveCaptchaImage(session.cookie);
      if (!captchaText || captchaText.length < 5) {
        continue;
      }
      
      // Validate
      session.captcha = captchaText;
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://payments.billdesk.com',
        'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController',
        'User-Agent': 'Mozilla/5.0',
        'Cookie': session.cookie
      };

      const body = new URLSearchParams({
        reqid: 'confirm',
        reqtoken: session.reqtoken || '',
        txtCustomerID: String(serviceNumber),
        jcaptchaVal: session.captcha || '',
      }).toString();

      const bdRes = await fetch(BILLDESK_URL, { method: 'POST', headers, body });
      if (!bdRes.ok) throw new Error(`BillDesk returned ${bdRes.status}`);
      const html = await bdRes.text();
      const htmlLower = html.toLowerCase();

      if (htmlLower.includes('wrong captcha') || htmlLower.includes('invalid captcha') || htmlLower.includes('incorrect captcha') || htmlLower.includes('enter valid captcha')) {
         continue;
      }

      // Success!
      session.timestamp = Date.now();
      return res.json({ ok: true, session });
      
    } catch (err) {
      console.error(`[api] auto-session attempt ${attempt} error:`, err);
      lastError = err.message;
    }
  }

  return res.json({ ok: false, error: lastError });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Internal error' });
});

// Only listen when running directly (locally), not when imported as a module by Vercel
if (process.env.NODE_ENV !== 'production' || process.env.API_PORT) {
  app.listen(PORT, () => {
  });
}

export default app;
