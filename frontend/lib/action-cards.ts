/**
 * Action-card extraction — turns an agent's tool-call trace into actionable
 * proposals the UI can run on the map.
 *
 * Selection and labelling ONLY. Deltas, feasibility, changes and savings are
 * lifted VERBATIM from each call's engine result (`ToolCallTrace.result`) —
 * the honesty rule (lib/api.ts, CLAUDE.md §2) means nothing here computes,
 * rounds, or combines a figure.
 */

import type { HubMapInfo, ToolCallTrace } from "./types";

export interface SimulateAction {
  kind: "simulate";
  title: string;
  scenarioName: string;
  params: Record<string, unknown>;
  /** Engine's delta_pct.cost_to_serve, verbatim. undefined if absent. */
  costDeltaPct: number | undefined;
  /** Engine's scenario_flow_feasible, verbatim. */
  feasible: boolean | undefined;
}

export interface OptimizeAction {
  kind: "optimize";
  title: string;
  changes: { action?: string; hub_id?: string }[];
  savingsPerParcel: number | undefined;
  costBefore: number | undefined;
  costAfter: number | undefined;
  /** The exact args the agent used — replayed unchanged on click. */
  optimizeArgs: Record<string, unknown>;
}

export type AgentAction = SimulateAction | OptimizeAction;

/** Plain-language title for each of the six scenario types. */
export function describeScenario(
  scenarioName: string,
  params: Record<string, unknown>,
  hubs: HubMapInfo[],
): string {
  const hubName = (id: unknown): string =>
    hubs.find((h) => h.id === id)?.name ?? String(id ?? "hub");

  switch (scenarioName) {
    case "close_hub":
      return `Close ${hubName(params.hub_id)}`;
    case "move_hub":
      return `Move ${hubName(params.hub_id)}`;
    case "add_hub":
      return `Add hub ${String(params.name ?? params.id ?? "")}`.trim();
    case "add_customer":
      return `Add customer ${String(params.name ?? params.id ?? "")}`.trim();
    case "demand_scale": {
      const factor = typeof params.factor === "number" ? params.factor : 1;
      const pct = Math.round((factor - 1) * 100);
      return `Demand ${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;
    }
    case "change_fleet_mix":
      return `Fleet ${String(params.fleet_type_id ?? "?")} → ${String(params.count_available ?? "?")} vehicles`;
    default:
      return scenarioName;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Every actionable proposal in a trace, in trace order. */
export function extractActions(toolCalls: ToolCallTrace[], hubs: HubMapInfo[]): AgentAction[] {
  const actions: AgentAction[] = [];

  for (const call of toolCalls) {
    const result = asRecord(call.result);
    if (!result) continue; // no engine result — nothing to promise

    if (call.tool === "simulate_scenario") {
      const args = asRecord(call.args) ?? {};
      const scenarioName = String(args.scenario_name ?? result.scenario_name ?? "");
      const params = asRecord(args.params) ?? {};
      if (!scenarioName) continue;
      const deltaPct = asRecord(result.delta_pct);
      actions.push({
        kind: "simulate",
        title: describeScenario(scenarioName, params, hubs),
        scenarioName,
        params,
        costDeltaPct:
          typeof deltaPct?.cost_to_serve === "number" ? deltaPct.cost_to_serve : undefined,
        feasible:
          typeof result.scenario_flow_feasible === "boolean"
            ? result.scenario_flow_feasible
            : undefined,
      });
    }

    if (call.tool === "optimise_network") {
      const changes = Array.isArray(result.changes)
        ? (result.changes as { action?: string; hub_id?: string }[])
        : [];
      actions.push({
        kind: "optimize",
        title: "Apply recommended network shape",
        changes,
        savingsPerParcel:
          typeof result.cost_to_serve_savings_per_parcel === "number"
            ? result.cost_to_serve_savings_per_parcel
            : undefined,
        costBefore:
          typeof result.cost_to_serve_before === "number" ? result.cost_to_serve_before : undefined,
        costAfter:
          typeof result.cost_to_serve_after === "number" ? result.cost_to_serve_after : undefined,
        optimizeArgs: asRecord(call.args) ?? {},
      });
    }
  }

  return actions;
}
