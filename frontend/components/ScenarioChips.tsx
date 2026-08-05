"use client";

/**
 * ScenarioChips — every saved what-if as a one-click chip (anyLogistix-style
 * scenario comparison, made instant). Selecting a chip flips the canvas into
 * BASELINE | SIMULATION split view; ✕ deletes the saved scenario.
 */

import type { SavedScenarioInfo } from "@/lib/types";

interface ScenarioChipsProps {
  scenarios: SavedScenarioInfo[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
}

export default function ScenarioChips({ scenarios, activeId, onSelect, onDelete }: ScenarioChipsProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-black/70 backdrop-blur-xl
                 border border-white/[0.12] max-w-[46vw] overflow-x-auto"
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
    >
      <Chip
        label="Baseline"
        active={activeId === null}
        accent="#22d3ee"
        onClick={() => onSelect(null)}
      />
      {scenarios.map((s) => (
        <Chip
          key={s.id}
          label={s.label}
          active={activeId === s.id}
          accent="#f59e0b"
          onClick={() => onSelect(s.id)}
          onDelete={() => onDelete(s.id)}
        />
      ))}
      {scenarios.length === 0 && (
        <span className="text-[10px] text-slate-500 pr-2 whitespace-nowrap">
          Run a what-if to pin scenarios here
        </span>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  accent,
  onClick,
  onDelete,
}: {
  label: string;
  active: boolean;
  accent: string;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <span
      className={`group flex items-center gap-1 pl-3 rounded-full text-[11px] font-medium
                  whitespace-nowrap cursor-pointer transition-all duration-150 border
        ${active ? "text-white" : "text-slate-400 hover:text-slate-100 border-transparent"}`}
      style={
        active
          ? { background: `${accent}22`, borderColor: `${accent}66`, boxShadow: `0 0 14px ${accent}30` }
          : {}
      }
      onClick={onClick}
    >
      <span className="py-1">{label}</span>
      {onDelete ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="px-1.5 py-1 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100
                     transition-opacity cursor-pointer"
          title="Delete scenario"
        >
          ✕
        </button>
      ) : (
        <span className="pr-2" />
      )}
    </span>
  );
}
