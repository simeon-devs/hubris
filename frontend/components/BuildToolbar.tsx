"use client";

/**
 * BuildToolbar — SimCity-grade direct manipulation for the twin.
 *
 * Three spatial what-ifs, driven by clicking the map itself (no forms-first):
 *   ＋ Hub       click anywhere → confirm card → add_hub scenario
 *   ＋ Customer  click anywhere → confirm card → add_customer scenario
 *   ⇄ Move Hub   click a hub, then its new location → move_hub scenario
 *
 * Every action runs through POST /simulate (the real engine re-solves the
 * network) and saves the result as a named scenario, which flips the canvas
 * into BASELINE | SIMULATION comparison automatically. No number here is
 * computed client-side — the card only collects INPUTS.
 */

import type { BuildMode } from "@/lib/build";

interface BuildToolbarProps {
  mode: BuildMode | null;
  pendingHubId: string | null; // move flow: the hub picked, waiting for a destination
  onSelect: (mode: BuildMode | null) => void;
}

const TOOLS: { id: BuildMode; icon: string; label: string; hint: string }[] = [
  { id: "add_hub", icon: "⬢", label: "Add Hub", hint: "Click the map where the new hub should go" },
  { id: "add_customer", icon: "◎", label: "Add Customer", hint: "Click the map to place the new demand" },
  { id: "move_hub", icon: "⇄", label: "Move Hub", hint: "Click a hub, then click its new location" },
];

export default function BuildToolbar({ mode, pendingHubId, onSelect }: BuildToolbarProps) {
  const active = TOOLS.find((t) => t.id === mode);
  return (
    <div className="flex flex-col items-center gap-2 pointer-events-none">
      <div
        className="flex items-center gap-1 p-1 rounded-full bg-black/75 backdrop-blur-xl
                   border border-white/[0.12] pointer-events-auto"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
      >
        <span className="pl-3 pr-1 text-[9px] font-mono uppercase tracking-[0.22em] text-slate-500">
          Build
        </span>
        {TOOLS.map(({ id, icon, label }) => {
          const isActive = mode === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(isActive ? null : id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold
                          whitespace-nowrap transition-all duration-200 cursor-pointer
                ${isActive ? "bg-[#E8112D]/20 text-red-200 border border-[#E8112D]/50" : "text-slate-400 hover:text-slate-100 border border-transparent"}`}
              style={isActive ? { boxShadow: "0 0 18px rgba(232,17,45,0.30)" } : {}}
            >
              <span className="text-[11px] leading-none">{icon}</span>
              {label}
            </button>
          );
        })}
      </div>

      {active && (
        <div
          className="px-4 py-1.5 rounded-full text-[11px] text-red-100/90 bg-[#E8112D]/15
                     border border-[#E8112D]/30 backdrop-blur-md pointer-events-none animate-pulse"
        >
          {mode === "move_hub" && pendingHubId
            ? `Moving ${pendingHubId} — click its new location`
            : active.hint}
        </div>
      )}
    </div>
  );
}
