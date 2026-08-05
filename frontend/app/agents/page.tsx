"use client";

/**
 * AGENTS — the delegation workspace. Chat with the multi-agent workforce on
 * the left (full height); build custom agents and watch the full monitoring
 * feed on the right.
 */

import { useEffect, useState } from "react";
import AgentBuilderPanel from "@/components/AgentBuilderPanel";
import AgentChat from "@/components/AgentChat";
import { getAlerts } from "@/lib/api";
import { actionLabel, alertHeadline, alertSavings } from "@/lib/alert-view";
import { useAtlas } from "@/lib/atlas-context";
import type { AlertInfo } from "@/lib/types";

const ALERTS_POLL_MS = 15_000;

export default function AgentsPage() {
  const { agents, reloadAgents } = useAtlas();

  return (
    <div className="w-full h-full flex gap-4 p-4 overflow-hidden">
      {/* ── Left: chat, full height ── */}
      <section className="flex-1 min-w-0 flex flex-col rounded-2xl bg-black/60 border border-white/10 tactical-grid overflow-hidden">
        <PanelHeader icon="⬡" title="Agent Chat" />
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <AgentChat agents={agents} />
        </div>
      </section>

      {/* ── Right: builder + full alert feed ── */}
      <section className="w-[380px] flex-none flex flex-col gap-4 overflow-hidden">
        <div className="flex-none rounded-2xl bg-black/60 border border-white/10 overflow-hidden">
          <PanelHeader icon="◇" title="Agent Builder" />
          <div className="px-5 py-4 max-h-[42vh] overflow-y-auto">
            <AgentBuilderPanel agents={agents} onChange={reloadAgents} />
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-2xl bg-black/60 border border-white/10 overflow-hidden flex flex-col">
          <PanelHeader icon="▴" title="Alert Feed" />
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            <AlertsFeed />
          </div>
        </div>
      </section>
    </div>
  );
}

function PanelHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex-none px-5 py-3.5 border-b border-white/[0.07] flex items-center gap-2">
      <span className="text-[10px] font-mono text-cyan-400">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
        {title}
      </span>
    </div>
  );
}

/** The COMPLETE /alerts feed — AndonAlerts on Command shows only the newest
 *  few; this is the audit view of every monitoring-agent run. */
function AlertsFeed() {
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getAlerts()
        .then((list) => {
          if (!cancelled) {
            setAlerts(
              [...list].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              ),
            );
            setLoaded(true);
          }
        })
        .catch(() => setLoaded(true));
    };
    poll();
    const timer = setInterval(poll, ALERTS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!loaded) return <div className="text-xs text-slate-500 animate-pulse">Loading alerts…</div>;
  if (alerts.length === 0)
    return (
      <div className="text-xs text-slate-500">
        No alerts yet — the capacity watchdog sweeps the baseline and every saved
        scenario on its own schedule and posts computed findings here.
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => {
        const savings = alertSavings(alert.recommended_action);
        return (
          <div
            key={alert.id}
            className={`rounded-xl p-3 border text-xs
              ${alert.severity === "critical"
                ? "bg-rose-500/5 border-rose-500/20"
                : "bg-white/5 border-white/10"}`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-semibold text-slate-200 truncate">
                {alert.agent_name.replace(/_/g, " ")}
              </span>
              <span className="flex-none text-[10px] font-mono text-slate-500">
                {new Date(alert.created_at).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">{alertHeadline(alert.finding)}</p>
            <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
              Recommended: {actionLabel(alert.recommended_action)}
              {savings !== null && (
                <span className="text-emerald-300"> — saves {savings} AED/period (verified)</span>
              )}
            </p>
            <div className="flex items-center gap-2 mt-2 text-[9px] font-mono text-slate-500">
              <span
                className={`px-1.5 py-0.5 rounded-full border font-bold tracking-widest
                  ${alert.severity === "critical"
                    ? "text-rose-400 border-rose-500/30"
                    : "text-amber-400 border-amber-500/30"}`}
              >
                {alert.severity.toUpperCase()}
              </span>
              <span title={`Provenance: ${alert.provenance}`}>COMPUTED · {alert.finding.target}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
