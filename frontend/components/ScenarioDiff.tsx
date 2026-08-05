"use client";

import type { SimulateResponse } from "@/lib/types";

type MetricKey = "cost_to_serve" | "utilization" | "coverage" | "spare_capacity";

const METRICS: { key: MetricKey; label: string; goodDirection: "down" | "up" | null }[] = [
  { key: "cost_to_serve",  label: "Cost-to-serve",  goodDirection: "down" },
  { key: "utilization",    label: "Avg utilization", goodDirection: null   },
  { key: "coverage",       label: "Coverage",        goodDirection: "up"   },
  { key: "spare_capacity", label: "Spare capacity",  goodDirection: null   },
];

const NEGLIGIBLE_PCT = 0.05;

function deltaMeta(pct: number, goodDirection: "down" | "up" | null) {
  if (goodDirection === null || Math.abs(pct) < NEGLIGIBLE_PCT)
    return { textCls: "text-slate-500", bgCls: "bg-slate-500/10" };
  const improving = goodDirection === "down" ? pct < 0 : pct > 0;
  return improving
    ? { textCls: "text-emerald-400", bgCls: "bg-emerald-500/10" }
    : { textCls: "text-rose-400",    bgCls: "bg-rose-500/10"    };
}

function formatPct(pct: number): string {
  if (Math.abs(pct) < NEGLIGIBLE_PCT) return "0.0";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}`;
}

export default function ScenarioDiff({
  result,
  onAdopt,
}: {
  result: SimulateResponse;
  /** Called with the engine-reported cost-to-serve delta_pct when the
   *  planner adopts this what-if into the Kaizen ledger. */
  onAdopt?: (costDeltaPct: number) => void;
}) {
  const costDelta = result.delta_pct["cost_to_serve"];
  const adoptable = onAdopt && typeof costDelta === "number" && result.scenario_flow_feasible;
  return (
    <div className="rounded-xl overflow-hidden bg-white/[0.04] border border-white/10">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
        <span className="text-xs font-mono font-semibold text-slate-100">{result.scenario_name}</span>
        {!result.scenario_flow_feasible && (
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full
                           bg-rose-500/10 text-rose-400 border border-rose-500/20">
            ⚠ infeasible
          </span>
        )}
      </div>

      {/* Metric rows */}
      {METRICS.map(({ key, label, goodDirection }) => {
        const before = result.baseline_kpis[key];
        const after  = result.scenario_kpis[key];
        const pct    = result.delta_pct[key];
        if (typeof before.value !== "number" || typeof after.value !== "number" || pct === undefined)
          return null;
        const { textCls, bgCls } = deltaMeta(pct, goodDirection);

        return (
          <div key={key}
               className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] last:border-b-0">
            <span className="text-xs text-amber-100/70">{label}</span>
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-slate-400">
                {before.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="text-slate-600">→</span>
              <span className="text-slate-100 font-medium">
                {after.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${textCls} ${bgCls}`}>
                {formatPct(pct)}%
              </span>
            </div>
          </div>
        );
      })}

      {/* Adopt into the Kaizen ledger — logs the ENGINE's delta, verbatim */}
      {adoptable && (
        <button
          onClick={() => onAdopt(costDelta)}
          className="w-full py-2.5 text-xs font-bold text-emerald-300 hover:text-white
                     bg-emerald-500/10 hover:bg-emerald-500/20 border-t border-emerald-500/20
                     transition-colors cursor-pointer"
          title="Log this engine-computed result in the improvement ledger"
        >
          ✓ Adopt this change ({formatPct(costDelta)}% cost-to-serve)
        </button>
      )}
    </div>
  );
}
