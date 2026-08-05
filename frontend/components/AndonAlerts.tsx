"use client";

/**
 * AndonAlerts — jidoka for the network (自働化, "automation with a human
 * touch"): monitoring agents run automatically after every state change;
 * when one finds something, this raises an andon card that a human reviews
 * and dismisses. The AI stops and asks — it never silently acts.
 *
 * Polls GET /alerts; renders nothing while the list is empty (or when the
 * backend has no API key, in which case monitoring is honestly off).
 */

import { useEffect, useRef, useState } from "react";
import { getAlerts } from "@/lib/api";
import type { AlertInfo } from "@/lib/types";

const POLL_MS = 8000;
const SHOW_MAX = 3;

export default function AndonAlerts() {
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  const dismissed = useRef<Set<number>>(new Set());

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

  const visible = alerts.filter((a) => !dismissed.current.has(a.ts)).slice(0, SHOW_MAX);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 pointer-events-auto">
      {visible.map((alert) => (
        <div
          key={alert.ts}
          className="w-[330px] rounded-2xl bg-black/85 backdrop-blur-xl border p-3.5 flex flex-col gap-2"
          style={{
            borderColor: alert.status === "ok" ? "rgba(245,158,11,0.4)" : "rgba(244,63,94,0.4)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.55), 0 0 22px rgba(245,158,11,0.12)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="andon-dot" />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-300">
              {alert.agent_name}
            </span>
            <span className="text-[9px] text-slate-500 truncate flex-1">{alert.trigger}</span>
            {alert.verification?.grounded && (
              <span className="text-[9px] font-bold text-emerald-400 border border-emerald-500/30
                               bg-emerald-500/10 rounded-full px-1.5 py-0.5">
                VERIFIED
              </span>
            )}
          </div>
          <p className="text-xs text-slate-200 leading-relaxed max-h-28 overflow-y-auto">
            {alert.answer}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-600">
              {alert.tool_calls} engine call{alert.tool_calls === 1 ? "" : "s"} ·{" "}
              {new Date(alert.ts * 1000).toLocaleTimeString()}
            </span>
            <button
              onClick={() => {
                dismissed.current.add(alert.ts);
                setAlerts([...alerts]);
              }}
              className="text-[10px] text-slate-500 hover:text-white cursor-pointer"
            >
              Acknowledge ✓
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
