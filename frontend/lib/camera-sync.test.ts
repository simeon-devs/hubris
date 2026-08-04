/**
 * The dual-map camera sync must mirror movement both ways WITHOUT feeding
 * back: a real map fires "move" when jumpTo() is called on it, so naive
 * wiring (A move → jumpTo B → B move → jumpTo A → …) loops forever. The
 * FakeMap below reproduces that behaviour — jumpTo emits "move"
 * synchronously — so these tests fail by stack overflow if the guard is
 * missing, and by assertion if mirroring is wrong.
 */
import { describe, expect, it } from "vitest";
import { createCameraSync, type CameraState, type SyncableCamera } from "./camera-sync";

class FakeMap implements SyncableCamera {
  center: [number, number] = [54.9, 24.8];
  zoom = 6.9;
  bearing = -18;
  pitch = 52;
  jumpToCalls = 0;
  private handlers: Array<() => void> = [];

  on(_event: "move", handler: () => void): void {
    this.handlers.push(handler);
  }
  off(_event: "move", handler: () => void): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }
  jumpTo(camera: CameraState): void {
    this.jumpToCalls++;
    this.center = camera.center;
    this.zoom = camera.zoom;
    this.bearing = camera.bearing;
    this.pitch = camera.pitch;
    this.emitMove(); // real maplibre-style maps fire "move" on jumpTo
  }
  getCenter(): [number, number] {
    return this.center;
  }
  getZoom(): number {
    return this.zoom;
  }
  getBearing(): number {
    return this.bearing;
  }
  getPitch(): number {
    return this.pitch;
  }

  /** A user gesture: the camera changes, then "move" fires. */
  userMove(camera: Partial<CameraState>): void {
    if (camera.center) this.center = camera.center;
    if (camera.zoom !== undefined) this.zoom = camera.zoom;
    if (camera.bearing !== undefined) this.bearing = camera.bearing;
    if (camera.pitch !== undefined) this.pitch = camera.pitch;
    this.emitMove();
  }
  private emitMove(): void {
    [...this.handlers].forEach((h) => h());
  }
}

describe("createCameraSync", () => {
  it("mirrors a user move on the left map to the right map", () => {
    const left = new FakeMap();
    const right = new FakeMap();
    createCameraSync([left, right]);

    left.userMove({ center: [55.3, 25.2], zoom: 9, bearing: 30, pitch: 45 });

    expect(right.getCenter()).toEqual([55.3, 25.2]);
    expect(right.getZoom()).toBe(9);
    expect(right.getBearing()).toBe(30);
    expect(right.getPitch()).toBe(45);
  });

  it("mirrors the reverse direction too", () => {
    const left = new FakeMap();
    const right = new FakeMap();
    createCameraSync([left, right]);

    right.userMove({ zoom: 11 });

    expect(left.getZoom()).toBe(11);
  });

  it("does not bounce the mirrored move back to the source", () => {
    const left = new FakeMap();
    const right = new FakeMap();
    createCameraSync([left, right]);

    left.userMove({ zoom: 8 });

    // One jumpTo onto the follower; the follower's own "move" event (fired
    // synchronously inside jumpTo) must NOT jump the source back.
    expect(right.jumpToCalls).toBe(1);
    expect(left.jumpToCalls).toBe(0);
  });

  it("detach() stops all mirroring", () => {
    const left = new FakeMap();
    const right = new FakeMap();
    const detach = createCameraSync([left, right]);

    detach();
    left.userMove({ zoom: 12 });

    expect(right.getZoom()).toBe(6.9); // untouched
    expect(right.jumpToCalls).toBe(0);
  });

  it("keeps any number of maps in step", () => {
    const maps = [new FakeMap(), new FakeMap(), new FakeMap()];
    createCameraSync(maps);

    maps[1].userMove({ bearing: 90 });

    expect(maps[0].getBearing()).toBe(90);
    expect(maps[2].getBearing()).toBe(90);
    expect(maps[1].jumpToCalls).toBe(0);
  });
});
