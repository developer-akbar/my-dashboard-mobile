import { useState } from 'react';
import {
  FiCopy, FiExternalLink, FiRefreshCw, FiMoreVertical,
  FiEdit2, FiTrash2, FiChevronDown
} from 'react-icons/fi';
import { BsPin, BsPinFill } from 'react-icons/bs';
import toast from 'react-hot-toast';
import {
  formatInr, formatDate, formatDateTime, fromNow,
  getDueTone, getDueCopy,
} from '../../../shared/utils/index.js';

export function ServiceCard({ service, refreshing, onRefresh, onEdit, onDelete, onTogglePin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = service.lastStatus || 'UNKNOWN';
  const dueTone = getDueTone(service.lastDueDate, service.isPaid);
  const dueCopy = getDueCopy(service.lastDueDate, service.isPaid);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(service.serviceNumber);
      toast.success('Service number copied');
    } catch {
      toast.error('Copy failed');
    }
  }

  async function payNow() {
    await copyNumber();
    window.open(
      'https://payments.billdesk.com/MercOnline/SPDCLController',
      '_blank',
      'noopener,noreferrer'
    );
  }

  return (
    <article className={`scard scard--${status.toLowerCase()}`}>
      {/* ── Header ──────────────────────────────────────── */}
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
          <button
            className="icon-btn"
            onClick={onTogglePin}
            title={service.pinned ? 'Unpin' : 'Pin'}
          >
            {service.pinned ? <BsPinFill size={16} /> : <BsPin size={16} />}
          </button>
          <button
            className={`icon-btn ${refreshing ? 'icon-btn--spinning' : ''}`}
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh"
          >
            <FiRefreshCw size={16} />
          </button>
          <div className="scard__menu">
            <button
              className="icon-btn"
              onClick={() => setMenuOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            >
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

      {/* ── Amount ──────────────────────────────────────── */}
      <div className="scard__amount-box">
        <div>
          <p className="label">Amount due</p>
          <strong className="amount">
            {status === 'DUE' ? formatInr(service.lastAmountDue) : '₹0'}
          </strong>
        </div>
        {dueCopy && (
          <span className={`due-chip due-chip--${dueTone}`}>{dueCopy}</span>
        )}
      </div>

      {/* ── Metrics ─────────────────────────────────────── */}
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
            {service.lastBilledUnits == null
              ? '—'
              : Number(service.lastBilledUnits).toLocaleString('en-IN')}
          </dd>
        </div>
        <div>
          <dt>Refreshed</dt>
          <dd title={formatDateTime(service.lastFetchedAt)}>
            {fromNow(service.lastFetchedAt)}
          </dd>
        </div>
      </dl>

      {/* ── Bill Breakup ─────────────────────────────────── */}
      {service.billBreakup && (
        <BillBreakup breakup={service.billBreakup} />
      )}

      {/* ── History strip ────────────────────────────────── */}
      {Array.isArray(service.lastThreeAmounts) &&
        service.lastThreeAmounts.length > 0 && (
          <div className="scard__history">
            {service.lastThreeAmounts.map((b) => (
              <span key={`${b.closingDate}-${b.billAmount}`}>
                {formatDate(b.closingDate)}&nbsp;
                <b>{formatInr(b.billAmount)}</b>
              </span>
            ))}
          </div>
        )}

      {/* ── Error ────────────────────────────────────────── */}
      {service.lastError && (
        <p className="scard__error">{service.lastError}</p>
      )}

      {/* ── Footer ──────────────────────────────────────── */}
      <div className="scard__footer">
        {service.isPaid ? (
          <span className="receipt-line">
            Receipt {service.receiptNumber || '—'} · {formatInr(service.paidAmount)}
          </span>
        ) : (
          <span />
        )}
        {status === 'DUE' && Number(service.lastAmountDue || 0) > 0 && (
          <button className="btn btn--pay" onClick={payNow}>
            <FiExternalLink size={14} />
            Pay now
          </button>
        )}
      </div>
    </article>
  );
}

// ── Bill Breakup ──────────────────────────────────────────────────────────────

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
      <button
        className="breakup__toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Bill breakup</span>
        <span className="breakup__toggle-right">
          <strong>{formatInr(breakup.totalBill || breakup.grossTotal || 0)}</strong>
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
            <b>
              {formatInr(breakup.currentMonthBill || 0)}
              {breakup.fsa > 0 && (
                <span style={{ fontWeight: 'normal', fontSize: '0.85em', color: 'var(--text-2)', marginLeft: '4px' }}>
                  ({formatInr((breakup.currentMonthBill || 0) - (breakup.fsa || 0))} + {formatInr(breakup.fsa || 0)})
                </span>
              )}
            </b>
          </div>

          {/* Arrears */}
          {breakup.arrears > 0 && (
            <div className="breakup__row breakup__row--arrear">
              <span>Arrears (Advance Payments)</span>
              <b className="credit">−{formatInr(breakup.arrears)}</b>
            </div>
          )}

          <div className="breakup__row breakup__row--net">
            <span>Total Amount Due</span>
            <b>{formatInr(breakup.totalBill || 0)}</b>
          </div>
        </div>
      )}
    </div>
  );
}
