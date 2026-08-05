"use client";

/**
 * MapCanvas — the twin's full-bleed map wired to Atlas context, shared by
 * the Command and Simulate pages. Owns only presentation of loading/error;
 * pages pass build-mode picking through untouched.
 */

import dynamic from "next/dynamic";
import type { BuildPick } from "@/lib/build";
import { useAtlas } from "@/lib/atlas-context";

const NetworkMap = dynamic(() => import("@/components/NetworkMap"), { ssr: false });

interface MapCanvasProps {
  picking?: "location" | "hub" | null;
  onPick?: (pick: BuildPick) => void;
  pendingMarker?: { lat: number; lon: number } | null;
}

export default function MapCanvas({ picking = null, onPick, pendingMarker = null }: MapCanvasProps) {
  const { network, baselineNetwork, scenarioId, corridorMode, isDarkMode, error } = useAtlas();

  return (
    <div className="absolute inset-0 z-0">
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1.5 px-5 py-3.5 rounded-xl text-sm text-rose-300
                          bg-rose-500/10 border border-rose-500/20 max-w-md text-center">
            <span className="text-base">⚠</span>
            <span>The twin can&apos;t reach its calculation engine right now.</span>
            <span className="text-[11px] font-mono text-rose-400/70">{error}</span>
          </div>
        </div>
      )}
      {!error && !network && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3 text-slate-400 text-sm">
            <span className="w-4 h-4 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
            Waking up the network twin…
          </div>
        </div>
      )}
      {network && (
        <NetworkMap
          baseline={scenarioId && baselineNetwork ? baselineNetwork : network}
          simulation={scenarioId ? network : null}
          simulationId={scenarioId}
          corridorMode={corridorMode}
          isDarkMode={isDarkMode}
          picking={picking}
          onPick={onPick}
          pendingMarker={pendingMarker}
        />
      )}
    </div>
  );
}
