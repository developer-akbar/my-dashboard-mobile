import { useCallback, useEffect, useReducer, useRef } from 'react';
import toast from 'react-hot-toast';
import { db } from '../../../shared/db/storage.js';
import {
  fetchApspdclSnapshot,
  validateServiceNumber,
} from '../api/apspdclClient.js';

// ── State ─────────────────────────────────────────────────────────────────────

const initialState = {
  services: [],
  trash: [],
  loading: true,
  refreshingIds: new Set(),
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        services: action.services,
        trash: action.trash,
        loading: false,
      };
    case 'SET_LOADING':
      return { ...state, loading: action.value };
    case 'REFRESHING_START': {
      const next = new Set(state.refreshingIds);
      next.add(action.id);
      return { ...state, refreshingIds: next };
    }
    case 'REFRESHING_END': {
      const next = new Set(state.refreshingIds);
      next.delete(action.id);
      return { ...state, refreshingIds: next };
    }
    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useElectricityServices() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const cooldowns = useRef(new Map()); // id → nextAllowedAt timestamp

  // Load all from DB
  const reload = useCallback(async () => {
    const [services, trash] = await Promise.all([db.getAll(), db.getTrash()]);
    dispatch({ type: 'LOAD', services, trash });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Refresh single service ──────────────────────────────────────────────────

  const refreshOne = useCallback(
    async (id) => {
      const now = Date.now();
      const nextAllowed = cooldowns.current.get(id) || 0;
      if (nextAllowed > now) {
        const wait = Math.ceil((nextAllowed - now) / 1000);
        throw new Error(`Please wait ${wait}s before refreshing again`);
      }

      dispatch({ type: 'REFRESHING_START', id });
      try {
        const service = await db.getById(id);
        if (!service) throw new Error('Service not found');

        const snapshot = await fetchApspdclSnapshot(service.serviceNumber);
        await db.update(id, {
          customerName: snapshot.customerName,
          lastBillDate: snapshot.billDate,
          lastDueDate: snapshot.dueDate,
          lastAmountDue: snapshot.amountDue,
          lastBilledUnits: snapshot.billedUnits,
          lastThreeAmounts: snapshot.lastThreeAmounts,
          lastStatus: snapshot.status,
          lastFetchedAt: new Date().toISOString(),
          isPaid: snapshot.isPaid,
          paidDate: snapshot.paidDate,
          receiptNumber: snapshot.receiptNumber,
          paidAmount: snapshot.paidAmount,
          billBreakup: snapshot.billBreakup,
          lastError: null,
        });

        // 2-minute cooldown
        cooldowns.current.set(id, Date.now() + 120_000);
      } catch (err) {
        await db.update(id, {
          lastError: err.message || 'Refresh failed',
          lastFetchedAt: new Date().toISOString(),
        });
        throw err;
      } finally {
        dispatch({ type: 'REFRESHING_END', id });
        await reload();
      }
    },
    [reload]
  );

  // ── Refresh all ─────────────────────────────────────────────────────────────

  const refreshAll = useCallback(async () => {
    const services = await db.getAll();
    const results = await Promise.allSettled(
      services.map((s) => refreshOne(s.id))
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      toast.error(`${failed} service(s) failed to refresh`);
    }
    await reload();
  }, [refreshOne, reload]);

  // ── Create ──────────────────────────────────────────────────────────────────

  const create = useCallback(
    async ({ serviceNumber, label }) => {
      // Check for existing
      const existing = await db.getByNumber(serviceNumber);
      if (existing && !existing.isDeleted) {
        throw new Error('Service number already exists');
      }

      // Validate with APSPDCL
      const valid = await validateServiceNumber(serviceNumber);
      if (!valid) throw new Error('Invalid APSPDCL service number');

      const service = await db.create({ serviceNumber, label });
      await reload();

      // Auto-refresh after add
      try {
        await refreshOne(service.id);
      } catch {
        // best-effort, don't throw
      }
    },
    [reload, refreshOne]
  );

  // ── Update (label, pinned, etc.) ────────────────────────────────────────────

  const update = useCallback(
    async (id, patch) => {
      if (patch.pinned !== undefined) {
        patch = {
          ...patch,
          pinnedAt: patch.pinned ? new Date().toISOString() : null,
        };
      }
      await db.update(id, patch);
      await reload();
    },
    [reload]
  );

  // ── Delete (soft / hard) ────────────────────────────────────────────────────

  const remove = useCallback(
    async (id, permanent = false) => {
      await db.delete(id, permanent);
      await reload();
    },
    [reload]
  );

  // ── Restore ─────────────────────────────────────────────────────────────────

  const restore = useCallback(
    async (id) => {
      await db.update(id, { isDeleted: false, deletedAt: null });
      await reload();
    },
    [reload]
  );

  return {
    ...state,
    actions: { create, update, remove, restore, refreshOne, refreshAll },
  };
}
