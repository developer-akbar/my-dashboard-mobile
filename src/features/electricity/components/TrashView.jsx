import { FiRefreshCw, FiTrash2, FiPackage } from 'react-icons/fi';
import { formatDate } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';

export function TrashView({ services, onRestore, onDeletePermanent }) {
  const { t } = useTranslation();

  if (!services.length) return (
    <div className="empty-state">
      <div className="empty-state__icon"><FiPackage size={28} /></div>
      <h3>{t('trash_empty')}</h3>
      <p>{t('deleted_services_here')}</p>
    </div>
  );

  return (
    <div className="trash-list">
      {services.map(s => (
        <div key={s.id} className="trash-item">
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
  );
}