import { db } from '../../../shared/db/storage.js';

/**
 * Migrates service number prefixes for all matching services.
 * @param {string} oldPrefix - The 5-digit prefix to replace.
 * @param {string} newPrefix - The new 5-digit prefix to use.
 * @returns {Promise<number>} - The number of services updated.
 */
export async function migrateServicePrefix(oldPrefix, newPrefix) {
  if (!oldPrefix || !newPrefix || oldPrefix.length !== 5 || newPrefix.length !== 5) {
    throw new Error('Prefixes must be exactly 5 digits.');
  }

  const activeServices = await db.getAll();
  const trashServices = await db.getTrash();
  const allServices = [...activeServices, ...trashServices];

  const matchingServices = allServices.filter(s => s.serviceNumber.startsWith(oldPrefix));

  if (matchingServices.length === 0) {
    return 0;
  }

  for (const service of matchingServices) {
    const updatedNumber = newPrefix + service.serviceNumber.substring(5);
    await db.update(service.id, {
      serviceNumber: updatedNumber,
      // Also update uniqueServiceNumber if it matches the old service number
      uniqueServiceNumber: service.uniqueServiceNumber === service.serviceNumber ? updatedNumber : service.uniqueServiceNumber
    });
  }

  // Record migration history
  const history = await db.getSetting('migration_history', []);
  const entry = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    oldPrefix,
    newPrefix,
    count: matchingServices.length,
    type: 'PREFIX_MIGRATION'
  };
  
  await db.setSetting('migration_history', [entry, ...history]);

  return matchingServices.length;
}

/**
 * Retrieves the migration history.
 */
export async function getMigrationHistory() {
  return await db.getSetting('migration_history', []);
}
