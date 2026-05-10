import { db } from '../../../shared/db/storage.js';
import { fetchApspdclSnapshot, validateServiceNumber } from './apspdclClient.js';

/**
 * Local API Service Layer
 * This acts as the application's backend API layer, providing customized
 * responses instead of raw APSPDCL payloads.
 * 
 * Equivalent REST Endpoints mapped to these functions:
 * - GET  /api/services            => listAllServices
 * - GET  /api/services/trash      => listTrashServices
 * - POST /api/services            => addService
 * - POST /api/services/:id/refresh => refreshService
 * - POST /api/services/refresh-all => refreshAllServices
 * - PUT  /api/services/:id        => updateService
 * - DELETE /api/services/:id      => moveToTrash
 */

// GET /api/services
export async function listAllServices() {
  return await db.getAll();
}

// GET /api/services/trash
export async function listTrashServices() {
  return await db.getTrash();
}

// POST /api/services
export async function addService(payload) {
  const { serviceNumber, label } = payload;
  
  // Validate with APSPDCL
  const valid = await validateServiceNumber(serviceNumber);
  if (!valid) throw new Error('Invalid APSPDCL service number');

  const existing = await db.getByNumber(serviceNumber);
  if (existing && !existing.isDeleted) {
    throw new Error('Service number already exists');
  }

  const service = await db.create({ serviceNumber, label });
  return service;
}

// POST /api/services/:id/refresh
export async function refreshService(id) {
  const service = await db.getById(id);
  if (!service) throw new Error('Service not found');

  const snapshot = await fetchApspdclSnapshot(service.serviceNumber);
  
  // Update local DB with the customized snapshot response
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

  return await db.getById(id);
}

// POST /api/services/refresh-all
export async function refreshAllServices() {
  const services = await db.getAll();
  const results = await Promise.allSettled(
    services.map((s) => refreshService(s.id))
  );
  
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    throw new Error(`${failed} service(s) failed to refresh`);
  }
  return await db.getAll();
}

// PUT /api/services/:id
export async function updateService(id, patch) {
  if (patch.pinned !== undefined) {
    patch = {
      ...patch,
      pinnedAt: patch.pinned ? new Date().toISOString() : null,
    };
  }
  return await db.update(id, patch);
}

// DELETE /api/services/:id
export async function moveToTrash(id) {
  await db.delete(id, false);
}

// POST /api/services/:id/restore
export async function restoreService(id) {
  return await db.update(id, { isDeleted: false, deletedAt: null });
}

// DELETE /api/services/:id/permanent
export async function deletePermanently(id) {
  await db.delete(id, true);
}
