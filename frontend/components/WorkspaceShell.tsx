"use client";

/**
 * WorkspaceShell — the persistent chrome around every page: AtlasProvider
 * (shared working state), the top header (brand, dataset upload, distance
 * controls), the 56px NavRail, and the guided tour. Pages render inside
 * <main>, offset by the rail width and header height.
 */

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AlertsBell, AlertsDrawer, useAlerts } from "@/components/AlertsDrawer";
import GuidedTour, { tourAlreadySeen } from "@/components/GuidedTour";
import IngestButton from "@/components/IngestButton";
import NavRail from "@/components/NavRail";
import { AtlasProvider, useAtlas } from "@/lib/atlas-context";
import type { NetworkMapResponse } from "@/lib/types";
import { useEffect, useState } from "react";

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <AtlasProvider>
      <ShellChrome>{children}</ShellChrome>
    </AtlasProvider>
  );
}

function ShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    network,
    refreshingDistances,
    refreshResult,
    refreshDistancesNow,
    tourOpen,
    setTourOpen,
    onIngested,
  } = useAtlas();

  const { alerts, reload: reloadAlerts } = useAlerts();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const unacknowledged = alerts.filter((a) => !a.acknowledged).length;

  // First visit: open the tour once (pre-existing behaviour, now shell-owned).
  // Not on the AtlasVision home — the design carries its own guided story.
  useEffect(() => {
    if (pathname !== "/" && !tourAlreadySeen()) setTourOpen(true);
  }, [setTourOpen, pathname]);

  // The home page IS the approved design, chrome and all — the shell steps
  // aside entirely so nothing sits on top of it. /classic keeps everything.
  if (pathname === "/") {
    return <div className="relative w-screen h-screen overflow-hidden bg-[#04070f]">{children}</div>;
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#020817]">
      {/* ── Header — persistent on all pages ── */}
      <header
        className="absolute top-0 left-0 right-0 z-40 h-14 flex items-center justify-between
                   pl-[72px] pr-5 bg-black/60 backdrop-blur-md border-b border-white/10"
      >
        <div className="flex items-center gap-3">
          <div className="live-dot" />
          <span
            className="flex items-center justify-center w-7 h-7 rounded-lg text-[13px] font-black
                       text-white select-none"
            style={{ background: "#E8112D", boxShadow: "0 0 16px rgba(232,17,45,0.45)" }}
          >
            7X
          </span>
          <div className="flex items-baseline gap-2.5">
            <span className="text-sm font-bold tracking-[0.14em] text-white">EMX ATLAS</span>
            <span className="hidden lg:block text-[10px] font-mono tracking-[0.2em] text-gray-500">
              PREDICTIVE NETWORK TWIN
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <IngestButton onIngested={onIngested} />
          {network && <DistanceModeBadge mode={network.distance_mode} />}
          <button
            onClick={refreshDistancesNow}
            disabled={refreshingDistances}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors duration-150
              ${refreshingDistances
                ? "border-white/5 text-slate-600 cursor-default"
                : "border-white/10 text-slate-400 hover:text-slate-100 hover:border-white/20 cursor-pointer"
              } bg-white/5`}
            title="Re-measure every route using real road distances instead of straight-line estimates. Takes a few seconds."
          >
            {refreshingDistances ? "Refreshing…" : "↻ Distances"}
          </button>
          {refreshResult && (
            <span className="text-xs font-mono text-slate-400">
              {refreshResult.cost_to_serve_before}
              <span className="mx-1.5 text-slate-600">→</span>
              <span className="text-emerald-400 neon-emerald">{refreshResult.cost_to_serve_after}</span>
              <span className="ml-1 text-slate-500">AED/parcel</span>
            </span>
          )}

          <AlertsBell count={unacknowledged} onClick={() => setAlertsOpen(true)} />
        </div>
      </header>

      <NavRail />

      {/* ── Page content — offset for rail + header ── */}
      <main className="absolute top-14 left-14 right-0 bottom-0">{children}</main>

      <AlertsDrawer
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        alerts={alerts}
        onAcknowledged={reloadAlerts}
      />

      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}

function DistanceModeBadge({ mode }: { mode: NetworkMapResponse["distance_mode"] }) {
  const isReal = mode === "osrm";
  return (
    <span
      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border tracking-widest
        ${isReal
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          : "bg-amber-500/10  text-amber-400  border-amber-500/20"
        }`}
      title={
        isReal
          ? "Distances are measured along real roads — the most accurate mode."
          : "Distances are straight-line estimates for now. Press ↻ Distances to measure real roads."
      }
    >
      {isReal ? "REAL ROADS" : "ESTIMATED"}
    </span>
  );
}
