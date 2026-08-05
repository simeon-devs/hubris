/**
 * Atlas AI Copilot — the ACCURATE chat (Sims' rule: the chat always gives
 * the real answer, preset or typed).
 *
 * Every question — chip or free text — goes to POST /agent/query: the LLM
 * orchestrates real engine tools, and the runtime provenance verifier
 * checks every figure in the prose against the tool results before the
 * answer reaches this client. Nothing is generated locally; the presets
 * below are canned QUESTIONS only, never canned answers.
 *
 * verification.status mapping: verified -> "verified",
 * regenerated -> "self-corrected" (the guardrail caught the first draft
 * and forced a correction that then verified), flagged -> "flagged" with
 * the exact untraceable figures carried for display.
 */

import { queryAgent, type ApiToolCall } from "@/lib/api";
import { DARK_STORES, HUBS, OD_NETWORK } from "@/lib/atlas-data";

export type CopilotPill = "verified" | "self-corrected" | "flagged";

export interface CopilotAnswer {
  text: string;
  pill: CopilotPill;
  mapTarget?: { lat: number; lng: number; zoom?: number; label: string } | undefined;
  toolCalls: { tool: string; summary: string }[];
  untraceableFigures: number[];
}

export const PRESET_QUESTIONS: string[] = [
  "Which hub breaks first if demand keeps growing?",
  "What is the best network shape, and what would you actually recommend?",
  "What happens if we close the RAK hub?",
  "Why is Fujairah so expensive per shipment?",
  "What is wrong with the dark-store network?",
  "What is the cheapest verified fix for the Abu Dhabi shortfall?",
];

/** Resolve the first entity id an answer's tool calls touched to map
 *  coordinates (hubs, dark stores, then On-Demand fleets). */
function resolveMapTarget(toolCalls: ApiToolCall[]): CopilotAnswer["mapTarget"] {
  const ids: string[] = [];
  for (const call of toolCalls) {
    const args = (call.args ?? {}) as Record<string, unknown>;
    for (const key of ["hub_id", "params"]) {
      const value = args[key];
      if (typeof value === "string") ids.push(value);
      if (value && typeof value === "object") {
        const inner = (value as Record<string, unknown>)["hub_id"];
        if (typeof inner === "string") ids.push(inner);
      }
    }
    const result = call.result as Record<string, unknown> | null | undefined;
    if (result && typeof result === "object") {
      for (const key of ["hub_id", "hottest_hub"]) {
        const value = result[key];
        if (typeof value === "string") ids.push(value);
      }
    }
  }
  for (const id of ids) {
    const hub = HUBS.find((h) => h.id === id);
    if (hub) return { lat: hub.lat, lng: hub.lng, zoom: 12, label: hub.name };
    const store = DARK_STORES.find((s) => s.id === id);
    if (store) return { lat: store.lat, lng: store.lng, zoom: 12, label: store.name };
    const od = OD_NETWORK.find((o) => o.id === id);
    if (od) return { lat: od.lat, lng: od.lng, zoom: 10, label: `${od.emirate} On-Demand` };
  }
  return undefined;
}

function summarizeToolCall(call: ApiToolCall): string {
  const argKeys = Object.keys(call.args ?? {}).filter((k) => k !== "model");
  return argKeys.length ? `${call.tool}(${argKeys.join(", ")})` : call.tool;
}

export async function answerQuestion(raw: string): Promise<CopilotAnswer> {
  const response = await queryAgent(raw);
  const pill: CopilotPill =
    response.verification.status === "verified"
      ? "verified"
      : response.verification.status === "regenerated"
        ? "self-corrected"
        : "flagged";
  return {
    text: response.answer,
    pill,
    mapTarget: resolveMapTarget(response.tool_calls),
    toolCalls: response.tool_calls.map((c) => ({ tool: c.tool, summary: summarizeToolCall(c) })),
    untraceableFigures: response.verification.untraceable_figures,
  };
}
