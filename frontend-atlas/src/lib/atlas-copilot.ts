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
import { targetForZone } from "@/lib/atlas-alerts";
import { DARK_STORES, HUBS, OD_NETWORK } from "@/lib/atlas-data";

export type CopilotPill = "verified" | "self-corrected" | "flagged";

export interface CopilotAnswer {
  text: string;
  pill: CopilotPill;
  mapTarget?: { lat: number; lng: number; zoom?: number; label: string; hubId?: string } | undefined;
  toolCalls: { tool: string; summary: string }[];
  untraceableFigures: number[];
}

export interface PresetQuestion {
  q: string;
  short: string;
  // Chips about the dark-store crisis bind the agent's tools to the
  // qcomm_twin scenario — the accurate context for those questions.
  scenarioId?: string;
}

export const PRESET_QUESTIONS: PresetQuestion[] = [
  { q: "Which hub breaks first if demand keeps growing, and at what growth?", short: "Which hub breaks first?" },
  // "Run", not "use": live-caught — with no frontier episode in memory the
  // agent read "use the frontier" as a lookup, found nothing, and asked
  // the user for data instead of running its own optimise_frontier tool.
  { q: "Run the frontier optimisation now: compare the raw optimal network shape with the resilience-constrained recommendation, both cost pools, and the resilience premium.", short: "Best network shape?" },
  { q: "Simulate closing hub HUB_RAK_01 (Ras Al Khaimah): what happens to cost, utilization and feasibility?", short: "Close the RAK hub?" },
  { q: "Why is Fujairah so expensive per shipment?", short: "Why is Fujairah expensive?" },
  { q: "What is wrong with this dark-store network? Check demand served and utilization.", short: "Dark-store crisis?", scenarioId: "qcomm_twin" },
  { q: "Find the cheapest verified capacity fix for the unserved Abu Dhabi demand.", short: "Cheapest fix for Abu Dhabi?", scenarioId: "qcomm_twin" },
];

type MapTarget = NonNullable<CopilotAnswer["mapTarget"]>;

/** Every known facility, resolvable by its engine id. hubId rides along so
 *  the map page can SELECT the target (open its live card), not just fly;
 *  zoom 13 lands close enough to read the pin (OD stays wide — it is a
 *  coverage blob, not a point). */
const FACILITY_TARGET = new Map<string, MapTarget>();
for (const h of HUBS) FACILITY_TARGET.set(h.id, { lat: h.lat, lng: h.lng, zoom: 13, label: h.name, hubId: h.id });
for (const s of DARK_STORES) FACILITY_TARGET.set(s.id, { lat: s.lat, lng: s.lng, zoom: 13, label: s.name, hubId: s.id });
for (const o of OD_NETWORK) FACILITY_TARGET.set(o.id, { lat: o.lat, lng: o.lng, zoom: 10, label: `${o.emirate} On-Demand`, hubId: o.id });

/** Every string anywhere in a tool payload — values AND keys, since the
 *  engine uses zone ids as dict keys (e.g. unmet_demand). */
function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (value == null || depth > 8) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push(k);
      collectStrings(v, out, depth + 1);
    }
  }
}

/** Resolve an answer to map coordinates. Candidates come ONLY from the
 *  tool payloads (the map can never point anywhere a tool didn't actually
 *  go); among them, the one the answer's own prose mentions most wins —
 *  the old first-id-scanned rule pinned "which hub breaks first" to
 *  whichever hub the agent happened to test first, and found nothing at
 *  all when the id sat one level deep (recommendation.hub_id,
 *  changes[].hub_id). Zone ids resolve through the alerts' own
 *  zone-of-concern helper, so both features point the same way. */
export function resolveMapTarget(toolCalls: ApiToolCall[], answer: string): CopilotAnswer["mapTarget"] {
  const strings: string[] = [];
  for (const call of toolCalls) {
    collectStrings(call.args, strings);
    collectStrings(call.result, strings);
  }

  const lowerAnswer = answer.toLowerCase();
  const mentions = (needle: string): number =>
    needle ? lowerAnswer.split(needle.toLowerCase()).length - 1 : 0;

  // Engine zone ids always start with an emirate ("Abu_Dhabi-Al_Reem").
  // Without this gate, any hyphenated PROSE inside a tool result parses as
  // a zone — live-caught: "cost-to-serve" split to zone name "to", which
  // matched Downtown and out-mentioned every real candidate.
  const emirates = new Set(
    [...HUBS, ...DARK_STORES, ...OD_NETWORK].map((e) => e.emirate.toLowerCase()),
  );
  const looksLikeZoneId = (s: string): boolean =>
    s.length < 64 && emirates.has((s.split("-")[0] ?? "").replace(/_/g, " ").trim().toLowerCase());

  interface Candidate {
    target: MapTarget;
    score: number;
    facility: boolean;
    order: number;
  }
  const candidates = new Map<string, Candidate>();
  strings.forEach((s, order) => {
    const facility = FACILITY_TARGET.get(s);
    if (facility) {
      if (!candidates.has(s)) {
        candidates.set(s, {
          target: facility,
          score: mentions(s) + mentions(facility.label),
          facility: true,
          order,
        });
      }
      return;
    }
    if (!looksLikeZoneId(s)) return;
    const zone = targetForZone(s, "");
    if (zone && !candidates.has(zone.label)) {
      candidates.set(zone.label, {
        target: {
          lat: zone.lat,
          lng: zone.lng,
          zoom: 13,
          label: zone.label,
          ...(zone.hubId ? { hubId: zone.hubId } : {}),
        },
        score: mentions(zone.label),
        facility: false,
        order,
      });
    }
  });

  const ranked = [...candidates.values()].sort(
    (a, b) => b.score - a.score || Number(b.facility) - Number(a.facility) || a.order - b.order,
  );
  return ranked[0]?.target;
}

function summarizeToolCall(call: ApiToolCall): string {
  const argKeys = Object.keys(call.args ?? {}).filter((k) => k !== "model");
  return argKeys.length ? `${call.tool}(${argKeys.join(", ")})` : call.tool;
}

export async function answerQuestion(raw: string, scenarioId?: string): Promise<CopilotAnswer> {
  const response = await queryAgent(raw, scenarioId ?? null);
  const pill: CopilotPill =
    response.verification.status === "verified"
      ? "verified"
      : response.verification.status === "regenerated"
        ? "self-corrected"
        : "flagged";
  return {
    text: response.answer,
    pill,
    mapTarget: resolveMapTarget(response.tool_calls, response.answer),
    toolCalls: response.tool_calls.map((c) => ({ tool: c.tool, summary: summarizeToolCall(c) })),
    untraceableFigures: response.verification.untraceable_figures,
  };
}
