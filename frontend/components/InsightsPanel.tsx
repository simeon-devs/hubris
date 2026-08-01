"use client";

import { useEffect, useState } from "react";
import { getOpportunities } from "@/lib/api";
import type { OpportunitiesResponse } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  overlapping_coverage: "Overlapping coverage",
  far_hub_service: "Far-hub service",
  idle_next_to_overload: "Idle next to overload",
};

export default function InsightsPanel() {
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getOpportunities()
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ fontSize: 13, color: "#9ca3af" }}>Scanning…</div>;
  if (error) return <div style={{ fontSize: 12, color: "#dc2626" }}>{error}</div>;
  if (!data) return null;

  const groups: { key: keyof OpportunitiesResponse; findings: { why: string }[] }[] = [
    { key: "overlapping_coverage", findings: data.overlapping_coverage },
    { key: "far_hub_service", findings: data.far_hub_service },
    { key: "idle_next_to_overload", findings: data.idle_next_to_overload },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        {data.total_opportunities} opportunit{data.total_opportunities === 1 ? "y" : "ies"} found across{" "}
        {data.inefficiency_types_found} inefficiency type{data.inefficiency_types_found === 1 ? "" : "s"}
      </div>

      {groups.map(({ key, findings }) => (
        <div key={key}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>
            {TYPE_LABELS[key]} ({findings.length})
          </h3>
          {findings.length === 0 ? (
            <div style={{ fontSize: 12, color: "#9ca3af" }}>None found</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {findings.map((f, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    padding: 8,
                    fontSize: 12,
                    color: "#374151",
                  }}
                >
                  {f.why}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
