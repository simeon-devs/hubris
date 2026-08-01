"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getNetwork } from "@/lib/api";
import type { NetworkMapResponse } from "@/lib/types";

const NetworkMap = dynamic(() => import("@/components/NetworkMap"), { ssr: false });

export default function Home() {
  const [network, setNetwork] = useState<NetworkMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getNetwork()
      .then(setNetwork)
      .catch((err: Error) => setError(err.message));
  }, []);

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
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626" }}>
              Failed to load network data: {error}
            </div>
          )}
          {!error && !network && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
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
            gap: 16,
          }}
        >
          <div style={{ color: "#9ca3af", fontSize: 13 }}>
            KPI cards, scenario controls, and agent chat land here in T-17/T-18.
          </div>
        </aside>
      </main>
    </div>
  );
}
