"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import KpiCards from "@/components/KpiCards";
import ScenarioDiff from "@/components/ScenarioDiff";
import ScenarioPanel from "@/components/ScenarioPanel";
import { getKpis, getNetwork } from "@/lib/api";
import type { KpisResponse, NetworkMapResponse, SimulateResponse } from "@/lib/types";

const NetworkMap = dynamic(() => import("@/components/NetworkMap"), { ssr: false });

export default function Home() {
  const [network, setNetwork] = useState<NetworkMapResponse | null>(null);
  const [kpis, setKpis] = useState<KpisResponse | null>(null);
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([getNetwork(), getKpis()])
      .then(([net, k]) => {
        setNetwork(net);
        setKpis(k);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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
              Failed to load network data: {error}
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
            width: 380,
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

          <div style={{ color: "#9ca3af", fontSize: 13 }}>Agent chat lands here in T-18.</div>
        </aside>
      </main>
    </div>
  );
}
