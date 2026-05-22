import { FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiChevronDown, FiGlobe, FiZap, FiCopy } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { SessionIndicator } from './SessionIndicator.jsx';
import toast from 'react-hot-toast';

export function Toolbar({ filters, onFiltersChange, onAdd, onRefreshAll, refreshingAll, activeView, onViewChange, trashCount, hasServices, services }) {
  const { t, i18n } = useTranslation();

  const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
  const isTelugu = currentLang.startsWith('te');

  const toggleLanguage = () => {
    i18n.changeLanguage(isTelugu ? 'en' : 'te');
  };

  const copyAllNumbers = async () => {
    if (!services || services.length === 0) return;
    const numbers = services.map(s => s.serviceNumber).join(', ');
    try {
      await navigator.clipboard.writeText(numbers);
      toast.success(t('copied_all', 'All service numbers copied'));
    } catch (e) {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="toolbar">
      {/* ── Top Row: Search, Language, Add ── */}
      <div className="toolbar__row toolbar__row--top">
        <div className="search-box">
          <FiSearch size={14} />
          <input
            value={filters.query}
            onChange={e => onFiltersChange({ ...filters, query: e.target.value })}
            placeholder={t('search_services')}
          />
        </div>
        
        <div className="toolbar__group">          
          <button className="btn btn--primary btn--sm" onClick={onAdd}>
            <FiPlus size={15} />
            <span style={{ marginLeft: '4px' }}>{t('add')}</span>
          </button>
          
          <button className="btn btn--ghost btn--sm" onClick={toggleLanguage} title={t('language')} style={{ padding: '0 8px' }}>
            <FiGlobe size={15} />
            <span className="hide-mobile-sm" style={{ marginLeft: '4px' }}>{isTelugu ? 'English' : 'తెలుగు'}</span>
            <span className="show-mobile-sm" style={{ marginLeft: '4px', fontSize: '11px', fontWeight: '800' }}>{isTelugu ? 'En' : 'తె'}</span>
          </button>
        </div>
      </div>

      {/* ── Bottom Row: Filters, Navigation, Refresh ── */}
      <div className="toolbar__row toolbar__row--bottom">
        <div className="toolbar__group" style={{ flex: 1, justifyContent: 'space-between' }}>
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

          <div className="seg">
            <button className={`seg__btn ${activeView === 'active' ? 'seg__btn--active' : ''}`} onClick={() => onViewChange('active')}>
               <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                 <FiZap size={14} className="show-mobile-sm" />
                 {t('active')}
               </span>
            </button>
            <button className={`seg__btn ${activeView === 'trash' ? 'seg__btn--active' : ''}`} onClick={() => onViewChange('trash')}>
              <FiTrash2 size={13} />
              {trashCount > 0 && <span className="badge">{trashCount}</span>}
            </button>
          </div>
        </div>

        <div className="toolbar__group toolbar__group--refresh" style={{ background: 'var(--surface-2)', padding: '2px 4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <button className="btn btn--ghost btn--sm" onClick={onRefreshAll} disabled={refreshingAll || !hasServices} style={{ border: 'none', background: 'transparent', padding: '0 6px' }}>
            <FiRefreshCw size={13} className={refreshingAll ? 'spin' : ''} />
            <span className="hide-mobile-sm" style={{ marginLeft: '4px' }}>{t('refresh')}</span>
          </button>
          <SessionIndicator />
        </div>
      </div>
    </div>
  );
}
