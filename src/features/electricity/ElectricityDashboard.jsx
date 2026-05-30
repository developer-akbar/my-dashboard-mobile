import { useMemo, useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { FiRefreshCw, FiZap, FiArrowDown, FiTrash2, FiCheckSquare, FiSquare, FiCopy, FiSettings, FiDownload, FiUpload, FiClock, FiEye, FiLayout, FiBell } from 'react-icons/fi';
import { ServiceCard } from './components/ServiceCard.jsx';
import { ServiceDialog } from './components/ServiceDialog.jsx';
import { ServiceAboutDialog } from './components/ServiceAboutDialog.jsx';
import { BillCalculator } from './components/BillCalculator.jsx';
import { QRCodeDialog } from './components/QRCodeDialog.jsx';
import { SummaryBar } from './components/SummaryBar.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { TrashView } from './components/TrashView.jsx';
import { useElectricityServices } from './hooks/useElectricityServices.js';
import { filterServices } from './utils/filters.js';
import { ConfirmDialog } from '../../shared/components/ConfirmDialog.jsx';
import { useTranslation } from 'react-i18next';
import { usePostHog } from '@posthog/react';
import { HelpFooter } from './components/CalculationSettings.jsx';

import { NotificationInbox, saveNotificationToHistory } from './components/NotificationInbox.jsx';
import { db } from '../../shared/db/storage.js';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

export function ElectricityDashboard({ onOpenCalcSettings }) {
  const isWeb = Capacitor.getPlatform() === 'web';
  const { services, trash, loading, refreshingIds, actions } = useElectricityServices();
  const [filters, setFilters] = useState({ query: '', status: '', sort: 'amount' });
  const [cardStyle, setCardStyle] = useState(localStorage.getItem('appearance_card_style') || 'classic'); 
  const [activeView, setActiveView] = useState('active');
  const [dialog, setDialog] = useState({ open: false, service: null });

  const [inboxOpen, setInboxOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const pendingDeepLink = useRef(null);

  useEffect(() => {
    const mainContainer = document.querySelector('.main');
    if (!mainContainer) return;

    const handleScroll = () => {
      setIsScrolled(mainContainer.scrollTop > 50);
    };

    mainContainer.addEventListener('scroll', handleScroll);
    return () => mainContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const updateUnread = async () => {
    const history = await db.getSetting('notification_history') || [];
    const count = history.filter(n => !n.read).length;
    setUnreadCount(count);
    
    // Update App Icon Badge
    if (window.Capacitor?.isNativePlatform()) {
      try {
        const { Badge } = await import('@capawesome/capacitor-badge');
        if (count > 0) {
          await Badge.set({ count });
        } else {
          await Badge.clear();
        }
      } catch (e) {
        console.warn('[badge] Failed to update badge', e);
      }
    }
  };

  const selfHealNotifications = async () => {
    if (loading || services.length === 0) return;
    
    const history = await db.getSetting('notification_history') || [];
    let updated = false;

    for (const svc of services) {
      if (!svc.isPaid && svc.lastAmountDue > 0) {
        const dueDate = svc.lastDueDate ? new Date(svc.lastDueDate) : null;
        if (!dueDate) continue;

        const now = new Date();
        const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

        if (diffDays <= 4) {
          // Check if we already have a notification for this specific bill amount
          const exists = history.some(n => 
            n.serviceNumber === svc.serviceNumber && 
            n.body.includes(svc.lastAmountDue.toString())
          );

          if (!exists) {
            const type = diffDays < 0 ? 'BILL_OVERDUE' : 'BILL_REMINDER';
            const title = diffDays < 0 ? 'Bill Overdue' : 'Bill Due Soon';
            const body = diffDays < 0 
              ? `Your bill of ₹${svc.lastAmountDue} for ${svc.serviceNumber} is overdue!`
              : `Your bill of ₹${svc.lastAmountDue} for ${svc.serviceNumber} is due in ${diffDays} days.`;

            await saveNotificationToHistory({
              title,
              body,
              serviceNumber: svc.serviceNumber,
              type,
              read: false
            });
            updated = true;
          }
        }
      }
    }

    if (updated) updateUnread();
  };

  useEffect(() => {
    if (isWeb) return;

    updateUnread();

    const processDeepLink = async (sn) => {
      if (!sn || loading || services.length === 0) return false;
      
      const svc = services.find(s => s.serviceNumber === sn);
      if (svc) {
        console.log('[dashboard] Successfully matched service for deep link:', sn);
        setInboxOpen(false);
        setDialog({ open: false, service: null });
        setAboutDialog({ open: false, service: null });
        flashCard(svc.id);
        setTimeout(() => {
          setQrDialog({ open: true, service: svc });
        }, 300); // 300ms to allow UI transitions
        return true;
      }
      return false;
    };

    const handleNotif = (e) => {
      console.log('[dashboard] Live notification signal received');
      updateUnread();
      const sn = e.detail?.serviceNumber;
      if (sn) {
        const svc = services.find(s => s.serviceNumber === sn);
        if (svc) actions.refresh(svc.id).catch(() => {});
      }
    };

    const handleDeepLinkSignal = (e) => {
      const sn = e.detail?.serviceNumber;
      console.log('[dashboard] Live deep-link signal received for:', sn);
      if (sn) {
        processDeepLink(sn).then(success => {
          if (!success) {
            console.log('[dashboard] Data not ready, deferring deep link for:', sn);
            pendingDeepLink.current = sn;
          }
        });
      }
    };

    const checkBootAction = async () => {
      const pending = await db.getSetting('pending_notification_action');
      if (pending && pending.serviceNumber) {
        if (Date.now() - pending.timestamp < 300000) {
          console.log('[dashboard] Boot check: Processing pending action for:', pending.serviceNumber);
          const success = await processDeepLink(pending.serviceNumber);
          if (success) {
            await db.setSetting('pending_notification_action', null);
            pendingDeepLink.current = null;
          } else {
            pendingDeepLink.current = pending.serviceNumber;
          }
        } else {
          console.log('[dashboard] Boot check: Expiring old action');
          await db.setSetting('pending_notification_action', null);
        }
      }
    };

    // Listen for App State changes (Foreground/Background)
    const appStateListener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        console.log('[dashboard] App active, running sync');
        updateUnread();
        selfHealNotifications();
      }
    });

    window.addEventListener('notification-received', handleNotif);
    window.addEventListener('notification-deep-link', handleDeepLinkSignal);
    
    if (!loading && services.length > 0) {
      if (pendingDeepLink.current) {
        processDeepLink(pendingDeepLink.current);
        pendingDeepLink.current = null;
      }
      checkBootAction();
      selfHealNotifications();
    }

    return () => {
      appStateListener.then(h => h.remove());
      window.removeEventListener('notification-received', handleNotif);
      window.removeEventListener('notification-deep-link', handleDeepLinkSignal);
    };
  }, [loading, services]);

  const handleNotificationAction = (notification) => {
    setInboxOpen(false);
    if (notification.serviceNumber) {
      const svc = services.find(s => s.serviceNumber === notification.serviceNumber);
      if (svc) {
        flashCard(svc.id);
        if (notification.type === 'BILL_OVERDUE' || notification.type === 'BILL_REMINDER') {
          setQrDialog({ open: true, service: svc });
        } else {
          setAboutDialog({ open: true, service: svc });
        }
      }
    }
  };

  const toggleCardStyle = () => {
    const nextStyle = cardStyle === 'classic' ? 'rich' : 'classic';
    setCardStyle(nextStyle);
    localStorage.setItem('appearance_card_style', nextStyle);
  };

  const [aboutDialog, setAboutDialog] = useState({ open: false, service: null });
  const [calculator, setCalculator] = useState({ open: false, service: null });
  const [qrDialog, setQrDialog] = useState({ open: false, service: null });
  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', isDanger: false, onConfirm: () => {} });
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(null);
  const [flashingId, setFlashingId] = useState(null);
  const { t } = useTranslation();
  const ph = usePostHog();

  const [bulkResult, setBulkResult] = useState(null);
  const fileInputRef = useRef(null);

  /**
   * Exports the current list of services to a JSON file.
   * Only includes essential data for ACTIVE (non-deleted) services.
   */
  const handleExport = () => {
    // Collect minimal data only for ACTIVE services
    const activeServices = services.filter(s => !s.isDeleted);
    const data = activeServices.map(s => ({
      label: s.label,
      serviceNumber: s.serviceNumber,
      pinned: s.pinned
    }));
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Construct filename: mydashboard_apspdcl_bills_backup_timestamp.json
    const timestamp = new Date().getTime();
    const link = document.createElement('a');
    link.href = url;
    link.download = `mydashboard_apspdcl_bills_backup_${timestamp}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    if (ph) ph.capture('data_exported', { count: data.length });
    toast.success(`${data.length} services exported successfully`);
  };

  /**
   * Imports services from a backup JSON file.
   * Validates each service number via the /validate API and restores pinned status.
   */
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!Array.isArray(data)) throw new Error('Invalid backup format');
        
        // Map to standard entries format for bulk addition, preserving pinned state
        const entries = data.map(item => ({
          label: item.label || '',
          number: item.serviceNumber,
          pinned: !!item.pinned
        })).filter(e => e.number && e.number.length === 13);

        if (entries.length === 0) {
          toast.error(t('no_valid_services_in_backup', 'No valid service numbers found in backup'));
          return;
        }

        toast.success(`Found ${entries.length} services. Starting import...`);

        // Trigger our standard bulk add logic (validates each number via API)
        await submitService({ isBulk: true, entries });
        if (ph) ph.capture('data_imported', { count: entries.length });
      } catch (err) {
        toast.error(t('import_failed', 'Failed to read backup file'));
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const trackBill = async (service, snapshot) => {
    if (!ph || !snapshot || !snapshot.billDate) return;
    
    if (service.lastReportedBillDate !== snapshot.billDate) {
      ph.capture('bill_refreshed', {
        id: service.id,
        circle: snapshot.circleName || service.circleName,
        amount: Number(snapshot.amountDue || 0),
        bill_date: snapshot.billDate
      });
      await actions.update(service.id, { lastReportedBillDate: snapshot.billDate });
    }
  };

  const handleViewChange = (view) => {
    setActiveView(view);
    clearSelection();
  };

  const flashCard = (id) => {
    setFlashingId(id);
    setTimeout(() => {
      const el = document.getElementById(`service-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
    setTimeout(() => setFlashingId(null), 4000);
  };

  // ── Selection ──────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visible = useMemo(() => filterServices(services, filters), [services, filters]);
  const currentItems = activeView === 'active' ? visible : trash;
  const allSelected = currentItems.length > 0 && selectedIds.size === currentItems.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentItems.map(s => s.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleCopySelected = async () => {
    const selectedServices = currentItems.filter(s => selectedIds.has(s.id));
    if (selectedServices.length === 0) return;
    
    const text = selectedServices.map(s => {
      const name = s.label || s.customerName || t('untitled');
      return `${name}:${s.serviceNumber}`;
    }).join(', ');

    try {
      await navigator.clipboard.writeText(text);
      const msg = selectedServices.length === 1 ? 'Copied 1 service' : `Copied ${selectedServices.length} services`;
      toast.success(t('copied_count', msg));
    } catch (e) {
      toast.error('Failed to copy');
    }
  };

  useEffect(() => {
    // Clear selection when view changes to avoid cross-view selection bugs
    clearSelection();
  }, [activeView]);

  // ── Keydown Handling (Esc) ────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (inboxOpen) {
          setInboxOpen(false);
        } else if (selectedIds.size > 0) {
          clearSelection();
        } else if (bulkResult) {
          setBulkResult(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, bulkResult, inboxOpen]);

  // ── Back Button Handling ───────────────────────────────────────────────────
  useEffect(() => {
    const handleBack = (e) => {
      if (e.detail?.handled) return;

      // 1. Priority: Close any open Modal or Dialog
      if (dialog.open || aboutDialog.open || calculator.open || qrDialog.open || confirmState.open || bulkResult || inboxOpen) {
        setDialog({ open: false, service: null });
        setAboutDialog({ open: false, service: null });
        setCalculator({ open: false, service: null });
        setQrDialog({ open: true, service: null });
        setConfirmState(prev => ({ ...prev, open: false }));
        setBulkResult(null);
        setInboxOpen(false);
        if (e.detail) e.detail.handled = true;
        return;
      }

      // 2. Priority: Clear Selection Mode
      if (selectedIds.size > 0) {
        clearSelection();
        if (e.detail) e.detail.handled = true;
        return;
      }

      // 3. Priority: Back to Active View from Trash
      if (activeView === 'trash') {
        setActiveView('active');
        if (e.detail) e.detail.handled = true;
        return;
      }
    };
    window.addEventListener('app-back-button', handleBack);
    return () => window.removeEventListener('app-back-button', handleBack);
  }, [selectedIds, dialog.open, aboutDialog.open, calculator.open, qrDialog.open, confirmState.open, bulkResult, inboxOpen]);

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
      isPulling.current = false;

      if (finalDist >= pullThreshold) {
        setPullDistance(70);
        setIsRefreshing(true);
        
        try {
          // Always reload from local DB first to recover from missing UI state
          await actions.reload();
          
          // Then attempt upstream refresh if there are services
          await handleRefreshAll();
        } catch (e) {
          console.error('[PTR] Refresh process failed', e);
        } finally {
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          }, 500);
        }
      } else {
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
  }, [pullDistance, isRefreshing, actions]);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 700);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 700);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const useAccordion = isMobile ? visible.length > 1 : visible.length > 3;

  const handleCalculateBill = (service) => {
    setCalculator({ open: true, service });
  };

  async function submitService(payload) {
    if (payload.isBulk) {
      const { entries } = payload;
      if (ph) ph.capture('bulk_add_started', { count: entries.length });
      const tst = toast.loading(`Validating ${entries.length} services...`);
      
      const results = {
        succeeded: [],
        failed: [],
        alreadyExists: [],
        inTrash: []
      };

      for (const entry of entries) {
        const sn = entry.number;
        const inActive = services.find(s => s.serviceNumber === sn);
        const inTrash = trash.find(t => t.serviceNumber === sn);
        
        if (inActive) {
          results.alreadyExists.push(sn);
          continue;
        }
        if (inTrash) {
          results.inTrash.push(sn);
          continue;
        }

        try {
          // Fix: Ensure pinned status is passed during restoration/import
          await actions.add({ 
            isBulk: false, 
            serviceNumber: sn, 
            label: entry.label, 
            pinned: !!entry.pinned 
          });
          results.succeeded.push(sn);
          toast.loading(`Added ${results.succeeded.length}/${entries.length}...`, { id: tst });
        } catch (e) {
          if (e?.message === 'CANCELLED') {
            toast.error(`Cancelled. Processed ${results.succeeded.length + results.failed.length + results.alreadyExists.length + results.inTrash.length} services.`, { id: tst });
            if (ph) ph.capture('bulk_add_cancelled');
            setBulkResult(results);
            return;
          }
          results.failed.push({ number: sn, error: e?.message || 'Unknown error' });
        }
      }

      toast.dismiss(tst);
      if (ph) ph.capture('bulk_add_completed', { 
        succeeded: results.succeeded.length, 
        failed: results.failed.length,
        alreadyExists: results.alreadyExists.length 
      });
      setBulkResult(results);
      if (activeView !== 'active') setActiveView('active');
      return;
    }

    if (dialog.service) {
      await toast.promise(actions.update(dialog.service.id, { label: payload.label }), {
        loading: t('saving'), success: 'Updated', error: e => `Update failed: ${e?.message || 'Unknown error'}`,
      });
      if (ph) ph.capture('service_updated', { id: dialog.service.id });
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
            if (ph) ph.capture('service_restored', { id: inTrash.id });
            setDialog({ open: false, service: null });
            handleViewChange('active');
            flashCard(inTrash.id);
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
        const newService = await actions.add(payload);
        toast.success('Service added', { id: tst });
        if (ph) {
          ph.capture('service_added', { 
            circle: newService.circleName, 
            amount: Number(newService.lastAmountDue || 0)
          });
          // Also track as a bill record if it has a date
          if (newService.lastBillDate) {
             ph.capture('bill_refreshed', {
               id: newService.id,
               circle: newService.circleName,
               amount: Number(newService.lastAmountDue || 0),
               bill_date: newService.lastBillDate
             });
             await actions.update(newService.id, { lastReportedBillDate: newService.lastBillDate });
          }
        }
        setDialog({ open: false, service: null });
        handleViewChange('active');
        if (newService?.id) flashCard(newService.id);
      } catch (e) {
        if (e?.message === 'CANCELLED') {
          toast.dismiss(tst);
        } else {
          toast.error(`Add failed: ${e?.message || 'Unknown error'}`, { id: tst });
          if (ph) ph.capture('service_add_failed', { error: e?.message });
        }
        throw e; // Re-throw to keep dialog open
      }
    }
  }

  async function handleRefreshAll(options = { skipApi: false, quiet: false }) {
    // 1. Always reload from local DB first to update UI immediately
    const currentServices = await actions.reload();

    if (!currentServices.length || options.skipApi) {
      return;
    }
    
    if (!options.quiet) {
      setRefreshingAll(true);
      setRefreshProgress({ done: 0, total: currentServices.length });
    }

    if (ph) ph.capture('refresh_all_started', { count: currentServices.length });
    try {
      const summary = await actions.refreshAll((done, tot) => {
        if (!options.quiet) setRefreshProgress({ done, total: tot });
      });
      if (summary) {
        if (ph) {
          ph.capture('refresh_all_completed', { succeeded: summary.succeeded, failed: summary.failed });
          // Track the latest amounts for all successfully refreshed services (deduplicated)
          for (const res of summary.results) {
            if (res.ok && res.snapshot) {
              const svc = services.find(sv => sv.id === res.id);
              if (svc) await trackBill(svc, res.snapshot);
            }
          }
        }
        if (!options.quiet) {
          summary.failed === 0
            ? toast.success(`All ${summary.succeeded} service(s) refreshed`)
            : toast.error(`Refresh failed for ${summary.failed} service(s)`);
        }
      }
    } catch (err) {
      if (err?.message !== 'CANCELLED' && !options.quiet) {
        toast.error(`Refresh all failed: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      if (!options.quiet) {
        setRefreshingAll(false);
        setRefreshProgress(null);
      }
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

  const handleBulkAction = async (actionType) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    let title, description, successMsg, action;
    if (activeView === 'active') {
      title = `Trash ${ids.length} service(s)?`;
      description = `These services will be moved to the Trash.`;
      successMsg = 'Moved to trash';
      action = () => actions.bulkRemove(ids);
    } else {
      if (actionType === 'restore') {
        title = `Restore ${ids.length} service(s)?`;
        description = `These services will be restored to your active list.`;
        successMsg = 'Restored';
        action = async () => {
          await actions.bulkRestore(ids);
          handleViewChange('active');
          if (ids.length > 0) flashCard(ids[0]);
        };
      } else {
        title = `Delete ${ids.length} service(s)?`;
        description = `This action cannot be undone and all history will be lost.`;
        successMsg = 'Deleted permanently';
        action = () => actions.bulkPurge(ids);
      }
    }

    setConfirmState({
      open: true,
      title,
      description,
      isDanger: actionType !== 'restore',
      onConfirm: async () => {
        const tst = toast.loading('Processing…');
        try {
          await action();
          toast.success(successMsg, { id: tst });
          clearSelection();
        } catch (e) {
          toast.error(`Action failed: ${e?.message || 'Unknown error'}`, { id: tst });
        }
      }
    });
  };

  return (
    <div className={`page ${isScrolled ? 'page--scrolled' : ''}`}>
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

      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <div className="selection-bar__left">
            <input 
              type="checkbox" 
              checked={allSelected} 
              onChange={toggleSelectAll}
              style={{ width: '18px', height: '18px', margin: 0, cursor: 'pointer' }}
            />
            <span>{selectedIds.size} selected</span>
          </div>
          <div className="selection-bar__actions">
            <button className="btn btn--ghost btn--sm" onClick={handleCopySelected} title="Copy Selected">
              <FiCopy size={16} />
              {!isMobile && <span style={{ marginLeft: '4px' }}>Copy</span>}
            </button>
            {activeView === 'active' ? (
              <button className="btn btn--danger btn--sm" onClick={() => handleBulkAction('trash')}>
                <FiTrash2 size={16} />
                {!isMobile && <span style={{ marginLeft: '4px' }}>Trash</span>}
              </button>
            ) : (
              <>
                <button className="btn btn--ghost btn--sm" onClick={() => handleBulkAction('restore')}>
                  <FiRefreshCw size={16} />
                  {!isMobile && <span style={{ marginLeft: '4px' }}>Restore</span>}
                </button>
                <button className="btn btn--danger btn--sm" onClick={() => handleBulkAction('purge')}>
                  <FiTrash2 size={13} />
                  {!isMobile && <span style={{ marginLeft: '4px' }}>Purge</span>}
                </button>
              </>
            )}
            <button className="btn btn--ghost btn--sm" onClick={clearSelection} style={{ marginLeft: '4px' }}>Cancel</button>
          </div>
        </div>
      )}

      <header className="page__header page__header--sticky">
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="page__eyebrow"><FiZap size={12} /> APSPDCL</p>
            {!isScrolled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 className="page__title" style={{ margin: 0 }}>{t('electricity')}</h1>
                <button className="icon-btn" onClick={onOpenCalcSettings} title={t('calc_settings', 'Calculation Settings')} style={{ width: '40px', height: '40px' }}>
                  <FiSettings size={20} style={{ color: 'var(--text-3)' }} />
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: isScrolled ? '12px' : '16px', alignItems: 'center' }}>
            {!isWeb && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <button 
                  className="icon-btn" 
                  onClick={() => setInboxOpen(true)} 
                  title="Notifications"
                  style={{ width: '40px', height: '40px', position: 'relative' }}
                >
                  <FiBell size={20} style={{ color: unreadCount > 0 ? 'var(--primary)' : 'var(--text-3)' }} />
                  {unreadCount > 0 && (
                    <span className="header-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                  )}
                </button>
                {!isScrolled && <span style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: '600', textTransform: 'uppercase' }}>Alerts</span>}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <button className="icon-btn" onClick={handleExport} title={t('backup', 'Backup')} style={{ width: '40px', height: '40px' }}>
                <FiDownload size={20} style={{ color: 'var(--text-3)' }} />
              </button>
              {!isScrolled && <span style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: '600', textTransform: 'uppercase' }}>{t('backup')}</span>}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title={t('restore', 'Restore')} style={{ width: '40px', height: '40px' }}>
                <FiUpload size={20} style={{ color: 'var(--text-3)' }} />
              </button>
              {!isScrolled && <span style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: '600', textTransform: 'uppercase' }}>{t('restore')}</span>}
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".json" 
              onChange={handleImport} 
            />
          </div>
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
        onViewChange={handleViewChange}
        trashCount={trash.length}
        hasServices={services.length > 0 && !loading}
        services={services}
        cardStyle={cardStyle}
        onToggleCardStyle={toggleCardStyle}
      />

      <NotificationInbox 
        open={inboxOpen} 
        onClose={() => setInboxOpen(false)} 
        onAction={handleNotificationAction}
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
                  id={`service-${s.id}`}
                  service={s}
                  useAccordion={useAccordion}
                  cardStyle={cardStyle}
                  refreshing={refreshingIds.has(s.id)}
                  isFlashing={flashingId === s.id}
                  selected={selectedIds.has(s.id)}
                  selecting={selectedIds.size > 0}
                  onToggleSelect={toggleSelect}
                  onRefresh={async () => {
                    const tst = toast.loading('Refreshing…');
                    try {
                      const updated = await actions.refresh(s.id);
                      toast.success('Refreshed', { id: tst });
                      if (ph) ph.capture('service_refreshed', { id: s.id });
                      if (updated) await trackBill(s, updated);
                    } catch (e) {
                      if (e?.message === 'CANCELLED') toast.dismiss(tst);
                      else {
                        toast.error(`Refresh failed: ${e?.message || 'Unknown error'}`, { id: tst });
                        if (ph) ph.capture('service_refresh_failed', { id: s.id, error: e?.message });
                      }
                    }
                  }}
                  onEdit={() => setDialog({ open: true, service: s })}
                  onAbout={() => setAboutDialog({ open: true, service: s })}
                  onDelete={() => {
                    setConfirmState({
                      open: true,
                      title: 'Move to Trash?',
                      description: 'This service will be moved to the Trash.\nYou can restore it later from the Trash section.',
                      isDanger: true,
                      onConfirm: async () => {
                        const tst = toast.loading('Moving to trash…');
                        try {
                          await actions.remove(s.id);
                          toast.success('Moved to trash', { id: tst });
                          if (ph) ph.capture('service_trashed', { id: s.id });
                          clearSelection();
                        } catch (e) {
                          toast.error(`Failed to move: ${e?.message || 'Unknown error'}`, { id: tst });
                        }
                      }
                    });
                  }}
                  onTogglePin={() => {
                    const nextPinned = !s.pinned;
                    actions.update(s.id, { pinned: nextPinned });
                    if (ph) ph.capture('service_pinned_toggled', { id: s.id, pinned: nextPinned });
                  }}
                  onCalculateBill={(svc) => {
                    handleCalculateBill(svc);
                    if (ph) ph.capture('calculator_opened', { id: svc.id });
                  }}
                  onShowQR={(svc) => setQrDialog({ open: true, service: svc })}
                  onPay={() => {
                    handlePay(s);
                    if (ph) ph.capture('pay_clicked', { id: s.id });
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeView === 'trash' && (
        <TrashView
          services={trash}
          selectedIds={selectedIds}
          selecting={selectedIds.size > 0}
          onToggleSelect={toggleSelect}
          onRestore={id => {
            setConfirmState({
              open: true,
              title: 'Restore service?',
              description: 'This service will be moved back to your active list.',
              isDanger: false,
              onConfirm: async () => {
                const tst = toast.loading('Restoring…');
                try {
                  await actions.restore(id);
                  toast.success('Restored', { id: tst });
                  if (ph) ph.capture('service_restored_from_trash', { id });
                  clearSelection();
                  handleViewChange('active');
                  flashCard(id);
                } catch (e) {
                  toast.error(`Restore failed: ${e?.message || 'Unknown error'}` , { id: tst });
                }
              }
            });
          }}
          onDeletePermanent={id => {
            setConfirmState({
              open: true,
              title: 'Delete permanently?',
              description: 'This action cannot be undone and all history will be lost.',
              isDanger: true,
              onConfirm: () => toast.promise(actions.purge(id).then(res => {
                if (ph) ph.capture('service_purged', { id });
                return res;
              }), { 
                loading: 'Deleting…', 
                success: () => { clearSelection(); return 'Deleted permanently'; }, 
                error: e => `Delete failed: ${e?.message || 'Unknown error'}` 
              })
            });
          }}
        />
      )}

      <ServiceDialog
        open={dialog.open}
        service={dialog.service}
        services={services}
        onClose={() => setDialog({ open: false, service: null })}
        onSubmit={submitService}
      />

      <ServiceAboutDialog
        open={aboutDialog.open}
        service={aboutDialog.service}
        onClose={() => setAboutDialog({ open: false, service: null })}
      />

      <BillCalculator
        open={calculator.open}
        service={calculator.service}
        onClose={() => setCalculator({ open: false, service: null })}
      />

      <QRCodeDialog
        open={qrDialog.open}
        service={qrDialog.service}
        onClose={() => setQrDialog({ open: false, service: null })}
        onUpdateTime={(id, time) => {
          actions.update(id, { billTime: time });
          // Update the dialog's local service state to refresh QR
          setQrDialog(prev => ({ ...prev, service: { ...prev.service, billTime: time } }));
        }}
      />

      {bulkResult && (
        <div className="overlay overlay--center" onClick={() => setBulkResult(null)}>
          <div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw' }}>
            <h2 className="dialog__title">Bulk Add Results</h2>
            <div className="dialog__body" style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: '12px' }}>
              {bulkResult.succeeded.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ color: 'var(--green)', fontWeight: '700', fontSize: '13px' }}>✅ Added ({bulkResult.succeeded.length})</p>
                  <p className="mono-sm" style={{ color: 'var(--text-2)' }}>{bulkResult.succeeded.join(', ')}</p>
                </div>
              )}
              {bulkResult.inTrash.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ color: 'var(--amber)', fontWeight: '700', fontSize: '13px' }}>⚠️ Skipped - Already in Trash ({bulkResult.inTrash.length})</p>
                  <p className="mono-sm" style={{ color: 'var(--text-2)' }}>{bulkResult.inTrash.join(', ')}</p>
                </div>
              )}
              {bulkResult.alreadyExists.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ color: 'var(--text-3)', fontWeight: '700', fontSize: '13px' }}>ℹ️ Skipped - Already Active ({bulkResult.alreadyExists.length})</p>
                  <p className="mono-sm" style={{ color: 'var(--text-2)' }}>{bulkResult.alreadyExists.length}</p>
                </div>
              )}
              {bulkResult.failed.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ color: 'var(--red)', fontWeight: '700', fontSize: '13px' }}>❌ Failed ({bulkResult.failed.length})</p>
                  {bulkResult.failed.map((f, i) => (
                    <p key={i} className="mono-sm" style={{ color: 'var(--text-2)' }}>{f.number}: {f.error}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="dialog__footer">
              <button className="btn btn--primary" onClick={() => setBulkResult(null)} style={{ width: '100%' }}>Got it</button>
            </div>
          </div>
        </div>
      )}

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
