"use client";

/**
 * OPTIMIZE — the decision workspace. No map: a clean column of engine-backed
 * decisions. Run the optimizer, drive it with a plain-English goal (the
 * pursue_goal tool via /agent/query), and probe limits with the bottleneck
 * unlock + break-even finders.
 */

import { useCallback, useState } from "react";
import InsightsPanel from "@/components/InsightsPanel";
import OptimizerPanel from "@/components/OptimizerPanel";
import { queryAgent } from "@/lib/api";
import { useAtlas } from "@/lib/atlas-context";
import type { AgentQueryResponse } from "@/lib/types";

export default function OptimizePage() {
  const { network, scenarioId, adoptEntry } = useAtlas();

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-8">

        {/* ── Hero: the optimizer ── */}
        <section
          className="rounded-2xl p-6 bg-black/60 border border-white/10 tactical-grid"
          style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.4)" }}
        >
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-sm font-mono text-cyan-400">◉</span>
            <h1 className="text-lg font-bold text-white tracking-wide">
              Find the optimal network shape
            </h1>
          </div>
          <p className="text-xs text-slate-400 mb-5 leading-relaxed">
            MILP facility-location with a greedy fallback, robustness-checked by Monte&nbsp;Carlo
            demand variation. Every figure below is solver output.
          </p>
          <OptimizerPanel
            onAdopt={(deltaPct) =>
              adoptEntry({
                label: "Optimizer recommendation adopted",
                metric: "cost_to_serve",
                value: deltaPct,
                unit: "%",
                source: "optimizer",
              })
            }
          />
        </section>

        {/* ── Goal loop ── */}
        <section className="rounded-2xl p-6 bg-black/60 border border-white/10">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-sm font-mono text-amber-400">⌖</span>
            <h2 className="text-base font-bold text-white tracking-wide">Goal-driven loop</h2>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Describe the target in plain English — the agent drives the real solver toward it
            (pursue_goal), and its answer is provenance-verified against the tool results.
          </p>
          <GoalLoop scenarioId={scenarioId} />
        </section>

        {/* ── Limits: bottleneck + break-even ── */}
        <section className="rounded-2xl p-6 bg-black/60 border border-white/10">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-sm font-mono text-cyan-400">⊙</span>
            <h2 className="text-base font-bold text-white tracking-wide">
              Bottlenecks &amp; break-even
            </h2>
          </div>
          {network ? (
            <InsightsPanel
              hubIds={network.hubs.map((h) => h.id)}
              emirates={[...new Set(network.zones.map((z) => z.emirate))].sort()}
              scenarioId={scenarioId}
              onAdopt={(label, value, unit) =>
                adoptEntry({
                  label,
                  metric: unit === "%" ? "cost_to_serve" : "finding",
                  value,
                  unit,
                  source: "opportunity",
                })
              }
            />
          ) : (
            <div className="text-xs text-slate-500">Loading network…</div>
          )}
        </section>
      </div>
    </div>
  );
}

function GoalLoop({ scenarioId }: { scenarioId: string | null }) {
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentQueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    if (!goal.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    queryAgent({ question: goal, mode: "single", scenario_id: scenarioId })
      .then(setResult)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }, [goal, busy, scenarioId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder='e.g. "cut cost 5% with no hub over 90% utilization"'
          className="flex-1 text-sm px-3.5 py-2.5 rounded-xl bg-white/8 border border-white/12
                     text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/40"
        />
        <button
          onClick={run}
          disabled={busy || !goal.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-amber-200 bg-amber-500/10
                     border border-amber-500/40 hover:bg-amber-500/20 cursor-pointer disabled:opacity-40"
        >
          {busy ? "Pursuing…" : "⌖ Pursue"}
        </button>
      </div>

      {error && (
        <div className="text-xs px-3.5 py-2.5 rounded-lg text-rose-400 bg-rose-500/10 border border-rose-500/20">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl p-4 bg-white/5 border border-white/10 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
            <span>{result.tool_calls.length} tool call{result.tool_calls.length === 1 ? "" : "s"}</span>
            {result.verification && (
              <span
                className={`px-2 py-0.5 rounded-full border font-bold tracking-widest
                  ${result.verification.grounded
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                    : "text-amber-400 bg-amber-500/10 border-amber-500/30"}`}
              >
                {result.verification.grounded ? "VERIFIED" : "FLAGGED"}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{result.answer}</p>
        </div>
      )}
    </div>
  );
}
