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
 *
 * This way:
 *   - The frontend makes 1 clean named API call per action
 *   - APSPDCL raw endpoints are never visible in browser DevTools
 *   - The DTO is small and purpose-built (no raw APSPDCL noise)
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.API_PORT || 4100;

app.use(cors());
app.use(express.json());

// ── APSPDCL raw client (server-side only) ─────────────────────────────────────

const APSPDCL_BASE = 'https://apspdcl.in/ConsumerDashboard/public';

async function apspdclPost(endpoint, serviceNumber) {
  const res = await fetch(`${APSPDCL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ uscno: String(serviceNumber) }).toString(),
  });
  if (!res.ok) throw new Error(`APSPDCL ${endpoint} responded with ${res.status}`);
  const text = await res.text();
  if (!text || !text.trim()) return { data: [] };
  try { return JSON.parse(text); }
  catch { return { data: [] }; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_MAP = {
  JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,
  JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11,
};

function parseDate(v) {
  if (!v) return null;
  const p = String(v).trim().split(/[-/]/);
  if (p.length === 3) {
    const [d, m, y] = p;
    const month = MONTH_MAP[m.toUpperCase()];
    const year  = String(y).length === 2 ? 2000 + +y : +y;
    if (month != null && isFinite(year) && isFinite(+d))
      return new Date(Date.UTC(year, month, +d));
  }
  const ts = Date.parse(String(v).replace(/-/g, ' '));
  return isNaN(ts) ? null : new Date(ts);
}

function toNum(v) {
  const n = Number(String(v || '0').replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

function normaliseBill(row) {
  return {
    closingDate:  parseDate(row.closingDate),
    dueDate:      parseDate(row.duedate),
    billedUnits:  toNum(row.billedUnits),
    billAmount:   toNum(row.billAmount),
    ec:    toNum(row.ec),
    fixchg:toNum(row.fixchg),
    cc:    toNum(row.cc),
    ed:    toNum(row.ed),
    fsa:   toNum(row.fsa),
    irda:  toNum(row.irda),
    othchg:toNum(row.othchg),
    sur:   toNum(row.sur),
  };
}

function analysePayments(rawPayments, bills) {
  const empty = { isPaid:false, paidDate:null, receiptNumber:null, paidAmount:null, arrears:[], arrearsTotal:0 };
  if (!Array.isArray(rawPayments) || !rawPayments.length || !bills?.length) return empty;

  const latest     = bills[0];
  const billDate   = latest.closingDate;
  const billAmount = latest.billAmount;

  const payments = rawPayments
    .map(p => ({ date: parseDate(p.prdate), amount: toNum(p.billamt), receiptNo: p.prno || null }))
    .filter(p => p.date)
    .sort((a, b) => b.date - a.date);

  // ── Is current bill fully paid? ──────────────────────────────────────────
  const paymentsAsc = [...payments].sort((a, b) => a.date - b.date);
  let currentTotal = 0;
  for (const p of paymentsAsc) {
    if (p.date < billDate) continue;  // Ignore payments before bill closes
    currentTotal += p.amount;
    if (currentTotal >= billAmount) {
      return { isPaid: true, paidDate: p.date, receiptNumber: p.receiptNo, paidAmount: p.amount, arrears: [], arrearsTotal: 0 };
    }
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
    const prevSettlePayments = [];  // List of payment objects that settle prev bill
    let prevAccum = 0;
    for (const p of paymentsAsc) {
      if (p.date <= prevDate || p.date >= billDate) continue;  // Outside the window? skip
      prevSettlePayments.push(p);
      prevAccum += p.amount;
      if (prevAccum >= prevAmount) break;  // Settled!
    }

    // Arrears = other payments in the same window that don't settle the prev bill
    const prevSettleSet = new Set(prevSettlePayments);  // Use object reference
    arrears = payments.filter(p => {
      if (p.date <= prevDate || p.date >= billDate) return false;  // Outside window
      return !prevSettleSet.has(p);  // Not in the settle list
    });
  }

  const arrearsTotal = arrears.reduce((s, p) => s + p.amount, 0);
  const latestPayment = payments[0];

  return {
    isPaid: false,
    paidDate: latestPayment?.date || null,
    receiptNumber: latestPayment?.receiptNo || null,
    paidAmount: latestPayment?.amount || null,
    arrears,
    arrearsTotal,
  };
}

function buildBreakup(bill, arrearPayments, arrearsTotal) {
  return {
    ec:      bill.ec,
    fixchg:  bill.fixchg,
    cc:      bill.cc,
    ed:      bill.ed,
    fsa:     bill.fsa,
    grossTotal:        bill.billAmount,
    currentMonthBill:  bill.billAmount,  // Same as grossTotal (full bill before arrears)
    arrears:           arrearsTotal,     // Numeric total for display
    arrearPayments,                       // Array of {date, amount, receiptNo}
    arrearsTotal,
    totalBill:         Math.max(0, bill.billAmount - arrearsTotal),  // Amount due after deductions
    netDue:            Math.max(0, bill.billAmount - arrearsTotal),
  };
}

/**
 * Core processor: given a service number, fetch from APSPDCL and return a clean snapshot DTO.
 * Returns null if the service number is unknown / has no data.
 * Throws only on network failures.
 */
async function buildSnapshot(serviceNumber) {
  const [billResult, paymentResult] = await Promise.allSettled([
    apspdclPost('publicbillhistory', serviceNumber),
    apspdclPost('publicpaymenthistory', serviceNumber),
  ]);

  if (billResult.status === 'rejected') throw new Error(`Network error: ${billResult.reason?.message}`);

  const billData    = billResult.value;
  const paymentData = paymentResult.status === 'fulfilled' ? paymentResult.value : { data: [] };

  if (!Array.isArray(billData?.data) || !billData.data.length) return null;

  const bills = billData.data
    .map(normaliseBill)
    .filter(b => b.closingDate)
    .sort((a, b) => b.closingDate - a.closingDate);

  if (!bills.length) return null;

  const latest       = bills[0];
  const now          = new Date();
  const currentYear  = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  const hasCurrentMonthBill = bills.some(
    b => b.closingDate.getUTCFullYear() === currentYear && b.closingDate.getUTCMonth() === currentMonth
  );

  const pay = analysePayments(paymentData.data || [], bills);

  let status;
  if (!hasCurrentMonthBill)   status = 'NO_DUES';
  else if (pay.isPaid)        status = 'PAID';
  else if (latest.billAmount > 0) status = 'DUE';
  else                        status = 'UNKNOWN';

  const breakup  = status === 'DUE' ? buildBreakup(latest, pay.arrears, pay.arrearsTotal) : null;
  const amountDue = status === 'DUE' ? (breakup?.netDue ?? latest.billAmount) : 0;

  // ── Parse all payments ────────────────────────────────────────────────────
  const allPayments = (paymentData.data || [])
    .map(p => ({ date: parseDate(p.prdate), amount: toNum(p.billamt), receiptNo: p.prno || null }))
    .filter(p => p.date)
    .sort((a, b) => b.date - a.date); // newest first

  const paymentsAsc = [...allPayments].reverse(); // oldest first for settlement calc

  // ── Build bill history (up to 12 months, excl. current) ──────────────────
  const pastBills = bills.filter(
    b => !(b.closingDate.getUTCFullYear() === currentYear && b.closingDate.getUTCMonth() === currentMonth)
  );

  /**
   * For each past bill, find the payment date by accumulating payments
   * that fall between this bill's closing date and the next bill's closing date.
   */
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
    return lastDate; // null = not yet paid
  }

  // last 3 for the card history strip
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

  // full 12-month history for charts & payment history table
  const billHistory12 = pastBills.slice(0, 12).map((bill, i) => {
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

  // ── Payment history (up to 12 recent payments) ────────────────────────────
  const paymentHistory12 = allPayments.slice(0, 12).map(p => ({
    date:      p.date.toISOString(),
    amount:    p.amount,
    receiptNo: p.receiptNo,
  }));

  // ── Trend data — 12-month monthly series for charts ──────────────────────
  // Combine current month + past bills, sorted oldest→newest for chart display
  const trendMonths = [
    ...(hasCurrentMonthBill ? [{
      month:       `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
      billAmount:  latest.billAmount,
      amountDue:   amountDue,
      billedUnits: latest.billedUnits,
      status,
    }] : []),
    ...pastBills.slice(0, hasCurrentMonthBill ? 11 : 12).map(b => ({
      month:       `${b.closingDate.getUTCFullYear()}-${String(b.closingDate.getUTCMonth() + 1).padStart(2, '0')}`,
      billAmount:  b.billAmount,
      amountDue:   b.billAmount,
      billedUnits: b.billedUnits,
      status:      'PAID',
    })),
  ].reverse(); // oldest first

  // ── Insights ──────────────────────────────────────────────────────────────
  const pastAmounts  = pastBills.slice(0, 12).map(b => b.billAmount);
  const pastUnits    = pastBills.slice(0, 12).map(b => b.billedUnits);

  function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
  function max(arr) { return arr.length ? Math.max(...arr) : 0; }
  function min(arr) { return arr.length ? Math.min(...arr) : 0; }

  const avgAmount   = avg(pastAmounts);
  const avgUnits    = avg(pastUnits);
  const maxAmount   = max(pastAmounts);
  const minAmount   = min(pastAmounts);
  const maxUnits    = max(pastUnits);
  const minUnits    = min(pastUnits);
  const avgCostPerUnit = avgUnits > 0 ? avgAmount / avgUnits : 0;

  // Spike detection: current vs 3-month avg
  const recent3Avg  = avg(pastAmounts.slice(0, 3));
  const unitSpike   = avgUnits > 0 && latest.billedUnits > avgUnits * 1.25;
  const amountSpike = recent3Avg > 0 && latest.billAmount > recent3Avg * 1.25;

  // Simple linear prediction of next bill based on last 3 months trend
  const last3 = pastAmounts.slice(0, 3);
  const predictedNextBill = last3.length >= 2
    ? Math.max(0, Math.round(avg(last3) + (last3[0] - last3[last3.length - 1]) / last3.length * 0.3))
    : null;

  // Comparison: current vs previous month vs same month last year
  const prevMonthBill = pastBills[0] || null;
  const sameMonthLastYear = pastBills.find(b => {
    const d = b.closingDate;
    return d.getUTCMonth() === currentMonth && d.getUTCFullYear() === currentYear - 1;
  }) || null;

  const insights = {
    avgAmount:         Math.round(avgAmount),
    avgUnits:          Math.round(avgUnits),
    maxAmount,
    minAmount,
    maxUnits,
    minUnits,
    avgCostPerUnit:    Number(avgCostPerUnit.toFixed(2)),
    predictedNextBill,
    unitSpike,
    amountSpike,
    vsLastMonth:       prevMonthBill
      ? { amount: latest.billAmount - prevMonthBill.billAmount, units: latest.billedUnits - prevMonthBill.billedUnits }
      : null,
    vsSameMonthLastYear: sameMonthLastYear
      ? { amount: latest.billAmount - sameMonthLastYear.billAmount, units: latest.billedUnits - sameMonthLastYear.billedUnits }
      : null,
  };

  // ── Clean DTO — only what the UI needs ──────────────────────────────────────
  return {
    serviceNumber,
    customerName:     null,

    // Current bill
    billDate:         latest.closingDate.toISOString(),
    dueDate:          latest.dueDate?.toISOString() || null,
    billedUnits:      latest.billedUnits,
    billAmount:       latest.billAmount,   // gross (before arrears)
    amountDue,                             // net (after arrears)
    status,                                // DUE | PAID | NO_DUES | UNKNOWN

    // Payment status
    isPaid:           pay.isPaid,
    paidDate:         pay.paidDate?.toISOString() || null,
    receiptNumber:    pay.receiptNumber,
    paidAmount:       pay.paidAmount,

    // Bill breakup (null unless DUE)
    billBreakup:      breakup,

    // Last 3 bills summary for card history strip
    lastThreeAmounts: history,

    // Full 12-month bill history for charts and detail panel
    billHistory:      billHistory12,

    // Last 12 payment transactions
    paymentHistory:   paymentHistory12,

    // Monthly trend series for charts (oldest→newest)
    trendData:        trendMonths,

    // Derived insights
    insights,

    fetchedAt:        new Date().toISOString(),
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
 * Body: { serviceNumber: "1234567890123" }
 *
 * Validates a service number against APSPDCL.
 * Returns the full snapshot DTO on success so the client can use it immediately
 * (no separate refresh needed after add).
 *
 * APSPDCL calls: 2 (bill + payment)
 */
app.post('/api/services/validate', async (req, res) => {
  const { serviceNumber } = req.body || {};
  if (!serviceNumber || !/^\d{13}$/.test(serviceNumber)) {
    return res.status(400).json({ ok: false, error: 'Service number must be 13 digits' });
  }
  try {
    const snapshot = await buildSnapshot(serviceNumber);
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
  if (!/^\d{13}$/.test(serviceNumber)) {
    return res.status(400).json({ ok: false, error: 'Invalid service number' });
  }
  try {
    const snapshot = await buildSnapshot(serviceNumber);
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
 * Body: { serviceNumbers: ["1234567890123", ...] }
 *
 * Refreshes a list of service numbers.
 * Processed sequentially to avoid hammering APSPDCL.
 *
 * APSPDCL calls: 2 per service number
 *
 * Response: { ok: true, results: [{ serviceNumber, snapshot?, error? }] }
 */
app.post('/api/services/refresh-all', async (req, res) => {
  const { serviceNumbers } = req.body || {};
  if (!Array.isArray(serviceNumbers) || !serviceNumbers.length) {
    return res.status(400).json({ ok: false, error: 'serviceNumbers array is required' });
  }

  const results = [];
  for (const sn of serviceNumbers) {
    try {
      const snapshot = await buildSnapshot(sn);
      results.push(snapshot
        ? { serviceNumber: sn, ok: true, snapshot }
        : { serviceNumber: sn, ok: false, error: 'No data returned' });
    } catch (err) {
      results.push({ serviceNumber: sn, ok: false, error: err.message || 'Fetch failed' });
    }
  }

  res.json({
    ok: true,
    succeeded: results.filter(r => r.ok).length,
    failed:    results.filter(r => !r.ok).length,
    results,
  });
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

app.listen(PORT, () => {
  console.log(`[api] My Dashboard API running at http://localhost:${PORT}`);
});