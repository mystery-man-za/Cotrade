import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

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
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS symbol_ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      bid REAL NOT NULL,
      ask REAL NOT NULL,
      spread INTEGER NOT NULL,
      timestamp INTEGER NOT NULL
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

// Helper query utilities
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

export async function dbGetOrders(limit = 100): Promise<any[]> {
  const db = await getDatabase();
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

export async function dbGetAnalytics(): Promise<any> {
  const db = await getDatabase();
  const totalOrdersRes = db.exec(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed FROM orders`);
  const logsRes = db.exec(`SELECT COUNT(*) as total FROM audit_logs`);

  let totalOrders = 0;
  let executedOrders = 0;
  let failedOrders = 0;
  let totalLogs = 0;

  if (totalOrdersRes.length > 0 && totalOrdersRes[0].values.length > 0) {
    const row = totalOrdersRes[0].values[0];
    totalOrders = Number(row[0]) || 0;
    executedOrders = Number(row[1]) || 0;
    failedOrders = Number(row[2]) || 0;
  }

  if (logsRes.length > 0 && logsRes[0].values.length > 0) {
    totalLogs = Number(logsRes[0].values[0][0]) || 0;
  }

  let dbSizeBytes = 0;
  if (fs.existsSync(DB_FILE)) {
    dbSizeBytes = fs.statSync(DB_FILE).size;
  }

  return {
    databasePath: 'data/mt5_bridge.sqlite',
    databaseType: 'SQLite WASM (Persistent)',
    dbSizeBytes,
    totalOrders,
    executedOrders,
    failedOrders,
    executionSuccessRate: totalOrders > 0 ? Number(((executedOrders / totalOrders) * 100).toFixed(1)) : 100,
    totalLogs,
  };
}
