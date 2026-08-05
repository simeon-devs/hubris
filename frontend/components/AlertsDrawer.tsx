"use client";

/**
 * AlertsDrawer — the watchdogs' findings, finally visible everywhere.
 * Bell in the header (unacknowledged count), right-side drawer on click:
 * new alerts first, acknowledged ones collapsed into History.
 *
 * Every card is a COMPUTED finding from the capacity watchdog (T-40):
 * a real stress simulation ran, the figures are solver output with
 * provenance, and the recommended action was verified by re-solving.
 * There is deliberately no LLM in the background loop.
 */

import { useCallback, useEffect, useState } from "react";
import { acknowledgeAlert, getAlerts } from "@/lib/api";
import type { AlertInfo } from "@/lib/types";
import { actionLabel, alertHeadline, alertSavings, unmetLines } from "@/lib/alert-view";

const POLL_MS = 12_000;
const BRAND_RED = "#E8112D";

export function useAlerts() {
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);

  const reload = useCallback(() => {
    getAlerts()
      .then((list) =>
        setAlerts(
          [...list].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          ),
        ),
      )
      .catch(() => {
        /* the bell just stays quiet if the feed is unreachable */
      });
  }, []);

  useEffect(() => {
    reload();
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return { alerts, reload };
}

export function AlertsBell({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative w-8 h-8 rounded-lg text-sm text-slate-400 hover:text-white
                 bg-white/5 border border-white/10 hover:border-white/25 cursor-pointer"
      title="Watchdog alerts — what the monitoring agents found after each network change"
    >
      ◭
      {count > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px]
                     font-bold text-white flex items-center justify-center"
          style={{ background: BRAND_RED, boxShadow: `0 0 10px ${BRAND_RED}88` }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

export function AlertsDrawer({
  open,
  onClose,
  alerts,
  onAcknowledged,
}: {
  open: boolean;
  onClose: () => void;
  alerts: AlertInfo[];
  onAcknowledged: () => void;
}) {
  const fresh = alerts.filter((a) => !a.acknowledged);
  const history = alerts.filter((a) => a.acknowledged);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!open) return null;

  return (
    <>
      {/* Scrim */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <aside
        className="fixed top-0 right-0 bottom-0 z-50 w-[400px] max-w-[92vw] flex flex-col
                   bg-[#060b18]/97 backdrop-blur-xl border-l border-white/10"
        style={{ boxShadow: "-16px 0 48px rgba(0,0,0,0.55)" }}
      >
        <header className="flex-none flex items-center justify-between px-5 h-14 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span style={{ color: BRAND_RED }}>◭</span>
            <span className="text-sm font-bold text-white tracking-wide">Watchdog alerts</span>
            {fresh.length > 0 && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                style={{ background: BRAND_RED }}
              >
                {fresh.length} new
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-white bg-white/5
                       border border-white/10 cursor-pointer"
            title="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {alerts.length === 0 && (
            <p className="text-xs text-slate-400 leading-relaxed px-1">
              Nothing yet. The capacity watchdog sweeps the network on its own
              schedule — a real stress simulation of the baseline plus every saved
              scenario — and reports here the moment something binds. Quiet means
              healthy (or memory is offline, in which case this stays honestly empty).
            </p>
          )}

          {fresh.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onAcknowledged={onAcknowledged} />
          ))}

          {history.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                className="w-full text-left text-[10px] font-semibold uppercase tracking-[0.18em]
                           text-slate-500 hover:text-slate-300 cursor-pointer px-1 py-2"
              >
                {historyOpen ? "▾" : "▸"} History — {history.length} acknowledged
              </button>
              {historyOpen && (
                <div className="flex flex-col gap-2 mt-1 opacity-70">
                  {history.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} onAcknowledged={onAcknowledged} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function AlertRow({ alert, onAcknowledged }: { alert: AlertInfo; onAcknowledged: () => void }) {
  const [busy, setBusy] = useState(false);

  const acknowledge = () => {
    setBusy(true);
    acknowledgeAlert(alert.id)
      .then(onAcknowledged)
      .finally(() => setBusy(false));
  };

  const savings = alertSavings(alert.recommended_action);

  return (
    <div
      className={`rounded-xl p-3.5 border text-xs flex flex-col gap-2
        ${alert.severity === "critical" ? "bg-rose-500/5 border-rose-500/20" : "bg-white/[0.04] border-white/10"}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-bold text-slate-100">{alert.agent_name.replace(/_/g, " ")}</span>
        <span
          className={`text-[9px] font-bold rounded-full px-2 py-px border ${
            alert.severity === "critical"
              ? "text-rose-300 border-rose-500/40 bg-rose-500/10"
              : "text-amber-300 border-amber-500/40 bg-amber-500/10"
          }`}
        >
          {alert.severity.toUpperCase()}
        </span>
        <span
          className="text-[9px] font-bold text-emerald-300 bg-emerald-500/15
                     border border-emerald-500/40 rounded-full px-2 py-px"
          title={`Engine-computed finding, not model prose — provenance ${alert.provenance}`}
        >
          COMPUTED
        </span>
        <span className="ml-auto text-[10px] font-mono text-slate-500">
          {new Date(alert.created_at).toLocaleTimeString()}
        </span>
      </div>

      <p className="text-slate-200 leading-relaxed">{alertHeadline(alert.finding)}</p>
      {!alert.finding.feasible && (
        <ul className="text-[10px] text-rose-200/90 leading-relaxed list-disc list-inside">
          {unmetLines(alert.finding).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-slate-300 leading-relaxed">
        <span className="text-slate-500">Recommended:</span> {actionLabel(alert.recommended_action)}
        {savings !== null && (
          <span className="text-emerald-300"> — saves {savings} AED/period (verified by re-solve)</span>
        )}
      </p>
      {alert.recommended_action.why && (
        <p className="text-[10px] text-slate-500 leading-relaxed">{alert.recommended_action.why}</p>
      )}
      <a
        href={alert.brief_link}
        className="text-[10px] text-cyan-300/80 hover:text-cyan-200 underline underline-offset-2 self-start"
        title="Open the decision brief for this target"
      >
        Decision brief →
      </a>

      {!alert.acknowledged && (
        <button
          onClick={acknowledge}
          disabled={busy}
          className="self-start text-[11px] font-semibold px-3 py-1.5 rounded-lg text-slate-200
                     bg-white/8 border border-white/15 hover:border-white/30 cursor-pointer
                     disabled:opacity-50"
          title="Mark as read — it moves into the drawer's History section"
        >
          {busy ? "…" : "Acknowledge"}
        </button>
      )}
    </div>
  );
}
