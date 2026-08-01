"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { simulate } from "@/lib/api";
import type { FleetTypeInfo, HubMapInfo, SimulateResponse } from "@/lib/types";

type ScenarioTab = "close_hub" | "demand_scale" | "change_fleet_mix";

interface ScenarioPanelProps {
  hubs: HubMapInfo[];
  fleetTypes: FleetTypeInfo[];
  onResult: (result: SimulateResponse | null) => void;
}

export default function ScenarioPanel({ hubs, fleetTypes, onResult }: ScenarioPanelProps) {
  const openHubs = hubs.filter((h) => h.status === "open");

  const [tab, setTab] = useState<ScenarioTab>("close_hub");
  const [hubId, setHubId] = useState(openHubs[0]?.id ?? "");
  const [demandFactorPct, setDemandFactorPct] = useState(0);
  const [fleetId, setFleetId] = useState(fleetTypes[0]?.id ?? "");
  const [fleetCount, setFleetCount] = useState(fleetTypes[0]?.count_available ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSimulate() {
    setLoading(true);
    setError(null);
    try {
      let scenario_name: string;
      let params: Record<string, unknown>;
      if (tab === "close_hub") {
        scenario_name = "close_hub";
        params = { hub_id: hubId };
      } else if (tab === "demand_scale") {
        scenario_name = "demand_scale";
        params = { factor: 1 + demandFactorPct / 100 };
      } else {
        scenario_name = "change_fleet_mix";
        params = { fleet_type_id: fleetId, count_available: fleetCount };
      }
      const result = await simulate({ scenario_name, params });
      onResult(result);
    } catch (err) {
      setError((err as Error).message);
      onResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <TabButton active={tab === "close_hub"} onClick={() => setTab("close_hub")}>
          Close hub
        </TabButton>
        <TabButton active={tab === "demand_scale"} onClick={() => setTab("demand_scale")}>
          Demand growth
        </TabButton>
        <TabButton active={tab === "change_fleet_mix"} onClick={() => setTab("change_fleet_mix")}>
          Fleet mix
        </TabButton>
      </div>

      {tab === "close_hub" && (
        <label style={{ fontSize: 13 }}>
          Hub to close
          <select
            value={hubId}
            onChange={(e) => setHubId(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4, padding: 6 }}
          >
            {openHubs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.id})
              </option>
            ))}
          </select>
        </label>
      )}

      {tab === "demand_scale" && (
        <label style={{ fontSize: 13 }}>
          Demand growth: {demandFactorPct > 0 ? "+" : ""}
          {demandFactorPct}%
          <input
            type="range"
            min={-30}
            max={100}
            value={demandFactorPct}
            onChange={(e) => setDemandFactorPct(Number(e.target.value))}
            style={{ display: "block", width: "100%" }}
          />
        </label>
      )}

      {tab === "change_fleet_mix" && (
        <>
          <label style={{ fontSize: 13 }}>
            Fleet type
            <select
              value={fleetId}
              onChange={(e) => {
                setFleetId(e.target.value);
                const fleet = fleetTypes.find((f) => f.id === e.target.value);
                if (fleet) setFleetCount(fleet.count_available);
              }}
              style={{ display: "block", width: "100%", marginTop: 4, padding: 6 }}
            >
              {fleetTypes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Vehicles available: {fleetCount}
            <input
              type="range"
              min={0}
              max={100}
              value={fleetCount}
              onChange={(e) => setFleetCount(Number(e.target.value))}
              style={{ display: "block", width: "100%" }}
            />
          </label>
        </>
      )}

      <button
        onClick={runSimulate}
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
        {loading ? "Simulating…" : "Simulate"}
      </button>

      {error && <div style={{ color: "#dc2626", fontSize: 12 }}>{error}</div>}
    </div>
  );
}

function TabButton({
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
        padding: "6px 10px",
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
