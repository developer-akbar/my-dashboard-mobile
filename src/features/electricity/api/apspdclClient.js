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
  return res.json();
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
function analysePayments(paymentData, bill) {
  const empty = {
    isPaid: false,
    paidDate: null,
    receiptNumber: null,
    paidAmount: null,
    arrears: [],
    arrearsTotal: 0,
  };

  if (!Array.isArray(paymentData?.data) || !bill) return empty;

  const billDate = bill.closingDate; // e.g. 02-MAY-26
  const billAmount = bill.billAmount; // e.g. 2258

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

  // Advance / partial payments during current billing period:
  // prdate between closingDate and today, amount < billAmount
  const now = new Date();
  const arrears = payments.filter(
    (p) =>
      p.date >= billDate &&
      p.date <= now &&
      p.amount < billAmount
  );

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
 *
 * grossTotal  = EC + FixChg + CC + ED + FSA  (matches APSPDCL rounding)
 * arrearsTotal = sum of advance payments during this billing period
 * netDue      = grossTotal - arrearsTotal
 */
function buildBreakup(bill, arrearsTotal, arrears) {
  const ec = bill.ec;
  const fixchg = bill.fixchg;
  const cc = bill.cc;
  const ed = bill.ed;
  const fsa = bill.fsa;
  const grossTotal = bill.billAmount; // use APSPDCL's own rounded total

  return {
    ec,
    fixchg,
    cc,
    ed,
    fsa,
    grossTotal,
    arrears,       // array of {date, amount, receiptNo}
    arrearsTotal,
    netDue: Math.max(0, grossTotal - arrearsTotal),
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
  const payAnalysis = analysePayments(paymentData, latest);

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
      ? buildBreakup(latest, payAnalysis.arrearsTotal, payAnalysis.arrears)
      : null;

  const amountDue =
    status === STATUS.DUE ? (breakup?.netDue ?? latest.billAmount) : 0;

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
    .map((b) => ({ closingDate: b.closingDate.toISOString(), billAmount: b.billAmount }));

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
