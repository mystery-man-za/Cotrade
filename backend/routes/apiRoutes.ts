import { Router } from 'express';
import { tradeStore } from '../services/tradeStore.js';
import { MCP_TOOLS, executeMcpTool, handleMcpJsonRpc } from '../services/mcpServer.js';
import { broadcast } from '../services/websocketServer.js';
import fs from 'fs';
import path from 'path';

export const apiRouter = Router();

// Full state snapshot
apiRouter.get('/state', (req, res) => {
  res.json(tradeStore.getState());
});

// Enqueue order command from UI or API
apiRouter.post('/commands', (req, res) => {
  const { action, symbol, orderType, volume, sl, tp, ticket, magic, comment, source } = req.body;

  const result = tradeStore.enqueueCommand({
    action: action || 'EXECUTE_TRADE',
    symbol,
    orderType,
    volume,
    sl,
    tp,
    ticket,
    magic,
    comment,
    source: source || 'MANUAL_UI',
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  broadcast({
    type: 'command:queued',
    payload: tradeStore.getState().commandQueue[0],
  });

  res.json(result);
});

// Update risk guard parameters
apiRouter.post('/risk', (req, res) => {
  const updates = req.body;
  tradeStore.updateRiskGuard(updates);

  broadcast({
    type: 'risk:updated',
    payload: tradeStore.getRiskGuard(),
  });

  res.json({
    status: 'ok',
    riskGuard: tradeStore.getRiskGuard(),
  });
});

// Toggle emergency kill switch
apiRouter.post('/kill-switch', (req, res) => {
  const { active } = req.body;
  tradeStore.triggerKillSwitch(Boolean(active));

  broadcast({
    type: 'risk:kill_switch',
    payload: { active: Boolean(active) },
  });

  res.json({
    status: 'ok',
    emergencyKillSwitch: tradeStore.getRiskGuard().emergencyKillSwitch,
  });
});

// Active SSE clients for MCP protocol
const mcpSseClients = new Map<string, any>();

// MCP SSE Transport
apiRouter.get('/mcp/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sessionId = `mcp-session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  mcpSseClients.set(sessionId, res);

  // Send endpoint event with session URI per MCP specification
  res.write(`event: endpoint\ndata: /api/mcp/messages?sessionId=${sessionId}\n\n`);

  req.on('close', () => {
    mcpSseClients.delete(sessionId);
  });
});

// MCP Messages handler for SSE session
apiRouter.post('/mcp/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const sseClient = mcpSseClients.get(sessionId);

  try {
    const rpcResponse = await handleMcpJsonRpc(req.body);
    if (sseClient) {
      sseClient.write(`event: message\ndata: ${JSON.stringify(rpcResponse)}\n\n`);
      res.status(202).json({ status: 'accepted' });
    } else {
      res.json(rpcResponse);
    }
  } catch (err: any) {
    const errPayload = {
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32603, message: err?.message || 'Internal RPC error' },
    };
    if (sseClient) {
      sseClient.write(`event: message\ndata: ${JSON.stringify(errPayload)}\n\n`);
      res.status(202).json({ status: 'accepted' });
    } else {
      res.status(500).json(errPayload);
    }
  }
});

// MCP JSON-RPC 2.0 Direct POST Handler
apiRouter.post('/mcp', async (req, res) => {
  try {
    const rpcResponse = await handleMcpJsonRpc(req.body);
    res.json(rpcResponse);
  } catch (err: any) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32603, message: err?.message || 'Internal RPC error' },
    });
  }
});

// MCP Tool List
apiRouter.get('/mcp/tools', (req, res) => {
  res.json({
    tools: MCP_TOOLS,
  });
});

// Execute specific MCP tool directly via REST
apiRouter.post('/mcp/tools/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const result = await executeMcpTool(name, req.body);
    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err?.message || String(err),
    });
  }
});

// Get MQL5 source code text
apiRouter.get('/ea/code', (req, res) => {
  try {
    const eaPath = path.resolve(process.cwd(), 'backend/ea/AIMT5Bridge.mq5');
    if (fs.existsSync(eaPath)) {
      const code = fs.readFileSync(eaPath, 'utf-8');
      return res.json({ code });
    }
    res.status(404).json({ error: 'EA source file not found' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Download MQL5 file directly
apiRouter.get('/ea/download', (req, res) => {
  const eaPath = path.resolve(process.cwd(), 'backend/ea/AIMT5Bridge.mq5');
  if (fs.existsSync(eaPath)) {
    res.setHeader('Content-Disposition', 'attachment; filename="AIMT5Bridge.mq5"');
    res.setHeader('Content-Type', 'text/plain');
    fs.createReadStream(eaPath).pipe(res);
  } else {
    res.status(404).send('File not found');
  }
});

// Get database analytics & statistics
apiRouter.get('/database/analytics', async (req, res) => {
  try {
    const { dbGetAnalytics } = await import('../database/db.js');
    const analytics = await dbGetAnalytics();
    res.json(analytics);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query orders history from SQLite database
apiRouter.get('/database/orders', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const { dbGetOrders } = await import('../database/db.js');
    const orders = await dbGetOrders(limit);
    res.json({ orders });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Explicitly prune database & purge unexecuted orders older than 24 hours
apiRouter.post('/database/prune', async (req, res) => {
  try {
    tradeStore.pruneStaleOrders();
    const { dbPruneDatabase } = await import('../database/db.js');
    const result = await dbPruneDatabase();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query candles history from SQLite database
apiRouter.get('/database/candles', async (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || 'EURUSD';
    const timeframe = (req.query.timeframe as string) || 'M1';
    const limit = Number(req.query.limit) || 100;
    const { dbGetCandles } = await import('../database/db.js');
    const candles = await dbGetCandles(symbol, timeframe, limit);
    res.json({ symbol, timeframe, count: candles.length, candles });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query ticks history from SQLite database
apiRouter.get('/database/ticks', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const limit = Number(req.query.limit) || 100;
    const { dbGetTicksHistory } = await import('../database/db.js');
    const ticks = await dbGetTicksHistory(symbol, limit);
    res.json({ count: ticks.length, ticks });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query account history snapshots from SQLite database
apiRouter.get('/database/account-history', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const { dbGetAccountHistory } = await import('../database/db.js');
    const history = await dbGetAccountHistory(limit);
    res.json({ count: history.length, history });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Simulate synthetic candles for strategy backtesting without waiting for live ticks
apiRouter.post('/candles/simulate', async (req, res) => {
  try {
    const { symbol, timeframe, count, basePrice } = req.body;
    const result = await tradeStore.seedCandles(
      symbol || 'EURUSD',
      timeframe || 'M1',
      Number(count) || 60,
      Number(basePrice) || 1.085
    );
    broadcast({
      type: 'ea:sync',
      payload: {
        chartHistory: result.candles,
      },
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Request historical candles from EA on demand
apiRouter.post('/candles/request', (req, res) => {
  try {
    const { symbol, timeframe, count } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    const result = tradeStore.requestHistoryFromEA(
      symbol,
      timeframe || 'M1',
      Number(count) || 100
    );
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Download raw SQLite database file
apiRouter.get('/database/download', (req, res) => {
  const dbPath = path.resolve(process.cwd(), 'data/mt5_bridge.sqlite');
  if (fs.existsSync(dbPath)) {
    res.setHeader('Content-Disposition', 'attachment; filename="mt5_bridge.sqlite"');
    res.setHeader('Content-Type', 'application/x-sqlite3');
    fs.createReadStream(dbPath).pipe(res);
  } else {
    res.status(404).json({ error: 'Database file has not been initialized yet' });
  }
});

// Trigger a live tick update for testing
apiRouter.post('/simulate-tick', (req, res) => {
  const { symbol, bid, ask } = req.body;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const current = tradeStore.getTicks().find((t) => t.symbol === symbol);
  const newBid = bid || (current ? current.bid * (1 + (Math.random() - 0.5) * 0.001) : 1.085);
  const newAsk = ask || newBid + 0.00015;

  tradeStore.updateTick({
    symbol,
    bid: Number(newBid.toFixed(5)),
    ask: Number(newAsk.toFixed(5)),
    last: Number(newBid.toFixed(5)),
    spread: 15,
    volume: 500,
    time: Math.floor(Date.now() / 1000),
  });

  broadcast({
    type: 'tick',
    payload: tradeStore.getTicks().find((t) => t.symbol === symbol),
  });

  res.json({ success: true, tick: tradeStore.getTicks().find((t) => t.symbol === symbol) });
});
