import { FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { formatDate } from '../../../shared/utils/index.js';

export function TrashView({ services, onRestore, onDeletePermanent }) {
  if (services.length === 0) {
    return (
      <div className="empty-state">
        <FiTrash2 size={32} className="empty-state__icon" />
        <h3>Trash is empty</h3>
        <p>Deleted services will appear here</p>
      </div>
    );
  }

  return (
    <div className="trash-list">
      {services.map((s) => (
        <div key={s.id} className="trash-item">
          <div className="trash-item__info">
            <h4>{s.label || 'Untitled'}</h4>
            <p className="mono">{s.serviceNumber}</p>
            <small>Deleted {formatDate(s.deletedAt)}</small>
          </div>
          <div className="trash-item__actions">
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => onRestore(s.id)}
            >
              <FiRefreshCw size={13} /> Restore
            </button>
            <button
              className="btn btn--danger btn--sm"
              onClick={() => onDeletePermanent(s.id)}
            >
              <FiTrash2 size={13} /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
