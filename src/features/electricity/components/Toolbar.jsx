import { FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiChevronDown, FiGlobe } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { SessionIndicator } from './SessionIndicator.jsx';

export function Toolbar({ filters, onFiltersChange, onAdd, onRefreshAll, refreshingAll, activeView, onViewChange, trashCount }) {
  const { t, i18n } = useTranslation();

  // Use resolvedLanguage as fallback if available, since language might be en-US
  const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
  const isTelugu = currentLang.startsWith('te');

  const toggleLanguage = () => {
    i18n.changeLanguage(isTelugu ? 'en' : 'te');
  };

  return (
    <div className="toolbar">
      <div className="toolbar__row toolbar__row--top">
        <div className="search-box">
          <FiSearch size={14} />
          <input
            value={filters.query}
            onChange={e => onFiltersChange({ ...filters, query: e.target.value })}
            placeholder={t('search_services')}
          />
        </div>
        <button className="btn btn--ghost btn--sm" onClick={toggleLanguage} title={t('language')} style={{ padding: '0 8px' }}>
          <FiGlobe size={15} style={{ marginRight: '4px' }} />
          {isTelugu ? 'English' : 'తెలుగు'}
        </button>
        <button className="btn btn--primary btn--sm" onClick={onAdd}>
          <FiPlus size={15} /> {t('add')}
        </button>
      </div>

      <div className="toolbar__row toolbar__row--bottom">
        <div className="toolbar__filters">
          <div className="select-wrap">
            <select className="select" value={filters.status} onChange={e => onFiltersChange({ ...filters, status: e.target.value })}>
              <option value="">{t('filter_all')}</option>
              <option value="DUE">{t('filter_due')}</option>
              <option value="PAID">{t('filter_paid')}</option>
              <option value="NO_DUES">{t('filter_no_dues')}</option>
              <option value="UNKNOWN">{t('filter_unknown')}</option>
            </select>
            <FiChevronDown size={12} className="select-icon" />
          </div>

          <div className="select-wrap">
            <select className="select" value={filters.sort} onChange={e => onFiltersChange({ ...filters, sort: e.target.value })}>
              <option value="amount">{t('sort_amount')}</option>
              <option value="dueDate">{t('sort_due_date')}</option>
              <option value="name">{t('sort_name')}</option>
            </select>
            <FiChevronDown size={12} className="select-icon" />
          </div>
        </div>

        <div className="toolbar__actions">
          <div className="seg">
            <button className={`seg__btn ${activeView === 'active' ? 'seg__btn--active' : ''}`} onClick={() => onViewChange('active')}>{t('active')}</button>
            <button className={`seg__btn ${activeView === 'trash' ? 'seg__btn--active' : ''}`} onClick={() => onViewChange('trash')}>
              <FiTrash2 size={12} />
              {trashCount > 0 && <span className="badge">{trashCount}</span>}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', background: 'var(--surface-2)', padding: '2px 4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <button className="btn btn--ghost btn--sm" onClick={onRefreshAll} disabled={refreshingAll} style={{ border: 'none', background: 'transparent' }}>
              <FiRefreshCw size={13} className={refreshingAll ? 'spin' : ''} />
              <span className="hide-xs">{t('refresh')}</span>
            </button>
            <SessionIndicator />
          </div>
        </div>
      </div>
    </div>
  );
}