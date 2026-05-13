import { useState } from 'react';
import {
  FiCopy, FiExternalLink, FiRefreshCw, FiMoreVertical,
  FiEdit2, FiTrash2, FiChevronDown, FiChevronUp,
  FiAlertTriangle, FiTrendingUp, FiTrendingDown, FiZap,
  FiCalendar, FiCheckCircle, FiActivity,
} from 'react-icons/fi';
import { BsPin, BsPinFill } from 'react-icons/bs';
import toast from 'react-hot-toast';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, ComposedChart, Area,
} from 'recharts';
import {
  formatInr, formatDate, formatDateTime, fromNow,
  getDueTone, getDueCopy,
} from '../../../shared/utils/index.js';

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <p className="chart-tip__label">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name.includes('Units') ? `${Number(p.value).toLocaleString('en-IN')} u` : formatInr(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── Trend badge ───────────────────────────────────────────────────────────────
function TrendBadge({ value, unit = '', percent = null }) {
  if (value == null) return null;
  const up = value > 0;
  const zero = value === 0;
  const label = zero
    ? 'Same'
    : `${up ? '+' : ''}${unit === '₹' ? formatInr(Math.abs(value)) : `${Math.abs(value).toLocaleString('en-IN')} ${unit}`}`;
  const pctLabel = percent != null ? ` (${percent > 0 ? '+' : ''}${percent.toFixed(0)}%)` : '';

  return (
    <span className={`trend-badge trend-badge--${zero ? 'neutral' : up ? 'up' : 'down'}`}>
      {zero ? '=' : up ? <FiTrendingUp size={11} /> : <FiTrendingDown size={11} />}
      {label}{pctLabel}
    </span>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────
export function ServiceCard({ service, refreshing, onRefresh, onEdit, onDelete, onTogglePin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState('charts'); // charts | payments | breakup

  const status = service.lastStatus || 'UNKNOWN';
  const dueTone = getDueTone(service.lastDueDate, service.isPaid);
  const dueCopy = getDueCopy(service.lastDueDate, service.isPaid);
  const insights = service.insights;
  const trendData = service.trendData;
  const hasDetail = !!(trendData?.length || service.billHistory?.length || service.paymentHistory?.length);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(service.serviceNumber);
      toast.success('Service number copied');
    } catch { toast.error('Copy failed'); }
  }

  async function payNow() {
    await copyNumber();
    window.open('https://payments.billdesk.com/MercOnline/SPDCLController', '_blank', 'noopener,noreferrer');
  }

  return (
    <article className={`scard scard--${status.toLowerCase()}${detailOpen ? ' scard--expanded' : ''}`}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="scard__header">
        <div className="scard__title-col">
          <div className="scard__title-row">
            <h3 className="scard__name">{service.label || 'Untitled'}</h3>
            <span className={`pill pill--${status.toLowerCase()}`}>
              {status.replace('_', ' ')}
            </span>
          </div>
          <button className="scard__num" onClick={copyNumber}>
            <FiCopy size={12} />
            {service.serviceNumber}
          </button>
        </div>

        <div className="scard__actions">
          <button className="icon-btn" onClick={onTogglePin} title={service.pinned ? 'Unpin' : 'Pin'}>
            {service.pinned ? <BsPinFill size={16} /> : <BsPin size={16} />}
          </button>
          <button
            className={`icon-btn ${refreshing ? 'icon-btn--spinning' : ''}`}
            onClick={onRefresh} disabled={refreshing} title="Refresh"
          >
            <FiRefreshCw size={16} />
          </button>
          <div className="scard__menu">
            <button className="icon-btn" onClick={() => setMenuOpen(v => !v)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}>
              <FiMoreVertical size={16} />
            </button>
            {menuOpen && (
              <div className="scard__popover">
                <button onMouseDown={() => { setMenuOpen(false); onEdit(); }}>
                  <FiEdit2 size={13} /> Edit
                </button>
                <button className="danger" onMouseDown={() => { setMenuOpen(false); onDelete(); }}>
                  <FiTrash2 size={13} /> Move to trash
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Amount box ──────────────────────────────────────── */}
      <div className="scard__amount-box">
        <div>
          <p className="label">Amount due</p>
          <strong className="amount">
            {status === 'DUE' ? formatInr(service.lastAmountDue) : '₹0'}
          </strong>
          {status === 'DUE' && insights?.vsLastMonth && (
            <div style={{ display:'flex', gap: 5, marginTop: 4 }}>
              <TrendBadge
                value={insights.vsLastMonth.amount}
                unit="₹"
                percent={insights.vsLastMonth.amountPct}
              />
              <span className="scard__vs-label"> vs last month</span>
            </div>
          )}
        </div>
        <div className="scard__amount-right">
          {dueCopy && <span className={`due-chip due-chip--${dueTone}`}>{dueCopy}</span>}
          {/* {insights?.predictedNextBill && (
            <div className="predict-chip">
              <FiActivity size={11} />
              Next ~{formatInr(insights.predictedNextBill)}
              {insights.predictedNextBillRange && insights.predictedNextBillRange !== `${insights.predictedNextBill}` && (
                <small>
                  {' '}
                  ({insights.predictedNextBillRange.split(' - ').map((value) => formatInr(Number(value))).join(' - ')})
                </small>
              )}
              {insights.predictedNextUnits != null && (
                <span>
                  {' '}· {Number(insights.predictedNextUnits).toLocaleString('en-IN')}u
                  {insights.predictedNextUnitsRange && insights.predictedNextUnitsRange !== `${insights.predictedNextUnits}` && (
                    <small> ({insights.predictedNextUnitsRange})</small>
                  )}
                </span>
              )}
            </div>
          )} */}
        </div>
      </div>

      {/* ── Metrics grid ────────────────────────────────────── */}
      <dl className="scard__metrics">
        <div>
          <dt>Bill date</dt>
          <dd>{formatDate(service.lastBillDate)}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{formatDate(service.lastDueDate)}</dd>
        </div>
        <div>
          <dt>Units</dt>
          <dd>
            {service.lastBilledUnits == null ? '—' : Number(service.lastBilledUnits).toLocaleString('en-IN')}
            {insights?.vsLastMonth?.units != null && (
              <TrendBadge
                value={insights.vsLastMonth.units}
                unit="u"
                percent={insights.vsLastMonth.unitsPct}
              />
            )}
          </dd>
        </div>
        <div>
          <dt>Refreshed</dt>
          <dd title={formatDateTime(service.lastFetchedAt)}>{fromNow(service.lastFetchedAt)}</dd>
        </div>
      </dl>

      {/* ── Quick insights row ───────────────────────────────── */}
      {insights && (
        <div className="scard__insights">
          <div className="insight-chip">
            <span className="insight-chip__label">Avg/mo</span>
            <strong>{formatInr(insights.avgAmount)}</strong>
          </div>
          <div className="insight-chip">
            <span className="insight-chip__label">Avg units</span>
            <strong>
              {insights.avgUnits6m != null ? `${insights.avgUnits6m.toLocaleString('en-IN')}u - 6m` : '—'}
            </strong>
            <strong>
              {insights.avgUnits12m != null ? `${insights.avgUnits12m.toLocaleString('en-IN')}u - 12m` : ''}
            </strong>
          </div>
          {insights.vsSameMonthLastYear && (
            <div className="insight-chip">
              <span className="insight-chip__label">vs last yr</span>
              <TrendBadge
                value={insights.vsSameMonthLastYear.amount}
                unit="₹"
                percent={insights.vsSameMonthLastYear.amountPct}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Bill Breakup ─────────────────────────────────────── */}
      {service.billBreakup && (
        <BillBreakup breakup={service.billBreakup} />
      )}

      {/* ── History strip ────────────────────────────────────── */}
      {Array.isArray(service.lastThreeAmounts) && service.lastThreeAmounts.length > 0 && (
        <>
          <div className="scard__history-label">Last 3 months payments</div>
          <div className="scard__history">
            {service.lastThreeAmounts.map((b) => (
              <span key={`${b.billDate}-${b.billAmount}`}>
                <span className="history-date">
                  {formatDate(b.paidDate || b.billDate)}
                </span>
                <div>
                  <b>{formatInr(b.billAmount)}</b>
                  {b.billedUnits != null && (
                    <small> ({Number(b.billedUnits).toLocaleString('en-IN')}u)</small>
                  )}
                </div>
              </span>
            ))}
          </div>
        </>
      )}

      {/* ── Error ────────────────────────────────────────────── */}
      {service.lastError && (
        <p className="scard__error"><FiAlertTriangle size={12} /> {service.lastError}</p>
      )}

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="scard__footer">
        {service.isPaid ? (
          <span className="receipt-line">
            <FiCheckCircle size={13} />
            {service.receiptNumber || '—'} · {formatInr(service.paidAmount)}
          </span>
        ) : <span />}
        <div className="scard__footer-right">
          {hasDetail && (
            <button className="btn btn--ghost btn--sm" onClick={() => setDetailOpen(v => !v)}>
              {detailOpen ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
              {detailOpen ? 'Insights' : 'Insights'}
            </button>
          )}
          {status === 'DUE' && Number(service.lastAmountDue || 0) > 0 && (
            <button className="btn btn--pay" onClick={payNow}>
              <FiExternalLink size={14} /> Pay now
            </button>
          )}
        </div>
      </div>

      {/* ── Detail panel ─────────────────────────────────────── */}
      {detailOpen && hasDetail && (
        <DetailPanel
          service={service}
          tab={detailTab}
          onTabChange={setDetailTab}
        />
      )}
    </article>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ service, tab, onTabChange }) {
  const tabs = [
    { id: 'charts',   label: 'Trends',   show: !!service.trendData?.length },
    { id: 'payments', label: 'Payments', show: !!service.paymentHistory?.length },
  ].filter(t => t.show);

  return (
    <div className="detail">
      {/* Tab bar */}
      <div className="detail__tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`detail__tab ${tab === t.id ? 'detail__tab--active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Charts tab */}
      {tab === 'charts' && service.trendData?.length > 0 && (
        <ChartsPanel data={service.trendData} insights={service.insights} />
      )}

      {/* Payment history tab */}
      {tab === 'payments' && service.paymentHistory?.length > 0 && (
        <PaymentHistoryPanel payments={service.paymentHistory} />
      )}

    </div>
  );
}

// ── Charts Panel ──────────────────────────────────────────────────────────────

function fmt(v) { return `₹${(v/1000).toFixed(1)}k`; }
function fmtU(v) { return `${v}u`; }

function ChartsPanel({ data, insights }) {
  const [view, setView] = useState('amount'); // amount | units | combo

  // Format month label: "2025-04" → "Apr'25"
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const chartData = data.map(d => {
    const [yr, mo] = d.month.split('-');
    return {
      ...d,
      label: `${MONTHS[parseInt(mo)-1]}'${yr.slice(2)}`,
    };
  });

  return (
    <div className="charts-panel">
      <div className="charts-panel__header">
        <span className="detail__section-title">18-Month Trend</span>
        <div className="seg seg--sm">
          {[
            { id: 'amount', label: 'Amount' },
            { id: 'units',  label: 'Units' },
            { id: 'combo',  label: 'Both' },
          ].map(v => (
            <button
              key={v.id}
              className={`seg__btn ${view === v.id ? 'seg__btn--active' : ''}`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-wrap">
        {view === 'amount' && (
          <div className="chart-block">
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="billAmount" name="Bill Amount" stroke="var(--accent)" fill="var(--accent-dim)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }} />
                {insights?.avgAmount && (
                  <ReferenceLine y={insights.avgAmount} stroke="var(--text-3)" strokeDasharray="4 3" label={{ value: 'avg', fontSize: 9, fill: 'var(--text-3)', position: 'insideTopRight' }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {view === 'units' && (
          <div className="chart-block">
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtU} tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="billedUnits" name="Units" stroke="var(--info)" strokeWidth={2} dot={{ r: 3, fill: 'var(--info)' }} />
                {insights?.avgUnits && (
                  <ReferenceLine y={insights.avgUnits} stroke="var(--text-3)" strokeDasharray="4 3" label={{ value: 'avg', fontSize: 9, fill: 'var(--text-3)', position: 'insideTopRight' }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {view === 'combo' && (
          <div className="chart-block" style={{ width: '100%' }}>
            <p className="chart-block__title">Amount + Units trend</p>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 40, left: -16, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="left"
                  tickFormatter={fmt}
                  tick={{ fontSize: 10, fill: 'var(--text-3)' }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={fmtU}
                  tick={{ fontSize: 10, fill: 'var(--text-3)' }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }} />
                <Area type="monotone" dataKey="billAmount" name="Bill Amount" stroke="var(--accent)" fill="var(--accent-dim)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }} />
                <Line yAxisId="right" type="monotone" dataKey="billedUnits" name="Units" stroke="var(--info)" strokeWidth={2} dot={{ r: 3, fill: 'var(--info)' }} />
                {insights?.avgAmount && (
                  <ReferenceLine y={insights.avgAmount} yAxisId="left" stroke="var(--text-3)" strokeDasharray="4 3" label={{ value: 'avg', fontSize: 9, fill: 'var(--text-3)', position: 'insideTopRight' }} />
                )}
                {insights?.avgUnits && (
                  <ReferenceLine y={insights.avgUnits} yAxisId="right" stroke="var(--text-3)" strokeDasharray="4 3" label={{ value: 'avg', fontSize: 9, fill: 'var(--text-3)', position: 'insideTopRight' }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Insight cards */}
      {insights && (
        <div className="insight-grid">
          <InsightCard
            label="Highest bill"
            value={formatInr(insights.maxAmount)}
            meta={formatMonthYear(insights.maxAmountMonth)}
            tone="danger"
          />
          <InsightCard
            label="Lowest bill"
            value={formatInr(insights.minAmount)}
            meta={formatMonthYear(insights.minAmountMonth)}
            tone="success"
          />
          {insights.predictedNextBill && (
            <InsightCard
              label="Predicted next bill"
              value={formatInr(insights.predictedNextBill)}
              meta={insights.predictedBasis}
              tone="info"
            />
          )}
        </div>
      )}
    </div>
  );
}

function InsightCard({ label, value, meta, tone = 'neutral' }) {
  return (
    <div className={`insight-card insight-card--${tone}`}>
      <span className="insight-card__label">{label}</span>
      <strong className="insight-card__value">{value}</strong>
      {meta && <span className="insight-card__meta">({meta})</span>}
    </div>
  );
}

function formatMonthYear(month) {
  if (!month) return null;
  const [year, mon] = month.split('-');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[Number(mon) - 1]}-${year}`;
}

// ── Payment History Panel ─────────────────────────────────────────────────────

function PaymentHistoryPanel({ payments }) {
  return (
    <div className="pay-history">
      <p className="detail__section-title">Payment History <span className="detail__count">{payments.length} records</span></p>
      <div className="pay-history__table">
        <div className="pay-history__head">
          <span>Date</span>
          <span>Receipt No</span>
          <span className="right">Amount</span>
        </div>
        {payments.map((p, i) => (
          <div key={`${p.date}-${i}`} className="pay-history__row">
            <span>
              <FiCalendar size={11} />
              {formatDate(p.date)}
            </span>
            <span className="mono small">{p.receiptNo || '—'}</span>
            <b className="right">{formatInr(p.amount)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Breakup Detail Panel ──────────────────────────────────────────────────────

function BreakupDetailPanel({ breakup }) {
  const rows = [
    { label: 'Energy Charges (EC)',      value: breakup.ec,     pct: breakup.grossTotal ? breakup.ec / breakup.grossTotal : 0, color: 'var(--accent)' },
    { label: 'Fixed Charges',            value: breakup.fixchg, pct: breakup.grossTotal ? breakup.fixchg / breakup.grossTotal : 0, color: 'var(--info)' },
    { label: 'Customer Charges',         value: breakup.cc,     pct: breakup.grossTotal ? breakup.cc / breakup.grossTotal : 0, color: 'var(--warning)' },
    { label: 'Electricity Duty (ED)',     value: breakup.ed,     pct: breakup.grossTotal ? breakup.ed / breakup.grossTotal : 0, color: 'var(--success)' },
    { label: 'Fuel Surcharge (FSA)',      value: breakup.fsa,    pct: breakup.grossTotal ? breakup.fsa / breakup.grossTotal : 0, color: '#a78bfa' },
  ];

  return (
    <div className="breakup-detail">
      <p className="detail__section-title">Charge Breakdown</p>

      {/* Visual bar */}
      <div className="breakup-bar">
        {rows.map(r => (
          <div key={r.label} className="breakup-bar__seg" style={{ width: `${r.pct * 100}%`, background: r.color }} title={`${r.label}: ${formatInr(r.value)}`} />
        ))}
      </div>

      {/* Rows with bar */}
      <div className="breakup-rows">
        {rows.map(r => (
          <div key={r.label} className="breakup-row-detail">
            <div className="breakup-row-detail__info">
              <span className="breakup-dot" style={{ background: r.color }} />
              <span>{r.label}</span>
            </div>
            <div className="breakup-row-detail__right">
              <span className="breakup-pct">{(r.pct * 100).toFixed(1)}%</span>
              <b>{formatInr(r.value)}</b>
            </div>
          </div>
        ))}

        <div className="breakup-row-detail breakup-row-detail--total">
          <span>Gross Total</span>
          <b>{formatInr(breakup.grossTotal)}</b>
        </div>

        {/* Arrears */}
        {breakup.arrearsTotal > 0 && (
          <>
            <div className="breakup-divider">Advance Payments (Arrears)</div>
            {Array.isArray(breakup.arrearPayments) && breakup.arrearPayments.map((a, i) => (
              <div key={i} className="breakup-row-detail breakup-row-detail--arrear">
                <div className="breakup-row-detail__info">
                  <FiCheckCircle size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  <span>
                    {a.receiptNo && <span className="mono small">{a.receiptNo}</span>}
                    {' '}<small>({formatDate(a.date)})</small>
                  </span>
                </div>
                <b className="credit">−{formatInr(a.amount)}</b>
              </div>
            ))}
            <div className="breakup-row-detail breakup-row-detail--arrear-total">
              <span>Total Arrears</span>
              <b className="credit">−{formatInr(breakup.arrearsTotal)}</b>
            </div>
          </>
        )}

        <div className="breakup-row-detail breakup-row-detail--net">
          <span>Net Amount Due</span>
          <b>{formatInr(breakup.netDue)}</b>
        </div>
      </div>
    </div>
  );
}

// ── Inline Bill Breakup (collapsed toggle on card) ───────────────────────────

function BillBreakup({ breakup }) {
  const [open, setOpen] = useState(false);

  const rows = [
    { label: 'Energy Charges', key: 'ec', value: breakup.ec },
    { label: 'Fixed Charges', key: 'fixchg', value: breakup.fixchg },
    { label: 'Customer Charges', key: 'cc', value: breakup.cc },
    { label: 'Electricity Duty', key: 'ed', value: breakup.ed },
    { label: 'Fuel Surcharge (FSA)', key: 'fsa', value: breakup.fsa },
  ];

  return (
    <div className={`breakup ${open ? 'breakup--open' : ''}`}>
      <button className="breakup__toggle" onClick={() => setOpen(v => !v)}>
        <span>Bill breakup</span>
        <span className="breakup__toggle-right">
          <strong>{formatInr(breakup.netDue ?? breakup.totalBill ?? 0)}</strong>
          <FiChevronDown size={15} className="chevron" />
        </span>
      </button>

      {open && (
        <div className="breakup__body">
          {rows.map(({ label, key, value }) => (
            <div key={key} className="breakup__row">
              <span>{label}</span>
              <b>{formatInr(value || 0)}</b>
            </div>
          ))}
          <div className="breakup__row breakup__row--subtotal">
            <span>Current Month Bill</span>
            <b>{formatInr(breakup.currentMonthBill || breakup.grossTotal || 0)}</b>
          </div>
          {breakup.arrearsTotal > 0 && (
            <div className="breakup__row breakup__row--arrear">
              <span>Arrears (Advance Payments)</span>
              <b className="credit">−{formatInr(breakup.arrearsTotal)}</b>
            </div>
          )}
          <div className="breakup__row breakup__row--net">
            <span>Total Amount Due</span>
            <b>{formatInr(breakup.netDue ?? breakup.totalBill ?? 0)}</b>
          </div>
        </div>
      )}
    </div>
  );
}