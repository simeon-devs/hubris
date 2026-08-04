"use client";

import type { KpisResponse } from "@/lib/types";

type MetricKey = "cost_to_serve" | "utilization" | "coverage" | "spare_capacity";

const CARD_CONFIG: {
  key: MetricKey;
  label: string;
  goodDirection: "down" | "up" | null;
  icon: string;
}[] = [
  { key: "cost_to_serve",  label: "Cost-to-serve",  goodDirection: "down", icon: "◈" },
  { key: "utilization",    label: "Utilization",     goodDirection: null,   icon: "◉" },
  { key: "coverage",       label: "Coverage",        goodDirection: "up",   icon: "◎" },
  { key: "spare_capacity", label: "Spare capacity",  goodDirection: null,   icon: "◫" },
];

const NEGLIGIBLE_PCT = 0.05;

function deltaInfo(pct: number | undefined, goodDirection: "down" | "up" | null) {
  if (pct === undefined || Math.abs(pct) < NEGLIGIBLE_PCT || goodDirection === null)
    return { cls: "text-slate-500", arrow: "" };
  const improving = goodDirection === "down" ? pct < 0 : pct > 0;
  return {
    cls: improving ? "text-emerald-400 glow-emerald" : "text-rose-400 glow-rose",
    arrow: pct < 0 ? "↓ " : "↑ ",
  };
}

/** Context-aware value colour — uses neon drop-shadow on the large KPI number */
function valueClass(key: MetricKey, value: number | null): string {
  if (value === null) return "text-slate-600";
  if (key === "utilization") {
    if (value >= 85) return "text-rose-400 neon-rose";
    if (value >= 60) return "text-emerald-400 neon-emerald";
    return "text-amber-400 neon-amber";
  }
  if (key === "coverage") {
    if (value >= 90) return "text-emerald-400 neon-emerald";
    if (value >= 70) return "text-amber-400 neon-amber";
    return "text-rose-400 neon-rose";
  }
  return "text-white neon-white";
}

/** Top accent gradient colour string */
function accentRgb(key: MetricKey, value: number | null): string {
  const c = valueClass(key, value);
  if (c.includes("emerald")) return "52,211,153";
  if (c.includes("rose"))    return "251,113,132";
  if (c.includes("amber"))   return "251,191,36";
  return "148,163,184";  // slate for neutral metrics
}

function formatPct(pct: number): string {
  if (Math.abs(pct) < NEGLIGIBLE_PCT) return "0.0";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}`;
}

interface KpiCardsProps {
  kpis: KpisResponse;
  deltaPct?: Record<string, number> | null;
}

export default function KpiCards({ kpis, deltaPct }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {CARD_CONFIG.map(({ key, label, goodDirection, icon }) => {
        const metric  = kpis[key];
        const delta   = deltaPct?.[key];
        const value   = typeof metric.value === "number" ? metric.value : null;
        const vClass  = valueClass(key, value);
        const dInfo   = deltaInfo(delta, goodDirection);
        const rgb     = accentRgb(key, value);

        return (
          <div
            key={key}
            className="card-hover relative overflow-hidden rounded-xl p-4 flex flex-col gap-1.5
                       bg-white/5 border border-white/10"
          >
            {/* Coloured top accent */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: `linear-gradient(to right, transparent, rgba(${rgb},0.6), transparent)` }}
            />

            {/* Label */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-cyan-400/50">{icon}</span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-amber-100/70">
                {label}
              </span>
            </div>

            {/* Value */}
            <div className={`font-mono text-[22px] font-bold leading-none tabular-nums ${vClass}`}>
              {value !== null
                ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : <span className="text-gray-700">—</span>
              }
              {value !== null && (
                <span className="text-xs font-sans font-normal ml-1.5 text-slate-400">
                  {metric.unit}
                </span>
              )}
            </div>

            {/* Delta */}
            {delta !== undefined && (
              <div className={`text-[11px] font-mono leading-none ${dInfo.cls}`}>
                {dInfo.arrow}{formatPct(delta)}%
                <span className="text-[10px] font-sans ml-1 text-slate-500">vs baseline</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
