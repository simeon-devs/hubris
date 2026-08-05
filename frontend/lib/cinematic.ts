/**
 * Cinematic display helpers for the map redesign.
 *
 * Pillar height is a DISPLAY encoding (screen metres, like line width) — the
 * engine's required_headcount drives it, but the tallest pillar renders at
 * exactly 2.5× the shortest so the skyline reads at a glance. The precise
 * figures live in the callouts and tooltips, verbatim.
 */

import type { HubMapInfo } from "./types";

export const PILLAR_BASE_HEIGHT_M = 3_000;
export const PILLAR_MAX_HEIGHT_M = PILLAR_BASE_HEIGHT_M * 2.5;

// ── Intro-flight flag — module scope: survives route switches, resets on a
// full page refresh. Command reads it to time its panel slide-ins.
let introPlayedFlag = false;
export function introHasPlayed(): boolean {
  return introPlayedFlag;
}
export function markIntroPlayed(): void {
  introPlayedFlag = true;
}

/** Height for one hub, normalized across the whole dataset. */
export function normalizedPillarHeight(hub: HubMapInfo, hubs: HubMapInfo[]): number {
  const values = hubs.map((h) => h.required_headcount ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max <= min) return PILLAR_BASE_HEIGHT_M; // flat dataset — nothing to rank
  const t = ((hub.required_headcount ?? 0) - min) / (max - min);
  return Math.round(PILLAR_BASE_HEIGHT_M + t * (PILLAR_MAX_HEIGHT_M - PILLAR_BASE_HEIGHT_M));
}

export interface StoryBeats {
  /** Highest required_headcount — the network's busiest hub. */
  busiest: HubMapInfo;
  /** Highest utilization_pct — the hub closest to its ceiling. */
  stressed: HubMapInfo;
}

/** The two hubs the story visits, chosen by single engine fields. */
export function pickStoryBeats(hubs: HubMapInfo[]): StoryBeats | null {
  if (hubs.length === 0) return null;
  const by = <K extends "required_headcount" | "utilization_pct">(key: K) =>
    [...hubs].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))[0];
  return { busiest: by("required_headcount"), stressed: by("utilization_pct") };
}

/** Callout ranking: the N busiest hubs by the same single engine field. */
export function topCalloutHubs(hubs: HubMapInfo[], n = 4): HubMapInfo[] {
  return [...hubs].sort((a, b) => (b.required_headcount ?? 0) - (a.required_headcount ?? 0)).slice(0, n);
}
