"use client";

/**
 * FrontierPanel — the realism frontier, side by side and labelled.
 *
 * The raw optimiser's answer (close 8 of 10 hubs) is reported but never
 * recommended: it concentrates most of the network onto one site. The
 * CONSTRAINED optimum — at least N open hubs per emirate, no hub above a
 * volume-share cap — is the deliverable number, and the gap between the two
 * is the engine-computed "cost of resilience".
 *
 * Both COST POOLS are shown for every point, named apart, because they move
 * in opposite directions under consolidation: variable-only (the pool the
 * dataset's ≤7.00 AED target is defined on) and fully-loaded. Every figure
 * is verbatim from POST /optimize/frontier — the two knobs re-ask the
 * engine, nothing is recomputed here.
 */

import { useState } from "react";
import { optimizeFrontier } from "@/lib/api";
import type { FrontierResponse, FrontierSide } from "@/lib/types";
import { useAtlas } from "@/lib/atlas-context";

function PoolRow({ label, side }: { label: string; side: FrontierSide }) {
  const pools = side.cost_pools;
  const topShare = Math.max(0, ...Object.values(side.volume_share_by_hub));
  return (
    <div
      className={`rounded-xl p-3.5 border flex flex-col gap-2 ${
        label === "Recommended"
          ? "bg-emerald-500/[0.06] border-emerald-500/25"
          : "bg-white/[0.03] border-white/10"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
            label === "Recommended" ? "text-emerald-300" : "text-slate-400"
          }`}
        >
          {label}
        </span>
        <span className="text-[10px] font-mono text-slate-500">
          {side.hubs_open_count} hubs open
        </span>
        {typeof side.delta_vs_baseline_pct === "number" && (
          <span className="ml-auto text-sm font-bold text-white">
            {side.delta_vs_baseline_pct}%
            <span className="text-[9px] font-mono text-slate-500 ml-1">vs baseline/day</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-black/30 px-2.5 py-1.5">
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
            Variable-only <span title="The pool the dataset's ≤7.00 AED/parcel target is defined on">ⓘ</span>
          </div>
          <div className="text-slate-100 font-semibold">
            {pools.variable_only_aed_per_parcel.toFixed(2)} AED/parcel
          </div>
          <div
            className={`text-[9px] font-mono ${
              pools.meets_variable_target ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {pools.meets_variable_target ? "meets" : "misses"} ≤{pools.variable_target_aed} target (
            {pools.variable_vs_target_aed > 0 ? "+" : ""}
            {pools.variable_vs_target_aed.toFixed(2)})
          </div>
        </div>
        <div className="rounded-lg bg-black/30 px-2.5 py-1.5">
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
            Fully-loaded
          </div>
          <div className="text-slate-100 font-semibold">
            {pools.fully_loaded_aed_per_parcel.toFixed(2)} AED/parcel
          </div>
          <div className="text-[9px] font-mono text-slate-500">incl. overhead pool</div>
        </div>
      </div>

      <div className="text-[10px] text-slate-400">
        Largest single-hub share:{" "}
        <b className={topShare > 0.5 ? "text-rose-300" : "text-slate-200"}>
          {(topShare * 100).toFixed(1)}%
        </b>
        {!side.constraints_enforced && (
          <span className="ml-2 text-amber-400 font-semibold" title="The MILP fell back to the greedy heuristic, which cannot enforce realism constraints — this side is honestly unenforced.">
            ⚠ constraints not enforced (greedy fallback)
          </span>
        )}
      </div>
    </div>
  );
}

export default function FrontierPanel() {
  const { scenarioId } = useAtlas();
  const [minHubs, setMinHubs] = useState(1);
  const [maxShare, setMaxShare] = useState(0.4);
  const [result, setResult] = useState<FrontierResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setBusy(true);
    setError(null);
    optimizeFrontier({
      scenario_id: scenarioId,
      min_hubs_per_emirate: minHubs,
      max_hub_volume_share: maxShare,
    })
      .then(setResult)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-bold text-white tracking-wide">Realism frontier</h2>
        <span className="text-[10px] text-slate-500">
          raw optimum vs the resilient one — and what resilience costs
        </span>
        <div className="ml-auto flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <label className="flex items-center gap-1" title="Minimum open hubs in every emirate that has a facility — the judges' 'what if two per emirate?' knob">
            ≥
            <input
              type="number"
              min={1}
              max={4}
              value={minHubs}
              onChange={(e) => setMinHubs(Math.max(1, Number(e.target.value) || 1))}
              className="w-10 px-1 py-0.5 rounded bg-white/8 border border-white/15 text-slate-100"
            />
            hubs/emirate
          </label>
          <label className="flex items-center gap-1" title="No single hub may carry more than this share of network volume — the no-single-point-of-failure cap">
            ≤
            <input
              type="number"
              min={0.2}
              max={1}
              step={0.05}
              value={maxShare}
              onChange={(e) => setMaxShare(Math.min(1, Math.max(0.2, Number(e.target.value) || 0.4)))}
              className="w-14 px-1 py-0.5 rounded bg-white/8 border border-white/15 text-slate-100"
            />
            share
          </label>
          <button
            onClick={run}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-cyan-600/80
                       hover:bg-cyan-500/80 border border-cyan-400/30 cursor-pointer disabled:opacity-50"
          >
            {busy ? "Solving twice…" : result ? "Re-solve" : "Compute frontier"}
          </button>
        </div>
      </header>

      {error && <p className="text-[11px] text-rose-300">{error}</p>}

      {result && (
        <>
          <div className="grid md:grid-cols-2 gap-2.5">
            <PoolRow label="Raw optimum (not recommended)" side={result.unconstrained} />
            <PoolRow label="Recommended" side={result.constrained} />
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Resilience premium:{" "}
            <b className="text-white">
              {result.resilience_premium.total_cost_delta.toLocaleString()} AED/day
            </b>
            {result.resilience_premium.pct_points_of_saving_given_up !== null && (
              <>
                {" "}
                ({result.resilience_premium.pct_points_of_saving_given_up} pct-points of saving
                given up)
              </>
            )}{" "}
            — what it costs to not concentrate the network. Baseline:{" "}
            {result.baseline.cost_pools.variable_only_aed_per_parcel.toFixed(2)} variable /{" "}
            {result.baseline.cost_pools.fully_loaded_aed_per_parcel.toFixed(2)} fully-loaded
            AED/parcel across {result.baseline.hubs_open_count} hubs.
          </p>
        </>
      )}

      {!result && !busy && !error && (
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Runs the optimiser twice — once unconstrained, once under the resilience rules above —
          and shows both cost pools for each, labelled. The unconstrained answer is reported for
          transparency, never recommended.
        </p>
      )}
    </section>
  );
}
