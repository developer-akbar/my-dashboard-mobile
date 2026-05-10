import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FiRefreshCw, FiZap } from 'react-icons/fi';
import { ServiceCard } from './components/ServiceCard.jsx';
import { ServiceDialog } from './components/ServiceDialog.jsx';
import { SummaryBar } from './components/SummaryBar.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { TrashView } from './components/TrashView.jsx';
import { useElectricityServices } from './hooks/useElectricityServices.js';
import { filterServices } from './utils/filters.js';

export function ElectricityDashboard() {
  const { services, trash, loading, refreshingIds, actions } =
    useElectricityServices();

  const [filters, setFilters] = useState({
    query: '',
    status: '',
    sort: 'amount',
  });
  const [activeView, setActiveView] = useState('active');
  const [dialog, setDialog] = useState({ open: false, service: null });
  const [refreshingAll, setRefreshingAll] = useState(false);

  const visible = useMemo(
    () => filterServices(services, filters),
    [services, filters]
  );

  async function submitService(payload) {
    try {
      if (dialog.service) {
        await toast.promise(actions.update(dialog.service.id, payload), {
          loading: 'Saving…',
          success: 'Service updated',
          error: (e) => e?.message || 'Update failed',
        });
      } else {
        await toast.promise(actions.create(payload), {
          loading: 'Adding service and fetching bill…',
          success: 'Service added',
          error: (e) => e?.message || 'Add failed',
        });
      }
      setDialog({ open: false, service: null });
    } catch {
      // error shown by toast
    }
  }

  async function refreshAll() {
    setRefreshingAll(true);
    try {
      await actions.refreshAll();
      toast.success('All services refreshed');
    } catch {
      // errors shown per-service
    } finally {
      setRefreshingAll(false);
    }
  }

  return (
    <div className="page">
      {/* ── Page header ─────────────────────────────────── */}
      <header className="page__header">
        <div>
          <p className="eyebrow">
            <FiZap size={13} /> APSPDCL
          </p>
          <h1>Electricity</h1>
        </div>
      </header>

      {/* ── Summary ─────────────────────────────────────── */}
      <SummaryBar services={services} />

      {/* ── Toolbar ─────────────────────────────────────── */}
      <Toolbar
        filters={filters}
        onFiltersChange={setFilters}
        onAdd={() => setDialog({ open: true, service: null })}
        onRefreshAll={refreshAll}
        refreshingAll={refreshingAll}
        activeView={activeView}
        onViewChange={setActiveView}
        trashCount={trash.length}
      />

      {/* ── Content ─────────────────────────────────────── */}
      {activeView === 'active' && (
        <>
          {loading ? (
            <div className="state-box">
              <FiRefreshCw size={24} className="spin" />
              <p>Loading services…</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="state-box">
              <FiZap size={32} />
              <h3>No services found</h3>
              {services.length === 0 && (
                <button
                  className="btn btn--primary"
                  onClick={() => setDialog({ open: true, service: null })}
                >
                  Add your first service
                </button>
              )}
            </div>
          ) : (
            <div className="grid">
              {visible.map((s) => (
                <ServiceCard
                  key={s.id}
                  service={s}
                  refreshing={refreshingIds.has(s.id)}
                  onRefresh={() =>
                    toast.promise(actions.refreshOne(s.id), {
                      loading: 'Refreshing…',
                      success: 'Bill refreshed',
                      error: (e) => e?.message || 'Refresh failed',
                    })
                  }
                  onEdit={() => setDialog({ open: true, service: s })}
                  onDelete={() =>
                    toast.promise(actions.remove(s.id), {
                      loading: 'Moving to trash…',
                      success: 'Moved to trash',
                      error: 'Delete failed',
                    })
                  }
                  onTogglePin={() =>
                    actions.update(s.id, { pinned: !s.pinned })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeView === 'trash' && (
        <TrashView
          services={trash}
          onRestore={(id) =>
            toast.promise(actions.restore(id), {
              loading: 'Restoring…',
              success: 'Restored',
              error: 'Restore failed',
            })
          }
          onDeletePermanent={(id) =>
            toast.promise(actions.remove(id, true), {
              loading: 'Deleting…',
              success: 'Deleted permanently',
              error: 'Delete failed',
            })
          }
        />
      )}

      <ServiceDialog
        open={dialog.open}
        service={dialog.service}
        onClose={() => setDialog({ open: false, service: null })}
        onSubmit={submitService}
      />
    </div>
  );
}
