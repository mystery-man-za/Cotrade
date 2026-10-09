import React from 'react';
import { ChartSymbolInfo } from '../../types';
import { Monitor, Zap, Shield, ArrowUpRight, ArrowDownRight, Layers, DollarSign } from 'lucide-react';

interface CurrentChartSymbolCardProps {
  currentChart: ChartSymbolInfo | null;
  onSelectSymbol?: (symbol: string) => void;
}

export const CurrentChartSymbolCard: React.FC<CurrentChartSymbolCardProps> = ({
  currentChart,
  onSelectSymbol,
}) => {
  if (!currentChart) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Current Connected Chart Symbol
            </h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
            Awaiting Chart
          </span>
        </div>

        <div className="border border-dashed border-slate-800 rounded-lg p-6 text-center text-slate-400 font-mono text-xs space-y-1.5">
          <p className="text-sm font-semibold text-slate-300">
            No Active MT5 Chart Connected Yet
          </p>
          <p className="text-slate-500 max-w-md mx-auto text-[11px]">
            Once you drag <code className="text-cyan-400">AIMT5Bridge.mq5</code> onto an MT5 chart (e.g. EURUSD M1),
            this card will immediately reflect the active chart symbol, broker specifications, and tick value.
          </p>
        </div>
      </div>
    );
  }

  const digits = currentChart.digits || (currentChart.symbol.includes('JPY') ? 3 : 5);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 border border-cyan-800/40 rounded-xl p-5 shadow-lg shadow-cyan-950/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white font-mono tracking-tight">
                {currentChart.symbol}
              </h2>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                {currentChart.timeframe}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Active EA Chart
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {currentChart.description || 'MetaTrader 5 Connected Chart'}
            </p>
          </div>
        </div>

        <button
          onClick={() => onSelectSymbol?.(currentChart.symbol)}
          className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
        >
          <Zap className="h-3.5 w-3.5" />
          Trade {currentChart.symbol}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 font-mono text-xs">
        {/* Bid */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Live Bid</span>
          <div className="text-sm font-bold text-emerald-400 mt-0.5">
            {currentChart.bid.toFixed(digits)}
          </div>
        </div>

        {/* Ask */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Live Ask</span>
          <div className="text-sm font-bold text-slate-200 mt-0.5">
            {currentChart.ask.toFixed(digits)}
          </div>
        </div>

        {/* Spread */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Live Spread</span>
          <div className="text-sm font-bold text-cyan-300 mt-0.5">
            {currentChart.spread} pts
          </div>
        </div>

        {/* Lot Range */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Min / Max Lot</span>
          <div className="text-slate-300 mt-0.5 font-bold">
            {currentChart.minLot} - {currentChart.maxLot}
          </div>
        </div>

        {/* Lot Step */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Lot Step</span>
          <div className="text-slate-300 mt-0.5 font-bold">
            {currentChart.lotStep}
          </div>
        </div>

        {/* Contract Size */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Contract Size</span>
          <div className="text-slate-300 mt-0.5 font-bold">
            {currentChart.contractSize.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
};
