"use client";

/**
 * MapViewControls — compact map-furniture pill (theme + corridor mode),
 * shared by the map pages. Lives with the map like the legend does; the
 * page layouts themselves stay clean.
 */

import { useAtlas } from "@/lib/atlas-context";

export default function MapViewControls() {
  const { isDarkMode, setIsDarkMode, corridorMode, setCorridorMode, scenarioId, setScenarioId } =
    useAtlas();

  return (
    <div
      className="flex items-center gap-1 p-1 rounded-full bg-black/75 backdrop-blur-xl
                 border border-white/[0.12]"
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
    >
      <PillButton active={isDarkMode} accent="cyan" onClick={() => setIsDarkMode(true)} title="Dark map">
        ◈
      </PillButton>
      <PillButton active={!isDarkMode} accent="amber" onClick={() => setIsDarkMode(false)} title="Light map">
        ○
      </PillButton>
      <div className="w-px h-3.5 bg-white/10 mx-0.5" />
      <PillButton
        active={corridorMode === "domestic"}
        accent="cyan"
        onClick={() => setCorridorMode("domestic")}
        title="Domestic Branch Network"
      >
        Domestic
      </PillButton>
      <PillButton
        active={corridorMode === "magazine"}
        accent="amber"
        onClick={() => {
          setCorridorMode("magazine");
          // The Magazine exists only inside its saved scenario (real model
          // data via add_hub) — entering this view brings it on screen.
          if (scenarioId === null) setScenarioId("main-magazine");
        }}
        title="International & Main Magazine Flow"
      >
        Magazine
      </PillButton>
    </div>
  );
}

function PillButton({
  active,
  accent,
  onClick,
  title,
  children,
}: {
  active: boolean;
  accent: "cyan" | "amber";
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const activeClasses =
    accent === "amber" ? "bg-amber-400/[0.13] text-amber-200" : "bg-white/[0.11] text-cyan-200";
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap
                  transition-all duration-200 cursor-pointer
        ${active ? activeClasses : "text-slate-500 hover:text-slate-300 bg-transparent"}`}
    >
      {children}
    </button>
  );
}
