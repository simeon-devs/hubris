"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getBrief } from "@/lib/api";
import type { DecisionBrief as DecisionBriefData } from "@/lib/types";

function toMarkdown(brief: DecisionBriefData): string {
  const lines: string[] = [];
  lines.push("# Hubris Decision Brief");
  lines.push(`_Generated ${brief.generated_at}_`);
  lines.push("");
  lines.push("## Summary");
  lines.push(brief.summary);
  lines.push("");
  lines.push("## Current state");
  lines.push(`- Cost-to-serve: ${brief.current_state.cost_to_serve} AED/parcel`);
  lines.push(`- Utilization: ${brief.current_state.utilization_pct}%`);
  lines.push(`- Coverage: ${brief.current_state.coverage_pct}%`);
  lines.push(`- Spare capacity: ${brief.current_state.spare_capacity} parcels`);
  lines.push(
    `- Network: ${brief.current_state.network_summary.hub_count} hubs (${brief.current_state.network_summary.open_hub_count} open), ${brief.current_state.network_summary.zone_count} zones`
  );
  lines.push("");
  lines.push("## Proposed change");
  lines.push(
    brief.proposed_change.changes.length === 0
      ? "No hub changes recommended — current configuration is optimal."
      : brief.proposed_change.changes.map((c) => `- ${c.action.replace("_", " ")} ${c.hub_id}`).join("\n")
  );
  lines.push(`- Objective value: ${brief.proposed_change.objective_value} AED`);
  lines.push("");
  lines.push("## Cost / risk");
  lines.push(
    `- Cost-to-serve: ${brief.cost_risk.cost_to_serve_before} -> ${brief.cost_risk.cost_to_serve_after} AED/parcel`
  );
  lines.push(`- Savings: ${brief.cost_risk.cost_to_serve_savings_per_parcel} AED/parcel`);
  lines.push("");
  lines.push("## Sensitivity (Monte Carlo)");
  lines.push(
    `- +/-${brief.sensitivity.demand_variation_pct}% demand, ${brief.sensitivity.trials} trials: ${brief.sensitivity.cost_to_serve_p10} - ${brief.sensitivity.cost_to_serve_p90} AED/parcel, feasible in ${brief.sensitivity.feasible_pct}% of trials`
  );
  lines.push(`- Holds under variation: ${brief.sensitivity.holds_under_variation ? "yes" : "NO"}`);
  lines.push("");
  lines.push("## What it unblocks");
  lines.push(brief.what_it_unblocks ? brief.what_it_unblocks.why ?? "" : "No binding bottleneck currently.");
  return lines.join("\n");
}

export default function DecisionBrief({ scenarioId }: { scenarioId: string | null }) {
  const [brief, setBrief]     = useState<DecisionBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getBrief(scenarioId)
      .then(setBrief)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [scenarioId]);

  useEffect(() => { load(); }, [load]);

  function exportBrief() {
    if (!brief) return;
    const blob = new Blob([toMarkdown(brief)], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "hubris-decision-brief.md"; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="text-xs text-slate-400 animate-pulse">Generating brief…</p>;
  if (error) return (
    <div className="text-xs px-3.5 py-2.5 rounded-xl text-rose-400 bg-rose-500/10 border border-rose-500/20">
      {error}
    </div>
  );
  if (!brief) return null;

  const robust = brief.sensitivity.holds_under_variation;

  return (
    <div className="flex flex-col gap-5">

      {/* Actions header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-500">
          {new Date(brief.generated_at).toLocaleString()}
        </span>
        <div className="flex gap-2">
          <GhostBtn onClick={load}>↻ Refresh</GhostBtn>
          <CyanBtn onClick={exportBrief}>↓ Export .md</CyanBtn>
        </div>
      </div>

      {/* Summary */}
      <BriefBlock title="Summary">
        <p className="text-sm leading-relaxed text-slate-100">{brief.summary}</p>
      </BriefBlock>

      {/* Current state */}
      <BriefBlock title="Current state">
        <DataRow label="Cost-to-serve" value={`${brief.current_state.cost_to_serve} AED/parcel`} mono />
        <DataRow label="Utilization"   value={`${brief.current_state.utilization_pct}%`} mono />
        <DataRow label="Coverage"      value={`${brief.current_state.coverage_pct}%`} mono />
        <DataRow label="Spare capacity" value={`${brief.current_state.spare_capacity} parcels`} mono />
      </BriefBlock>

      {/* Proposed change */}
      <BriefBlock title="Proposed change">
        {brief.proposed_change.changes.length === 0 ? (
          <p className="text-sm text-emerald-400">✓ Already optimal — no changes recommended.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {brief.proposed_change.changes.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-100">
                <span className="text-amber-400">◆</span>
                {c.action.replace("_", " ")} {c.hub_id}
              </div>
            ))}
          </div>
        )}
      </BriefBlock>

      {/* Cost / risk */}
      <BriefBlock title="Cost / risk">
        <DataRow label="Before → After"
          value={`${brief.cost_risk.cost_to_serve_before} → ${brief.cost_risk.cost_to_serve_after} AED/parcel`}
          mono />
        <DataRow label="Savings" value={`${brief.cost_risk.cost_to_serve_savings_per_parcel} AED/parcel`}
          mono accent="emerald" />
      </BriefBlock>

      {/* Sensitivity */}
      <BriefBlock title={`Sensitivity · ±${brief.sensitivity.demand_variation_pct}% demand`}>
        <div className="flex items-center gap-2 mb-2.5">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full tracking-widest
            ${robust
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-rose-500/10    text-rose-400    border border-rose-500/20"
            }`}>
            {robust ? "ROBUST" : "AT RISK"}
          </span>
        </div>
        <p className="text-xs font-mono text-slate-400">
          {brief.sensitivity.cost_to_serve_p10} – {brief.sensitivity.cost_to_serve_p90}
          <span className="font-sans"> AED/parcel · </span>
          {brief.sensitivity.feasible_pct}%<span className="font-sans"> feasible of </span>
          {brief.sensitivity.trials}<span className="font-sans"> trials</span>
        </p>
      </BriefBlock>

      {/* What it unblocks */}
      <BriefBlock title="What it unblocks">
        {brief.what_it_unblocks ? (
          <p className="text-sm leading-relaxed text-slate-100">{brief.what_it_unblocks.why}</p>
        ) : (
          <p className="text-sm text-slate-400">No binding bottleneck currently.</p>
        )}
      </BriefBlock>
    </div>
  );
}

function BriefBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h4 className="text-[10px] font-semibold uppercase tracking-widest text-cyan-200 pb-2
                     border-b border-white/[0.07]">
        {title}
      </h4>
      {children}
    </div>
  );
}

function DataRow({ label, value, mono, accent }: {
  label: string; value: string; mono?: boolean; accent?: "emerald";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-amber-100/70 flex-shrink-0">{label}</span>
      <span className={`${mono ? "font-mono" : ""} text-xs
        ${accent === "emerald" ? "text-emerald-400" : "text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}

function GhostBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className="text-[10px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors duration-150
                 bg-white/5 border border-white/10 text-slate-400 hover:text-slate-100 hover:border-white/20">
      {children}
    </button>
  );
}

function CyanBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className="text-[10px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors duration-150
                 bg-cyan-500/12 border border-cyan-500/25 text-cyan-300 hover:text-white">
      {children}
    </button>
  );
}
