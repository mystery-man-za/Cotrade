import { AppState, MCPToolDefinition, RiskGuardConfig, TradeCommand } from '../types';

export const api = {
  async getState(): Promise<AppState> {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('Failed to fetch state');
    return res.json();
  },

  async sendCommand(command: {
    action: TradeCommand['action'];
    symbol?: string;
    orderType?: TradeCommand['orderType'];
    volume?: number;
    price?: number;
    sl?: number;
    tp?: number;
    ticket?: number;
    magic?: number;
    comment?: string;
    source?: TradeCommand['source'];
  }): Promise<{ success: boolean; commandId?: string; error?: string }> {
    const res = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    return res.json();
  },

  async updateRisk(risk: Partial<RiskGuardConfig>): Promise<{ status: string; riskGuard: RiskGuardConfig }> {
    const res = await fetch('/api/risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(risk),
    });
    return res.json();
  },

  async toggleKillSwitch(active: boolean): Promise<{ status: string; emergencyKillSwitch: boolean }> {
    const res = await fetch('/api/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    return res.json();
  },

  async getMcpTools(): Promise<{ tools: MCPToolDefinition[] }> {
    const res = await fetch('/api/mcp/tools');
    return res.json();
  },

  async executeMcpTool(name: string, args: Record<string, any>): Promise<{ success: boolean; result?: any; error?: string }> {
    const res = await fetch(`/api/mcp/tools/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    return res.json();
  },

  async callMcpJsonRpc(body: any): Promise<any> {
    const res = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async getEaCode(): Promise<{ code: string }> {
    const res = await fetch('/api/ea/code');
    return res.json();
  },

  async checkBridgeHealth(url = '/health'): Promise<{ ok: boolean; data?: any; latencyMs: number }> {
    const start = performance.now();
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
      const latencyMs = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        return { ok: true, data, latencyMs };
      }
      return { ok: false, latencyMs };
    } catch {
      return { ok: false, latencyMs: Math.round(performance.now() - start) };
    }
  },

  async simulateTick(symbol: string, bid?: number, ask?: number) {
    const res = await fetch('/api/simulate-tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, bid, ask }),
    });
    return res.json();
  },

  async getDatabaseAnalytics(): Promise<any> {
    const res = await fetch('/api/database/analytics');
    if (!res.ok) throw new Error('Failed to fetch database analytics');
    return res.json();
  },

  async getDatabaseOrders(limit = 100): Promise<{ orders: any[] }> {
    const res = await fetch(`/api/database/orders?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch database orders');
    return res.json();
  },

  async pruneDatabase(): Promise<{ success: boolean; purgedUnexecutedOrders: number; message: string }> {
    const res = await fetch('/api/database/prune', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to prune database');
    return res.json();
  },
};
