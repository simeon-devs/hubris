"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import AgentBuilderPanel from "@/components/AgentBuilderPanel";
import AgentChat from "@/components/AgentChat";
import KpiCards from "@/components/KpiCards";
import OptimizerPanel from "@/components/OptimizerPanel";
import ScenarioDiff from "@/components/ScenarioDiff";
import ScenarioPanel from "@/components/ScenarioPanel";
import { getKpis, getNetwork, listAgents, refreshDistances } from "@/lib/api";
import type {
  AgentSpec,
  KpisResponse,
  NetworkMapResponse,
  RefreshDistancesResponse,
  SimulateResponse,
} from "@/lib/types";

const NetworkMap = dynamic(() => import("@/components/NetworkMap"), { ssr: false });

type SidebarTab = "scenario" | "agents";

export default function Home() {
  const [network, setNetwork] = useState<NetworkMapResponse | null>(null);
  const [kpis, setKpis] = useState<KpisResponse | null>(null);
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SidebarTab>("scenario");
  const [refreshingDistances, setRefreshingDistances] = useState(false);
  const [refreshResult, setRefreshResult] = useState<RefreshDistancesResponse | null>(null);

  const reloadNetwork = useCallback(() => {
    Promise.all([getNetwork(), getKpis()])
      .then(([net, k]) => {
        setNetwork(net);
        setKpis(k);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const reloadAgents = useCallback(() => {
    listAgents()
      .then(setAgents)
      .catch((err: Error) => setError(err.message));
  }, []);

  const handleRefreshDistances = useCallback(() => {
    setRefreshingDistances(true);
    refreshDistances()
      .then((result) => {
        setRefreshResult(result);
        reloadNetwork();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setRefreshingDistances(false));
  }, [reloadNetwork]);

  useEffect(() => {
    reloadNetwork();
    reloadAgents();
  }, [reloadNetwork, reloadAgents]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Hubris — Network Digital Twin</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {network && <DistanceModeBadge mode={network.distance_mode} />}
          <button
            onClick={handleRefreshDistances}
            disabled={refreshingDistances}
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: refreshingDistances ? "default" : "pointer",
              opacity: refreshingDistances ? 0.6 : 1,
            }}
            title="Rebuild the od_matrix from real OSRM drive distances (falls back to haversine automatically if unreachable)"
          >
            {refreshingDistances ? "Refreshing…" : "Refresh real distances"}
          </button>
          {refreshResult && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              cost-to-serve {refreshResult.cost_to_serve_before} → {refreshResult.cost_to_serve_after} AED/parcel
            </span>
          )}
          <span style={{ fontSize: 13, color: "#6b7280" }}>EMX Predictive Network Optimisation</span>
        </div>
      </header>

      <main style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <section style={{ flex: 1, position: "relative" }}>
          {error && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#dc2626",
              }}
            >
              Failed to load: {error}
            </div>
          )}
          {!error && !network && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6b7280",
              }}
            >
              Loading network…
            </div>
          )}
          {network && <NetworkMap hubs={network.hubs} zones={network.zones} flows={network.flows} />}
        </section>

        <aside
          style={{
            width: 400,
            borderLeft: "1px solid #e5e7eb",
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>
              NETWORK KPIS
            </h2>
            {kpis ? (
              <KpiCards kpis={kpis} deltaPct={simResult?.delta_pct} />
            ) : (
              <div style={{ fontSize: 13, color: "#9ca3af" }}>Loading…</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, borderBottom: "1px solid #e5e7eb", paddingBottom: 10 }}>
            <SidebarTabButton active={tab === "scenario"} onClick={() => setTab("scenario")}>
              Scenario
            </SidebarTabButton>
            <SidebarTabButton active={tab === "agents"} onClick={() => setTab("agents")}>
              Agents
            </SidebarTabButton>
          </div>

          {tab === "scenario" && (
            <>
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>
                  WHAT-IF SCENARIO
                </h2>
                {network ? (
                  <ScenarioPanel
                    hubs={network.hubs}
                    fleetTypes={network.fleet_types}
                    onResult={setSimResult}
                  />
                ) : (
                  <div style={{ fontSize: 13, color: "#9ca3af" }}>Loading…</div>
                )}
              </div>

              {simResult && (
                <div>
                  <h2 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>
                    BEFORE / AFTER
                  </h2>
                  <ScenarioDiff result={simResult} />
                </div>
              )}

              <div>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>
                  NETWORK OPTIMIZER
                </h2>
                <OptimizerPanel />
              </div>
            </>
          )}

          {tab === "agents" && (
            <>
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>
                  AGENT CHAT
                </h2>
                <AgentChat agents={agents} />
              </div>

              <div>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>
                  AGENT BUILDER
                </h2>
                <AgentBuilderPanel agents={agents} onChange={reloadAgents} />
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

function DistanceModeBadge({ mode }: { mode: NetworkMapResponse["distance_mode"] }) {
  const isReal = mode === "osrm";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 999,
        background: isReal ? "#dcfce7" : "#fef3c7",
        color: isReal ? "#166534" : "#92400e",
      }}
      title={
        isReal
          ? "od_matrix distances/times are real OSRM road distances"
          : "od_matrix distances/times are haversine x 1.3 estimates, not real road distances"
      }
    >
      {isReal ? "REAL ROAD DISTANCES" : "HAVERSINE FALLBACK"}
    </span>
  );
}

function SidebarTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12,
        padding: "6px 12px",
        borderRadius: 6,
        border: active ? "1px solid #111827" : "1px solid #e5e7eb",
        background: active ? "#111827" : "white",
        color: active ? "white" : "#111827",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
