"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { simulate } from "@/lib/api";
import type { FleetTypeInfo, HubMapInfo, SimulateResponse } from "@/lib/types";

type ScenarioTab = "close_hub" | "demand_scale" | "change_fleet_mix";

interface ScenarioPanelProps {
  hubs:       HubMapInfo[];
  fleetTypes: FleetTypeInfo[];
  onResult:   (result: SimulateResponse | null) => void;
}

export default function ScenarioPanel({ hubs, fleetTypes, onResult }: ScenarioPanelProps) {
  const openHubs = hubs.filter((h) => h.status === "open");

  const [tab, setTab]               = useState<ScenarioTab>("close_hub");
  const [hubId, setHubId]           = useState(openHubs[0]?.id ?? "");
  const [demandFactorPct, setDemandFactorPct] = useState(0);
  const [fleetId, setFleetId]       = useState(fleetTypes[0]?.id ?? "");
  const [fleetCount, setFleetCount] = useState(fleetTypes[0]?.count_available ?? 0);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

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

  const SCENARIO_TABS: { id: ScenarioTab; label: string }[] = [
    { id: "close_hub",        label: "Close hub"     },
    { id: "demand_scale",     label: "Demand"        },
    { id: "change_fleet_mix", label: "Fleet mix"     },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Segment control */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
        {SCENARIO_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all duration-150 cursor-pointer
              ${tab === id
                ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300"
                : "border border-transparent text-slate-400 hover:text-slate-200"
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab-specific inputs */}
      {tab === "close_hub" && (
        <Field label="Hub to close">
          <Select value={hubId} onChange={(e) => setHubId(e.target.value)}>
            {openHubs.map((h) => (
              <option key={h.id} value={h.id}>{h.name} ({h.id})</option>
            ))}
          </Select>
        </Field>
      )}

      {tab === "demand_scale" && (
        <Field label="Demand growth">
          <input
            type="range"
            min={-30}
            max={100}
            value={demandFactorPct}
            onChange={(e) => setDemandFactorPct(Number(e.target.value))}
          />
          <div className="flex justify-between items-center mt-1">
            <span className="text-[10px] text-slate-500">−30%</span>
            <span className={`text-sm font-mono font-bold
              ${demandFactorPct > 0 ? "text-amber-400" : demandFactorPct < 0 ? "text-rose-400" : "text-slate-400"}`}>
              {demandFactorPct > 0 ? "+" : ""}{demandFactorPct}%
            </span>
            <span className="text-[10px] text-slate-500">+100%</span>
          </div>
        </Field>
      )}

      {tab === "change_fleet_mix" && (
        <>
          <Field label="Fleet type">
            <Select
              value={fleetId}
              onChange={(e) => {
                setFleetId(e.target.value);
                const fleet = fleetTypes.find((f) => f.id === e.target.value);
                if (fleet) setFleetCount(fleet.count_available);
              }}
            >
              {fleetTypes.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Vehicles available">
            <input
              type="range"
              min={0}
              max={100}
              value={fleetCount}
              onChange={(e) => setFleetCount(Number(e.target.value))}
            />
            <div className="flex justify-between items-center mt-1">
              <span className="text-[10px] text-slate-500">0</span>
              <span className="text-sm font-mono font-bold text-cyan-300">{fleetCount}</span>
              <span className="text-[10px] text-slate-500">100</span>
            </div>
          </Field>
        </>
      )}

      {/* Simulate CTA */}
      <button
        onClick={runSimulate}
        disabled={loading}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200
          ${loading
            ? "bg-cyan-500/5 border border-cyan-500/10 text-cyan-700 cursor-default"
            : "bg-gradient-to-r from-cyan-500/20 via-cyan-400/10 to-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:text-white cursor-pointer btn-glow-cyan"
          }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
            Simulating…
          </span>
        ) : "▷  Run Simulation"}
      </button>

      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium tracking-wide text-amber-100/70">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, children }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full text-sm px-3 py-2.5 rounded-lg bg-white/8 border border-white/12
                 text-white focus:outline-none focus:border-cyan-500/40 cursor-pointer"
    >
      {children}
    </select>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs px-3.5 py-2.5 rounded-lg text-rose-400
                    bg-rose-500/10 border border-rose-500/20">
      {children}
    </div>
  );
}
