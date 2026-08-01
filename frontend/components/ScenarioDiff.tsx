"use client";

import type { SimulateResponse } from "@/lib/types";

type MetricKey = "cost_to_serve" | "utilization" | "coverage" | "spare_capacity";

const METRICS: { key: MetricKey; label: string; goodDirection: "down" | "up" | null }[] = [
  { key: "cost_to_serve", label: "Cost-to-serve", goodDirection: "down" },
  { key: "utilization", label: "Avg utilization", goodDirection: null },
  { key: "coverage", label: "Coverage", goodDirection: "up" },
  { key: "spare_capacity", label: "Spare capacity", goodDirection: null },
];

const NEGLIGIBLE_PCT = 0.05; // solver re-computation noise, not a real change

function deltaColor(pct: number, goodDirection: "down" | "up" | null): string {
  if (goodDirection === null || Math.abs(pct) < NEGLIGIBLE_PCT) return "#6b7280";
  const improving = goodDirection === "down" ? pct < 0 : pct > 0;
  return improving ? "#16a34a" : "#dc2626";
}

function formatPct(pct: number): string {
  if (Math.abs(pct) < NEGLIGIBLE_PCT) return "0.0";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}`;
}

export default function ScenarioDiff({ result }: { result: SimulateResponse }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>
        {result.scenario_name} — before / after
        {!result.scenario_flow_feasible && (
          <span style={{ color: "#dc2626", fontWeight: 400 }}>
            {" "}
            (infeasible: demand exceeds capacity)
          </span>
        )}
      </div>
      {METRICS.map(({ key, label, goodDirection }) => {
        const before = result.baseline_kpis[key];
        const after = result.scenario_kpis[key];
        const pct = result.delta_pct[key];
        if (typeof before.value !== "number" || typeof after.value !== "number" || pct === undefined) {
          return null;
        }
        return (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "#6b7280" }}>{label}</span>
            <span>
              {before.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} {"->"}{" "}
              {after.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
              <span style={{ color: deltaColor(pct, goodDirection), fontWeight: 600 }}>
                ({formatPct(pct)}%)
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
