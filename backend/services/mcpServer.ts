import { tradeStore } from './tradeStore.js';
import { OrderType } from '../types/mt5.js';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export const MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'mt5_get_account_info',
    description: 'Retrieve real-time MetaTrader 5 account metrics including balance, equity, margin, free margin, margin level percentage, leverage, currency, and total floating profit.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_get_market_data',
    description: 'Get real-time live tick and price quote data for a symbol or all tracked symbols (bid, ask, spread, 24h high, 24h low).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD). Leave empty or specify "ALL" to get all quotes.',
        },
      },
    },
  },
  {
    name: 'mt5_get_open_positions',
    description: 'Retrieve all currently open trading positions in MetaTrader 5 including ticket ID, symbol, type (BUY/SELL), volume, open price, current market price, stop loss, take profit, floating profit, and magic number.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Filter positions by symbol (optional).',
        },
      },
    },
  },
  {
    name: 'mt5_execute_trade',
    description: 'Asynchronously dispatch a trade execution order (BUY or SELL) to MetaTrader 5. Returns a command ID for asynchronous status tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol to trade (e.g. EURUSD, XAUUSD, BTCUSD)',
        },
        orderType: {
          type: 'string',
          enum: ['BUY', 'SELL'],
          description: 'Order direction: BUY (long) or SELL (short)',
        },
        volume: {
          type: 'number',
          description: 'Volume in standard lots (e.g. 0.01, 0.1, 0.5, 1.0)',
        },
        sl: {
          type: 'number',
          description: 'Stop Loss absolute price (optional, 0 to disable)',
        },
        tp: {
          type: 'number',
          description: 'Take Profit absolute price (optional, 0 to disable)',
        },
        comment: {
          type: 'string',
          description: 'Custom comment or tag explaining AI trade rationale',
        },
        magic: {
          type: 'number',
          description: 'Magic number tag for the order (default: 889900)',
        },
      },
      required: ['symbol', 'orderType', 'volume'],
    },
  },
  {
    name: 'mt5_modify_position',
    description: 'Modify Stop Loss (SL) and Take Profit (TP) levels of an active MetaTrader 5 position ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket: {
          type: 'number',
          description: 'Unique ticket number of the open position to modify',
        },
        sl: {
          type: 'number',
          description: 'New Stop Loss absolute price level',
        },
        tp: {
          type: 'number',
          description: 'New Take Profit absolute price level',
        },
      },
      required: ['ticket'],
    },
  },
  {
    name: 'mt5_close_position',
    description: 'Close an open MetaTrader 5 position by ticket. Supports full close or partial lot closure.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket: {
          type: 'number',
          description: 'Unique ticket number of the open position to close',
        },
        volume: {
          type: 'number',
          description: 'Volume in lots to close. If omitted or 0, closes the entire position.',
        },
      },
      required: ['ticket'],
    },
  },
  {
    name: 'mt5_close_all',
    description: 'Emergency liquidation: Close all open positions immediately or all open positions for a designated symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol filter (e.g. "EURUSD"), or "ALL" to liquidate entire portfolio.',
        },
      },
    },
  },
  {
    name: 'mt5_configure_risk_guard',
    description: 'Update global risk parameters such as account-level take profit ($), stop loss ($), trailing stop distance, and maximum position caps.',
    inputSchema: {
      type: 'object',
      properties: {
        globalTakeProfitUSD: {
          type: 'number',
          description: 'Global portfolio floating profit target in USD (auto-closes all when reached). 0 to disable.',
        },
        globalStopLossUSD: {
          type: 'number',
          description: 'Global portfolio floating loss limit in USD (auto-liquidates when reached). 0 to disable.',
        },
        trailingStopEnabled: {
          type: 'boolean',
          description: 'Enable or disable the dynamic trailing stop engine',
        },
        trailingStopDistancePoints: {
          type: 'number',
          description: 'Trailing distance in broker points (e.g. 150 points = 15 pips)',
        },
        trailingStopStepPoints: {
          type: 'number',
          description: 'Trailing step in broker points (e.g. 30 points)',
        },
        maxLotSizePerTrade: {
          type: 'number',
          description: 'Maximum allowable lot size per individual trade order',
        },
        emergencyKillSwitch: {
          type: 'boolean',
          description: 'When true, halts all new trading and immediately liquidates open positions',
        },
      },
    },
  },
  {
    name: 'mt5_get_execution_queue',
    description: 'Inspect the status of asynchronous orders dispatched to MetaTrader 5 (pending, dispatched, executed, failed, execution latencies).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of recent queue commands to return (default 10)',
        },
      },
    },
  },
  {
    name: 'mt5_get_current_chart',
    description: 'Retrieve real-time details of the active chart and symbol that the MT5 EA is attached to (symbol, timeframe, spread, bid, ask, digits, contract size, min/max lot sizes).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_get_all_symbols',
    description: 'Retrieve all symbols that the MT5 EA is transmitting market quotes and broker specifications for.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_query_trade_history',
    description: 'Query historical trade orders from the persistent SQLite database, including order type, lots, execution prices, deal tickets, and broker latencies.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of historical trade orders to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'mt5_get_performance_analytics',
    description: 'Retrieve comprehensive performance analytics from the SQLite database: execution success rate, total orders, failed orders, and database metrics.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function executeMcpTool(name: string, args: Record<string, any> = {}): Promise<any> {
  switch (name) {
    case 'mt5_query_trade_history': {
      const { dbGetOrders } = await import('../database/db.js');
      const limit = args.limit ? Number(args.limit) : 20;
      const orders = await dbGetOrders(limit);
      return {
        count: orders.length,
        orders,
      };
    }

    case 'mt5_get_performance_analytics': {
      const { dbGetAnalytics } = await import('../database/db.js');
      return await dbGetAnalytics();
    }

    case 'mt5_get_current_chart': {
      const chart = tradeStore.getCurrentChart();
      if (!chart) {
        return {
          status: 'awaiting_ea',
          message: 'Awaiting MT5 EA connection to retrieve active chart symbol.',
        };
      }
      return chart;
    }

    case 'mt5_get_all_symbols': {
      const allSyms = tradeStore.getAllSymbols();
      return {
        count: allSyms.length,
        symbols: allSyms,
      };
    }

    case 'mt5_get_account_info': {
      const account = tradeStore.getAccount();
      return {
        login: account.login,
        tradeMode: account.tradeMode,
        balance: account.balance,
        equity: account.equity,
        freeMargin: account.freeMargin,
        margin: account.margin,
        marginLevel: `${account.marginLevel}%`,
        floatingProfit: account.profit,
        currency: account.currency,
        leverage: `1:${account.leverage}`,
        server: account.server,
        lastUpdate: new Date(account.lastUpdate).toISOString(),
      };
    }

    case 'mt5_get_market_data': {
      const ticks = tradeStore.getTicks();
      if (args.symbol && args.symbol.toUpperCase() !== 'ALL') {
        const found = ticks.find((t) => t.symbol.toUpperCase() === args.symbol.toUpperCase());
        if (!found) {
          throw new Error(`Symbol ${args.symbol} not found in tracked market feed.`);
        }
        return found;
      }
      return ticks;
    }

    case 'mt5_get_open_positions': {
      let positions = tradeStore.getPositions();
      if (args.symbol) {
        positions = positions.filter((p) => p.symbol.toUpperCase() === args.symbol.toUpperCase());
      }
      return {
        count: positions.length,
        totalProfit: positions.reduce((acc, p) => acc + p.profit, 0),
        positions,
      };
    }

    case 'mt5_execute_trade': {
      const { symbol, orderType, volume, sl, tp, comment, magic } = args;
      if (!symbol || !orderType || !volume) {
        throw new Error('Missing required arguments: symbol, orderType, volume');
      }

      const res = tradeStore.enqueueCommand({
        action: 'EXECUTE_TRADE',
        symbol: String(symbol).toUpperCase(),
        orderType: String(orderType).toUpperCase() as OrderType,
        volume: Number(volume),
        sl: sl ? Number(sl) : undefined,
        tp: tp ? Number(tp) : undefined,
        comment: comment || 'AI_MCP_TRADE',
        magic: magic ? Number(magic) : 889900,
        source: 'AI_MCP',
      });

      if (!res.success) {
        throw new Error(`Execution rejected by Risk Engine: ${res.error}`);
      }

      return {
        status: 'queued',
        commandId: res.commandId,
        message: `Asynchronous order queued for MT5 EA dispatch. Action: ${orderType} ${volume} ${symbol.toUpperCase()}`,
        timestamp: Date.now(),
      };
    }

    case 'mt5_modify_position': {
      const { ticket, sl, tp } = args;
      if (!ticket) throw new Error('Missing required argument: ticket');

      const res = tradeStore.enqueueCommand({
        action: 'MODIFY_POSITION',
        ticket: Number(ticket),
        sl: sl !== undefined ? Number(sl) : undefined,
        tp: tp !== undefined ? Number(tp) : undefined,
        source: 'AI_MCP',
        comment: 'AI_MCP_MODIFY',
      });

      if (!res.success) {
        throw new Error(`Modify rejected: ${res.error}`);
      }

      return {
        status: 'queued',
        commandId: res.commandId,
        message: `Modification queued for ticket #${ticket}. New SL: ${sl ?? 'unchanged'}, New TP: ${tp ?? 'unchanged'}`,
      };
    }

    case 'mt5_close_position': {
      const { ticket, volume } = args;
      if (!ticket) throw new Error('Missing required argument: ticket');

      const res = tradeStore.enqueueCommand({
        action: 'CLOSE_POSITION',
        ticket: Number(ticket),
        volume: volume ? Number(volume) : undefined,
        source: 'AI_MCP',
        comment: 'AI_MCP_CLOSE',
      });

      if (!res.success) {
        throw new Error(`Close rejected: ${res.error}`);
      }

      return {
        status: 'queued',
        commandId: res.commandId,
        message: `Close order queued for ticket #${ticket}`,
      };
    }

    case 'mt5_close_all': {
      const symbol = args.symbol ? String(args.symbol).toUpperCase() : 'ALL';
      const res = tradeStore.enqueueCommand({
        action: 'CLOSE_ALL',
        symbol: symbol,
        source: 'AI_MCP',
        comment: 'AI_MCP_CLOSE_ALL',
      });

      return {
        status: 'queued',
        commandId: res.commandId,
        message: `Bulk liquidation queued for symbol filter: ${symbol}`,
      };
    }

    case 'mt5_configure_risk_guard': {
      tradeStore.updateRiskGuard(args);
      return {
        status: 'success',
        riskGuard: tradeStore.getRiskGuard(),
      };
    }

    case 'mt5_get_execution_queue': {
      const state = tradeStore.getState();
      const limit = args.limit ? Number(args.limit) : 10;
      return state.commandQueue.slice(0, limit);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Handle JSON-RPC 2.0 MCP requests
export async function handleMcpJsonRpc(body: any): Promise<any> {
  const { jsonrpc, id, method, params } = body;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'mt5-ai-mcp-bridge',
          version: '2.10.0',
        },
      },
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS,
      },
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params || {};
    try {
      const toolResult = await executeMcpTool(name, toolArgs || {});
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(toolResult, null, 2),
            },
          ],
          isError: false,
        },
      };
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${err?.message || String(err)}`,
            },
          ],
          isError: true,
        },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  };
}
