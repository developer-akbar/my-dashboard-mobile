import { FiAlertTriangle, FiCheckCircle, FiClock, FiZap } from 'react-icons/fi';
import { formatInr } from '../../../shared/utils/index.js';

export function SummaryBar({ services }) {
  const total = services.length;
  const due = services.filter((s) => s.lastStatus === 'DUE');
  const paid = services.filter(
    (s) => s.lastStatus === 'PAID' || s.lastStatus === 'NO_DUES'
  );
  const totalDue = due.reduce((sum, s) => sum + (s.lastAmountDue || 0), 0);

  const cards = [
    {
      icon: <FiZap size={18} />,
      label: 'Total services',
      value: total,
      tone: 'info',
    },
    {
      icon: <FiAlertTriangle size={18} />,
      label: 'Amount due',
      value: totalDue > 0 ? formatInr(totalDue) : '₹0',
      tone: totalDue > 0 ? 'danger' : 'neutral',
    },
    {
      icon: <FiAlertTriangle size={18} />,
      label: 'Pending bills',
      value: due.length,
      tone: due.length > 0 ? 'warning' : 'neutral',
    },
    {
      icon: <FiCheckCircle size={18} />,
      label: 'Paid / No dues',
      value: paid.length,
      tone: 'success',
    },
  ];

  return (
    <div className="summary">
      {cards.map((c) => (
        <div key={c.label} className={`summary__card summary__card--${c.tone}`}>
          <div className="summary__icon">{c.icon}</div>
          <div>
            <p className="summary__label">{c.label}</p>
            <strong className="summary__value">{c.value}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
