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
import { ConfirmDialog } from '../../shared/components/ConfirmDialog.jsx';

export function ElectricityDashboard() {
  const { services, trash, loading, refreshingIds, actions } = useElectricityServices();
  const [filters, setFilters] = useState({ query: '', status: '', sort: 'amount' });
  const [activeView, setActiveView] = useState('active');
  const [dialog, setDialog] = useState({ open: false, service: null });
  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', isDanger: false, onConfirm: () => {} });
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(null);

  const visible = useMemo(() => filterServices(services, filters), [services, filters]);

  async function submitService(payload) {
    if (dialog.service) {
      await toast.promise(actions.update(dialog.service.id, { label: payload.label }), {
        loading: 'Saving…', success: 'Updated', error: e => e?.message || 'Failed',
      });
    } else {
      const inTrash = trash.find(t => t.serviceNumber === payload.serviceNumber);
      if (inTrash) {
        setConfirmState({
          open: true,
          title: 'Restore from Trash?',
          description: 'This service is currently in the Trash.\n\nWould you like to restore it instead of adding a new one?',
          isDanger: false,
          onConfirm: async () => {
            await toast.promise(actions.restore(inTrash.id), { loading: 'Restoring…', success: 'Restored', error: 'Failed' });
            setDialog({ open: false, service: null });
          }
        });
        return;
      }
      
      const inActive = services.find(s => s.serviceNumber === payload.serviceNumber);
      if (inActive) {
        toast.error('Service number already exists in your active list.');
        return;
      }

      const t = toast.loading('Validating and fetching bill…');
      try {
        await actions.add(payload);
        toast.success('Service added', { id: t });
        setDialog({ open: false, service: null });
      } catch (e) {
        if (e?.message === 'CANCELLED') {
          toast.dismiss(t);
        } else {
          toast.error(e?.message || 'Failed', { id: t });
        }
      }
    }
  }

  async function handleRefreshAll() {
    if (!services.length) return;
    setRefreshingAll(true);
    setRefreshProgress({ done: 0, total: services.length });
    try {
      const summary = await actions.refreshAll((done, t) => setRefreshProgress({ done, total: t }));
      if (summary) {
        summary.failed === 0
          ? toast.success(`All ${summary.succeeded} service(s) refreshed`)
          : toast.error(`${summary.failed} failed to refresh`);
      }
    } catch (err) {
      if (err?.message !== 'CANCELLED') {
        toast.error(err?.message || 'Refresh failed');
      }
    } finally {
      setRefreshingAll(false);
      setRefreshProgress(null);
    }
  }

  function handlePay(service) {
    setConfirmState({
      open: true,
      title: 'Redirecting to BillDesk',
      description: 'You will be redirected to the APSPDCL official website to pay your bill.\n\nYour service number will be automatically copied to your clipboard so you can paste it easily.',
      isDanger: false,
      onConfirm: async () => {
        try { 
          await navigator.clipboard.writeText(service.serviceNumber); 
          toast.success('Service number copied to clipboard'); 
        } catch { 
          toast.error('Failed to copy service number'); 
        }
        window.open('https://payments.billdesk.com/MercOnline/SPDCLController', '_blank', 'noopener,noreferrer');
      }
    });
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
                  onRefresh={async () => {
                    const t = toast.loading('Refreshing…');
                    try {
                      await actions.refresh(s.id);
                      toast.success('Refreshed', { id: t });
                    } catch (e) {
                      if (e?.message === 'CANCELLED') toast.dismiss(t);
                      else toast.error(e?.message || 'Failed', { id: t });
                    }
                  }}
                  onEdit={() => setDialog({ open: true, service: s })}
                  onDelete={() => {
                    setConfirmState({
                      open: true,
                      title: 'Move to Trash?',
                      description: 'This service will be moved to the Trash.\nYou can restore it later from the Trash section.',
                      isDanger: true,
                      onConfirm: () => toast.promise(actions.remove(s.id), { loading: 'Moving to trash…', success: 'Moved to trash', error: e => e?.message || 'Failed' })
                    });
                  }}
                  onTogglePin={() => actions.update(s.id, { pinned: !s.pinned })}
                  onPay={() => handlePay(s)}
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
          onDeletePermanent={id => {
            setConfirmState({
              open: true,
              title: 'Delete permanently?',
              description: 'This action cannot be undone and all history will be lost.',
              isDanger: true,
              onConfirm: () => toast.promise(actions.purge(id), { loading: 'Deleting…', success: 'Deleted permanently', error: 'Failed' })
            });
          }}
        />
      )}

      <ServiceDialog
        open={dialog.open}
        service={dialog.service}
        onClose={() => setDialog({ open: false, service: null })}
        onSubmit={submitService}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        isDanger={confirmState.isDanger}
        onClose={() => setConfirmState(prev => ({ ...prev, open: false }))}
        onConfirm={confirmState.onConfirm}
      />
    </div>
  );
}