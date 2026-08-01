"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import AgentBuilderPanel from "@/components/AgentBuilderPanel";
import AgentChat from "@/components/AgentChat";
import KpiCards from "@/components/KpiCards";
import ScenarioDiff from "@/components/ScenarioDiff";
import ScenarioPanel from "@/components/ScenarioPanel";
import { getKpis, getNetwork, listAgents } from "@/lib/api";
import type { AgentSpec, KpisResponse, NetworkMapResponse, SimulateResponse } from "@/lib/types";

const NetworkMap = dynamic(() => import("@/components/NetworkMap"), { ssr: false });

type SidebarTab = "scenario" | "agents";

export default function Home() {
  const [network, setNetwork] = useState<NetworkMapResponse | null>(null);
  const [kpis, setKpis] = useState<KpisResponse | null>(null);
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SidebarTab>("scenario");

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
        <span style={{ fontSize: 13, color: "#6b7280" }}>EMX Predictive Network Optimisation</span>
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
