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
  const { services, trash, loading, refreshingIds, actions } = useElectricityServices();
  const [filters, setFilters] = useState({ query: '', status: '', sort: 'amount' });
  const [activeView, setActiveView] = useState('active');
  const [dialog, setDialog] = useState({ open: false, service: null });
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(null);

  const visible = useMemo(() => filterServices(services, filters), [services, filters]);

  async function submitService(payload) {
    if (dialog.service) {
      await toast.promise(actions.update(dialog.service.id, { label: payload.label }), {
        loading: 'Saving…', success: 'Updated', error: e => e?.message || 'Failed',
      });
    } else {
      await toast.promise(actions.add(payload), {
        loading: 'Validating and fetching bill…', success: 'Service added', error: e => e?.message || 'Failed',
      });
    }
    setDialog({ open: false, service: null });
  }

  async function handleRefreshAll() {
    if (!services.length) return;
    setRefreshingAll(true);
    setRefreshProgress({ done: 0, total: services.length });
    try {
      const summary = await actions.refreshAll((done, t) => setRefreshProgress({ done, total: t }));
      summary.failed === 0
        ? toast.success(`All ${summary.succeeded} service(s) refreshed`)
        : toast.error(`${summary.failed} failed to refresh`);
    } catch (err) {
      toast.error(err?.message || 'Refresh failed');
    } finally {
      setRefreshingAll(false);
      setRefreshProgress(null);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow"><FiZap size={12} /> APSPDCL</p>
          <h1 className="page__title">Electricity</h1>
        </div>
        {refreshProgress && (
          <div className="refresh-progress">
            <FiRefreshCw size={12} className="spin" />
            {refreshProgress.done} / {refreshProgress.total}
          </div>
        )}
      </header>

      <SummaryBar services={services} />

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

      {activeView === 'active' && (
        <>
          {loading ? (
            <div className="state-box">
              <FiRefreshCw size={22} className="spin" />
              <p>Loading services…</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="state-box">
              <FiZap size={28} />
              <h3>No services found</h3>
              <p>{services.length === 0 ? 'Add your first APSPDCL service to get started.' : 'No results for this filter.'}</p>
              {services.length === 0 && (
                <button className="btn btn--primary" onClick={() => setDialog({ open: true, service: null })}>
                  Add service
                </button>
              )}
            </div>
          ) : (
            <div className="grid">
              {visible.map(s => (
                <ServiceCard
                  key={s.id}
                  service={s}
                  refreshing={refreshingIds.has(s.id)}
                  onRefresh={() => toast.promise(actions.refresh(s.id), { loading: 'Refreshing…', success: 'Refreshed', error: e => e?.message || 'Failed' })}
                  onEdit={() => setDialog({ open: true, service: s })}
                  onDelete={() => toast.promise(actions.remove(s.id), { loading: 'Moving to trash…', success: 'Moved to trash', error: e => e?.message || 'Failed' })}
                  onTogglePin={() => actions.update(s.id, { pinned: !s.pinned })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeView === 'trash' && (
        <TrashView
          services={trash}
          onRestore={id => toast.promise(actions.restore(id), { loading: 'Restoring…', success: 'Restored', error: 'Failed' })}
          onDeletePermanent={id => toast.promise(actions.purge(id), { loading: 'Deleting…', success: 'Deleted permanently', error: 'Failed' })}
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