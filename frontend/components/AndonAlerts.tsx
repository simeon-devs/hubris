"use client";

/**
 * AndonAlerts — jidoka for the network (自働化, "automation with a human
 * touch"): the capacity watchdog sweeps on its own schedule, runs REAL
 * stress simulations, and raises an andon card when a target is infeasible
 * (critical) or a hub runs hot (warning). The AI stops and asks — it never
 * silently acts. Every figure on the card is solver output with provenance;
 * there is deliberately no LLM in the background loop.
 *
 * Polls GET /memory/alerts; renders nothing while the list is empty (or
 * when memory is unavailable, in which case monitoring is honestly off).
 */

import { useEffect, useRef, useState } from "react";
import { getAlerts } from "@/lib/api";
import type { AlertInfo } from "@/lib/types";
import { actionLabel, alertHeadline, alertSavings, unmetLines } from "@/lib/alert-view";

const POLL_MS = 8000;
const SHOW_MAX = 3;

export default function AndonAlerts() {
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  const dismissed = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      getAlerts()
        .then((list) => {
          if (!cancelled) setAlerts(list);
        })
        .catch(() => {
          /* backend down or no monitoring — stay quiet */
        });
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const visible = alerts
    .filter((a) => !a.acknowledged && !dismissed.current.has(a.id))
    .slice(0, SHOW_MAX);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 pointer-events-auto">
      {visible.map((alert) => {
        const savings = alertSavings(alert.recommended_action);
        return (
          <div
            key={alert.id}
            className="w-[330px] rounded-2xl bg-black/85 backdrop-blur-xl border p-3.5 flex flex-col gap-2"
            style={{
              borderColor:
                alert.severity === "warning" ? "rgba(245,158,11,0.4)" : "rgba(244,63,94,0.4)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.55), 0 0 22px rgba(245,158,11,0.12)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="andon-dot" />
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-300">
                {alert.agent_name.replace(/_/g, " ")}
              </span>
              <span
                className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 border ${
                  alert.severity === "critical"
                    ? "text-rose-300 border-rose-500/40 bg-rose-500/10"
                    : "text-amber-300 border-amber-500/40 bg-amber-500/10"
                }`}
              >
                {alert.severity.toUpperCase()}
              </span>
              <span
                className="text-[9px] font-bold text-emerald-400 border border-emerald-500/30
                           bg-emerald-500/10 rounded-full px-1.5 py-0.5 ml-auto"
                title={`Engine-computed finding — provenance ${alert.provenance}`}
              >
                COMPUTED
              </span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">{alertHeadline(alert.finding)}</p>
            {!alert.finding.feasible && (
              <ul className="text-[10px] text-rose-200/90 leading-relaxed">
                {unmetLines(alert.finding).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Recommended: {actionLabel(alert.recommended_action)}
              {savings !== null && (
                <span className="text-emerald-300"> — saves {savings} AED/period (verified by re-solve)</span>
              )}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-600">
                {new Date(alert.created_at).toLocaleTimeString()}
              </span>
              <button
                onClick={() => {
                  dismissed.current.add(alert.id);
                  setAlerts([...alerts]);
                }}
                className="text-[10px] text-slate-500 hover:text-white cursor-pointer"
              >
                Acknowledge ✓
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
