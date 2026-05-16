/**
 * Storage abstraction layer
 * - Android (Capacitor): uses @capacitor-community/sqlite
 * - Browser / Desktop: uses IndexedDB via idb
 */

import { openDB } from 'idb';

const DB_NAME = 'my-dashboard';
const DB_VERSION = 2;  // bumped: adds billHistory, paymentHistory, trendData, insights, lastRefreshedDate
const STORE = 'electricity_services';

let _idb = null;
let _sqlite = null;
let _platform = null; // 'android' | 'browser'

// ── Platform detection ──────────────────────────────────────────────────────

function isAndroid() {
  return (
    typeof window !== 'undefined' &&
    (window.Capacitor?.isNativePlatform?.() ||
      window.Capacitor?.getPlatform?.() === 'android')
  );
}

// ── IndexedDB (browser/desktop) ─────────────────────────────────────────────

async function getIdb() {
  if (_idb) return _idb;
  _idb = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: false });
        store.createIndex('serviceNumber', 'serviceNumber', { unique: false });
        store.createIndex('isDeleted', 'isDeleted', { unique: false });
        store.createIndex('pinned', 'pinned', { unique: false });
      }
      // v2: new fields are plain JS properties — IndexedDB stores them automatically.
      // No schema change needed; existing records just won't have them until next refresh.
    },
  });
  return _idb;
}

// ── SQLite (Android) ─────────────────────────────────────────────────────────

async function getSqlite() {
  if (_sqlite) return _sqlite;
  const { CapacitorSQLite, SQLiteConnection } = await import(
    '@capacitor-community/sqlite'
  );
  const conn = new SQLiteConnection(CapacitorSQLite);

  let db;
  try {
    const retCC = await conn.checkConnectionsConsistency();
    const isConn = await conn.isConnection('mydashboard', false);
    
    if (retCC.result && isConn.result) {
      db = await conn.retrieveConnection('mydashboard', false);
    } else {
      db = await conn.createConnection(
        'mydashboard',
        false,
        'no-encryption',
        1,
        false
      );
    }
    await db.open();

    // Migrate: add historyFetchedAt if missing
    try {
      await db.execute("ALTER TABLE electricity_services ADD COLUMN historyFetchedAt TEXT;");
    } catch (e) {
      // Column probably exists, ignore
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS electricity_services (
        id TEXT PRIMARY KEY,
        serviceNumber TEXT NOT NULL,
        label TEXT,
        customerName TEXT,
        lastBillDate TEXT,
        lastDueDate TEXT,
        lastAmountDue REAL,
        lastBilledUnits REAL,
        lastThreeAmounts TEXT,
        lastStatus TEXT DEFAULT 'UNKNOWN',
        lastFetchedAt TEXT,
        historyFetchedAt TEXT,
        lastRefreshedDate TEXT,
        lastError TEXT,
        isPaid INTEGER DEFAULT 0,
        paidDate TEXT,
        receiptNumber TEXT,
        paidAmount REAL,
        billBreakup TEXT,
        billHistory TEXT,
        paymentHistory TEXT,
        trendData TEXT,
        insights TEXT,
        pinned INTEGER DEFAULT 0,
        pinnedAt TEXT,
        isDeleted INTEGER DEFAULT 0,
        deletedAt TEXT,
        createdAt TEXT,
        updatedAt TEXT
      )
    `);
    _sqlite = db;
    return db;
  } catch (err) {
    console.error("SQLite init error:", err);
    throw err;
  }
}

// ── UUID generator ───────────────────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Serializers ──────────────────────────────────────────────────────────────

function serializeRecord(record) {
  return {
    ...record,
    lastThreeAmounts: record.lastThreeAmounts ? JSON.stringify(record.lastThreeAmounts) : '[]',
    billBreakup:      record.billBreakup      ? JSON.stringify(record.billBreakup)      : null,
    billHistory:      record.billHistory      ? JSON.stringify(record.billHistory)      : null,
    paymentHistory:   record.paymentHistory   ? JSON.stringify(record.paymentHistory)   : null,
    trendData:        record.trendData        ? JSON.stringify(record.trendData)        : null,
    insights:         record.insights         ? JSON.stringify(record.insights)         : null,
    isPaid:     record.isPaid     ? 1 : 0,
    pinned:     record.pinned     ? 1 : 0,
    isDeleted:  record.isDeleted  ? 1 : 0,
  };
}

function deserializeRecord(row) {
  if (!row) return null;
  return {
    ...row,
    lastThreeAmounts: typeof row.lastThreeAmounts === 'string' ? JSON.parse(row.lastThreeAmounts) : row.lastThreeAmounts || [],
    billBreakup:      typeof row.billBreakup      === 'string' ? JSON.parse(row.billBreakup)      : row.billBreakup    || null,
    billHistory:      typeof row.billHistory      === 'string' ? JSON.parse(row.billHistory)      : row.billHistory    || null,
    paymentHistory:   typeof row.paymentHistory   === 'string' ? JSON.parse(row.paymentHistory)   : row.paymentHistory || null,
    trendData:        typeof row.trendData        === 'string' ? JSON.parse(row.trendData)        : row.trendData      || null,
    insights:         typeof row.insights         === 'string' ? JSON.parse(row.insights)         : row.insights       || null,
    isPaid:     Boolean(row.isPaid),
    pinned:     Boolean(row.pinned),
    isDeleted:  Boolean(row.isDeleted),
  };
}

// ── DB Operations ─────────────────────────────────────────────────────────────

async function getPlatform() {
  if (_platform) return _platform;
  _platform = isAndroid() ? 'android' : 'browser';
  return _platform;
}

async function getAllServices() {
  const platform = await getPlatform();
  if (platform === 'android') {
    const db = await getSqlite();
    const result = await db.query(
      `SELECT * FROM electricity_services WHERE isDeleted = 0
       ORDER BY pinned DESC, pinnedAt ASC, createdAt DESC`
    );
    return (result.values || []).map(deserializeRecord);
  } else {
    const db = await getIdb();
    const all = await db.getAll(STORE);
    return all
      .filter((r) => !r.isDeleted)
      .sort((a, b) => {
        if (b.pinned !== a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        if (a.pinned && b.pinned) return new Date(a.pinnedAt) - new Date(b.pinnedAt);
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }
}

async function getTrashServices() {
  const platform = await getPlatform();
  if (platform === 'android') {
    const db = await getSqlite();
    const result = await db.query(
      `SELECT * FROM electricity_services WHERE isDeleted = 1
       ORDER BY deletedAt DESC`
    );
    return (result.values || []).map(deserializeRecord);
  } else {
    const db = await getIdb();
    const all = await db.getAll(STORE);
    return all
      .filter((r) => r.isDeleted)
      .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  }
}

async function getServiceById(id) {
  const platform = await getPlatform();
  if (platform === 'android') {
    const db = await getSqlite();
    const result = await db.query(
      `SELECT * FROM electricity_services WHERE id = ?`,
      [id]
    );
    return deserializeRecord(result.values?.[0] || null);
  } else {
    const db = await getIdb();
    const record = await db.get(STORE, id);
    return deserializeRecord(record || null);
  }
}

async function getServiceByNumber(serviceNumber) {
  const platform = await getPlatform();
  if (platform === 'android') {
    const db = await getSqlite();
    const result = await db.query(
      `SELECT * FROM electricity_services WHERE serviceNumber = ? AND isDeleted = 0`,
      [serviceNumber]
    );
    return deserializeRecord(result.values?.[0] || null);
  } else {
    const db = await getIdb();
    const all = await db.getAllFromIndex(STORE, 'serviceNumber', serviceNumber);
    return deserializeRecord(all.find((r) => !r.isDeleted) || null);
  }
}

async function createService(data) {
  const platform = await getPlatform();
  const now = new Date().toISOString();
  const record = {
    id: generateId(),
    serviceNumber: data.serviceNumber,
    label: data.label || '',
    customerName: null,
    lastBillDate: null,
    lastDueDate: null,
    lastAmountDue: null,
    lastBilledUnits: null,
    lastThreeAmounts: [],
    lastStatus: 'UNKNOWN',
    lastFetchedAt: null,
    historyFetchedAt: null,
    lastRefreshedDate: null,
    lastError: null,
    isPaid: false,
    paidDate: null,
    receiptNumber: null,
    paidAmount: null,
    billBreakup: null,
    billHistory: null,
    paymentHistory: null,
    trendData: null,
    insights: null,
    pinned: false,
    pinnedAt: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (platform === 'android') {
    const db = await getSqlite();
    const ser = serializeRecord(record);
    await db.run(
      `INSERT INTO electricity_services
        (id, serviceNumber, label, customerName, lastBillDate, lastDueDate,
         lastAmountDue, lastBilledUnits, lastThreeAmounts, lastStatus, lastFetchedAt,
         historyFetchedAt, lastRefreshedDate, lastError, isPaid, paidDate, receiptNumber, paidAmount,
         billBreakup, billHistory, paymentHistory, trendData, insights,
         pinned, pinnedAt, isDeleted, deletedAt, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        ser.id, ser.serviceNumber, ser.label, ser.customerName,
        ser.lastBillDate, ser.lastDueDate, ser.lastAmountDue, ser.lastBilledUnits,
        ser.lastThreeAmounts, ser.lastStatus, ser.lastFetchedAt, ser.historyFetchedAt, ser.lastRefreshedDate,
        ser.lastError, ser.isPaid, ser.paidDate, ser.receiptNumber, ser.paidAmount,
        ser.billBreakup, ser.billHistory, ser.paymentHistory, ser.trendData, ser.insights,
        ser.pinned, ser.pinnedAt, ser.isDeleted, ser.deletedAt, ser.createdAt, ser.updatedAt
      ]
    );
  } else {
    const db = await getIdb();
    await db.put(STORE, record);
  }
  return record;
}

async function updateService(id, patch) {
  const platform = await getPlatform();
  const now = new Date().toISOString();

  if (platform === 'android') {
    const existing = await getServiceById(id);
    if (!existing) throw new Error('Service not found');
    const updated = { ...existing, ...patch, updatedAt: now };
    const ser = serializeRecord(updated);
    await (await getSqlite()).run(
      `UPDATE electricity_services SET
        serviceNumber=?, label=?, customerName=?, lastBillDate=?, lastDueDate=?,
        lastAmountDue=?, lastBilledUnits=?, lastThreeAmounts=?, lastStatus=?,
        lastFetchedAt=?, historyFetchedAt=?, lastRefreshedDate=?, lastError=?, isPaid=?, paidDate=?,
        receiptNumber=?, paidAmount=?, billBreakup=?, billHistory=?,
        paymentHistory=?, trendData=?, insights=?,
        pinned=?, pinnedAt=?, isDeleted=?, deletedAt=?, updatedAt=?
       WHERE id=?`,
      [
        ser.serviceNumber, ser.label, ser.customerName, ser.lastBillDate,
        ser.lastDueDate, ser.lastAmountDue, ser.lastBilledUnits, ser.lastThreeAmounts,
        ser.lastStatus, ser.lastFetchedAt, ser.historyFetchedAt, ser.lastRefreshedDate, ser.lastError,
        ser.isPaid, ser.paidDate, ser.receiptNumber, ser.paidAmount,
        ser.billBreakup, ser.billHistory, ser.paymentHistory, ser.trendData, ser.insights,
        ser.pinned, ser.pinnedAt, ser.isDeleted, ser.deletedAt, ser.updatedAt, ser.id
      ]
    );
    return updated;
  } else {
    const db = await getIdb();
    const existing = await db.get(STORE, id);
    if (!existing) throw new Error('Service not found');
    const updated = { ...existing, ...patch, updatedAt: now };
    await db.put(STORE, updated);
    return updated;
  }
}

async function deleteService(id, permanent = false) {
  const platform = await getPlatform();
  if (permanent) {
    if (platform === 'android') {
      await (await getSqlite()).run(
        `DELETE FROM electricity_services WHERE id=?`, [id]
      );
    } else {
      const db = await getIdb();
      await db.delete(STORE, id);
    }
  } else {
    await updateService(id, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      pinned: false,
      pinnedAt: null,
    });
  }
}

export const db = {
  getAll: getAllServices,
  getTrash: getTrashServices,
  getById: getServiceById,
  getByNumber: getServiceByNumber,
  create: createService,
  update: updateService,
  delete: deleteService,
  getPlatform,
};