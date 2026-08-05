/**
 * Deterministic card layout for map-anchored glass cards: each card starts at
 * its anchor + preferred offset and is pushed UP (16px steps), then shifted
 * RIGHT (24px) and retried, until it overlaps neither the already-placed
 * cards nor any obstacle (e.g. the open result card). Pure and frame-safe.
 */

export interface Rect { x: number; y: number; w: number; h: number }

export interface Anchor {
  id: string;
  /** Anchor point on screen (the hub's projected position). */
  x: number;
  y: number;
  /** Preferred card offset from the anchor (top-left of the card). */
  offX: number;
  offY: number;
}

const PUSH_UP = 16;
const PUSH_RIGHT = 24;
const MAX_UP_STEPS = 14;
const MAX_RIGHT_STEPS = 8;

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function resolveCardPositions(
  anchors: Anchor[],
  cardW: number,
  cardH: number,
  obstacles: Rect[],
): Map<string, { x: number; y: number }> {
  const placed: Rect[] = [...obstacles];
  const out = new Map<string, { x: number; y: number }>();

  for (const a of anchors) {
    let pos = { x: a.x + a.offX, y: a.y + a.offY - cardH };
    let found = false;
    for (let right = 0; right <= MAX_RIGHT_STEPS && !found; right++) {
      for (let up = 0; up <= MAX_UP_STEPS; up++) {
        const candidate = {
          x: a.x + a.offX + right * PUSH_RIGHT,
          y: a.y + a.offY - cardH - up * PUSH_UP,
        };
        const rect: Rect = { ...candidate, w: cardW, h: cardH };
        if (!placed.some((p) => intersects(rect, p))) {
          pos = candidate;
          found = true;
          break;
        }
      }
    }
    placed.push({ x: pos.x, y: pos.y, w: cardW, h: cardH });
    out.set(a.id, pos);
  }
  return out;
}
