"use client";

/**
 * KpiStrip — the Command page's plain-language read of the 4 network KPIs.
 * Headline: a sentence anyone can read. Sub-text: the precise metric name +
 * engine value, verbatim, for the experts. Rounding here is DISPLAY-only
 * (headline); the exact figure always sits right underneath.
 */

import { useEffect, useRef, useState } from "react";
import type { KpisResponse } from "@/lib/types";

type MetricKey = "cost_to_serve" | "utilization" | "coverage" | "spare_capacity";

const COUNT_UP_MS = 800;

/** Display-only count-up on the FIRST value: 0 → the API value over 800ms,
 *  landing on exactly the API value. Later updates jump straight there. */
function useCountUp(target: number | null): number | null {
  const [display, setDisplay] = useState<number | null>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    if (target === null) return;
    if (animatedRef.current) {
      setDisplay(target);
      return;
    }
    animatedRef.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(p < 1 ? target * eased : target); // ends EXACTLY on the API value
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return display;
}

const NEGLIGIBLE_PCT = 0.05;

function healthClass(key: MetricKey, value: number | null): string {
  if (value === null) return "text-slate-600";
  if (key === "utilization") {
    if (value >= 85) return "text-rose-300";
    if (value >= 60) return "text-emerald-300";
    return "text-amber-300";
  }
  if (key === "coverage") {
    if (value >= 90) return "text-emerald-300";
    if (value >= 70) return "text-amber-300";
    return "text-rose-300";
  }
  return "text-white";
}

/** The plain-language headline for each metric. */
function headline(key: MetricKey, value: number | null): string {
  if (value === null) return "No data yet";
  switch (key) {
    case "cost_to_serve":
      return `Costs ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} AED per parcel`;
    case "utilization":
      return `Network is ${Math.round(value)}% busy`;
    case "coverage":
      return value >= 100
        ? "Every area reachable on time"
        : `${Math.round(value)}% of areas reachable on time`;
    case "spare_capacity":
      return `Can handle ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} more parcels a day`;
  }
}

const TILES: {
  key: MetricKey;
  metricLabel: string;
  goodDirection: "down" | "up" | null;
  icon: string;
  tooltip: string;
}[] = [
  {
    key: "cost_to_serve", metricLabel: "cost-to-serve", goodDirection: "down", icon: "◈",
    tooltip: "What one delivered parcel costs the network end-to-end, computed by the calculation engine. Lower is better.",
  },
  {
    key: "utilization", metricLabel: "utilization", goodDirection: null, icon: "◉",
    tooltip: "How much of the network's total capacity is in use right now. Very high means overload risk; very low means paying for idle capacity.",
  },
  {
    key: "coverage", metricLabel: "coverage", goodDirection: "up", icon: "◎",
    tooltip: "The share of delivery areas the network can serve within their promised time.",
  },
  {
    key: "spare_capacity", metricLabel: "spare capacity", goodDirection: null, icon: "◫",
    tooltip: "Extra parcels the network could absorb today without any change — the growth headroom.",
  },
];

export default function KpiStrip({
  kpis,
  deltaPct,
}: {
  kpis: KpisResponse;
  deltaPct?: Record<string, number> | null;
}) {
  return (
    <div
      className="flex items-stretch gap-px rounded-xl overflow-hidden bg-white/10
                 border border-white/10 backdrop-blur-xl"
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.45)" }}
    >
      {TILES.map((tile) => (
        <Tile key={tile.key} tile={tile} kpis={kpis} deltaPct={deltaPct} />
      ))}
    </div>
  );
}

function Tile({
  tile: { key, metricLabel, goodDirection, icon, tooltip },
  kpis,
  deltaPct,
}: {
  tile: (typeof TILES)[number];
  kpis: KpisResponse;
  deltaPct?: Record<string, number> | null;
}) {
  const metric = kpis[key];
  const value = typeof metric.value === "number" ? metric.value : null;
  const displayValue = useCountUp(value); // display-only intro count-up
  const delta = deltaPct?.[key];
  const showDelta =
    delta !== undefined && Math.abs(delta) >= NEGLIGIBLE_PCT && goodDirection !== null;
  const improving =
    showDelta && (goodDirection === "down" ? (delta as number) < 0 : (delta as number) > 0);

  return (
    <div
      title={tooltip}
      className="flex flex-col gap-0.5 px-4 py-2 bg-black/75 min-w-[168px] cursor-default"
    >
      <span className={`text-[13px] font-semibold leading-tight ${healthClass(key, value)}`}>
        {headline(key, displayValue)}
        {showDelta && (
          <span
            className={`ml-1.5 text-[10px] font-mono ${improving ? "text-emerald-400" : "text-rose-400"}`}
            title="Change vs today's network, computed by the engine for the scenario you're viewing"
          >
            {(delta as number) > 0 ? "+" : ""}
            {(delta as number).toFixed(1)}%
          </span>
        )}
      </span>
      {/* The expert line: precise metric, verbatim engine value — no animation here */}
      <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-[0.14em] text-slate-500">
        <span className="text-cyan-400/50">{icon}</span>
        {metricLabel}{" "}
        {value !== null &&
          `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${metric.unit}`}
      </span>
    </div>
  );
}
