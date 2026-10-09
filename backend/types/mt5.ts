export type OrderType = 'BUY' | 'SELL';
export type CommandStatus = 'pending' | 'dispatched' | 'executed' | 'failed' | 'cancelled';
export type OrderAction = 'EXECUTE_TRADE' | 'MODIFY_POSITION' | 'CLOSE_POSITION' | 'CLOSE_ALL' | 'SET_RISK_GUARD';

export interface AccountInfo {
  login: number;
  tradeMode: string; // 'DEMO' | 'REAL' | 'CONTEST'
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number; // percentage
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
  trailingStep?: number;
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
  globalTakeProfitUSD: number; // 0 = disabled
  globalStopLossUSD: number; // 0 = disabled
  maxDrawdownPercent: number; // 0 = disabled
  emergencyKillSwitch: boolean;
  trailingStopEnabled: boolean;
  trailingStopDistancePoints: number; // in points
  trailingStopStepPoints: number; // in points
  maxLotSizePerTrade: number;
  maxOpenPositions: number;
  allowedSymbols: string[];
  autoCloseOnMarginLevelBelow: number; // e.g. 50%
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

export interface EASyncPayload {
  apiKey: string;
  account: AccountInfo;
  positions: Position[];
  ticks: TickData[];
  eaVersion: string;
  mt5Time: number;
  currentChart?: ChartSymbolInfo;
  allSymbols?: DetailedSymbolInfo[];
  terminalName?: string;
  terminalCompany?: string;
  terminalBuild?: number;
  pendingExecutionResults?: {
    commandId: string;
    success: boolean;
    dealTicket?: number;
    orderTicket?: number;
    executionPrice?: number;
    errorCode?: number;
    errorMessage?: string;
    executionTimeMs?: number;
  }[];
}

export interface EASyncResponse {
  status: 'ok' | 'error';
  serverTime: number;
  commands: TradeCommand[];
  riskGuard: RiskGuardConfig;
  message?: string;
}
