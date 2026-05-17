import { FiRefreshCw, FiTrash2, FiPackage } from 'react-icons/fi';
import { formatDate } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';

export function TrashView({ services, onRestore, onDeletePermanent, selectedIds, onToggleSelect, onToggleSelectAll }) {
  const { t } = useTranslation();

  if (!services.length) return (
    <div className="empty-state">
      <div className="empty-state__icon"><FiPackage size={28} /></div>
      <h3>{t('trash_empty')}</h3>
      <p>{t('deleted_services_here')}</p>
    </div>
  );

  const allSelected = services.length > 0 && selectedIds.size === services.length;

  return (
    <div className="trash-container">
      {services.length > 0 && onToggleSelectAll && (
        <div className="trash-select-all">
          <label>
            <input 
              type="checkbox" 
              checked={allSelected} 
              onChange={() => onToggleSelectAll(services.map(s => s.id))}
            />
            <span>{allSelected ? t('deselect_all') : t('select_all')} ({services.length})</span>
          </label>
        </div>
      )}
      <div className="trash-list">
        {services.map(s => (
          <div key={s.id} className={`trash-item ${selectedIds.has(s.id) ? 'trash-item--selected' : ''}`}>
            {onToggleSelect && (
              <div className="trash-item__select">
                <input 
                  type="checkbox" 
                  checked={selectedIds.has(s.id)} 
                  onChange={() => onToggleSelect(s.id)}
                />
              </div>
            )}
            <div className="trash-item__info">
              <h4>{s.label || t('untitled')}</h4>
              <span className="mono-sm">{s.serviceNumber}</span>
              <small>{t('deleted')} {formatDate(s.deletedAt)}</small>
            </div>
            <div className="trash-item__actions">
              <button className="btn btn--ghost btn--xs" onClick={() => onRestore(s.id)}><FiRefreshCw size={12} /> {t('restore')}</button>
              <button className="btn btn--danger btn--xs" onClick={() => onDeletePermanent(s.id)}><FiTrash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}