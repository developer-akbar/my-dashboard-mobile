import { useState } from 'react';
import {
  FiCopy, FiExternalLink, FiRefreshCw, FiMoreVertical,
  FiEdit2, FiTrash2, FiChevronDown, FiTrendingUp, FiTrendingDown,
  FiCalendar, FiCheckCircle, FiAlertTriangle, FiZap,
} from 'react-icons/fi';
import { BsPin, BsPinFill } from 'react-icons/bs';
import toast from 'react-hot-toast';
import {
  ComposedChart, Area, BarChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { formatInr, formatDate, formatDateTime, fromNow, getDueTone, getDueCopy } from '../../../shared/utils/index.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function TrendBadge({ value, unit = '', percent }) {
  if (value == null) return null;
  const up = value > 0, zero = value === 0;
  const label = zero ? 'Same'
    : `${up ? '+' : ''}${unit === '₹' ? formatInr(Math.abs(value)) : `${Math.abs(value).toLocaleString('en-IN')} ${unit}`}`;
  return (
    <span className={`tbadge tbadge--${zero ? 'flat' : up ? 'up' : 'dn'}`}>
      {!zero && (up ? <FiTrendingUp size={10} /> : <FiTrendingDown size={10} />)}
      {label}{percent != null ? ` (${percent > 0 ? '+' : ''}${Number(percent).toFixed(0)}%)` : ''}
    </span>
  );
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ctip">
      <p className="ctip__label">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name.includes('Unit') ? `${Number(p.value).toLocaleString('en-IN')} u` : formatInr(p.value)}
        </p>
      ))}
    </div>
  );
}

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtMonth(m) { if (!m) return '—'; const [y, mo] = m.split('-'); return `${MO[+mo - 1]} ${y}`; }
function fmtK(v) { return v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`; }

// ── Accordion section ─────────────────────────────────────────────────────────

function Section({ title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`acc ${open ? 'acc--open' : ''}`}>
      <button className="acc__head" onClick={() => setOpen(v => !v)}>
        <span className="acc__title">{title}</span>
        <div className="acc__right">
          {badge && <span className="acc__badge">{badge}</span>}
          <FiChevronDown size={14} className="acc__chevron" />
        </div>
      </button>
      {open && <div className="acc__body">{children}</div>}
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function ServiceCard({ service, refreshing, onRefresh, onEdit, onDelete, onTogglePin, onPay }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const status = service.lastStatus || 'UNKNOWN';
  const dueTone = getDueTone(service.lastDueDate, service.isPaid);
  const dueCopy = getDueCopy(service.lastDueDate, service.isPaid);
  const insights = service.insights;
  const breakup = service.billBreakup;

  async function copyNum() {
    try { await navigator.clipboard.writeText(service.serviceNumber); toast.success('Copied'); }
    catch { toast.error('Copy failed'); }
  }

  return (
    <article className={`scard scard--${status.toLowerCase()}`}>

      {/* ── Top bar ──────────────────────────────────────── */}
      <div className="scard__topbar">
        <div className={`scard__status-dot scard__status-dot--${status.toLowerCase()}`} />
        <div className="scard__topbar-info">
          <h3 className="scard__name">{service.label || 'Untitled'}</h3>
          <p className="scard__customer">
            {(service.customerName && service.customerName !== service.label) ? service.customerName : (service.customerName || 'Untitled')}
          </p>
          <button className="scard__num" onClick={copyNum}>
            <FiCopy size={10} />{service.serviceNumber}
          </button>
        </div>
        <span className={`pill pill--${status.toLowerCase()}`}>{status.replace('_', ' ')}</span>
        <div className="scard__actions">
          <button className={`icon-btn ${refreshing ? 'icon-btn--spin' : ''}`} onClick={onRefresh} disabled={refreshing} title="Refresh">
            <FiRefreshCw size={15} />
          </button>
          <div className="scard__menu-wrap">
            <button className="icon-btn" onClick={() => setMenuOpen(v => !v)} onBlur={() => setTimeout(() => setMenuOpen(false), 150)}>
              <FiMoreVertical size={15} />
            </button>
            {menuOpen && (
              <div className="popover">
                <button onMouseDown={() => { setMenuOpen(false); onTogglePin(); }}>
                  {service.pinned ? <BsPinFill size={13} /> : <BsPin size={13} />} {service.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button onMouseDown={() => { setMenuOpen(false); onEdit(); }}><FiEdit2 size={13} /> Edit</button>
                <button className="danger" onMouseDown={() => { setMenuOpen(false); onDelete(); }}><FiTrash2 size={13} /> Trash</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Hero amount ──────────────────────────────────── */}
      <div className="scard__hero">
        <div className="scard__hero-left">
          <p className="scard__hero-label">Amount due</p>
          <p className="scard__hero-amount">{status === 'DUE' ? formatInr(service.lastAmountDue) : '₹0'}</p>
          {status === 'DUE' && insights?.vsLastMonth && (
            <TrendBadge value={insights.vsLastMonth.amount} unit="₹" percent={insights.vsLastMonth.amountPct} />
          )}
        </div>
        <div className="scard__hero-right">
          {dueCopy && !service.isPaid && <span className={`due-tag due-tag--${dueTone}`}>{dueCopy}</span>}
          {service.isPaid && (
            <span className="paid-tag"><FiCheckCircle size={12} /> Paid</span>
          )}
          {/* <div className="scard__foot"> */}
            {service.isPaid
              ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <span className="receipt-line">{formatInr(service.paidAmount)} · {formatDate(service.paidDate)}</span>
                  <button className="btn btn--ghost" onClick={onPay} style={{ height: '26px', padding: '0 8px', fontSize: '11.5px', marginTop: '2px', color: 'var(--primary)' }}><FiExternalLink size={11} /> Pay More</button>
                </div>
              )
              : <span />}
            {status === 'DUE' && Number(service.lastAmountDue || 0) > 0 && (
              <button className="btn btn--pay" onClick={onPay}><FiExternalLink size={13} /> Pay now</button>
            )}
          {/* </div> */}
        </div>
      </div>

      {/* ── Key metrics row ──────────────────────────────── */}
      <div className="scard__kv">
        <div className="kv"><span>Bill date</span><b>{formatDate(service.lastBillDate)}</b></div>
        <div className="kv"><span>Due date</span><b>{formatDate(service.lastDueDate)}</b></div>
        <div className="kv">
          <span>Units</span>
          <b>{service.lastBilledUnits == null ? '—' : Number(service.lastBilledUnits).toLocaleString('en-IN')} <TrendBadge value={insights.vsLastMonth.units} unit="u" percent={insights.vsLastMonth.unitsPct} /></b>
        </div>
        <div className="kv"><span>Updated</span><b title={formatDateTime(service.lastFetchedAt)}>{fromNow(service.lastFetchedAt)}</b></div>
      </div>

      {/* ── Quick stats ──────────────────────────────────── */}
      {insights && (
        <div className="scard__chips">
          <div className="chip"><span>Avg/mo</span><b>{formatInr(insights.avgAmount)}</b></div>
          {insights.avgUnits6m != null && <div className="chip"><span>Avg units</span><b>{insights.avgUnits6m.toLocaleString('en-IN')} u - 6m</b><b>{insights.avgUnits12m.toLocaleString('en-IN')} u - 12m</b></div>}
          {insights.vsSameMonthLastYear && (
            <div className="chip"><span>vs last yr</span><TrendBadge value={insights.vsSameMonthLastYear.amount} unit="₹" percent={insights.vsSameMonthLastYear.amountPct} /></div>
          )}
        </div>
      )}

      {/* ── Error ────────────────────────────────────────── */}
      {service.lastError && (
        <div className="scard__error"><FiAlertTriangle size={12} />{service.lastError}</div>
      )}

      {/* ── Accordions ───────────────────────────────────── */}
      {breakup && (
        <Section title="Bill Breakup" badge={formatInr(breakup.netDue ?? breakup.grossTotal ?? 0)}>
          <BreakupPanel breakup={breakup} />
        </Section>
      )}

      {Array.isArray(service.lastThreeAmounts) && service.lastThreeAmounts.length > 0 && (
        <Section title="Recent Bills">
          <div className="hist-list">
            {service.lastThreeAmounts.map((b, i) => (
              <div key={i} className="hist-row">
                <span className="hist-date">{formatDate(b.paidDate || b.billDate)}</span>
                <span className="hist-units">{b.billedUnits != null ? `${Number(b.billedUnits).toLocaleString('en-IN')} u` : ''}</span>
                <b className="hist-amt">{formatInr(b.billAmount)}</b>
              </div>
            ))}
          </div>
        </Section>
      )}

      {service.trendData?.length > 0 && (
        <Section title="Trends">
          <TrendPanel data={service.trendData} insights={insights} />
        </Section>
      )}

      {service.paymentHistory?.length > 0 && (
        <Section title="Payment History" badge={`${service.paymentHistory.length}`}>
          <PaymentsPanel payments={service.paymentHistory} />
        </Section>
      )}

      {/* ── Footer ───────────────────────────────────────── */}
      {/* <div className="scard__foot">
        {service.isPaid
          ? <span className="receipt-line"><FiCheckCircle size={12}/>{service.receiptNumber || '—'} · {formatInr(service.paidAmount)} · {formatDate(service.paidDate)}</span>
          : <span/>}
        {status === 'DUE' && Number(service.lastAmountDue || 0) > 0 && (
          <button className="btn btn--pay" onClick={onPay}><FiExternalLink size={13}/> Pay now</button>
        )}
      </div> */}
    </article>
  );
}

// ── Breakup panel ─────────────────────────────────────────────────────────────

function BreakupPanel({ breakup, isPaid, paidAmount }) {
  const rows = [
    { label: 'Energy Charges', key: 'ec', color: '#6366f1' },
    { label: 'Fixed Charges', key: 'fixchg', color: '#06b6d4' },
    { label: 'Customer Charges', key: 'cc', color: '#f59e0b' },
    { label: 'Electricity Duty', key: 'ed', color: '#10b981' },
    { label: 'Fuel Surcharge', key: 'fsa', color: '#8b5cf6' },
  ];
  const total = breakup.grossTotal || 1;
  return (
    <div className="bp">
      {/* Proportional bar */}
      <div className="bp__bar">
        {rows.map(r => (
          <div key={r.key} className="bp__seg" style={{ flex: breakup[r.key] / total, background: r.color }} title={r.label} />
        ))}
      </div>
      {/* Rows */}
      {rows.map(r => (
        <div key={r.key} className="bp__row">
          <span className="bp__dot" style={{ background: r.color }} />
          <span className="bp__label">{r.label}</span>
          <span className="bp__pct">{((breakup[r.key] || 0) / total * 100).toFixed(1)}%</span>
          <b className="bp__val">{formatInr(breakup[r.key] || 0)}</b>
        </div>
      ))}
      <div className="bp__row bp__row--sub"><span className="bp__label">Gross Total</span><b>{formatInr(breakup.grossTotal || 0)}</b></div>
      {breakup.isd !== 0 && breakup.isd != null && (
        <div className={`bp__row bp__row--deduction ${breakup.isd < 0 ? 'credit' : ''}`}>
          <span className="bp__label">Initial Security Deposit</span>
          <b>{formatInr(breakup.isd)}</b>
        </div>
      )}
      {breakup.arrearsTotal > 0 && (
        <>
          <div className="bp__divider">Advance Payments (Arrears)</div>
          {Array.isArray(breakup.arrears) && breakup.arrears.map((a, i) => (
            <div key={i} className="bp__row bp__row--arrear">
              <FiCheckCircle size={11} color="#10b981" />
              <span className="bp__label mono-sm">{a.receiptNo || `Payment ${i + 1}`} <small>({formatDate(a.date)})</small></span>
              <b className="credit">−{formatInr(a.amount)}</b>
            </div>
          ))}
          <div className="bp__row bp__row--arrear"><span className="bp__label">Total Arrears</span><b className="credit">−{formatInr(breakup.arrearsTotal)}</b></div>
        </>
      )}
      {isPaid && paidAmount != null && (
        <div className="bp__row bp__row--arrear">
          <FiCheckCircle size={11} color="#10b981" />
          <span className="bp__label">Paid Amount</span>
          <b className="credit">−{formatInr(paidAmount)}</b>
        </div>
      )}
      <div className="bp__row bp__row--net">
        <span className="bp__label">Net Due</span>
        <b style={isPaid ? { color: 'var(--green)' } : {}}>{formatInr(isPaid ? 0 : (breakup.netDue ?? breakup.grossTotal ?? 0))}</b>
      </div>
    </div>
  );
}

// ── Trend panel ───────────────────────────────────────────────────────────────

function TrendPanel({ data, insights }) {
  const [view, setView] = useState('amount');
  const chartData = data.map(d => {
    const [yr, mo] = d.month.split('-');
    return { ...d, label: `${MO[+mo - 1]}'${yr.slice(2)}` };
  });

  return (
    <div className="trend">
      <div className="trend__head">
        <span className="trend__title">18-Month Trend</span>
        <div className="seg seg--xs">
          {['amount', 'units', 'combo'].map(v => (
            <button key={v} className={`seg__btn ${view === v ? 'seg__btn--active' : ''}`} onClick={() => setView(v)}>
              {v === 'amount' ? '₹' : v === 'units' ? 'U' : 'Both'}
            </button>
          ))}
        </div>
      </div>

      {view === 'amount' && (
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} interval={2} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={42} />
            <Tooltip content={<ChartTip />} />
            <Area type="monotone" dataKey="billAmount" name="Bill Amount" stroke="var(--primary)" fill="var(--primary-dim)" strokeWidth={2} dot={{ r: 2, fill: 'var(--primary)' }} />
            {insights?.avgAmount && <ReferenceLine y={insights.avgAmount} stroke="var(--text-3)" strokeDasharray="3 3" label={{ value: 'avg', fontSize: 8, fill: 'var(--text-3)', position: 'insideTopRight' }} />}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {view === 'units' && (
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} interval={2} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={42} />
            <Tooltip content={<ChartTip />} />
            <Area type="monotone" dataKey="billedUnits" name="Units" stroke="var(--cyan)" fill="var(--cyan-dim)" strokeWidth={2} dot={{ r: 2, fill: 'var(--cyan)' }} />
            {insights?.avgUnits && <ReferenceLine y={insights.avgUnits} stroke="var(--text-3)" strokeDasharray="3 3" label={{ value: 'avg', fontSize: 8, fill: 'var(--text-3)', position: 'insideTopRight' }} />}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {view === 'combo' && (
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: -18, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} interval={2} />
            <YAxis yAxisId="left" tickFormatter={fmtK} tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={42} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={36} />
            <Tooltip content={<ChartTip />} />
            <Area yAxisId="left" type="monotone" dataKey="billAmount" name="Bill Amount" stroke="var(--primary)" fill="var(--primary-dim)" strokeWidth={2} dot={{ r: 2, fill: 'var(--primary)' }} />
            <Line yAxisId="right" type="monotone" dataKey="billedUnits" name="Units" stroke="var(--cyan)" strokeWidth={2} dot={{ r: 2, fill: 'var(--cyan)' }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {insights && (
        <div className="trend__stats">
          <div className="tstat tstat--red">
            <span>Highest</span>
            <b>{formatInr(insights.maxAmount)}</b>
            <small>{fmtMonth(insights.maxAmountMonth)}</small>
          </div>
          <div className="tstat tstat--green">
            <span>Lowest</span>
            <b>{formatInr(insights.minAmount)}</b>
            <small>{fmtMonth(insights.minAmountMonth)}</small>
          </div>
          {insights.predictedNextBill && (
            <div className="tstat tstat--blue">
              <span>Next est.</span>
              <b>~{formatInr(insights.predictedNextBill)}</b>
              <small>{insights.predictedBasis || 'Seasonal'}</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Payments panel ────────────────────────────────────────────────────────────

function PaymentsPanel({ payments }) {
  return (
    <div className="pymt">
      {payments.map((p, i) => (
        <div key={i} className="pymt__row">
          <div className="pymt__left">
            <FiCalendar size={11} />
            <span>{formatDate(p.date)}</span>
          </div>
          <span className="mono-sm pymt__ref">{p.receiptNo || '—'}</span>
          <b>{formatInr(p.amount)}</b>
        </div>
      ))}
    </div>
  );
}