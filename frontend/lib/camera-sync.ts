/**
 * Bidirectional camera synchronisation for side-by-side map panes.
 *
 * The trap: calling jumpTo() on the follower fires its own "move" event,
 * which would jump the source back — an infinite loop. A single lock flag
 * breaks the cycle: while one map is being followed, every other map's
 * handler is a no-op. jumpTo is synchronous in maplibre-style SDKs, so a
 * plain boolean is sufficient — no re-entrancy beyond the locked window.
 *
 * SDK-agnostic on purpose (SyncableCamera, not tt.Map): the logic is pure
 * and unit-tested with fake maps; components adapt the real SDK to it.
 */

export interface CameraState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface SyncableCamera {
  on(event: "move", handler: () => void): void;
  off(event: "move", handler: () => void): void;
  jumpTo(camera: CameraState): void;
  getCenter(): [number, number];
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
}

/** Keep every map's camera in step. Returns a detach function. */
export function createCameraSync(maps: SyncableCamera[]): () => void {
  let locked = false;

  const entries = maps.map((source) => {
    const handler = () => {
      if (locked) return;
      locked = true;
      const camera: CameraState = {
        center: source.getCenter(),
        zoom: source.getZoom(),
        bearing: source.getBearing(),
        pitch: source.getPitch(),
      };
      for (const follower of maps) {
        if (follower !== source) follower.jumpTo(camera);
      }
      locked = false;
    };
    source.on("move", handler);
    return { source, handler };
  });

  return () => {
    for (const { source, handler } of entries) source.off("move", handler);
  };
}
