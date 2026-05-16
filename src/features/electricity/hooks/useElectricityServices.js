/**
 * useElectricityServices
 *
 * React state layer for electricity services.
 * Calls only servicesApi — never touches db or apspdclClient directly.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  createService,
  deletePermanently,
  listServices,
  listTrash,
  moveToTrash,
  refreshAllServices,
  refreshService,
  restoreService,
  shouldAutoRefresh,
  updateService,
} from '../api/servicesApi.js';
import { getValidSession } from '../utils/billdeskSession.jsx';

// ── Reducer ───────────────────────────────────────────────────────────────────

const initialState = {
  services: [],
  trash: [],
  loading: true,
  refreshingIds: new Set(),
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD':
      return { ...state, services: action.services, trash: action.trash, loading: false };

    case 'REFRESHING_ADD': {
      const next = new Set(state.refreshingIds);
      next.add(action.id);
      return { ...state, refreshingIds: next };
    }
    case 'REFRESHING_REMOVE': {
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

  // Per-service refresh cooldown: id → timestamp when next refresh is allowed
  const cooldowns = useRef(new Map());

  // ── Reload from local DB ────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    try {
      const [services, trash] = await Promise.all([listServices(), listTrash()]);
      dispatch({ type: 'LOAD', services, trash });
      return services; // return so auto-refresh can inspect them
    } catch (e) {
      console.error("Failed to load services:", e);
      dispatch({ type: 'LOAD', services: [], trash: [] });
      return [];
    }
  }, []);

  // ── Auto-refresh stale services on first daily load ─────────────────────
  // Runs once on mount. If any service hasn't been refreshed today, refresh-all.
  // Uses a ref to prevent double-fire in React StrictMode.
  const autoRefreshDone = useRef(false);

  useEffect(() => {
    if (autoRefreshDone.current) return;
    autoRefreshDone.current = true;

    (async () => {
      const services = await reload();
      const stale = services.filter(shouldAutoRefresh);
      if (stale.length === 0) return;

      const session = await getValidSession(stale[0].serviceNumber);
      if (!session) return; // User cancelled captcha or failed

      // Mark all stale as refreshing
      stale.forEach(s => dispatch({ type: 'REFRESHING_ADD', id: s.id }));
      try {
        await refreshAllServices(undefined, session);
      } finally {
        stale.forEach(s => dispatch({ type: 'REFRESHING_REMOVE', id: s.id }));
        await reload();
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions.add ─────────────────────────────────────────────────────────────
  // POST /services
  // Validates + fetches in one shot (2 APSPDCL calls total), then reloads.
  const add = useCallback(async ({ serviceNumber, label }) => {
    const session = await getValidSession(serviceNumber);
    if (!session) throw new Error('CANCELLED');
    
    await createService({ serviceNumber, label }, session);
    await reload();
  }, [reload]);

  // ── actions.refresh ─────────────────────────────────────────────────────────
  // POST /services/:id/refresh
  // Enforces a 2-minute per-service cooldown to avoid hammering APSPDCL.
  const refresh = useCallback(async (id) => {
    const now = Date.now();
    const nextAllowed = cooldowns.current.get(id) || 0;
    if (nextAllowed > now) {
      const wait = Math.ceil((nextAllowed - now) / 1000);
      throw new Error(`Please wait ${wait}s before refreshing again`);
    }

    const service = state.services.find(s => s.id === id);
    if (!service) throw new Error('Service not found');

    const session = await getValidSession(service.serviceNumber);
    if (!session) throw new Error('CANCELLED');

    dispatch({ type: 'REFRESHING_ADD', id });
    try {
      await refreshService(id, session);
      cooldowns.current.set(id, Date.now() + 120_000);
    } finally {
      dispatch({ type: 'REFRESHING_REMOVE', id });
      await reload();
    }
    // Note: refreshService already writes lastError to db on failure,
    // so we let the error bubble up for the toast without a second db write.
  }, [state.services, reload]);

  // ── actions.refreshAll ──────────────────────────────────────────────────────
  // POST /services/refresh-all
  // Uses concurrency-limited queue inside servicesApi — at most 2 in-flight.
  // Returns summary { succeeded, failed, errors }.
  const refreshAll = useCallback(async (onProgress) => {
    if (!state.services.length) return { succeeded: 0, failed: 0, errors: [] };
    const session = await getValidSession(state.services[0].serviceNumber);
    if (!session) throw new Error('CANCELLED');
    
    // Mark all as refreshing
    const services = state.services;
    services.forEach((s) => dispatch({ type: 'REFRESHING_ADD', id: s.id }));

    try {
      const summary = await refreshAllServices(async (completed, total) => {
        onProgress?.(completed, total);
        // Reload incrementally so cards update as each service finishes
        await reload();
      }, session);
      return summary;
    } finally {
      services.forEach((s) => dispatch({ type: 'REFRESHING_REMOVE', id: s.id }));
      await reload();
    }
  }, [state.services, reload]);

  // ── actions.update ──────────────────────────────────────────────────────────
  // PUT /services/:id  (label, pinned, etc.)
  const update = useCallback(async (id, patch) => {
    await updateService(id, patch);
    await reload();
  }, [reload]);

  // ── actions.moveToTrash ─────────────────────────────────────────────────────
  // DELETE /services/:id
  const remove = useCallback(async (id) => {
    await moveToTrash(id);
    await reload();
  }, [reload]);

  // ── actions.restore ─────────────────────────────────────────────────────────
  // PUT /services/:id/restore
  const restore = useCallback(async (id) => {
    await restoreService(id);
    await reload();
  }, [reload]);

  // ── actions.deletePermanently ───────────────────────────────────────────────
  // DELETE /services/:id/permanent
  const purge = useCallback(async (id) => {
    await deletePermanently(id);
    await reload();
  }, [reload]);

  return {
    ...state,
    actions: { add, refresh, refreshAll, update, remove, restore, purge },
  };
}