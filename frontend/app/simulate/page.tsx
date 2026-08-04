"use client";

/**
 * SIMULATE — the what-if workshop. Map stays the centerpiece; six equal tool
 * cards float left (spatial tools arm map picking, the rest take their
 * minimal inputs inline); results slide up in a collapsible bottom tray.
 *
 * Every simulation runs through POST /simulate — the engine re-solves the
 * network; the tray only displays what came back.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import BuildConfirmCard from "@/components/BuildConfirmCard";
import MapCanvas from "@/components/MapCanvas";
import MapViewControls from "@/components/MapViewControls";
import ScenarioDiff from "@/components/ScenarioDiff";
import { simulate } from "@/lib/api";
import { useAtlas } from "@/lib/atlas-context";
import {
  addCustomerDefaults,
  addHubDefaults,
  nextScenarioId,
  type BuildMode,
  type BuildPick,
  type PendingBuild,
} from "@/lib/build";

const BUILD_LABEL: Record<BuildMode, string> = {
  add_hub: "Add hub",
  add_customer: "Add customer",
  move_hub: "Move hub",
};

const ARM_HINT: Record<BuildMode, string> = {
  add_hub: "Click the map to place the new hub — Esc to cancel",
  add_customer: "Click the map to place the new customer — Esc to cancel",
  move_hub: "Click the hub to move — Esc to cancel",
};

export default function SimulatePage() {
  const {
    network,
    simResult,
    setSimResult,
    savedScenarios,
    setScenarioId,
    reloadScenarios,
    adoptEntry,
  } = useAtlas();

  // ── Build flow (spatial tools) ──
  const [buildMode, setBuildMode] = useState<BuildMode | null>(null);
  const [pendingHubId, setPendingHubId] = useState<string | null>(null);
  const [pendingBuild, setPendingBuild] = useState<PendingBuild | null>(null);
  const [buildBusy, setBuildBusy] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  // ── Non-spatial tool inputs — defaults DERIVED at render (no effects):
  // null means "user hasn't chosen yet", so the first engine row is used.
  const openHubs = useMemo(() => (network?.hubs ?? []).filter((h) => h.status === "open"), [network]);
  const fleetTypes = useMemo(() => network?.fleet_types ?? [], [network]);
  const [chosenCloseHubId, setChosenCloseHubId] = useState<string | null>(null);
  const [demandPct, setDemandPct] = useState(20);
  const [chosenFleetId, setChosenFleetId] = useState<string | null>(null);
  const [chosenFleetCount, setChosenFleetCount] = useState<number | null>(null);
  const [runBusy, setRunBusy] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const closeHubId = chosenCloseHubId ?? openHubs[0]?.id ?? "";
  const fleetId = chosenFleetId ?? fleetTypes[0]?.id ?? "";
  const selectedFleet = fleetTypes.find((f) => f.id === fleetId);
  const fleetCount = chosenFleetCount ?? selectedFleet?.count_available ?? 0;

  // ── Results tray ──
  const [trayOpen, setTrayOpen] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  const disarm = useCallback(() => {
    setBuildMode(null);
    setPendingHubId(null);
    setPendingBuild(null);
    setBuildError(null);
  }, []);

  // Esc cancels an armed tool or a pending confirm.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") disarm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disarm]);

  const picking: "location" | "hub" | null = pendingBuild
    ? null
    : buildMode === "move_hub"
      ? (pendingHubId ? "location" : "hub")
      : buildMode
        ? "location"
        : null;

  const handleMapPick = useCallback(
    (pick: BuildPick) => {
      if (!buildMode) return;
      if (pick.kind === "hub") {
        setPendingHubId(pick.hubId);
        return;
      }
      setPendingBuild({ mode: buildMode, lat: pick.lat, lon: pick.lon, hubId: pendingHubId ?? undefined });
    },
    [buildMode, pendingHubId],
  );

  const handleBuildConfirm = useCallback(
    (params: Record<string, unknown>) => {
      if (!pendingBuild) return;
      setBuildBusy(true);
      setBuildError(null);
      const saveAs = nextScenarioId(
        savedScenarios.map((s) => s.id),
        pendingBuild.mode.replace("_", "-"),
      );
      simulate({ scenario_name: pendingBuild.mode, params, save_as: saveAs })
        .then((result) => {
          setSimResult(result);
          setPinned(true); // build tools always save — already a scenario
          setTrayOpen(true);
          disarm();
          reloadScenarios();
          setScenarioId(saveAs);
        })
        .catch((err: Error) => setBuildError(err.message))
        .finally(() => setBuildBusy(false));
    },
    [pendingBuild, savedScenarios, reloadScenarios, setScenarioId, setSimResult, disarm],
  );

  const runInline = useCallback(
    (tool: "close_hub" | "demand_scale" | "change_fleet_mix") => {
      const params: Record<string, unknown> =
        tool === "close_hub"
          ? { hub_id: closeHubId }
          : tool === "demand_scale"
            ? { factor: 1 + demandPct / 100 }
            : { fleet_type_id: fleetId, count_available: fleetCount };
      setRunBusy(tool);
      setRunError(null);
      simulate({ scenario_name: tool, params })
        .then((result) => {
          setSimResult(result);
          setPinned(false); // ran unsaved — Pin offers to keep it
          setTrayOpen(true);
        })
        .catch((err: Error) => setRunError(err.message))
        .finally(() => setRunBusy(null));
    },
    [closeHubId, demandPct, fleetId, fleetCount, setSimResult],
  );

  const pinScenario = useCallback(() => {
    if (!simResult || pinned) return;
    setPinBusy(true);
    const saveAs = nextScenarioId(
      savedScenarios.map((s) => s.id),
      simResult.scenario_name.replace("_", "-"),
    );
    simulate({ scenario_name: simResult.scenario_name, params: simResult.params, save_as: saveAs })
      .then((result) => {
        setSimResult(result);
        setPinned(true);
        reloadScenarios();
        setScenarioId(saveAs);
      })
      .catch((err: Error) => setRunError(err.message))
      .finally(() => setPinBusy(false));
  }, [simResult, pinned, savedScenarios, reloadScenarios, setScenarioId, setSimResult]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <MapCanvas
        picking={picking}
        onPick={handleMapPick}
        pendingMarker={pendingBuild ? { lat: pendingBuild.lat, lon: pendingBuild.lon } : null}
      />

      {/* Armed-tool instruction banner — top center */}
      {buildMode && !pendingBuild && (
        <div className="absolute left-1/2 -translate-x-1/2 top-3 z-30">
          <div
            className="px-5 py-2 rounded-full text-xs font-medium text-red-100
                       bg-[#E8112D]/20 border border-[#E8112D]/45 backdrop-blur-xl animate-pulse"
            style={{ boxShadow: "0 0 24px rgba(232,17,45,0.30)" }}
          >
            {buildMode === "move_hub" && pendingHubId
              ? `Moving ${pendingHubId} — click its new location — Esc to cancel`
              : ARM_HINT[buildMode]}
          </div>
        </div>
      )}

      {/* ── Left floating tool panel — 2×3 grid ── */}
      <div className="absolute left-4 top-3 z-20 w-[330px]">
        <div
          className="rounded-2xl p-3 bg-black/75 backdrop-blur-lg border border-white/10 tactical-grid"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
        >
          <div className="flex items-center gap-2 px-1.5 pb-2.5">
            <span className="text-[10px] font-mono text-cyan-400">◈</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              What-if tools
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Spatial tools — arm the map */}
            <SpatialToolCard
              icon="⬢" label="Add Hub" desc="Click the map to place it"
              armed={buildMode === "add_hub"}
              onToggle={() => (buildMode === "add_hub" ? disarm() : (disarm(), setBuildMode("add_hub")))}
            />
            <SpatialToolCard
              icon="◎" label="Add Customer" desc="Click the map to add demand"
              armed={buildMode === "add_customer"}
              onToggle={() => (buildMode === "add_customer" ? disarm() : (disarm(), setBuildMode("add_customer")))}
            />
            <SpatialToolCard
              icon="⇄" label="Move Hub" desc="Pick a hub, then its new spot"
              armed={buildMode === "move_hub"}
              onToggle={() => (buildMode === "move_hub" ? disarm() : (disarm(), setBuildMode("move_hub")))}
            />

            {/* Inline tools — minimal inputs, run in place */}
            <InlineToolCard icon="⊘" label="Close Hub" desc="Retire a hub, re-solve"
              busy={runBusy === "close_hub"} onRun={() => runInline("close_hub")}>
              <select
                value={closeHubId}
                onChange={(e) => setChosenCloseHubId(e.target.value)}
                className="w-full text-[11px] px-2 py-1.5 rounded-lg bg-white/8 border border-white/12
                           text-white focus:outline-none cursor-pointer"
              >
                {openHubs.map((h) => (
                  <option key={h.id} value={h.id}>{h.id} — {h.name}</option>
                ))}
              </select>
            </InlineToolCard>

            <InlineToolCard icon="◭" label="Demand Surge" desc="Scale demand network-wide"
              busy={runBusy === "demand_scale"} onRun={() => runInline("demand_scale")}>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={-30} max={100} value={demandPct}
                  onChange={(e) => setDemandPct(Number(e.target.value))}
                  className="flex-1"
                />
                <span className={`text-[11px] font-mono font-bold w-10 text-right
                  ${demandPct > 0 ? "text-amber-400" : demandPct < 0 ? "text-rose-400" : "text-slate-400"}`}>
                  {demandPct > 0 ? "+" : ""}{demandPct}%
                </span>
              </div>
            </InlineToolCard>

            <InlineToolCard icon="▤" label="Fleet Mix" desc="Change vehicle availability"
              busy={runBusy === "change_fleet_mix"} onRun={() => runInline("change_fleet_mix")}>
              <div className="flex flex-col gap-1.5">
                <select
                  value={fleetId}
                  onChange={(e) => {
                    setChosenFleetId(e.target.value);
                    setChosenFleetCount(null); // re-derive from the newly picked fleet
                  }}
                  className="w-full text-[11px] px-2 py-1.5 rounded-lg bg-white/8 border border-white/12
                             text-white focus:outline-none cursor-pointer"
                >
                  {fleetTypes.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={0} max={100} value={fleetCount}
                    onChange={(e) => setChosenFleetCount(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-[11px] font-mono font-bold text-cyan-300 w-7 text-right">
                    {fleetCount}
                  </span>
                </div>
              </div>
            </InlineToolCard>
          </div>

          {(buildError || runError) && (
            <div className="mt-2 text-[11px] px-3 py-2 rounded-lg text-rose-400 bg-rose-500/10 border border-rose-500/20">
              {buildError ?? runError}
            </div>
          )}
        </div>
      </div>

      {/* Build confirm card */}
      {pendingBuild && network && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40">
          <BuildConfirmCard
            key={`${pendingBuild.mode}-${pendingBuild.lat}-${pendingBuild.lon}`}
            pending={pendingBuild}
            hubDefaults={pendingBuild.mode === "add_hub" ? addHubDefaults(network, pendingBuild.lat, pendingBuild.lon) : null}
            customerDefaults={pendingBuild.mode === "add_customer" ? addCustomerDefaults(network, pendingBuild.lat, pendingBuild.lon) : null}
            emirates={[...new Set(network.zones.map((z) => z.emirate))].sort()}
            movingHubName={network.hubs.find((h) => h.id === pendingBuild.hubId)?.name}
            busy={buildBusy}
            error={buildError}
            onConfirm={handleBuildConfirm}
            onCancel={() => { setPendingBuild(null); setPendingHubId(null); }}
          />
        </div>
      )}

      {/* Map furniture */}
      <div className="absolute right-4 bottom-4 z-20">
        <MapViewControls />
      </div>

      {/* ── Results tray — slides up when a simulation returns ── */}
      {simResult && (
        <div
          className="absolute left-0 right-0 bottom-0 z-30 transition-transform duration-300"
          style={{ transform: trayOpen ? "translateY(0)" : "translateY(calc(100% - 34px))" }}
        >
          {/* Tray handle */}
          <button
            onClick={() => setTrayOpen(!trayOpen)}
            className="mx-auto flex items-center gap-2 px-5 h-[34px] rounded-t-xl text-[11px]
                       font-semibold uppercase tracking-[0.18em] text-cyan-200 bg-black/85
                       border border-b-0 border-white/10 backdrop-blur-xl cursor-pointer"
          >
            {trayOpen ? "▾" : "▴"} Result — {BUILD_LABEL[simResult.scenario_name as BuildMode] ?? simResult.scenario_name}
            <FeasibilityBadge feasible={simResult.scenario_flow_feasible} />
          </button>

          <div className="h-[200px] px-6 py-4 bg-black/85 backdrop-blur-xl border-t border-white/10 overflow-y-auto">
            <div className="max-w-4xl mx-auto flex items-start gap-8">
              <div className="flex-1">
                <ScenarioDiff
                  result={simResult}
                  onAdopt={(deltaPct) =>
                    adoptEntry({
                      label: `${BUILD_LABEL[simResult.scenario_name as BuildMode] ?? simResult.scenario_name} — what-if adopted`,
                      metric: "cost_to_serve",
                      value: deltaPct,
                      unit: "%",
                      source: "what-if",
                    })
                  }
                />
              </div>
              <div className="flex-none flex flex-col gap-2 pt-1">
                {!pinned && (
                  <button
                    onClick={pinScenario}
                    disabled={pinBusy}
                    className="text-xs px-4 py-2 rounded-lg font-semibold text-amber-200
                               bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500/20
                               cursor-pointer disabled:opacity-50"
                  >
                    {pinBusy ? "Pinning…" : "⊹ Pin as scenario"}
                  </button>
                )}
                {pinned && (
                  <span className="text-[11px] text-emerald-400">✓ Saved as scenario</span>
                )}
                <button
                  onClick={() => { setSimResult(null); setPinned(false); }}
                  className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tool card primitives ─────────────────────────────────────────────── */

function SpatialToolCard({
  icon, label, desc, armed, onToggle,
}: {
  icon: string; label: string; desc: string; armed: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all
                  duration-200 cursor-pointer min-h-[86px]
        ${armed
          ? "bg-[#E8112D]/15 border-[#E8112D]/50 text-red-100"
          : "bg-white/5 border-white/10 text-slate-300 hover:border-white/25 hover:text-white"}`}
      style={armed ? { boxShadow: "0 0 18px rgba(232,17,45,0.25)" } : undefined}
    >
      <span className="text-[15px] leading-none">{icon}</span>
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[10px] text-slate-500 leading-tight">{armed ? "Armed — Esc to cancel" : desc}</span>
    </button>
  );
}

function InlineToolCard({
  icon, label, desc, busy, onRun, children,
}: {
  icon: string; label: string; desc: string; busy: boolean; onRun: () => void; children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-xl border bg-white/5 border-white/10 min-h-[86px]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] leading-none text-slate-300">{icon}</span>
          <span className="text-xs font-semibold text-slate-200">{label}</span>
        </span>
        <button
          onClick={onRun}
          disabled={busy}
          className="text-[10px] px-2 py-1 rounded-md font-bold text-cyan-200 bg-cyan-500/10
                     border border-cyan-500/40 hover:bg-cyan-500/20 cursor-pointer disabled:opacity-50"
        >
          {busy ? "…" : "▷ Run"}
        </button>
      </div>
      <span className="text-[10px] text-slate-500 leading-tight">{desc}</span>
      {children}
    </div>
  );
}

function FeasibilityBadge({ feasible }: { feasible: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest border
        ${feasible
          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
          : "text-rose-400 bg-rose-500/10 border-rose-500/30"}`}
    >
      {feasible ? "FEASIBLE" : "INFEASIBLE"}
    </span>
  );
}
