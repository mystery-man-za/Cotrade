import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { AccountInfo, CandleData, TickData } from '../types/mt5.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'mt5_bridge.sqlite');

let dbInstance: Database | null = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;

export async function getDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (err) {
      console.warn('Could not read existing sqlite file, creating fresh database:', err);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  initSchema(dbInstance);
  persistDatabase();
  return dbInstance;
}

function initSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      symbol TEXT,
      order_type TEXT,
      volume REAL,
      price REAL,
      sl REAL,
      tp REAL,
      ticket INTEGER,
      magic INTEGER,
      comment TEXT,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      deal_ticket INTEGER,
      execution_price REAL,
      execution_time_ms INTEGER,
      error_code INTEGER,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      executed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS positions_history (
      ticket INTEGER PRIMARY KEY,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      volume REAL NOT NULL,
      open_price REAL NOT NULL,
      close_price REAL,
      sl REAL,
      tp REAL,
      profit REAL,
      swap REAL,
      magic INTEGER,
      comment TEXT,
      open_time INTEGER NOT NULL,
      close_time INTEGER,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login INTEGER NOT NULL,
      balance REAL NOT NULL,
      equity REAL NOT NULL,
      margin REAL NOT NULL,
      free_margin REAL NOT NULL,
      margin_level REAL NOT NULL,
      profit REAL NOT NULL,
      currency TEXT,
      server TEXT,
      created_at INTEGER NOT NULL,
      created_at_iso TEXT
    );

    CREATE TABLE IF NOT EXISTS candles_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      time INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      time_iso TEXT,
      UNIQUE(symbol, timeframe, time)
    );

    CREATE TABLE IF NOT EXISTS ticks_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      bid REAL NOT NULL,
      ask REAL NOT NULL,
      spread INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      time_iso TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      level TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      source TEXT NOT NULL,
      ticket INTEGER
    );

    CREATE TABLE IF NOT EXISTS risk_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      global_tp_usd REAL NOT NULL,
      global_sl_usd REAL NOT NULL,
      max_drawdown_pct REAL NOT NULL,
      kill_switch INTEGER NOT NULL,
      trailing_enabled INTEGER NOT NULL,
      trailing_distance INTEGER NOT NULL,
      trailing_step INTEGER NOT NULL,
      max_lot_size REAL NOT NULL,
      max_open_positions INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles_history(symbol, timeframe, time);
    CREATE INDEX IF NOT EXISTS idx_ticks_lookup ON ticks_history(symbol, timestamp);
    CREATE INDEX IF NOT EXISTS idx_account_created ON account_history(created_at);
  `);
}

export function persistDatabase() {
  if (!dbInstance) return;

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(() => {
    try {
      if (!dbInstance) return;
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = dbInstance.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_FILE, buffer);
    } catch (e) {
      console.error('Failed to write sqlite database to disk:', e);
    }
  }, 100);
}

// Prune old data so database stays lightweight, fast, and does not grow unbounded
let pruneCounter = 0;
export async function pruneDatabase() {
  pruneCounter++;
  if (pruneCounter % 20 !== 0) return; // run periodically every 20 sync cycles
  await dbPruneDatabase();
}

// Full explicit database pruning with 24-hour unexecuted order expiration
export async function dbPruneDatabase(): Promise<{
  purgedUnexecutedOrders: number;
  message: string;
}> {
  try {
    const db = await getDatabase();
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const twoDaysAgoSec = Math.floor(now / 1000) - 48 * 3600;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // 1. Delete all unexecuted orders older than 24 hours (pending or dispatched)
    const countBefore = db.exec(`SELECT COUNT(*) FROM orders WHERE status IN ('pending', 'dispatched') AND created_at < ${twentyFourHoursAgo}`);
    const unexecutedCount = countBefore.length > 0 && countBefore[0].values.length > 0 ? Number(countBefore[0].values[0][0]) : 0;

    db.run(`DELETE FROM orders WHERE status IN ('pending', 'dispatched') AND created_at < ${twentyFourHoursAgo}`);

    // 2. Cap total archived orders (keep last 1,000 executed/failed orders)
    db.run(`DELETE FROM orders WHERE id NOT IN (SELECT id FROM orders ORDER BY created_at DESC LIMIT 1000)`);

    // 3. Cap ticks history (keep last 5,000 ticks or ticks within 48h)
    db.run(`DELETE FROM ticks_history WHERE timestamp < ${twoDaysAgoSec} OR id NOT IN (SELECT id FROM ticks_history ORDER BY id DESC LIMIT 5000)`);

    // 4. Cap account history snapshots (keep last 1,000 entries)
    db.run(`DELETE FROM account_history WHERE created_at < ${sevenDaysAgo} OR id NOT IN (SELECT id FROM account_history ORDER BY id DESC LIMIT 1000)`);

    // 5. Cap candles history (keep last 2,000 candles)
    db.run(`DELETE FROM candles_history WHERE id NOT IN (SELECT id FROM candles_history ORDER BY time DESC LIMIT 2000)`);

    // 6. Cap audit logs (keep last 500 logs)
    db.run(`DELETE FROM audit_logs WHERE timestamp < ${sevenDaysAgo} OR id NOT IN (SELECT id FROM audit_logs ORDER BY timestamp DESC LIMIT 500)`);

    persistDatabase();
    return {
      purgedUnexecutedOrders: unexecutedCount,
      message: `Database pruned successfully. Purged ${unexecutedCount} expired unexecuted orders older than 24h.`,
    };
  } catch (err: any) {
    console.error('Database prune error:', err);
    return {
      purgedUnexecutedOrders: 0,
      message: `Prune error: ${err?.message || String(err)}`,
    };
  }
}

// 1. Orders
export async function dbInsertOrder(order: any) {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO orders (
      id, action, symbol, order_type, volume, price, sl, tp, ticket, magic, comment,
      status, source, deal_ticket, execution_price, execution_time_ms, error_code,
      error_message, created_at, executed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    order.id,
    order.action,
    order.symbol || null,
    order.orderType || null,
    order.volume || null,
    order.price || null,
    order.sl || null,
    order.tp || null,
    order.ticket || null,
    order.magic || null,
    order.comment || null,
    order.status,
    order.source,
    order.result?.dealTicket || null,
    order.result?.executionPrice || null,
    order.result?.executionTimeMs || null,
    order.result?.errorCode || null,
    order.result?.errorMessage || null,
    order.createdAt,
    order.executedAt || null,
  ]);
  stmt.free();
  persistDatabase();
}

// 2. Account History Snapshot
let lastAccountRecordTime = 0;
export async function dbInsertAccountSnapshot(account: AccountInfo) {
  if (!account || account.login === 0) return;
  const now = Date.now();
  // Throttle to every 5 seconds to avoid bloating
  if (now - lastAccountRecordTime < 5000) return;
  lastAccountRecordTime = now;

  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT INTO account_history (
      login, balance, equity, margin, free_margin, margin_level, profit, currency, server, created_at, created_at_iso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    account.login,
    account.balance,
    account.equity,
    account.margin,
    account.freeMargin,
    account.marginLevel,
    account.profit,
    account.currency,
    account.server,
    now,
    new Date(now).toISOString(),
  ]);
  stmt.free();
  persistDatabase();
}

// 3. Candles History
export async function dbInsertCandles(symbol: string, timeframe: string, candles: CandleData[]) {
  if (!candles || candles.length === 0) return;
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO candles_history (
      symbol, timeframe, time, open, high, low, close, volume, time_iso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of candles) {
    const timeIso = c.timeIso || new Date(c.time * 1000).toISOString();
    stmt.run([
      symbol.toUpperCase(),
      timeframe.toUpperCase(),
      c.time,
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
      timeIso,
    ]);
  }
  stmt.free();
  persistDatabase();
}

// 4. Ticks History
export async function dbInsertTicks(ticks: TickData[]) {
  if (!ticks || ticks.length === 0) return;
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT INTO ticks_history (symbol, bid, ask, spread, timestamp, time_iso)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const t of ticks) {
    const timeIso = new Date(t.time * 1000).toISOString();
    stmt.run([
      t.symbol.toUpperCase(),
      t.bid,
      t.ask,
      t.spread,
      t.time,
      timeIso,
    ]);
  }
  stmt.free();
  persistDatabase();
}

// 5. Query Candles
export async function dbGetCandles(symbol: string, timeframe: string, limit = 100): Promise<CandleData[]> {
  const db = await getDatabase();
  const sql = `
    SELECT time, open, high, low, close, volume, time_iso
    FROM candles_history
    WHERE symbol = '${symbol.toUpperCase()}' AND timeframe = '${timeframe.toUpperCase()}'
    ORDER BY time ASC
    LIMIT ${limit}
  `;
  const res = db.exec(sql);
  if (res.length === 0) return [];
  const rows = res[0].values;
  return rows.map((r) => ({
    time: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
    timeIso: String(r[6]),
  }));
}

// 6. Query Ticks History
export async function dbGetTicksHistory(symbol?: string, limit = 100): Promise<any[]> {
  const db = await getDatabase();
  let sql = `SELECT symbol, bid, ask, spread, timestamp, time_iso FROM ticks_history`;
  if (symbol && symbol.toUpperCase() !== 'ALL') {
    sql += ` WHERE symbol = '${symbol.toUpperCase()}'`;
  }
  sql += ` ORDER BY timestamp DESC LIMIT ${limit}`;

  const res = db.exec(sql);
  if (res.length === 0) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const item: Record<string, any> = {};
    cols.forEach((c, i) => (item[c] = row[i]));
    return item;
  });
}

// 7. Query Account History
export async function dbGetAccountHistory(limit = 100): Promise<any[]> {
  const db = await getDatabase();
  const res = db.exec(`SELECT * FROM account_history ORDER BY created_at DESC LIMIT ${limit}`);
  if (res.length === 0) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const item: Record<string, any> = {};
    cols.forEach((c, i) => (item[c] = row[i]));
    return item;
  });
}

// 8. Logs
export async function dbInsertLog(log: any) {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO audit_logs (id, timestamp, level, title, details, source, ticket)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    log.id,
    log.timestamp,
    log.level,
    log.title,
    log.details,
    log.source,
    log.ticket || null,
  ]);
  stmt.free();
  persistDatabase();
}

// 9. Risk Settings
export async function dbSaveRiskSettings(risk: any) {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO risk_settings (
      id, global_tp_usd, global_sl_usd, max_drawdown_pct, kill_switch,
      trailing_enabled, trailing_distance, trailing_step, max_lot_size,
      max_open_positions, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    risk.globalTakeProfitUSD,
    risk.globalStopLossUSD,
    risk.maxDrawdownPercent,
    risk.emergencyKillSwitch ? 1 : 0,
    risk.trailingStopEnabled ? 1 : 0,
    risk.trailingStopDistancePoints,
    risk.trailingStopStepPoints,
    risk.maxLotSizePerTrade,
    risk.maxOpenPositions,
    Date.now(),
  ]);
  stmt.free();
  persistDatabase();
}

// 10. Query Orders
export async function dbGetOrders(limit = 100): Promise<any[]> {
  const db = await getDatabase();
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  // Automatically purge unexecuted orders older than 24 hours
  db.run(`DELETE FROM orders WHERE status IN ('pending', 'dispatched') AND created_at < ${twentyFourHoursAgo}`);
  persistDatabase();

  const res = db.exec(`SELECT * FROM orders ORDER BY created_at DESC LIMIT ${limit}`);
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const item: Record<string, any> = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item;
  });
}

// 11. Database Analytics
export async function dbGetAnalytics(): Promise<any> {
  const db = await getDatabase();
  const totalOrdersRes = db.exec(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed FROM orders`);
  const logsRes = db.exec(`SELECT COUNT(*) as total FROM audit_logs`);
  const candlesRes = db.exec(`SELECT COUNT(*) as total FROM candles_history`);
  const ticksRes = db.exec(`SELECT COUNT(*) as total FROM ticks_history`);
  const accountRes = db.exec(`SELECT COUNT(*) as total FROM account_history`);

  let totalOrders = 0;
  let executedOrders = 0;
  let failedOrders = 0;
  let totalLogs = 0;
  let totalCandles = 0;
  let totalTicks = 0;
  let totalAccountSnapshots = 0;

  if (totalOrdersRes.length > 0 && totalOrdersRes[0].values.length > 0) {
    const row = totalOrdersRes[0].values[0];
    totalOrders = Number(row[0]) || 0;
    executedOrders = Number(row[1]) || 0;
    failedOrders = Number(row[2]) || 0;
  }

  if (logsRes.length > 0 && logsRes[0].values.length > 0) {
    totalLogs = Number(logsRes[0].values[0][0]) || 0;
  }
  if (candlesRes.length > 0 && candlesRes[0].values.length > 0) {
    totalCandles = Number(candlesRes[0].values[0][0]) || 0;
  }
  if (ticksRes.length > 0 && ticksRes[0].values.length > 0) {
    totalTicks = Number(ticksRes[0].values[0][0]) || 0;
  }
  if (accountRes.length > 0 && accountRes[0].values.length > 0) {
    totalAccountSnapshots = Number(accountRes[0].values[0][0]) || 0;
  }

  let dbSizeBytes = 0;
  if (fs.existsSync(DB_FILE)) {
    dbSizeBytes = fs.statSync(DB_FILE).size;
  }

  return {
    databasePath: 'data/mt5_bridge.sqlite',
    databaseType: 'SQLite WASM (Persistent with Retention Pruning)',
    dbSizeBytes,
    totalOrders,
    executedOrders,
    failedOrders,
    executionSuccessRate: totalOrders > 0 ? Number(((executedOrders / totalOrders) * 100).toFixed(1)) : 100,
    totalLogs,
    totalCandles,
    totalTicks,
    totalAccountSnapshots,
  };
}
