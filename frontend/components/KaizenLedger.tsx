"use client";

/**
 * KaizenLedger — the improvement ledger (改善): every decision the planner
 * ADOPTS from an engine recommendation is logged, with its engine-computed
 * figure, against the track's official target: −5% network cost-to-serve.
 *
 * Honesty rule: each entry's figure is exactly what the engine reported for
 * that decision (delta_pct / verified savings) — this component never
 * combines or recomputes numbers. The progress bar tracks the single best
 * adopted cost-to-serve delta (an engine number), not a client-side sum.
 */

import { useState } from "react";

export interface LedgerEntry {
  id: string;
  label: string;
  /** e.g. "cost-to-serve" */
  metric: string;
  /** The engine-reported figure, verbatim. Negative = saving. */
  value: number;
  unit: string;
  source: "what-if" | "optimizer" | "opportunity" | "bottleneck";
  ts: number;
}

const TARGET_PCT = 5; // the track brief's stated success metric

interface KaizenLedgerProps {
  entries: LedgerEntry[];
  onRemove: (id: string) => void;
}

export default function KaizenLedger({ entries, onRemove }: KaizenLedgerProps) {
  const [open, setOpen] = useState(false);

  // Best single adopted cost-to-serve reduction — an engine-reported delta,
  // shown as progress toward the official 5% target.
  const costDeltas = entries
    .filter((e) => e.metric === "cost_to_serve" && e.unit === "%" && e.value < 0)
    .map((e) => -e.value);
  const best = costDeltas.length ? Math.max(...costDeltas) : 0;
  const progress = Math.min(100, (best / TARGET_PCT) * 100);
  const hit = best >= TARGET_PCT;

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
      {open && entries.length > 0 && (
        <div
          className="w-[440px] max-h-[300px] overflow-y-auto rounded-2xl bg-black/85 backdrop-blur-xl
                     border border-white/12 p-3 flex flex-col gap-1.5"
          style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.6)" }}
        >
          {entries.map((e) => (
            <div
              key={e.id}
              className="group flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.04]
                         border border-white/[0.06] text-xs"
            >
              <span className="text-emerald-400 text-sm">✓</span>
              <div className="flex-1 min-w-0">
                <div className="text-slate-200 truncate">{e.label}</div>
                <div className="text-[10px] text-slate-500">
                  {e.source} · {new Date(e.ts).toLocaleTimeString()}
                </div>
              </div>
              <span
                className={`font-mono font-bold ${e.value < 0 ? "text-emerald-400" : "text-slate-300"}`}
              >
                {e.value > 0 ? "+" : ""}
                {e.value}
                {e.unit === "%" ? "%" : ` ${e.unit}`}
              </span>
              <button
                onClick={() => onRemove(e.id)}
                className="text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 px-4 py-2 rounded-full bg-black/75 backdrop-blur-xl
                   border border-white/[0.12] cursor-pointer hover:border-white/25 transition-colors"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
        title="Improvement ledger — engine-verified savings adopted so far, vs the brief's official −5% cost-to-serve target"
      >
        <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-slate-500">
          改善 Kaizen Ledger
        </span>
        <span className="text-[11px] font-semibold text-slate-300">
          {entries.length} adopted
        </span>
        <span className="w-32 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <span
            className="block h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress}%`,
              background: hit ? "#34d399" : "linear-gradient(90deg,#E8112D,#f59e0b)",
              boxShadow: hit ? "0 0 10px rgba(52,211,153,0.7)" : "0 0 10px rgba(232,17,45,0.5)",
            }}
          />
        </span>
        <span className={`text-[11px] font-mono font-bold ${hit ? "text-emerald-400" : "text-slate-300"}`}>
          {best.toFixed(1)}% / {TARGET_PCT}%
        </span>
        {hit && <span className="text-[10px] text-emerald-400 font-bold">TARGET HIT</span>}
      </button>
    </div>
  );
}
