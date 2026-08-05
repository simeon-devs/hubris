"use client";

/**
 * ActionCard — an agent proposal you can run on the map with one click.
 * One component, two homes: the chat thread and (once alerts carry traces)
 * the alerts drawer.
 *
 * Every figure shown is lifted verbatim from the trace's engine result by
 * lib/action-cards (unit-tested). Clicking replays the SAME scenario_name +
 * params through POST /simulate — the engine re-solves; nothing is reused
 * from the chat run except its inputs.
 */

import { useCallback, useState } from "react";
import { optimize, simulate } from "@/lib/api";
import type { AgentAction, OptimizeAction, SimulateAction } from "@/lib/action-cards";
import { useAtlas } from "@/lib/atlas-context";
import { nextScenarioId } from "@/lib/build";
import type { OptimizeResponse } from "@/lib/types";

const BRAND_RED = "#E8112D";

export default function ActionCard({ action }: { action: AgentAction }) {
  return action.kind === "simulate" ? (
    <SimulateCard action={action} />
  ) : (
    <OptimizeCard action={action} />
  );
}

/* ── Simulate proposal ─────────────────────────────────────────────────── */

function SimulateCard({ action }: { action: SimulateAction }) {
  const { savedScenarios, setScenarioId, reloadScenarios, setSimResult } = useAtlas();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    if (state === "busy" || state === "done") return;
    setState("busy");
    setError(null);
    const saveAs = nextScenarioId(
      savedScenarios.map((s) => s.id),
      `agent-${action.scenarioName.replace("_", "-")}`,
    );
    simulate({ scenario_name: action.scenarioName, params: action.params, save_as: saveAs })
      .then((result) => {
        setSimResult(result);
        reloadScenarios();
        setScenarioId(saveAs); // flips the canvas to BASELINE | SIMULATION
        setState("done");
      })
      .catch((err: Error) => {
        setError(err.message);
        setState("error");
      });
  }, [state, action, savedScenarios, reloadScenarios, setScenarioId, setSimResult]);

  return (
    <CardShell title={action.title} icon="◈">
      <EngineLine>
        {action.costDeltaPct !== undefined && (
          <>
            cost per parcel{" "}
            <b className={action.costDeltaPct <= 0 ? "text-emerald-400" : "text-rose-400"}>
              {action.costDeltaPct > 0 ? "+" : ""}
              {action.costDeltaPct}%
            </b>
          </>
        )}
        {action.costDeltaPct !== undefined && action.feasible !== undefined && " · "}
        {action.feasible !== undefined &&
          (action.feasible ? (
            <b className="text-emerald-400">network stays feasible</b>
          ) : (
            <b className="text-rose-400">network would NOT be feasible</b>
          ))}
      </EngineLine>

      <CardButton state={state} onClick={run} idleLabel="Run this on the map ▷"
        doneLabel="✓ Running on map — view split screen" />
      {error && <CardError>{error}</CardError>}
    </CardShell>
  );
}

/* ── Optimize proposal ─────────────────────────────────────────────────── */

function OptimizeCard({ action }: { action: OptimizeAction }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResponse | null>(null);

  const run = useCallback(() => {
    if (state === "busy" || state === "done") return;
    setState("busy");
    setError(null);
    // Replay with the agent's own args, untouched.
    optimize(action.optimizeArgs)
      .then((res) => {
        setResult(res);
        setState("done");
      })
      .catch((err: Error) => {
        setError(err.message);
        setState("error");
      });
  }, [state, action]);

  return (
    <CardShell title={action.title} icon="◉">
      {action.changes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {action.changes.map((c, i) => (
            <span
              key={i}
              className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300"
            >
              {(c.action ?? "change").replace("_", " ")} {c.hub_id ?? ""}
            </span>
          ))}
        </div>
      )}
      <EngineLine>
        {action.costBefore !== undefined && action.costAfter !== undefined && (
          <>
            {action.costBefore} → <b className="text-emerald-400">{action.costAfter}</b> AED/parcel
          </>
        )}
        {action.savingsPerParcel !== undefined && (
          <>
            {" · saves "}
            <b className="text-emerald-400">{action.savingsPerParcel} AED/parcel</b>
          </>
        )}
      </EngineLine>

      <CardButton state={state} onClick={run} idleLabel="Run optimizer ▷" doneLabel="✓ Optimizer re-run" />
      {error && <CardError>{error}</CardError>}

      {result && (
        <div className="mt-1 text-[11px] text-slate-300 rounded-lg bg-black/40 border border-white/10 px-3 py-2">
          Fresh engine run: {result.cost_to_serve_before} →{" "}
          <b className="text-emerald-400">{result.cost_to_serve_after}</b> AED/parcel · robust in{" "}
          {result.robustness.feasible_pct}% of {result.robustness.trials} demand trials
        </div>
      )}
    </CardShell>
  );
}

/* ── Shared shell (7X-branded) ─────────────────────────────────────────── */

function CardShell({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div
      className="w-full max-w-[420px] rounded-xl p-3.5 flex flex-col gap-2.5 border bg-black/50"
      style={{
        borderColor: `${BRAND_RED}40`,
        boxShadow: `inset 2px 0 0 ${BRAND_RED}, 0 4px 24px rgba(0,0,0,0.35)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px]" style={{ color: BRAND_RED }}>{icon}</span>
        <span className="text-sm font-bold text-white tracking-wide">{title}</span>
        <span
          className="ml-auto text-[8px] font-mono font-bold tracking-[0.18em] px-1.5 py-0.5 rounded"
          style={{ color: BRAND_RED, background: `${BRAND_RED}18`, border: `1px solid ${BRAND_RED}35` }}
          title="This proposal was produced by the calculation engine during the agent's run — the button replays it for real."
        >
          AGENT PROPOSAL
        </span>
      </div>
      {children}
    </div>
  );
}

function EngineLine({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] text-slate-300"
      title="These figures come from the calculation engine's own result for this proposal — they were not computed by the AI or by this page."
    >
      <span className="text-slate-500 mr-1">Engine verified:</span>
      {children}
    </div>
  );
}

function CardButton({
  state, onClick, idleLabel, doneLabel,
}: {
  state: "idle" | "busy" | "done" | "error";
  onClick: () => void;
  idleLabel: string;
  doneLabel: string;
}) {
  if (state === "done") {
    return <span className="text-xs font-semibold text-emerald-400">{doneLabel}</span>;
  }
  return (
    <button
      onClick={onClick}
      disabled={state === "busy"}
      className="self-start text-xs font-bold px-4 py-2 rounded-lg text-white cursor-pointer
                 transition-all duration-150 disabled:opacity-60"
      style={{ background: BRAND_RED, boxShadow: `0 0 18px ${BRAND_RED}55` }}
      title="Runs this exact proposal through the engine and shows it on the map next to today's network"
    >
      {state === "busy" ? "Running…" : idleLabel}
    </button>
  );
}

function CardError({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] px-3 py-2 rounded-lg text-rose-400 bg-rose-500/10 border border-rose-500/20">
      {children}
    </div>
  );
}
