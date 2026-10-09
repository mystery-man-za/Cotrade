export type OrderType = 'BUY' | 'SELL';
export type CommandStatus = 'pending' | 'dispatched' | 'executed' | 'failed' | 'cancelled';
export type OrderAction = 'EXECUTE_TRADE' | 'MODIFY_POSITION' | 'CLOSE_POSITION' | 'CLOSE_ALL' | 'SET_RISK_GUARD';

export interface AccountInfo {
  login: number;
  tradeMode: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  currency: string;
  server: string;
  company: string;
  profit: number;
  lastUpdate: number;
}

export interface TickData {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  last: number;
  volume: number;
  time: number;
  high24h?: number;
  low24h?: number;
}

export interface Position {
  ticket: number;
  symbol: string;
  type: OrderType;
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  magic: number;
  comment: string;
  openTime: number;
  trailingEnabled?: boolean;
  trailingDistance?: number;
}

export interface TradeCommand {
  id: string;
  action: OrderAction;
  symbol?: string;
  orderType?: OrderType;
  volume?: number;
  price?: number;
  sl?: number;
  tp?: number;
  ticket?: number;
  magic?: number;
  comment?: string;
  slippage?: number;
  status: CommandStatus;
  createdAt: number;
  dispatchedAt?: number;
  executedAt?: number;
  source: 'AI_MCP' | 'MANUAL_UI' | 'RISK_GUARD' | 'API';
  result?: {
    success: boolean;
    dealTicket?: number;
    orderTicket?: number;
    executionPrice?: number;
    comment?: string;
    errorCode?: number;
    errorMessage?: string;
    executionTimeMs?: number;
  };
}

export interface RiskGuardConfig {
  globalTakeProfitUSD: number;
  globalStopLossUSD: number;
  maxDrawdownPercent: number;
  emergencyKillSwitch: boolean;
  trailingStopEnabled: boolean;
  trailingStopDistancePoints: number;
  trailingStopStepPoints: number;
  maxLotSizePerTrade: number;
  maxOpenPositions: number;
  allowedSymbols: string[];
  autoCloseOnMarginLevelBelow: number;
}

export interface ExecutionLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'trade';
  title: string;
  details: string;
  source: string;
  ticket?: number;
}

export interface ChartSymbolInfo {
  symbol: string;
  timeframe: string;
  digits: number;
  point: number;
  bid: number;
  ask: number;
  spread: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  contractSize: number;
  tickValue: number;
  tradeAllowed: boolean;
  description?: string;
  currencyBase?: string;
  currencyProfit?: string;
}

export interface DetailedSymbolInfo {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  point: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  contractSize: number;
  tradeAllowed: boolean;
  high24h?: number;
  low24h?: number;
  volume?: number;
  time?: number;
  isCurrentChart?: boolean;
}

export interface AppState {
  connection: {
    isEaConnected: boolean;
    lastEaSync: number;
    eaVersion: string;
    bridgeEndpoint: string;
    fallbackEndpoint: string;
    serverTime: number;
    mt5ServerTime: number;
    terminalName?: string;
    terminalCompany?: string;
    terminalBuild?: number;
    chartSymbol?: string;
    chartTimeframe?: string;
  };
  currentChart: ChartSymbolInfo | null;
  allSymbols: DetailedSymbolInfo[];
  account: AccountInfo;
  positions: Position[];
  ticks: TickData[];
  tickHistory: Record<string, { time: number; bid: number; ask: number }[]>;
  commandQueue: TradeCommand[];
  riskGuard: RiskGuardConfig;
  logs: ExecutionLog[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
