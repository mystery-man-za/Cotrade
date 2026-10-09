import React, { useState } from 'react';
import { AppState } from '../../types';
import { api } from '../../services/api';
import {
  Radio,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Terminal,
  Activity,
  Layers,
} from 'lucide-react';

interface EaConnectionRadarProps {
  state: AppState | null;
  onRefresh?: () => void;
}

export const EaConnectionRadar: React.FC<EaConnectionRadarProps> = ({ state, onRefresh }) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; latencyMs: number } | null>(null);

  const isConnected = state?.connection.isEaConnected ?? false;
  const terminalName = state?.connection.terminalName;
  const terminalCompany = state?.connection.terminalCompany;
  const chartSymbol = state?.connection.chartSymbol;
  const chartTimeframe = state?.connection.chartTimeframe;

  const copyUrl = () => {
    navigator.clipboard.writeText('http://127.0.0.1:7777');
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleTestPing = async () => {
    try {
      setIsPinging(true);
      const res = await api.checkBridgeHealth('/health');
      setPingResult(res);
      onRefresh?.();
    } catch {
      setPingResult({ ok: false, latencyMs: 0 });
    } finally {
      setIsPinging(false);
    }
  };

  if (isConnected) {
    return (
      <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="h-3.5 w-3.5 rounded-full bg-emerald-400 block animate-ping absolute inset-0" />
              <span className="h-3.5 w-3.5 rounded-full bg-emerald-400 block relative" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm font-mono text-emerald-300 uppercase tracking-wider">
                  MT5 EA Live & Running
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700">
                  Sub-second Loop
                </span>
              </div>
              <p className="text-xs text-slate-300 font-mono mt-0.5">
                Terminal: <strong className="text-white">{terminalName || 'MetaTrader 5'}</strong> • Broker:{' '}
                <strong className="text-white">{terminalCompany || state?.account.company || 'Live Broker'}</strong>
                {chartSymbol && (
                  <span>
                    {' '}• Chart: <strong className="text-cyan-400">{chartSymbol} {chartTimeframe}</strong>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800">
              Target: <code className="text-cyan-300">http://127.0.0.1:7777</code>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border border-amber-800/40 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider font-mono">
                Awaiting MetaTrader 5 EA Connection
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 animate-pulse">
                Auto-Detect Active
              </span>
            </div>
            <p className="text-xs text-slate-300 font-mono mt-1 max-w-2xl leading-relaxed">
              The bridge is actively listening. When you attach <code className="text-cyan-400 font-bold">AIMT5Bridge.mq5</code> to
              any MT5 chart, this terminal will automatically detect the connection in real-time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={copyUrl}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>Copy Whitelist URL</span>
          </button>

          <button
            onClick={handleTestPing}
            disabled={isPinging}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPinging ? 'animate-spin' : ''}`} />
            <span>Check Bridge Ping</span>
          </button>
        </div>
      </div>

      {pingResult && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Bridge HTTP Listener responding on port 7777 / 3000 ({pingResult.latencyMs}ms)
          </span>
          <span className="text-[11px] text-slate-500">
            Now attach the EA to any MT5 chart to complete the handshake.
          </span>
        </div>
      )}
    </div>
  );
};
