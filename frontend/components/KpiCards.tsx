"use client";

import type { KpisResponse } from "@/lib/types";

type MetricKey = "cost_to_serve" | "utilization" | "coverage" | "spare_capacity";

// "good direction" for colouring a delta: null means we don't editorialise
// (e.g. utilization/spare capacity can go either way depending on intent).
const CARD_CONFIG: { key: MetricKey; label: string; goodDirection: "down" | "up" | null }[] = [
  { key: "cost_to_serve", label: "Cost-to-serve", goodDirection: "down" },
  { key: "utilization", label: "Avg utilization", goodDirection: null },
  { key: "coverage", label: "Coverage", goodDirection: "up" },
  { key: "spare_capacity", label: "Spare capacity", goodDirection: null },
];

const NEGLIGIBLE_PCT = 0.05; // solver re-computation noise, not a real change

function deltaColor(pct: number | undefined, goodDirection: "down" | "up" | null): string {
  if (pct === undefined || goodDirection === null || Math.abs(pct) < NEGLIGIBLE_PCT) return "#6b7280";
  const improving = goodDirection === "down" ? pct < 0 : pct > 0;
  return improving ? "#16a34a" : "#dc2626";
}

function formatPct(pct: number): string {
  if (Math.abs(pct) < NEGLIGIBLE_PCT) return "0.0";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}`;
}

interface KpiCardsProps {
  kpis: KpisResponse;
  deltaPct?: Record<string, number> | null;
}

export default function KpiCards({ kpis, deltaPct }: KpiCardsProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {CARD_CONFIG.map(({ key, label, goodDirection }) => {
        const metric = kpis[key];
        const delta = deltaPct?.[key];
        const value = typeof metric.value === "number" ? metric.value : null;
        return (
          <div key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {value !== null ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
              <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>{metric.unit}</span>
            </div>
            {delta !== undefined && (
              <div style={{ fontSize: 12, color: deltaColor(delta, goodDirection), marginTop: 4 }}>
                {formatPct(delta)}% vs baseline
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
