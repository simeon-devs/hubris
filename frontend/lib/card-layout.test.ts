/**
 * Card collision layout: hub cards may NEVER overlap each other or the
 * result card. Deterministic push-up-then-right resolution.
 */
import { describe, expect, it } from "vitest";
import { intersects, resolveCardPositions, type Anchor, type Rect } from "./card-layout";

const CARD_W = 172;
const CARD_H = 74;

const anchor = (id: string, x: number, y: number, offX = -120, offY = -46): Anchor => ({
  id, x, y, offX, offY,
});

describe("intersects", () => {
  it("detects overlap and clean separation", () => {
    const a: Rect = { x: 0, y: 0, w: 100, h: 50 };
    expect(intersects(a, { x: 50, y: 20, w: 100, h: 50 })).toBe(true);
    expect(intersects(a, { x: 200, y: 0, w: 100, h: 50 })).toBe(false);
  });
});

describe("resolveCardPositions", () => {
  it("keeps a lone card at its preferred offset (card sits above the anchor)", () => {
    const out = resolveCardPositions([anchor("A", 500, 400)], CARD_W, CARD_H, []);
    expect(out.get("A")).toEqual({ x: 500 - 120, y: 400 - 46 - CARD_H });
  });

  it("separates two cards that would overlap", () => {
    const out = resolveCardPositions(
      [anchor("A", 500, 400), anchor("B", 510, 405)],
      CARD_W, CARD_H, [],
    );
    const a = out.get("A")!, b = out.get("B")!;
    expect(
      intersects(
        { x: a.x, y: a.y, w: CARD_W, h: CARD_H },
        { x: b.x, y: b.y, w: CARD_W, h: CARD_H },
      ),
    ).toBe(false);
  });

  it("avoids obstacle rectangles (the result card)", () => {
    const obstacle: Rect = { x: 300, y: 280, w: 250, h: 120 };
    const out = resolveCardPositions([anchor("A", 500, 400)], CARD_W, CARD_H, [obstacle]);
    const a = out.get("A")!;
    expect(intersects({ x: a.x, y: a.y, w: CARD_W, h: CARD_H }, obstacle)).toBe(false);
  });

  it("is deterministic for the same input", () => {
    const anchors = [anchor("A", 500, 400), anchor("B", 505, 402), anchor("C", 495, 398)];
    const a = resolveCardPositions(anchors, CARD_W, CARD_H, []);
    const b = resolveCardPositions(anchors, CARD_W, CARD_H, []);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("never leaves any pair overlapping, even with many stacked anchors", () => {
    const anchors = Array.from({ length: 6 }, (_, i) => anchor(`H${i}`, 500 + i * 4, 400 + i * 3));
    const out = resolveCardPositions(anchors, CARD_W, CARD_H, []);
    const rects = [...out.values()].map((p) => ({ x: p.x, y: p.y, w: CARD_W, h: CARD_H }));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++)
        expect(intersects(rects[i], rects[j])).toBe(false);
  });
});
