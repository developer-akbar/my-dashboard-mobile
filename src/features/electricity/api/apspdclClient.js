/**
 * APSPDCL API Client
 * Fetches bill history and payment history from APSPDCL public APIs.
 *
 * Billing calculation logic:
 *  - Raw total = EC + FixChg + CC + ED + FSA (rounded)
 *  - Advance payments (arrears) = payments made before current bill date
 *    that are NOT the regular bill payment — identified from payment history
 *    where payment date is within the current billing period
 *  - Final due = Raw total - sum of advance/arrear payments
 */

// In browser dev mode, requests go through Vite proxy → /api/apspdcl/*
// On Android Capacitor, we call APSPDCL directly (native HTTP, no CORS)
function getBaseUrl() {
  if (
    typeof window !== 'undefined' &&
    window.Capacitor?.isNativePlatform?.()
  ) {
    return 'https://apspdcl.in/ConsumerDashboard/public';
  }
  return '/api/apspdcl';
}

const STATUS = {
  DUE: 'DUE',
  PAID: 'PAID',
  NO_DUES: 'NO_DUES',
  UNKNOWN: 'UNKNOWN',
};

async function postForm(endpoint, serviceNumber) {
  const url = `${getBaseUrl()}/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: new URLSearchParams({ uscno: String(serviceNumber) }).toString(),
  });
  if (!res.ok) throw new Error(`APSPDCL responded with ${res.status}`);
  
  const text = await res.text();
  if (!text || text.trim() === '') {
    return { data: [] };
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    return { data: [] };
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTH_MAP = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseDate(value) {
  if (!value) return null;
  const parts = String(value).trim().split(/[-/]/);
  if (parts.length === 3) {
    const [day, mon, yr] = parts;
    const month = MONTH_MAP[String(mon).toUpperCase()];
    const year = String(yr).length === 2 ? 2000 + Number(yr) : Number(yr);
    if (month !== undefined && isFinite(year) && isFinite(Number(day))) {
      return new Date(Date.UTC(year, month, Number(day)));
    }
  }
  const ts = Date.parse(String(value).replace(/-/g, ' '));
  return isNaN(ts) ? null : new Date(ts);
}

function toNum(v) {
  const n = Number(String(v || '0').replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

// ── Bill normalizer ───────────────────────────────────────────────────────────

function normalizeBill(row) {
  return {
    closingDate: parseDate(row.closingDate),
    dueDate: parseDate(row.duedate),
    billedUnits: toNum(row.billedUnits),
    billAmount: toNum(row.billAmount),
    ec: toNum(row.ec),
    fixchg: toNum(row.fixchg),
    cc: toNum(row.cc),
    ed: toNum(row.ed),
    fsa: toNum(row.fsa),
    irda: toNum(row.irda),       // included for display / future deduction
    othchg: toNum(row.othchg),
    sur: toNum(row.sur),
  };
}

// ── Payment analysis ──────────────────────────────────────────────────────────

/**
 * Analyse payment history for a billing period.
 *
 * Returns:
 *  - isPaid         : whether a full bill payment covers the current bill
 *  - paidDate/etc.  : details of the most recent payment
 *  - arrears        : list of advance / partial payments made during the
 *                     billing period (prdate between closingDate and now)
 *  - arrearsTotal   : sum of arrears amounts
 */
function analysePayments(paymentData, bills) {
  const empty = {
    isPaid: false,
    paidDate: null,
    receiptNumber: null,
    paidAmount: null,
    arrears: [],
    arrearsTotal: 0,
  };

  if (!Array.isArray(paymentData?.data) || !bills || bills.length === 0) return empty;

  const latest = bills[0];
  const billDate = latest.closingDate; // e.g. 02-MAY-26
  const billAmount = latest.billAmount; // e.g. 2258

  // All payments, parsed
  const payments = paymentData.data
    .map((p) => ({
      date: parseDate(p.prdate),
      amount: toNum(p.billamt),
      receiptNo: p.prno || null,
    }))
    .filter((p) => p.date)
    .sort((a, b) => b.date - a.date);

  // A payment "covers" the bill if its amount >= billAmount and its date >= billDate
  const covering = payments.find(
    (p) => p.date >= billDate && p.amount >= billAmount
  );

  if (covering) {
    return {
      isPaid: true,
      paidDate: covering.date,
      receiptNumber: covering.receiptNo,
      paidAmount: covering.amount,
      arrears: [],
      arrearsTotal: 0,
    };
  }

  // Advance payments (arrears) logic:
  // "after the last month's payment if there are any payment history till the bill date (closingDate)"
  let arrears = [];
  if (bills.length > 1) {
    const previous = bills[1];
    
    // Sort ascending for chronological processing
    const ascPayments = [...payments].sort((a, b) => a.date - b.date);
    
    // Find the first payment on or after previous.closingDate (which is assumed to be the previous bill's payment)
    const prevPaymentIndex = ascPayments.findIndex(p => p.date >= previous.closingDate);
    
    if (prevPaymentIndex !== -1) {
       // Any payments AFTER this payment, up to current bill's closingDate are advance payments (arrears)
       arrears = ascPayments.filter((p, i) => i > prevPaymentIndex && p.date <= latest.closingDate);
    }
  }

  return {
    isPaid: false,
    paidDate: payments[0]?.date || null,
    receiptNumber: payments[0]?.receiptNo || null,
    paidAmount: payments[0]?.amount || null,
    arrears,
    arrearsTotal: arrears.reduce((sum, p) => sum + p.amount, 0),
  };
}

// ── Breakup builder ───────────────────────────────────────────────────────────

/**
 * Build bill breakup object.
 */
function buildBreakup(bill, arrearsTotal) {
  const ec = bill.ec || 0;
  const fixchg = bill.fixchg || 0;
  const cc = bill.cc || 0;
  const ed = bill.ed || 0;
  const fsa = bill.fsa || 0;
  
  // As per APSPDCL, the raw bill is the sum of these, but we use the API's billAmount
  const totalBill = bill.billAmount || 0;
  const currentMonthBill = totalBill; // Before any advance payments/arrears are deducted

  return {
    ec,
    fixchg,
    cc,
    ed,
    fsa,
    totalBill: Math.max(0, totalBill - (arrearsTotal || 0)),
    currentMonthBill,
    arrears: arrearsTotal || 0,
  };
}

// ── Main snapshot fetch ───────────────────────────────────────────────────────

export async function fetchApspdclSnapshot(serviceNumber) {
  const [billResult, paymentResult] = await Promise.allSettled([
    postForm('publicbillhistory', serviceNumber),
    postForm('publicpaymenthistory', serviceNumber),
  ]);

  if (billResult.status !== 'fulfilled') {
    throw new Error('APSPDCL bill history is unavailable');
  }

  const billData = billResult.value;
  const paymentData =
    paymentResult.status === 'fulfilled' ? paymentResult.value : null;

  if (!Array.isArray(billData?.data) || billData.data.length === 0) {
    const err = new Error('Invalid service number or no bill history found');
    err.status = 400;
    throw err;
  }

  // Sort bills newest first
  const bills = billData.data
    .map(normalizeBill)
    .filter((b) => b.closingDate)
    .sort((a, b) => b.closingDate - a.closingDate);

  const latest = bills[0];
  const now = new Date();

  // Determine if there's a current-month bill
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const hasCurrentMonthBill = bills.some(
    (b) =>
      b.closingDate.getUTCFullYear() === currentYear &&
      b.closingDate.getUTCMonth() === currentMonth
  );

  // Payment analysis
  const payAnalysis = analysePayments(paymentData, bills);

  // Status
  let status;
  if (!hasCurrentMonthBill) {
    status = STATUS.NO_DUES;
  } else if (payAnalysis.isPaid) {
    status = STATUS.PAID;
  } else {
    status = latest?.billAmount > 0 ? STATUS.DUE : STATUS.UNKNOWN;
  }

  // Bill breakup with arrears
  const breakup =
    latest && status === STATUS.DUE
      ? buildBreakup(latest, payAnalysis.arrearsTotal)
      : null;

  const amountDue =
    status === STATUS.DUE ? (breakup?.totalBill ?? latest.billAmount) : 0;

  // Parse all payments for matching (sorted ascending to find the first one after closingDate)
  const ascPayments = Array.isArray(paymentData?.data)
    ? paymentData.data
        .map((p) => ({ date: parseDate(p.prdate) }))
        .filter((p) => p.date)
        .sort((a, b) => a.date - b.date)
    : [];

  // Last 3 previous bills (excluding current month)
  const previousBills = bills
    .filter(
      (b) =>
        !(
          b.closingDate.getUTCFullYear() === currentYear &&
          b.closingDate.getUTCMonth() === currentMonth
        )
    )
    .slice(0, 3)
    .map((b) => {
      const payment = ascPayments.find(p => p.date >= b.closingDate);
      return { 
        closingDate: (payment ? payment.date : b.closingDate).toISOString(), 
        billAmount: b.billAmount 
      };
    });

  return {
    serviceNumber,
    customerName: null,
    billDate: latest?.closingDate?.toISOString() || null,
    dueDate: latest?.dueDate?.toISOString() || null,
    amountDue,
    billedUnits: latest?.billedUnits || 0,
    lastThreeAmounts: previousBills,
    status,
    isPaid: payAnalysis.isPaid,
    paidDate: payAnalysis.paidDate?.toISOString() || null,
    receiptNumber: payAnalysis.receiptNumber,
    paidAmount: payAnalysis.paidAmount,
    billBreakup: breakup,
  };
}

export async function validateServiceNumber(serviceNumber) {
  try {
    const data = await postForm('publicbillhistory', serviceNumber);
    return Array.isArray(data?.data) && data.data.length > 0;
  } catch {
    return false;
  }
}

export { STATUS };
