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
  overlapping_coverage:  "Overlapping coverage",
  far_hub_service:       "Far-hub service",
  idle_next_to_overload: "Idle next to overload",
};
const TYPE_ICON: Record<string, string> = {
  overlapping_coverage:  "⊙",
  far_hub_service:       "⊘",
  idle_next_to_overload: "⊛",
};

interface InsightsPanelProps {
  hubIds:     string[];
  emirates:   string[];
  scenarioId: string | null;
  /** Log an engine-reported figure into the Kaizen ledger (label, value, unit). */
  onAdopt?: (label: string, value: number, unit: string) => void;
}

/** The engine figure each finding type carries — logged verbatim on adopt. */
function findingFigure(
  key: "overlapping_coverage" | "far_hub_service" | "idle_next_to_overload",
  f: Record<string, unknown>
): { value: number; unit: string } {
  if (key === "far_hub_service") return { value: -(f.excess_cost_total as number), unit: "AED" };
  if (key === "overlapping_coverage") return { value: f.overlap_demand as number, unit: "parcels overlap" };
  return { value: f.idle_spare_capacity as number, unit: "parcels spare" };
}

export default function InsightsPanel({ hubIds, emirates, scenarioId, onAdopt }: InsightsPanelProps) {
  const [data, setData]       = useState<OpportunitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getOpportunities(scenarioId)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [scenarioId]);

  const groups = data
    ? (["overlapping_coverage", "far_hub_service", "idle_next_to_overload"] as const).map((key) => ({
        key,
        findings: data[key],
      }))
    : [];

  return (
    <div className="flex flex-col gap-5">
      {loading && (
        <p className="text-xs text-slate-400 animate-pulse">Scanning for inefficiencies…</p>
      )}
      {error && (
        <div className="text-xs px-3.5 py-2.5 rounded-xl text-rose-400
                        bg-rose-500/10 border border-rose-500/20">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Summary */}
          <div className="inline-flex items-center gap-2.5 px-3 py-2 rounded-lg
                          bg-cyan-500/8 border border-cyan-500/15 self-start">
            <span className="text-sm font-mono font-bold text-cyan-300">
              {data.total_opportunities}
            </span>
            <span className="text-xs text-slate-300">
              opportunit{data.total_opportunities === 1 ? "y" : "ies"} · {data.inefficiency_types_found} type{data.inefficiency_types_found === 1 ? "" : "s"}
            </span>
          </div>

          {/* Grouped findings */}
          <div className="flex flex-col gap-4">
            {groups.map(({ key, findings }) => (
              <div key={key}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-amber-500/60">{TYPE_ICON[key]}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-cyan-200">
                    {TYPE_LABELS[key]}
                  </span>
                  <span className="text-xs font-mono text-slate-500 ml-0.5">({findings.length})</span>
                </div>
                {findings.length === 0 ? (
                  <p className="text-xs text-slate-400 pl-4">None found</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {findings.map((f, i) => (
                      <div key={i} className="text-xs leading-relaxed px-3.5 py-2.5 rounded-xl text-slate-100
                                              bg-amber-500/[0.06] border border-amber-500/[0.14]">
                        {f.why}
                        {onAdopt && (
                          <button
                            onClick={() => {
                              const fig = findingFigure(key, f as unknown as Record<string, unknown>);
                              onAdopt(`${TYPE_LABELS[key]} actioned`, fig.value, fig.unit);
                            }}
                            className="block mt-2 text-[10px] font-bold text-emerald-300 hover:text-white
                                       cursor-pointer"
                            title="Log this engine finding in the improvement ledger"
                          >
                            ✓ Action this finding
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bottleneck */}
      <div className="flex flex-col gap-3 pt-4 border-t border-white/[0.07]">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cyan-200">
          ⬡ Bottleneck unlock
        </span>
        <BottleneckFinder scenarioId={scenarioId} />
      </div>

      {/* Break-even */}
      <div className="flex flex-col gap-4 pt-4 border-t border-white/[0.07]">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cyan-200">
          ◇ Break-even finder
        </span>
        <DemandGrowthBreakFinder hubIds={hubIds} scenarioId={scenarioId} />
        <CustomerCountBreakFinder emirates={emirates} scenarioId={scenarioId} />
      </div>
    </div>
  );
}

/* ─── Shared primitives ─── */

function AnalysisButton({ onClick, disabled, children }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-3 py-2 rounded-lg font-medium transition-all duration-150 whitespace-nowrap
        ${disabled
          ? "bg-cyan-500/5 border border-cyan-500/10 text-cyan-800 cursor-default"
          : "bg-cyan-500/12 border border-cyan-500/25 text-cyan-400 hover:text-white cursor-pointer"
        }`}
    >
      {children}
    </button>
  );
}

function AnalysisSelect({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 text-xs px-2.5 py-2 rounded-lg bg-white/8 border border-white/12
                 text-slate-100 focus:outline-none focus:border-cyan-500/40 cursor-pointer"
    >
      {children}
    </select>
  );
}

function ResultCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs leading-relaxed px-3.5 py-2.5 rounded-xl text-slate-100
                    bg-white/[0.04] border border-white/10">
      {children}
    </div>
  );
}

/* ─── Sub-panels ─── */

function BottleneckFinder({ scenarioId }: { scenarioId: string | null }) {
  const [result, setResult] = useState<BottleneckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null);
    try { setResult(await getBottleneck(scenarioId)); }
    catch (err) { setError((err as Error).message); setResult(null); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col gap-2">
      <AnalysisButton onClick={run} disabled={loading}>
        {loading ? "Scanning…" : "Find cheapest unlock"}
      </AnalysisButton>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {result && <ResultCard>{result.bottleneck_found ? result.why : result.reason}</ResultCard>}
    </div>
  );
}

function DemandGrowthBreakFinder({ hubIds, scenarioId }: { hubIds: string[]; scenarioId: string | null }) {
  const [hubId, setHubId]   = useState(hubIds[0] ?? "");
  const [result, setResult] = useState<DemandGrowthBreakResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null);
    try { setResult(await getDemandGrowthBreak(hubId, scenarioId)); }
    catch (err) { setError((err as Error).message); setResult(null); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <AnalysisSelect value={hubId} onChange={setHubId}>
          {hubIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </AnalysisSelect>
        <AnalysisButton onClick={run} disabled={loading}>
          {loading ? "…" : "At what growth?"}
        </AnalysisButton>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {result && (
        <ResultCard>
          {result.threshold_found ? (
            <>
              {result.hub_id} breaks at{" "}
              <span className="font-mono font-bold text-amber-400">+{result.growth_pct_threshold}%</span>{" "}
              demand growth (×{result.growth_factor_threshold}) —{" "}
              <span className="font-mono text-rose-400">{result.hub_utilization_pct}%</span>{" "}
              utilised at that point.
            </>
          ) : result.reason}
        </ResultCard>
      )}
    </div>
  );
}

function CustomerCountBreakFinder({ emirates, scenarioId }: { emirates: string[]; scenarioId: string | null }) {
  const [emirate, setEmirate] = useState(emirates[0] ?? "");
  const [result, setResult]   = useState<CustomerCountBreakResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null);
    try { setResult(await getCustomerCountBreak(emirate, scenarioId)); }
    catch (err) { setError((err as Error).message); setResult(null); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <AnalysisSelect value={emirate} onChange={setEmirate}>
          {emirates.map((e) => <option key={e} value={e}>{e}</option>)}
        </AnalysisSelect>
        <AnalysisButton onClick={run} disabled={loading}>
          {loading ? "…" : "SLA capacity?"}
        </AnalysisButton>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {result && (
        <ResultCard>
          {result.threshold_found ? (
            <>
              <span className="font-mono font-bold text-amber-400">{result.customer_count_threshold}</span>{" "}
              more customers in {result.emirate} before service drops to{" "}
              <span className="font-mono font-bold text-rose-400">{result.served_pct_at_threshold}%</span>.
            </>
          ) : result.reason}
        </ResultCard>
      )}
    </div>
  );
}
