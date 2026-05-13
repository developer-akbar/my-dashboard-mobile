import { FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiChevronDown } from 'react-icons/fi';

export function Toolbar({ filters, onFiltersChange, onAdd, onRefreshAll, refreshingAll, activeView, onViewChange, trashCount }) {
  return (
    <div className="toolbar">
      <div className="toolbar__row toolbar__row--top">
        <div className="search-box">
          <FiSearch size={14} />
          <input
            value={filters.query}
            onChange={e => onFiltersChange({ ...filters, query: e.target.value })}
            placeholder="Search services…"
          />
        </div>
        <button className="btn btn--primary btn--sm" onClick={onAdd}>
          <FiPlus size={15} /> Add
        </button>
      </div>

      <div className="toolbar__row toolbar__row--bottom">
        <div className="toolbar__filters">
          <div className="select-wrap">
            <select className="select" value={filters.status} onChange={e => onFiltersChange({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="DUE">Due</option>
              <option value="PAID">Paid</option>
              <option value="NO_DUES">No dues</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
            <FiChevronDown size={12} className="select-icon" />
          </div>

          <div className="select-wrap">
            <select className="select" value={filters.sort} onChange={e => onFiltersChange({ ...filters, sort: e.target.value })}>
              <option value="amount">Amount ↓</option>
              <option value="dueDate">Due date</option>
              <option value="name">Name</option>
            </select>
            <FiChevronDown size={12} className="select-icon" />
          </div>
        </div>

        <div className="toolbar__actions">
          <div className="seg">
            <button className={`seg__btn ${activeView === 'active' ? 'seg__btn--active' : ''}`} onClick={() => onViewChange('active')}>Active</button>
            <button className={`seg__btn ${activeView === 'trash' ? 'seg__btn--active' : ''}`} onClick={() => onViewChange('trash')}>
              <FiTrash2 size={12} />
              {trashCount > 0 && <span className="badge">{trashCount}</span>}
            </button>
          </div>

          <button className="btn btn--ghost btn--sm" onClick={onRefreshAll} disabled={refreshingAll}>
            <FiRefreshCw size={13} className={refreshingAll ? 'spin' : ''} />
            <span className="hide-xs">Refresh</span>
          </button>
        </div>
      </div>
    </div>
  );
}