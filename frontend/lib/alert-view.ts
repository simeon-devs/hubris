// Shared presentation helpers for watchdog alerts (T-40). These compose
// LABELS around the engine's computed finding — every number shown is a
// field from the API rendered verbatim; nothing is calculated here.

import type { AlertFinding, AlertAction } from "@/lib/types";

/** One-line headline for an alert card, from the computed finding. */
export function alertHeadline(finding: AlertFinding): string {
  if (!finding.feasible) {
    return `${finding.target}: cannot serve all demand`;
  }
  return `${finding.target}: ${finding.hottest_hub ?? "a hub"} at ${finding.hottest_utilization_pct}% — above the ${finding.hot_threshold_pct}% line`;
}

/** Per-zone unserved demand, verbatim from the flow solve. */
export function unmetLines(finding: AlertFinding): string[] {
  return Object.entries(finding.unmet_demand).map(
    ([zone, qty]) => `${zone.replace(/_/g, " ")} — ${qty} parcels/day unserved`,
  );
}

/** The engine-verified saving carried on the recommended action, if any.
 *  (Computed by re-solving the flow server-side — see action.source_tool.) */
export function alertSavings(action: AlertAction): number | null {
  if (typeof action.detail === "object" && action.detail !== null) {
    const value = (action.detail as { verified_cost_savings?: unknown }).verified_cost_savings;
    if (typeof value === "number") return value;
  }
  return null;
}

/** Short human label for the recommended action. */
export function actionLabel(action: AlertAction): string {
  if (action.action === "add_capacity" && typeof action.detail === "object" && action.detail) {
    const d = action.detail as { hub_id?: unknown; unlock_units?: unknown };
    if (typeof d.hub_id === "string" && typeof d.unlock_units === "number") {
      return `Add ${d.unlock_units} units at ${d.hub_id}`;
    }
  }
  if (action.action === "review_robustness") return "Review robustness band";
  return action.action.replace(/_/g, " ");
}
