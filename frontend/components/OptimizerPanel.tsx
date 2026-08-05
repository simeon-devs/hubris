"use client";

import { useState } from "react";
import { optimize } from "@/lib/api";
import type { OptimizeResponse } from "@/lib/types";

export default function OptimizerPanel({
  onAdopt,
}: {
  /** Called with the engine's cost_to_serve_pct delta when the planner
   *  adopts the recommendation into the Kaizen ledger. */
  onAdopt?: (costDeltaPct: number) => void;
}) {
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function runOptimize() {
    setLoading(true);
    setError(null);
    try {
      setResult(await optimize({}));
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={runOptimize}
        disabled={loading}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200
          ${loading
            ? "bg-emerald-500/5 border border-emerald-500/10 text-emerald-800 cursor-default"
            : "bg-gradient-to-r from-emerald-500/20 via-emerald-400/10 to-emerald-500/20 border border-emerald-400/40 text-emerald-200 hover:text-white cursor-pointer btn-glow-emerald"
          }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
            Optimising…
          </span>
        ) : "◈  Run Optimizer"}
      </button>

      {error && (
        <div className="text-xs px-3.5 py-2.5 rounded-xl text-rose-400
                        bg-rose-500/10 border border-rose-500/20">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/10">

          {/* Changes */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Recommended changes
            </span>
            <div className="text-sm">
              {result.changes.length === 0 ? (
                <span className="text-emerald-400">✓ Current network is already optimal</span>
              ) : (
                result.changes.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-slate-100">
                    <span className="text-amber-400 text-xs">◆</span>
                    {c.action} {c.hub_id}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cost comparison */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Cost-to-serve
            </span>
            <div className="flex items-center gap-2 font-mono text-sm">
              <span className="text-slate-400">{result.cost_to_serve_before.toFixed(2)}</span>
              <span className="text-slate-600">→</span>
              <span className="text-emerald-400 font-bold neon-emerald">
                {result.cost_to_serve_after.toFixed(2)}
              </span>
              <span className="text-[10px] font-sans text-slate-500">AED</span>
            </div>
          </div>

          {/* Robustness */}
          <RobustnessBadge band={result.robustness} />

          {/* Adopt — logs the ENGINE's delta_vs_baseline figure, verbatim */}
          {onAdopt && typeof result.delta_vs_baseline["cost_to_serve_pct"] === "number" &&
            result.changes.length > 0 && (
            <button
              onClick={() => onAdopt(result.delta_vs_baseline["cost_to_serve_pct"])}
              className="w-full py-2.5 rounded-lg text-xs font-bold text-emerald-300 hover:text-white
                         bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20
                         transition-colors cursor-pointer"
            >
              ✓ Adopt recommendation ({result.delta_vs_baseline["cost_to_serve_pct"].toFixed(2)}% cost-to-serve)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RobustnessBadge({ band }: { band: OptimizeResponse["robustness"] }) {
  const robust = band.holds_under_variation;
  return (
    <div className="flex flex-col gap-2.5 pt-3 border-t border-white/[0.07]">
      <span
        className={`text-[10px] font-bold px-2.5 py-1 rounded-full tracking-widest self-start
          ${robust
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            : "bg-rose-500/10    text-rose-400    border border-rose-500/20"
          }`}
      >
        {robust ? "ROBUST" : "AT RISK"} · ±{band.demand_variation_pct}% DEMAND
      </span>
      <p className="text-[11px] font-mono leading-relaxed text-slate-400">
        {band.cost_to_serve_p10.toFixed(2)}
        <span className="font-sans mx-1">–</span>
        {band.cost_to_serve_p90.toFixed(2)} AED/parcel
        <span className="font-sans"> (p50: {band.cost_to_serve_p50.toFixed(2)}), </span>
        feasible {band.feasible_pct}%
        <span className="font-sans"> of {band.trials} trials</span>
      </p>
    </div>
  );
}
