import { useState, useEffect, useRef } from 'react';
import {
  FiCopy, FiExternalLink, FiRefreshCw, FiMoreVertical,
  FiEdit2, FiTrash2, FiChevronDown, FiTrendingUp, FiTrendingDown,
  FiCalendar, FiCheckCircle, FiAlertTriangle, FiZap, FiInfo, FiClock, FiAlertCircle
} from 'react-icons/fi';
import { LuCalculator } from 'react-icons/lu';
import { BsPin, BsPinFill, BsQrCode } from 'react-icons/bs';
import toast from 'react-hot-toast';
import {
  ComposedChart, Area, BarChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { formatInr, formatDate, formatDateTime, fromNow, getDueTone, getDueCopy } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { generateAPSPDCLUpiString } from '../utils/qrcode.js';

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

export function ServiceCard({ id, service, refreshing, isFlashing, onRefresh, onEdit, onShowQR, onAbout, onDelete, onTogglePin, onPay, useAccordion, selected, selecting, onToggleSelect, onCalculateBill, cardStyle = 'rich' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!useAccordion);
  const [showUpdateInfoHead, setShowUpdateInfoHead] = useState(false);
  const [showUpdateInfoMetrics, setShowUpdateInfoMetrics] = useState(false);
  const { t } = useTranslation();
  const longPressTimer = useRef(null);
  const headUpdateRef = useRef(null);
  const metricsUpdateRef = useRef(null);

  useEffect(() => {
    setIsExpanded(!useAccordion);
  }, [useAccordion, cardStyle]);

  useEffect(() => {
    if (!showUpdateInfoHead && !showUpdateInfoMetrics) return;
    const handleEsc = (e) => { 
      if (e.key === 'Escape') {
        setShowUpdateInfoHead(false);
        setShowUpdateInfoMetrics(false);
      }
    };
    const handleClickOutside = (e) => {
      if (headUpdateRef.current && !headUpdateRef.current.contains(e.target)) {
        setShowUpdateInfoHead(false);
      }
      if (metricsUpdateRef.current && !metricsUpdateRef.current.contains(e.target)) {
        setShowUpdateInfoMetrics(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('touchstart', handleClickOutside);
    const handlePop = () => {
      setShowUpdateInfoHead(false);
      setShowUpdateInfoMetrics(false);
    };
    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('popstate', handlePop);
    };
  }, [showUpdateInfoHead, showUpdateInfoMetrics]);

  const status = service.lastStatus || 'UNKNOWN';
  const dueTone = getDueTone(service.lastDueDate, service.isPaid);
  const dueCopy = getDueCopy(service.lastDueDate, service.isPaid);
  const insights = service.insights;
  const breakup = service.billBreakup;

  async function copyNum() {
    try { 
      await navigator.clipboard.writeText(service.serviceNumber); 
      toast.success('Service number copied'); 
    }
    catch (e) { toast.error(`Copy failed: ${e?.message || 'Unknown error'}`); }
  }

  const touchPos = useRef({ x: 0, y: 0 });

  const handlePressStart = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    touchPos.current = { x: clientX, y: clientY };

    longPressTimer.current = setTimeout(() => {
      if (onToggleSelect && !selecting) {
        onToggleSelect(service.id);
        if (window.navigator.vibrate) window.navigator.vibrate(50);
      }
    }, 700);
  };

  const handlePressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePressMove = (e) => {
    if (!longPressTimer.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = Math.abs(clientX - touchPos.current.x);
    const dy = Math.abs(clientY - touchPos.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const isHistoryError = service.lastError?.includes('APSPDCL history unavailable');

  return (
    <article 
      id={id}
      className={`scard scard--${status.toLowerCase()} ${menuOpen ? 'scard--menu-open' : ''} ${selected ? 'scard--selected' : ''} ${isFlashing ? 'flash' : ''} ${isExpanded ? 'scard--expanded' : ''}`}
      onContextMenu={e => { if (longPressTimer.current || selecting) e.preventDefault(); }}
      style={{ overflow: 'visible' }}
    >
      {selecting && (
        <div 
          className="scard__select-overlay" 
          onClick={e => { e.stopPropagation(); onToggleSelect(service.id); }}
          style={{ position: 'absolute', inset: 0, zIndex: 5, cursor: 'pointer' }}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="scard__header" 
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onMouseMove={handlePressMove}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onTouchMove={handlePressMove}
      >
        <div className="scard__identity">
          {selecting && (
            <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', marginRight: '8px' }}>
              <input 
                type="checkbox" 
                checked={!!selected} 
                onChange={() => onToggleSelect(service.id)}
                onClick={e => e.stopPropagation()}
                style={{ width: '18px', height: '18px', margin: 0, padding: 0 }}
              />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div className={`scard__status-dot scard__status-dot--${status.toLowerCase()}`} />
            {service.pinned && <BsPinFill size={12} style={{ color: 'var(--primary-hi)' }} />}
          </div>
          <div className="scard__identity-text">
            <h3 className="scard__name" title={service.customerName}>{service.label || t('untitled')}</h3>
            <div className="scard__num-row">
              <span className="scard__num">{service.serviceNumber}</span>
              <button 
                className="icon-btn-micro" 
                onClick={(e) => { e.stopPropagation(); copyNum(); }} 
                title={t('copy')}
                style={{ position: 'relative', zIndex: 10 }}
              >
                <FiCopy size={12} />
              </button>
            </div>
          </div>
        </div>

        <div className="scard__header-right" style={{ position: 'relative', zIndex: 30 }}>
          {cardStyle === 'classic' && (
            <div 
              ref={headUpdateRef}
              className="scard__updated-at" 
              title={formatDateTime(service.lastFetchedAt)}
              onClick={(e) => { e.stopPropagation(); setShowUpdateInfoHead(!showUpdateInfoHead); }}
              style={{ fontSize: '10px', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <FiClock size={11} /> {fromNow(service.lastFetchedAt)}
            </div>
          )}
          {showUpdateInfoHead && cardStyle === 'classic' && (
            <div className="popover" style={{ position: 'absolute', top: '30px', right: '40px', width: 'max-content', zIndex: 110, padding: '8px 12px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>
               Updated: {formatDateTime(service.lastFetchedAt)}
            </div>
          )}

          <span className={`soft-badge soft-badge--${status.toLowerCase()}`}>{t(`filter_${status.toLowerCase()}`, status.replace('_', ' '))}</span>
          <div className="scard__menu-wrap">
            <button className="icon-btn-ghost" onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }} onBlur={() => setTimeout(() => setMenuOpen(false), 200)}>
              <FiMoreVertical size={16} />
            </button>
            {menuOpen && (
              <div className="popover" onMouseDown={e => e.stopPropagation()} style={{ zIndex: 100 }}>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onTogglePin(); }}>
                  {service.pinned ? <BsPinFill size={13} /> : <BsPin size={13} />} {service.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}><FiEdit2 size={13} /> Edit</button>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onShowQR?.(service); }}>
                  <BsQrCode size={13} /> Show QR Code
                </button>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onCalculateBill?.(service); }}>
                  <LuCalculator size={13} /> {t('calculate_next_bill')}
                </button>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onAbout(); }}><FiInfo size={13} /> {t('about_service')}</button>
                <button className="danger" onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}><FiTrash2 size={13} /> Trash</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero / Amount ───────────────────────────────────────────── */}
      <div className="scard__hero-main" onClick={useAccordion ? () => setIsExpanded(!isExpanded) : undefined}>
        <div className="scard__hero-content">
          <p className="scard__hero-label">{t('amount_due')}</p>
          <div className="scard__hero-val">
            <h2 className="scard__hero-amount">
              {status === 'DUE' ? formatInr(service.lastAmountDue) : '₹0'}
            </h2>
          </div>
          <div className="scard__hero-meta">
            {insights?.vsLastMonth && (
              <div style={{marginBottom: '4px'}}>
                 <TrendBadge value={insights?.vsLastMonth.amount} unit="₹" percent={insights?.vsLastMonth.amountPct} />
              </div>
            )}
            {dueCopy && !service.isPaid && <span className={`text-${dueTone}`}>{dueCopy} (Due {formatDate(service.lastDueDate)})</span>}
            {service.isPaid && (
              <span className="text-green" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FiCheckCircle size={12} /> {t('paid')} <b>{formatInr(service.paidAmount)}</b> on {formatDate(service.paidDate)}
              </span>
            )}
          </div>
        </div>
        
        {status === 'DUE' && Number(service.lastAmountDue || 0) > 0 && (
          <div className="scard__hero-qr" onClick={(e) => { e.stopPropagation(); onShowQR?.(service); }} title={t('show_qr')} style={{ position: 'relative', zIndex: 10 }}>
            <QRCodeSVG value={generateAPSPDCLUpiString(service) || ''} size={44} level="L" includeMargin={false} />
          </div>
        )}
      </div>

      {/* ── Quick Metrics (Visible when collapsed in rich mode, or always when expanded) ────────────────── */}
      {(cardStyle === 'rich' || isExpanded) && (
        <div className="scard__quick-metrics" onClick={useAccordion ? () => setIsExpanded(!isExpanded) : undefined} style={{ cursor: useAccordion ? 'pointer' : 'default', paddingBottom: (service.lastThreeAmounts?.length > 0) ? '8px' : '14px' }}>
          <div className="qm-item">
            <span className="qm-label">{t('units')}</span>
            <span className="qm-val">
              {service.lastBilledUnits == null ? '—' : Number(service.lastBilledUnits).toLocaleString('en-IN')} 
              <span style={{fontSize: '9px', fontWeight: '500', marginLeft:'2px', color: 'var(--text-3)'}}>u</span>
            </span>
          </div>
          <div className="qm-item">
            <span className="qm-label">{t('bill_date')}</span>
            <span className="qm-val">{formatDate(service.lastBillDate)}</span>
          </div>
          <div ref={metricsUpdateRef} className="qm-item" onClick={(e) => { e.stopPropagation(); setShowUpdateInfoMetrics(!showUpdateInfoMetrics); }} style={{ cursor: 'pointer', position: 'relative' }}>
            <span className="qm-label">{t('last_updated')}</span>
            <span className="qm-val" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FiClock size={11} /> {fromNow(service.lastFetchedAt)}
            </span>
            {showUpdateInfoMetrics && (
              <div className="popover" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px', width: 'max-content', zIndex: 110, padding: '8px 12px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                 Updated: {formatDateTime(service.lastFetchedAt)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Quick History Chips (Visible when collapsed in rich mode, or always when expanded) ────────────────── */}
      {(cardStyle === 'rich' || isExpanded) && Array.isArray(service.lastThreeAmounts) && service.lastThreeAmounts.length > 0 && (
        <div className="scard__chips" style={{ borderTop: 'none' }}>
          {service.lastThreeAmounts.map((b, i) => {
            const date = new Date(b.paidDate || b.billDate);
            const label = `${MO[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`;
            return (
              <div key={i} className="chip" style={{ minWidth: 'auto', flex: '1', padding: '4px 8px' }}>
                <span style={{ fontSize: '9px' }}>{label}</span>
                <b style={{ fontSize: '11px' }}>{formatInr(b.billAmount)}</b>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Action Bar ──────────────────────────────────────────────── */}
      <div className="scard__action-bar" onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 20 }}>
        <div className="scard__action-left">
          <button className="btn-ghost-sm" onClick={onRefresh} disabled={refreshing}>
            <FiRefreshCw size={14} className={refreshing ? 'spin' : ''} /> {t('refresh')}
          </button>
        </div>
        <div className="scard__action-right">
          {status === 'DUE' && Number(service.lastAmountDue || 0) > 0 ? (
            <>
              <button 
                className="btn btn--secondary btn--sm" 
                onClick={(e) => { e.stopPropagation(); onCalculateBill?.(service); }} 
                title="Calculator"
              >
                <LuCalculator size={14} />
              </button>
              <button className="btn btn--pay btn--sm" onClick={onPay}>
                {t('pay_now')}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn--secondary btn--sm" onClick={(e) => { e.stopPropagation(); onShowQR?.(service); }}>
                <BsQrCode size={14} /> <span className="hide-mobile-sm" style={{marginLeft:'4px'}}>QR</span>
              </button>
              <button className="btn btn--secondary btn--sm" onClick={(e) => { e.stopPropagation(); onCalculateBill?.(service); }}>
                <LuCalculator size={14} /> <span className="hide-mobile-sm" style={{marginLeft:'4px'}}>{t('calculate_next_bill')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Expanded Body ──────────────────────────────────────────── */}
      <div className={`scard__body ${isExpanded ? 'scard__body--expanded' : ''}`}>
        <div className="scard__body-inner">
          {insights && (
            <Section title="Consumption Insights" defaultOpen={false}>
              <div style={{ padding: '0 10px' }}>
                 <div className="receipt-row">
                    <span className="receipt-row__label">Units Vs Last Month</span>
                    <TrendBadge value={insights.vsLastMonth?.units} unit="u" percent={insights.vsLastMonth?.unitsPct} />
                 </div>
                 {insights.vsLastMonth?.amount != null && (
                   <div className="receipt-row">
                      <span className="receipt-row__label">Amount Vs Last Month</span>
                      <TrendBadge value={insights.vsLastMonth.amount} unit="₹" percent={insights.vsLastMonth.amountPct} />
                   </div>
                 )}
                 {insights.vsSameMonthLastYear && (
                   <>
                     <div className="receipt-row">
                        <span className="receipt-row__label">Units Vs Last Year</span>
                        <TrendBadge value={insights.vsSameMonthLastYear.units} unit="u" percent={insights.vsSameMonthLastYear.unitsPct} />
                     </div>
                     <div className="receipt-row">
                        <span className="receipt-row__label">Amount Vs Last Year</span>
                        <TrendBadge value={insights.vsSameMonthLastYear.amount} unit="₹" percent={insights.vsSameMonthLastYear.amountPct} />
                     </div>
                   </>
                 )}
                 <div className="receipt-row">
                    <span className="receipt-row__label">{t('avg_mo')}</span>
                    <b className="receipt-row__val">{formatInr(insights.avgAmount)}</b>
                 </div>
                 <div className="receipt-row">
                    <span className="receipt-row__label">Avg Units (Last 6m)</span>
                    <b className="receipt-row__val">{insights.avgUnits6m?.toLocaleString('en-IN') || '—'} u</b>
                 </div>
                 <div className="receipt-row">
                    <span className="receipt-row__label">Avg Units (Last 12m)</span>
                    <b className="receipt-row__val">{insights.avgUnits12m?.toLocaleString('en-IN') || '—'} u</b>
                 </div>
              </div>
            </Section>
          )}

          {breakup && (
            <Section title={t('bill_breakup')} badge={formatInr(breakup.netDue ?? breakup.grossTotal ?? 0)}>
              <BreakupPanel breakup={breakup} isPaid={service.isPaid} paidAmount={service.paidAmount} t={t} />
            </Section>
          )}

          {service.trendData?.length > 0 && (
            <Section title={t('trends')}>
              <TrendPanel data={service.trendData} insights={insights} t={t} />
            </Section>
          )}

          <Section 
            title={t('payment_history')} 
            badge={isHistoryError ? <span style={{display:'flex', alignItems:'center', gap: '4px'}}><FiAlertTriangle size={12}/> Sync Error</span> : `${service.paymentHistory?.length || 0}`}
          >
            {isHistoryError && (
              <div className="scard__error" style={{ margin: '8px 10px' }}>
                <FiAlertTriangle size={12} />
                APSPDCL payment history is unavailable for this service number
              </div>
            )}
            {service.paymentHistory?.length > 0 ? (
              <PaymentsPanel payments={service.paymentHistory} t={t} />
            ) : !isHistoryError && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
                No payment records found
              </div>
            )}
          </Section>
        </div>
      </div>
    </article>
  );
}

function BreakupPanel({ breakup, isPaid, paidAmount, t }) {
  const rows = [
    { label: t('energy_charges', 'Energy Charges'), key: 'ec', color: '#6366f1' },
    { label: t('fixed_charges', 'Fixed Charges'), key: 'fixchg', color: '#06b6d4' },
    { label: t('customer_charges', 'Customer Charges'), key: 'cc', color: '#f59e0b' },
    { label: t('electricity_duty', 'Electricity Duty'), key: 'ed', color: '#10b981' },
    { label: t('fuel_surcharge', 'Fuel Surcharge'), key: 'fsa', color: '#8b5cf6' },
  ];
  const total = breakup.grossTotal || 1;
  return (
    <div className="bp">
      <div className="bp__bar">
        {rows.map(r => (
          <div key={r.key} className="bp__seg" style={{ flex: breakup[r.key] / total, background: r.color }} title={r.label} />
        ))}
      </div>
      
      {rows.map(r => (
        <div key={r.key} className="receipt-row">
          <span className="receipt-row__label">
            <span className="bp__dot" style={{ background: r.color }} />
            {r.label}
          </span>
          <b className="receipt-row__val">{formatInr(breakup[r.key] || 0)}</b>
        </div>
      ))}
      
      <div style={{ borderTop: '1px dashed var(--border-md)', margin: '8px 0' }} />
      <div className="receipt-row">
        <span className="receipt-row__label">{t('gross_total')}</span>
        <b className="receipt-row__val">{formatInr(breakup.grossTotal || 0)}</b>
      </div>
      
      {breakup.isd !== 0 && breakup.isd != null && (
        <div className="receipt-row">
          <span className="receipt-row__label">{t('isd')}</span>
          <b className="receipt-row__val" style={{ color: breakup.isd < 0 ? 'var(--green)' : 'inherit' }}>{formatInr(breakup.isd)}</b>
        </div>
      )}
      
      {breakup.arrearsTotal > 0 && (
        <>
          <div style={{ borderTop: '1px dashed var(--border-md)', margin: '8px 0' }} />
          {Array.isArray(breakup.arrears) && breakup.arrears.map((a, i) => (
            <div key={i} className="receipt-row">
              <span className="receipt-row__label">
                <FiCheckCircle size={12} color="var(--green)" /> 
                {a.receiptNo || `Payment ${i + 1}`} 
                <small style={{fontWeight:'normal', marginLeft: '4px'}}>({formatDate(a.date)})</small>
              </span>
              <b className="receipt-row__val credit">−{formatInr(a.amount)}</b>
            </div>
          ))}
          <div className="receipt-row">
            <span className="receipt-row__label">{t('total_arrears')}</span>
            <b className="receipt-row__val credit">−{formatInr(breakup.arrearsTotal)}</b>
          </div>
        </>
      )}
      
      {isPaid && paidAmount != null && (
        <div className="receipt-row">
          <span className="receipt-row__label">
            <FiCheckCircle size={12} color="var(--green)" /> {t('paid_amount')}
          </span>
          <b className="receipt-row__val credit">−{formatInr(paidAmount)}</b>
        </div>
      )}
      
      <div className="receipt-row receipt-row--net">
        <span className="receipt-row__label">{t('net_due')}</span>
        <b className="receipt-row__val">{formatInr(isPaid ? 0 : (breakup.netDue ?? breakup.grossTotal ?? 0))}</b>
      </div>
    </div>
  );
}

function TrendPanel({ data, insights, t }) {
  const [view, setView] = useState('amount');
  const chartData = data.map(d => {
    const [yr, mo] = d.month.split('-');
    return { ...d, label: `${MO[+mo - 1]}'${yr.slice(2)}` };
  });

  return (
    <div className="trend">
      <div className="trend__head">
        <span className="trend__title">{t('18_month_trend')}</span>
        <div className="seg seg--xs">
          {['amount', 'units', 'combo'].map(v => (
            <button key={v} className={`seg__btn ${view === v ? 'seg__btn--active' : ''}`} onClick={() => setView(v)}>
              {v === 'amount' ? '₹' : v === 'units' ? 'U' : t('both')}
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
            <ReferenceLine y={insights?.avgUnits} stroke="var(--text-3)" strokeDasharray="3 3" label={{ value: 'avg', fontSize: 8, fill: 'var(--text-3)', position: 'insideTopRight' }} />
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
            <span>{t('highest')}</span>
            <b>{formatInr(insights.maxAmount)}</b>
            <small>{fmtMonth(insights.maxAmountMonth)}</small>
          </div>
          <div className="tstat tstat--green">
            <span>{t('lowest')}</span>
            <b>{formatInr(insights.minAmount)}</b>
            <small>{fmtMonth(insights.minAmountMonth)}</small>
          </div>
          {insights.predictedNextBill && (
            <div className="tstat tstat--blue">
              <span>{t('next_est')}</span>
              <b>~{formatInr(insights.predictedNextBill)}</b>
              <small>{insights.predictedBasis || 'Seasonal'}</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentsPanel({ payments, t }) {
  return (
    <div className="pymt">
      {payments.map((p, i) => (
        <div key={i} className="pymt__row">
          <div className="pymt__left">
            <FiCalendar size={11} />
            <span>{formatDate(p.date)}</span>
          </div>
          <span className="mono-sm pymt__ref" title={p.receiptNo || '—'}>{p.receiptNo || '—'}</span>
          <span className="mono-sm pymt__counter">{p.counter || '—'}</span>
          <b>{formatInr(p.amount)}</b>
        </div>
      ))}
    </div>
  );
}
