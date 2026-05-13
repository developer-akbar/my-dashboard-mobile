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

  const [filters, setFilters] = useState({ query: '', status: '', sort: 'amount' });
  const [activeView, setActiveView] = useState('active');
  const [dialog, setDialog] = useState({ open: false, service: null });
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(null); // { done, total }

  const visible = useMemo(() => filterServices(services, filters), [services, filters]);

  // ── Submit dialog (add or edit) ─────────────────────────────────────────────
  async function submitService(payload) {
    if (dialog.service) {
      // Edit: only label / metadata — no APSPDCL call
      await toast.promise(
        actions.update(dialog.service.id, { label: payload.label }),
        {
          loading: 'Saving…',
          success: 'Service updated',
          error: (e) => e?.message || 'Update failed',
        }
      );
    } else {
      // Add: validate + fetch in one shot
      await toast.promise(
        actions.add(payload),
        {
          loading: 'Validating and fetching bill data…',
          success: 'Service added',
          error: (e) => e?.message || 'Add failed',
        }
      );
    }
    setDialog({ open: false, service: null });
  }

  // ── Refresh all ─────────────────────────────────────────────────────────────
  async function handleRefreshAll() {
    const total = services.length;
    if (!total) return;

    setRefreshingAll(true);
    setRefreshProgress({ done: 0, total });

    try {
      const summary = await actions.refreshAll((done, t) => {
        setRefreshProgress({ done, total: t });
      });

      if (summary.failed === 0) {
        toast.success(`All ${summary.succeeded} service(s) refreshed`);
      } else {
        toast.error(`${summary.failed} service(s) failed to refresh`);
      }
    } catch (err) {
      toast.error(err?.message || 'Refresh all failed');
    } finally {
      setRefreshingAll(false);
      setRefreshProgress(null);
    }
  }

  return (
    <div className="page">
      {/* ── Page header ─────────────────────────────────── */}
      <header className="page__header">
        <div>
          <p className="eyebrow"><FiZap size={13} /> APSPDCL</p>
          <h1>Electricity</h1>
        </div>
        {/* Refresh-all progress badge */}
        {refreshProgress && (
          <div className="refresh-progress">
            <FiRefreshCw size={13} className="spin" />
            {refreshProgress.done} / {refreshProgress.total}
          </div>
        )}
      </header>

      {/* ── Summary ─────────────────────────────────────── */}
      <SummaryBar services={services} />

      {/* ── Toolbar ─────────────────────────────────────── */}
      <Toolbar
        filters={filters}
        onFiltersChange={setFilters}
        onAdd={() => setDialog({ open: true, service: null })}
        onRefreshAll={handleRefreshAll}
        refreshingAll={refreshingAll}
        activeView={activeView}
        onViewChange={setActiveView}
        trashCount={trash.length}
      />

      {/* ── Active services ──────────────────────────────── */}
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
                    toast.promise(actions.refresh(s.id), {
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
                      error: (e) => e?.message || 'Delete failed',
                    })
                  }
                  onTogglePin={() => actions.update(s.id, { pinned: !s.pinned })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Trash ───────────────────────────────────────── */}
      {activeView === 'trash' && (
        <TrashView
          services={trash}
          onRestore={(id) =>
            toast.promise(actions.restore(id), {
              loading: 'Restoring…',
              success: 'Service restored',
              error: (e) => e?.message || 'Restore failed',
            })
          }
          onDeletePermanent={(id) =>
            toast.promise(actions.purge(id), {
              loading: 'Deleting permanently…',
              success: 'Deleted permanently',
              error: (e) => e?.message || 'Delete failed',
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