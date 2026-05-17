import { useMemo, useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { FiRefreshCw, FiZap, FiArrowDown } from 'react-icons/fi';
import { ServiceCard } from './components/ServiceCard.jsx';
import { ServiceDialog } from './components/ServiceDialog.jsx';
import { SummaryBar } from './components/SummaryBar.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { TrashView } from './components/TrashView.jsx';
import { useElectricityServices } from './hooks/useElectricityServices.js';
import { filterServices } from './utils/filters.js';
import { ConfirmDialog } from '../../shared/components/ConfirmDialog.jsx';
import { useTranslation } from 'react-i18next';

export function ElectricityDashboard() {
  const { services, trash, loading, refreshingIds, actions } = useElectricityServices();
  const [filters, setFilters] = useState({ query: '', status: '', sort: 'amount' });
  const [activeView, setActiveView] = useState('active');
  const [dialog, setDialog] = useState({ open: false, service: null });
  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', isDanger: false, onConfirm: () => {} });
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(null);
  const { t } = useTranslation();

  // ── Pull to Refresh ────────────────────────────────────────────────────────
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStart = useRef(0);
  const isPulling = useRef(false);
  const pullThreshold = 80;

  useEffect(() => {
    const container = document.querySelector('.main');
    if (!container) return;

    const handleTouchStart = (e) => {
      if (container.scrollTop <= 0) {
        touchStart.current = e.touches[0].pageY;
        isPulling.current = true;
      } else {
        isPulling.current = false;
      }
    };

    const handleTouchMove = (e) => {
      if (!isPulling.current || isRefreshing) return;
      const currentY = e.touches[0].pageY;
      const diff = currentY - touchStart.current;

      if (diff > 0) {
        // Apply resistance
        const dist = Math.min(diff * 0.4, pullThreshold + 20);
        setPullDistance(dist);
        if (dist > 10) {
           // Prevent native bounce/scroll if we are pulling
           if (e.cancelable) e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current || isRefreshing) return;
      const finalDist = pullDistance;
      console.log('[PTR] touchEnd. finalDist:', finalDist, 'threshold:', pullThreshold);
      isPulling.current = false;

      if (finalDist >= pullThreshold) {
        console.log('[PTR] Threshold met. Triggering refresh...');
        setPullDistance(70);
        setIsRefreshing(true);
        
        try {
          // Always reload from local DB first to recover from missing UI state
          await actions.reload();
          console.log('[PTR] Local reload complete.');
          
          // Then attempt upstream refresh if there are services
          await handleRefreshAll();
          console.log('[PTR] Upstream refresh complete.');
        } catch (e) {
          console.error('[PTR] Refresh process failed', e);
        } finally {
          console.log('[PTR] Cleaning up PTR state.');
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          }, 500);
        }
      } else {
        console.log('[PTR] Threshold not met. Resetting.');
        setPullDistance(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, isRefreshing]);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 700);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 700);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const visible = useMemo(() => filterServices(services, filters), [services, filters]);
  const useAccordion = isMobile ? visible.length > 1 : visible.length > 3;

  async function submitService(payload) {
    if (dialog.service) {
      await toast.promise(actions.update(dialog.service.id, { label: payload.label }), {
        loading: t('saving'), success: 'Updated', error: e => `Update failed: ${e?.message || 'Unknown error'}`,
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
            await toast.promise(actions.restore(inTrash.id), { loading: t('saving'), success: 'Restored', error: e => `Restore failed: ${e?.message || 'Unknown error'}` });
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

      const tst = toast.loading('Validating and fetching bill…');
      try {
        await actions.add(payload);
        toast.success('Service added', { id: tst });
        setDialog({ open: false, service: null });
      } catch (e) {
        if (e?.message === 'CANCELLED') {
          toast.dismiss(tst);
        } else {
          toast.error(`Add failed: ${e?.message || 'Unknown error'}`, { id: tst });
        }
      }
    }
  }

  async function handleRefreshAll(options = { skipApi: false }) {
    console.log('[PTR] handleRefreshAll triggered. skipApi:', options.skipApi);
    
    // 1. Always reload from local DB first to update UI immediately
    const currentServices = await actions.reload();
    console.log('[PTR] Local reload complete. Services in DB:', currentServices?.length);

    if (!currentServices.length || options.skipApi) {
      console.log('[PTR] Stopping after local reload.');
      return;
    }
    
    // 2. Proceed with API refresh for all services
    setRefreshingAll(true);
    setRefreshProgress({ done: 0, total: currentServices.length });
    try {
      const summary = await actions.refreshAll((done, tot) => setRefreshProgress({ done, total: tot }));
      if (summary) {
        summary.failed === 0
          ? toast.success(`All ${summary.succeeded} service(s) refreshed`)
          : toast.error(`Refresh failed for ${summary.failed} service(s)`);
      }
    } catch (err) {
      if (err?.message !== 'CANCELLED') {
        toast.error(`Refresh all failed: ${err?.message || 'Unknown error'}`);
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
      <div 
        className={`ptr ${pullDistance > 0 || isRefreshing ? 'ptr--visible' : ''} ${isRefreshing ? 'ptr--refreshing' : ''} ${pullDistance >= pullThreshold ? 'ptr--ready' : ''}`}
        style={{ transform: `translateY(${pullDistance - 70}px)` }}
      >
        <div className="ptr__icon" style={{ transform: `rotate(${pullDistance * 3}deg)` }}>
          <FiRefreshCw size={18} />
        </div>
        <span className="ptr__label">
          {isRefreshing ? 'Refreshing...' : (pullDistance >= pullThreshold ? 'Release to refresh' : 'Pull down to refresh')}
        </span>
      </div>

      <header className="page__header" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <p className="page__eyebrow"><FiZap size={12} /> APSPDCL</p>
          <h1 className="page__title">{t('electricity')}</h1>
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
              <p>{t('loading_services')}</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="state-box">
              <FiZap size={28} />
              <h3>{t('no_services_found')}</h3>
              <p>{services.length === 0 ? t('add_first_service') : t('no_results_filter')}</p>
              {services.length === 0 && (
                <button className="btn btn--primary" onClick={() => setDialog({ open: true, service: null })}>
                  {t('add_service')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid">
              {visible.map(s => (
                <ServiceCard
                  key={s.id}
                  service={s}
                  useAccordion={useAccordion}
                  refreshing={refreshingIds.has(s.id)}
                  onRefresh={async () => {
                    const tst = toast.loading('Refreshing…');
                    try {
                      await actions.refresh(s.id);
                      toast.success('Refreshed', { id: tst });
                    } catch (e) {
                      if (e?.message === 'CANCELLED') toast.dismiss(tst);
                      else toast.error(`Refresh failed: ${e?.message || 'Unknown error'}`, { id: tst });
                    }
                  }}
                  onEdit={() => setDialog({ open: true, service: s })}
                  onDelete={() => {
                    setConfirmState({
                      open: true,
                      title: 'Move to Trash?',
                      description: 'This service will be moved to the Trash.\nYou can restore it later from the Trash section.',
                      isDanger: true,
                      onConfirm: () => toast.promise(actions.remove(s.id), { loading: 'Moving to trash…', success: 'Moved to trash', error: e => `Failed to move: ${e?.message || 'Unknown error'}` })
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
          onRestore={id => toast.promise(actions.restore(id), { loading: 'Restoring…', success: 'Restored', error: e => `Restore failed: ${e?.message || 'Unknown error'}` })}
          onDeletePermanent={id => {
            setConfirmState({
              open: true,
              title: 'Delete permanently?',
              description: 'This action cannot be undone and all history will be lost.',
              isDanger: true,
              onConfirm: () => toast.promise(actions.purge(id), { loading: 'Deleting…', success: 'Deleted permanently', error: e => `Delete failed: ${e?.message || 'Unknown error'}` })
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
