"use client";

import { useEffect, useState } from "react";
import { getBottleneck, getCustomerCountBreak, getDemandGrowthBreak, getOpportunities } from "@/lib/api";
import type {
  BottleneckResponse,
  CustomerCountBreakResponse,
  DemandGrowthBreakResponse,
  OpportunitiesResponse,
} from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  overlapping_coverage: "Overlapping coverage",
  far_hub_service: "Far-hub service",
  idle_next_to_overload: "Idle next to overload",
};

interface InsightsPanelProps {
  hubIds: string[];
  emirates: string[];
  scenarioId: string | null;
}

export default function InsightsPanel({ hubIds, emirates, scenarioId }: InsightsPanelProps) {
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getOpportunities(scenarioId)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [scenarioId]);

  const groups: { key: keyof OpportunitiesResponse; findings: { why: string }[] }[] = data
    ? [
        { key: "overlapping_coverage", findings: data.overlapping_coverage },
        { key: "far_hub_service", findings: data.far_hub_service },
        { key: "idle_next_to_overload", findings: data.idle_next_to_overload },
      ]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {loading && <div style={{ fontSize: 13, color: "#9ca3af" }}>Scanning…</div>}
      {error && <div style={{ fontSize: 12, color: "#dc2626" }}>{error}</div>}

      {data && (
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
      )}

      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>
          Bottleneck unlock
        </h3>
        <BottleneckFinder scenarioId={scenarioId} />
      </div>

      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>
          Break-even finder
        </h3>
        <DemandGrowthBreakFinder hubIds={hubIds} scenarioId={scenarioId} />
        <div style={{ height: 10 }} />
        <CustomerCountBreakFinder emirates={emirates} scenarioId={scenarioId} />
      </div>
    </div>
  );
}

function BottleneckFinder({ scenarioId }: { scenarioId: string | null }) {
  const [result, setResult] = useState<BottleneckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await getBottleneck(scenarioId));
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontSize: 12 }}>
      <button
        onClick={run}
        disabled={loading}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid #111827",
          background: "#111827",
          color: "white",
          cursor: loading ? "default" : "pointer",
          marginBottom: 6,
        }}
      >
        {loading ? "…" : "Find cheapest unlock"}
      </button>
      {error && <div style={{ color: "#dc2626" }}>{error}</div>}
      {result && (
        <div style={{ color: "#374151" }}>
          {result.bottleneck_found ? result.why : result.reason}
        </div>
      )}
    </div>
  );
}

function DemandGrowthBreakFinder({
  hubIds,
  scenarioId,
}: {
  hubIds: string[];
  scenarioId: string | null;
}) {
  const [hubId, setHubId] = useState(hubIds[0] ?? "");
  const [result, setResult] = useState<DemandGrowthBreakResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await getDemandGrowthBreak(hubId, scenarioId));
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <select
          value={hubId}
          onChange={(e) => setHubId(e.target.value)}
          style={{ flex: 1, padding: 4 }}
        >
          {hubIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={loading}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid #111827",
            background: "#111827",
            color: "white",
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "…" : "At what growth does it break?"}
        </button>
      </div>
      {error && <div style={{ color: "#dc2626" }}>{error}</div>}
      {result && (
        <div style={{ color: "#374151" }}>
          {result.threshold_found ? (
            <>
              {result.hub_id} breaks at <strong>+{result.growth_pct_threshold}%</strong> demand growth
              (factor {result.growth_factor_threshold}x) — {result.hub_utilization_pct}% utilized at that
              point.
            </>
          ) : (
            result.reason
          )}
        </div>
      )}
    </div>
  );
}

function CustomerCountBreakFinder({
  emirates,
  scenarioId,
}: {
  emirates: string[];
  scenarioId: string | null;
}) {
  const [emirate, setEmirate] = useState(emirates[0] ?? "");
  const [result, setResult] = useState<CustomerCountBreakResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await getCustomerCountBreak(emirate, scenarioId));
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <select
          value={emirate}
          onChange={(e) => setEmirate(e.target.value)}
          style={{ flex: 1, padding: 4 }}
        >
          {emirates.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={loading}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid #111827",
            background: "#111827",
            color: "white",
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "…" : "How many customers before SLA fails?"}
        </button>
      </div>
      {error && <div style={{ color: "#dc2626" }}>{error}</div>}
      {result && (
        <div style={{ color: "#374151" }}>
          {result.threshold_found ? (
            <>
              {result.customer_count_threshold} more customers in {result.emirate} before service level
              drops to <strong>{result.served_pct_at_threshold}%</strong>.
            </>
          ) : (
            result.reason
          )}
        </div>
      )}
    </div>
  );
}
