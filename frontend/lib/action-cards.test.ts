/**
 * Action cards lift actionable proposals out of an agent's tool-call trace.
 * Pure selection + labelling: every figure shown comes verbatim from the
 * trace's engine results — these tests pin that nothing is computed here.
 */
import { describe, expect, it } from "vitest";
import { describeScenario, extractActions } from "./action-cards";
import type { HubMapInfo, ToolCallTrace } from "./types";

const hub = (id: string, name: string): HubMapInfo => ({
  id, name, lat: 25, lon: 55, emirate: "Ajman", capacity: 1000, status: "open",
  utilization_pct: 10, spare_capacity: 900, cost_to_serve: 50,
});
const HUBS = [hub("H3", "Ajman Hub 1"), hub("H1", "Abu Dhabi Hub 1")];

describe("describeScenario — plain language for all six scenario types", () => {
  it("close_hub names the actual hub", () => {
    expect(describeScenario("close_hub", { hub_id: "H3" }, HUBS)).toBe("Close Ajman Hub 1");
  });
  it("falls back to the id when the hub is unknown", () => {
    expect(describeScenario("close_hub", { hub_id: "H9" }, HUBS)).toBe("Close H9");
  });
  it("demand_scale shows the signed percentage", () => {
    expect(describeScenario("demand_scale", { factor: 1.3 }, HUBS)).toBe("Demand +30%");
    expect(describeScenario("demand_scale", { factor: 0.8 }, HUBS)).toBe("Demand −20%");
  });
  it("add_hub uses the proposed name", () => {
    expect(describeScenario("add_hub", { id: "NEW-H1", name: "Fujairah North" }, HUBS)).toBe(
      "Add hub Fujairah North",
    );
  });
  it("add_customer uses the proposed name", () => {
    expect(describeScenario("add_customer", { id: "NEW-C1", name: "Port FZ" }, HUBS)).toBe(
      "Add customer Port FZ",
    );
  });
  it("move_hub names the hub being moved", () => {
    expect(describeScenario("move_hub", { hub_id: "H1", lat: 24, lon: 54 }, HUBS)).toBe(
      "Move Abu Dhabi Hub 1",
    );
  });
  it("change_fleet_mix names the fleet and count", () => {
    expect(
      describeScenario("change_fleet_mix", { fleet_type_id: "F2", count_available: 40 }, HUBS),
    ).toBe("Fleet F2 → 40 vehicles");
  });
});

describe("extractActions — lifts engine outcomes verbatim from the trace", () => {
  const simulateCall: ToolCallTrace = {
    tool: "simulate_scenario",
    args: { scenario_name: "close_hub", params: { hub_id: "H3" } },
    result: {
      scenario_name: "close_hub",
      delta_pct: { cost_to_serve: -4.2, utilization: 1.1 },
      scenario_flow_feasible: true,
    },
  };
  const optimizeCall: ToolCallTrace = {
    tool: "optimise_network",
    args: { optimizer_name: "milp_cflp" },
    result: {
      changes: [{ action: "close_hub", hub_id: "H1" }, { action: "close_hub", hub_id: "H3" }],
      cost_to_serve_before: 57.09,
      cost_to_serve_after: 54.1,
      cost_to_serve_savings_per_parcel: 2.99,
    },
  };

  it("returns one simulate action with the engine's own delta and feasibility", () => {
    const actions = extractActions([simulateCall], HUBS);
    expect(actions).toHaveLength(1);
    const a = actions[0];
    if (a.kind !== "simulate") throw new Error(`expected simulate, got ${a.kind}`);
    expect(a.title).toBe("Close Ajman Hub 1");
    expect(a.scenarioName).toBe("close_hub");
    expect(a.params).toEqual({ hub_id: "H3" });
    expect(a.costDeltaPct).toBe(-4.2); // verbatim from result — never derived
    expect(a.feasible).toBe(true);
  });

  it("returns an optimize action carrying the changes and savings verbatim", () => {
    const actions = extractActions([optimizeCall], HUBS);
    expect(actions).toHaveLength(1);
    const a = actions[0];
    if (a.kind !== "optimize") throw new Error(`expected optimize, got ${a.kind}`);
    expect(a.changes).toEqual(
      (optimizeCall.result as { changes: unknown }).changes,
    );
    expect(a.savingsPerParcel).toBe(2.99);
    expect(a.optimizeArgs).toEqual({ optimizer_name: "milp_cflp" });
  });

  it("ignores non-actionable tools and calls with missing results", () => {
    const noise: ToolCallTrace[] = [
      { tool: "get_kpis", args: {}, result: { cost_to_serve: {} } },
      { tool: "simulate_scenario", args: { scenario_name: "close_hub", params: {} }, result: null },
    ];
    expect(extractActions(noise, HUBS)).toHaveLength(0);
  });

  it("handles several proposals in one answer", () => {
    expect(extractActions([simulateCall, optimizeCall, simulateCall], HUBS)).toHaveLength(3);
  });
});
