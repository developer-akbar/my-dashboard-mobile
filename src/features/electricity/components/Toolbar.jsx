import { FiPlus, FiRefreshCw, FiSearch, FiTrash2 } from 'react-icons/fi';

export function Toolbar({
  filters,
  onFiltersChange,
  onAdd,
  onRefreshAll,
  refreshingAll,
  activeView,
  onViewChange,
  trashCount,
}) {
  return (
    <div className="toolbar">
      <div className="toolbar__left">
        <div className="search-box">
          <FiSearch size={15} />
          <input
            value={filters.query}
            onChange={(e) =>
              onFiltersChange({ ...filters, query: e.target.value })
            }
            placeholder="Search services…"
          />
        </div>

        <select
          className="select"
          value={filters.status}
          onChange={(e) =>
            onFiltersChange({ ...filters, status: e.target.value })
          }
        >
          <option value="">All statuses</option>
          <option value="DUE">Due</option>
          <option value="PAID">Paid</option>
          <option value="NO_DUES">No dues</option>
          <option value="UNKNOWN">Unknown</option>
        </select>

        <select
          className="select"
          value={filters.sort}
          onChange={(e) =>
            onFiltersChange({ ...filters, sort: e.target.value })
          }
        >
          <option value="amount">Sort: Amount</option>
          <option value="dueDate">Sort: Due date</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      <div className="toolbar__right">
        {/* View toggle */}
        <div className="seg">
          <button
            className={`seg__btn ${activeView === 'active' ? 'seg__btn--active' : ''}`}
            onClick={() => onViewChange('active')}
          >
            Active
          </button>
          <button
            className={`seg__btn ${activeView === 'trash' ? 'seg__btn--active' : ''}`}
            onClick={() => onViewChange('trash')}
          >
            <FiTrash2 size={13} />
            Trash
            {trashCount > 0 && (
              <span className="badge">{trashCount}</span>
            )}
          </button>
        </div>

        <button
          className="btn btn--ghost"
          onClick={onRefreshAll}
          disabled={refreshingAll}
        >
          <FiRefreshCw
            size={14}
            className={refreshingAll ? 'spin' : ''}
          />
          Refresh all
        </button>

        <button className="btn btn--primary" onClick={onAdd}>
          <FiPlus size={16} />
          Add service
        </button>
      </div>
    </div>
  );
}
