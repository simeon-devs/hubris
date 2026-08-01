"use client";

import { useState } from "react";
import { optimize } from "@/lib/api";
import type { OptimizeResponse } from "@/lib/types";

export default function OptimizerPanel() {
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runOptimize() {
    setLoading(true);
    setError(null);
    try {
      const res = await optimize({});
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button
        onClick={runOptimize}
        disabled={loading}
        style={{
          padding: "8px 12px",
          borderRadius: 6,
          background: "#111827",
          color: "white",
          border: "none",
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Optimising…" : "Run optimizer"}
      </button>

      {error && <div style={{ color: "#dc2626", fontSize: 12 }}>{error}</div>}

      {result && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 13,
          }}
        >
          <div>
            <span style={{ color: "#6b7280" }}>Recommended changes: </span>
            {result.changes.length === 0
              ? "none (current network already optimal)"
              : result.changes.map((c) => `${c.action} ${c.hub_id}`).join(", ")}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#6b7280" }}>Cost-to-serve</span>
            <span>
              {result.cost_to_serve_before.toFixed(2)} {"->"} {result.cost_to_serve_after.toFixed(2)}{" "}
              AED/parcel
            </span>
          </div>

          <RobustnessBadge band={result.robustness} />
        </div>
      )}
    </div>
  );
}

function RobustnessBadge({ band }: { band: OptimizeResponse["robustness"] }) {
  return (
    <div
      style={{
        borderTop: "1px solid #f3f4f6",
        paddingTop: 8,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 999,
            background: band.holds_under_variation ? "#dcfce7" : "#fee2e2",
            color: band.holds_under_variation ? "#166534" : "#991b1b",
          }}
        >
          {band.holds_under_variation ? "ROBUST" : "AT RISK"} UNDER ±{band.demand_variation_pct}% DEMAND
        </span>
      </div>
      <span style={{ color: "#6b7280" }}>
        Cost-to-serve range ({band.trials} Monte Carlo trials): {band.cost_to_serve_p10.toFixed(2)} –{" "}
        {band.cost_to_serve_p90.toFixed(2)} AED/parcel (median {band.cost_to_serve_p50.toFixed(2)}),
        feasible in {band.feasible_pct}% of trials
      </span>
    </div>
  );
}
