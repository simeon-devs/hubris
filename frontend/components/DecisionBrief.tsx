"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
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

export default function DecisionBrief() {
  const [brief, setBrief] = useState<DecisionBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getBrief()
      .then(setBrief)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function exportBrief() {
    if (!brief) return;
    const blob = new Blob([toMarkdown(brief)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hubris-decision-brief.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div style={{ fontSize: 13, color: "#9ca3af" }}>Generating brief…</div>;
  if (error) return <div style={{ fontSize: 12, color: "#dc2626" }}>{error}</div>;
  if (!brief) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          Generated {new Date(brief.generated_at).toLocaleString()}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={load} style={buttonStyle(false)}>
            Refresh
          </button>
          <button onClick={exportBrief} style={buttonStyle(true)}>
            Export .md
          </button>
        </div>
      </div>

      <Section title="Summary">
        <p style={{ margin: 0, lineHeight: 1.5, color: "#374151" }}>{brief.summary}</p>
      </Section>

      <Section title="Current state">
        <Row label="Cost-to-serve" value={`${brief.current_state.cost_to_serve} AED/parcel`} />
        <Row label="Utilization" value={`${brief.current_state.utilization_pct}%`} />
        <Row label="Coverage" value={`${brief.current_state.coverage_pct}%`} />
        <Row label="Spare capacity" value={`${brief.current_state.spare_capacity} parcels`} />
      </Section>

      <Section title="Proposed change">
        {brief.proposed_change.changes.length === 0 ? (
          <div style={{ color: "#6b7280" }}>Already optimal — no changes recommended.</div>
        ) : (
          brief.proposed_change.changes.map((c, i) => (
            <div key={i} style={{ color: "#374151" }}>
              {c.action.replace("_", " ")} {c.hub_id}
            </div>
          ))
        )}
      </Section>

      <Section title="Cost / risk">
        <Row
          label="Cost-to-serve"
          value={`${brief.cost_risk.cost_to_serve_before} → ${brief.cost_risk.cost_to_serve_after} AED/parcel`}
        />
        <Row label="Savings" value={`${brief.cost_risk.cost_to_serve_savings_per_parcel} AED/parcel`} />
      </Section>

      <Section title="Sensitivity">
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 999,
            background: brief.sensitivity.holds_under_variation ? "#dcfce7" : "#fee2e2",
            color: brief.sensitivity.holds_under_variation ? "#166534" : "#991b1b",
          }}
        >
          {brief.sensitivity.holds_under_variation ? "ROBUST" : "AT RISK"} UNDER ±
          {brief.sensitivity.demand_variation_pct}% DEMAND
        </span>
        <div style={{ color: "#6b7280", marginTop: 4 }}>
          {brief.sensitivity.cost_to_serve_p10} – {brief.sensitivity.cost_to_serve_p90} AED/parcel across{" "}
          {brief.sensitivity.trials} trials, feasible in {brief.sensitivity.feasible_pct}%
        </div>
      </Section>

      <Section title="What it unblocks">
        {brief.what_it_unblocks ? (
          <p style={{ margin: 0, color: "#374151" }}>{brief.what_it_unblocks.why}</p>
        ) : (
          <div style={{ color: "#6b7280" }}>No binding bottleneck currently.</div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", color: "#374151" }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function buttonStyle(primary: boolean): CSSProperties {
  return {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 6,
    border: primary ? "1px solid #111827" : "1px solid #e5e7eb",
    background: primary ? "#111827" : "white",
    color: primary ? "white" : "#111827",
    cursor: "pointer",
  };
}
