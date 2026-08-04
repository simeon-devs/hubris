"use client";

/**
 * NetworkMap — TomTom 3D workforce view, now with Comparison Mode.
 *
 * Single mode: one full-width pane. Comparison mode (a scenario is selected):
 * two synchronized panes — BASELINE left, SIMULATION right — cameras mirrored
 * both ways via lib/camera-sync (unit-tested; jumpTo feedback is the trap).
 *
 * Layers per pane:
 *   pillars    fill-extrusion, height = required_headcount (engine)
 *   corridors  animated dashed lines along the min-cost-flow solver's real
 *              hub→zone flows (lib/corridors selects, never computes)
 *   buildings  city geometry under the data layers
 *
 * The Main Magazine (hub id "MAGAZINE") is REAL model data — created via the
 * add_hub scenario, so the solver genuinely routes flow through it. Gold is
 * its visual identity; its numbers are the engine's, same as every hub.
 * Corridor costs come from GET /route-cost (engine) — clicking a corridor
 * fetches, never calculates (CLAUDE.md §2).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import tt from "@tomtom-international/web-sdk-maps";
import "@tomtom-international/web-sdk-maps/dist/maps.css";
import type { BuildPick } from "@/lib/build";
import { createCameraSync, type CameraState, type SyncableCamera } from "@/lib/camera-sync";
import { buildCorridors, MAGAZINE_HUB_ID, type CorridorMode } from "@/lib/corridors";
import { getRouteCost } from "@/lib/api";
import type {
  FlowMapInfo,
  HubMapInfo,
  NetworkMapResponse,
  RouteCostResponse,
  ZoneMapInfo,
} from "@/lib/types";

const TOMTOM_KEY = process.env.NEXT_PUBLIC_TOMTOM_KEY ?? "";

const PILLAR_SOURCE = "hubris-workforce-src";
const PILLAR_LAYER = "hubris-workforce-pillars";
const GLOW_LAYER = "hubris-workforce-glow";
const BUILDINGS_LAYER = "hubris-3d-buildings";
const CORRIDOR_SOURCE = "hubris-corridor-src";
const CORRIDOR_LAYER = "hubris-corridors";
const CORRIDOR_HIT_LAYER = "hubris-corridors-hit";
const PENDING_SOURCE = "hubris-pending-src";
const PENDING_LAYER = "hubris-pending-marker";

// Signal palette — tailwind.config.js control-tower accents + magazine gold.
const COLOR_UNDERSTAFFED = "#ef4444";
const COLOR_STAFFED = "#06b6d4";
const COLOR_CLOSED = "#475569";
const COLOR_MAGAZINE = "#f59e0b";
const COLOR_CORRIDOR = "#22d3ee";

const PILLAR_RADIUS_M = 6_000;
const METRES_PER_COURIER = 14_000;
const MIN_PILLAR_HEIGHT_M = 6_000;

const EARTH_M_PER_DEG_LAT = 110_540;
const EARTH_M_PER_DEG_LON = 111_320;

const INITIAL_CAMERA: CameraState = {
  center: [54.9, 24.8],
  zoom: 6.9,
  pitch: 52,
  bearing: -18,
};

/** Classic maplibre "marching ants": cycle the dash phase each tick. */
const DASH_SEQUENCE: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
];
const DASH_TICK_MS = 90;

type Ring = [number, number][];

function polygonAround(lon: number, lat: number, radiusM: number, sides = 8): Ring {
  const dLat = radiusM / EARTH_M_PER_DEG_LAT;
  const dLon = radiusM / (EARTH_M_PER_DEG_LON * Math.cos((lat * Math.PI) / 180));
  const ring: Ring = [];
  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return ring;
}

/** GeoJSON for the pending-build pulse — an empty collection clears it. */
function pendingToFeature(marker: { lat: number; lon: number } | null) {
  return {
    type: "FeatureCollection" as const,
    features: marker
      ? [
          {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [marker.lon, marker.lat] },
            properties: {},
          },
        ]
      : [],
  };
}

function pillarColor(hub: HubMapInfo): string {
  if (hub.id === MAGAZINE_HUB_ID) return COLOR_MAGAZINE; // visual identity, not a number
  if (hub.status !== "open") return COLOR_CLOSED;
  return hub.gap_direction === "understaffed" ? COLOR_UNDERSTAFFED : COLOR_STAFFED;
}

function pillarHeight(hub: HubMapInfo): number {
  const couriers = hub.required_headcount ?? 0;
  return Math.max(MIN_PILLAR_HEIGHT_M, couriers * METRES_PER_COURIER);
}

function toPillarCollection(hubs: HubMapInfo[]) {
  return {
    type: "FeatureCollection" as const,
    features: hubs.map((hub) => ({
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [polygonAround(hub.lon, hub.lat, PILLAR_RADIUS_M)],
      },
      properties: {
        id: hub.id,
        height: pillarHeight(hub),
        color: pillarColor(hub),
      },
    })),
  };
}

/** Adapt a tt.Map to the SDK-agnostic camera interface the sync module uses. */
function adaptCamera(map: tt.Map): SyncableCamera {
  return {
    on: (event, handler) => map.on(event, handler),
    off: (event, handler) => map.off(event, handler),
    jumpTo: (camera) =>
      (map as unknown as { jumpTo: (o: unknown) => void }).jumpTo({
        center: camera.center,
        zoom: camera.zoom,
        bearing: camera.bearing,
        pitch: camera.pitch,
      }),
    getCenter: () => {
      const c = map.getCenter();
      return [c.lng, c.lat];
    },
    getZoom: () => map.getZoom(),
    getBearing: () => map.getBearing(),
    getPitch: () => map.getPitch(),
  };
}

function readCamera(map: tt.Map): CameraState {
  const c = map.getCenter();
  return {
    center: [c.lng, c.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

interface PaneData {
  hubs: HubMapInfo[];
  zones: ZoneMapInfo[];
  flows: FlowMapInfo[];
}

interface NetworkMapProps {
  baseline: NetworkMapResponse;
  /** When present, the canvas splits: baseline left, this on the right. */
  simulation?: NetworkMapResponse | null;
  simulationId?: string | null;
  corridorMode: CorridorMode;
  isDarkMode: boolean;
  /** Build mode (SimCity direct manipulation): what the next click means.
   *  "hub" = pick an existing hub; "location" = pick coordinates. Picks fire
   *  only from the BASELINE pane — builds always start from reality. */
  picking?: "location" | "hub" | null;
  onPick?: (pick: BuildPick) => void;
  /** A picked-but-unconfirmed build location: pulses on the baseline pane
   *  until the confirm card resolves. Pure presentation. */
  pendingMarker?: { lat: number; lon: number } | null;
}

type PaneSide = "left" | "right";

export default function NetworkMap({
  baseline,
  simulation,
  simulationId,
  corridorMode,
  isDarkMode,
  picking = null,
  onPick,
  pendingMarker = null,
}: NetworkMapProps) {
  const split = Boolean(simulation);

  const mapsRef = useRef<Partial<Record<PaneSide, tt.Map>>>({});
  const detachSyncRef = useRef<(() => void) | null>(null);
  // One shared camera: panes start here and write back on unmount, so theme
  // rebuilds and split-mode toggles keep the planner's viewpoint.
  const sharedCameraRef = useRef<CameraState>(INITIAL_CAMERA);

  const attachSync = useCallback(() => {
    detachSyncRef.current?.();
    detachSyncRef.current = null;
    const { left, right } = mapsRef.current;
    if (!left || !right) return;
    // Align instantly, then mirror every subsequent movement both ways.
    adaptCamera(right).jumpTo(readCamera(left));
    detachSyncRef.current = createCameraSync([adaptCamera(left), adaptCamera(right)]);
  }, []);

  const handlePaneReady = useCallback(
    (side: PaneSide, map: tt.Map) => {
      mapsRef.current[side] = map;
      attachSync();
    },
    [attachSync],
  );

  const handlePaneGone = useCallback((side: PaneSide) => {
    delete mapsRef.current[side];
    detachSyncRef.current?.();
    detachSyncRef.current = null;
  }, []);

  if (!TOMTOM_KEY) return <MapUnavailable reason={null} />;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex" }}>
      <MapPane
        side="left"
        data={baseline}
        scenarioId={null}
        label={split ? "BASELINE" : null}
        accent={COLOR_CORRIDOR}
        corridorMode={corridorMode}
        isDarkMode={isDarkMode}
        sharedCameraRef={sharedCameraRef}
        onReady={handlePaneReady}
        onGone={handlePaneGone}
        picking={picking}
        onPick={onPick}
        pendingMarker={pendingMarker}
      />

      {split && (
        <>
          {/* Divider — a thin luminous seam between the two worlds. */}
          <div
            style={{
              width: 1,
              flexShrink: 0,
              background:
                "linear-gradient(180deg, transparent, rgba(34,211,238,0.35) 30%, rgba(245,158,11,0.35) 70%, transparent)",
              boxShadow: "0 0 12px rgba(34,211,238,0.25)",
              zIndex: 5,
            }}
          />
          <MapPane
            side="right"
            data={simulation!}
            scenarioId={simulationId ?? null}
            label="SIMULATION"
            accent={COLOR_MAGAZINE}
            corridorMode={corridorMode}
            isDarkMode={isDarkMode}
            sharedCameraRef={sharedCameraRef}
            onReady={handlePaneReady}
            onGone={handlePaneGone}
          />
        </>
      )}

      <WorkforceLegend corridorMode={corridorMode} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MapPane — one TomTom instance with pillars, corridors, tooltips
═══════════════════════════════════════════════════════════════════════════ */

interface MapPaneProps {
  side: PaneSide;
  data: PaneData;
  scenarioId: string | null;
  label: string | null;
  accent: string;
  corridorMode: CorridorMode;
  isDarkMode: boolean;
  sharedCameraRef: React.MutableRefObject<CameraState>;
  onReady: (side: PaneSide, map: tt.Map) => void;
  onGone: (side: PaneSide) => void;
  picking?: "location" | "hub" | null;
  onPick?: (pick: BuildPick) => void;
  pendingMarker?: { lat: number; lon: number } | null;
}

interface CorridorPopoverState {
  hubId: string;
  zoneId: string;
  volume: number;
  x: number;
  y: number;
  cost: RouteCostResponse | null; // null while the engine fetch is in flight
  error: string | null;
}

function MapPane({
  side,
  data,
  scenarioId,
  label,
  accent,
  corridorMode,
  isDarkMode,
  sharedCameraRef,
  onReady,
  onGone,
  picking = null,
  onPick,
  pendingMarker = null,
}: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<tt.Map | null>(null);
  const readyRef = useRef(false);
  const scenarioIdRef = useRef(scenarioId);
  // Build-mode picking, read by click handlers through refs so arming a
  // tool never tears down and rebuilds the map.
  const pickingRef = useRef<"location" | "hub" | null>(picking);
  const onPickRef = useRef<typeof onPick>(onPick);
  const pendingMarkerRef = useRef(pendingMarker);

  const [selectedHubId, setSelectedHubId] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [corridorPopover, setCorridorPopover] = useState<CorridorPopoverState | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const pillars = useMemo(() => toPillarCollection(data.hubs), [data.hubs]);
  const corridors = useMemo(
    () => buildCorridors(data.hubs, data.zones, data.flows, { mode: corridorMode }),
    [data.hubs, data.zones, data.flows, corridorMode],
  );
  const pillarsRef = useRef(pillars);
  const corridorsRef = useRef(corridors);

  const selectedHub = selectedHubId ? data.hubs.find((h) => h.id === selectedHubId.id) : undefined;

  // ── Map lifecycle (rebuilt on theme change; camera survives via ref) ──────
  useEffect(() => {
    if (!containerRef.current) return;

    let map: tt.Map;
    try {
      map = tt.map({
        key: TOMTOM_KEY,
        container: containerRef.current,
        style: {
          map: isDarkMode ? "basic_night" : "basic_main",
          poi: "poi_main",
          trafficFlow: "flow_relative0-dark",
          trafficIncidents: "incidents_dark",
        },
        stylesVisibility: { map: true, poi: false, trafficFlow: false, trafficIncidents: false },
        center: sharedCameraRef.current.center,
        zoom: sharedCameraRef.current.zoom,
        pitch: sharedCameraRef.current.pitch,
        bearing: sharedCameraRef.current.bearing,
        dragRotate: true,
        touchPitch: true,
        // SDK v6 hard-caps pitch at 60 — higher throws on construction.
        maxPitch: 60,
      } as tt.MapOptions);
    } catch (err) {
      const message = err instanceof Error ? err.message : "TomTom map failed to initialise.";
      queueMicrotask(() => setInitError(message));
      return;
    }

    mapRef.current = map;
    readyRef.current = false;

    const onError = (e: { error?: { message?: string; status?: number } }) => {
      const message = e?.error?.message ?? "";
      const status = e?.error?.status;
      // The raw text is the only way to diagnose a map failure from a report.
      console.error(`[NetworkMap:${side}] TomTom error:`, message || e);
      const isAuthFailure =
        status === 401 ||
        status === 403 ||
        /\b(401|403)\b|unauthorized|forbidden|invalid api key/i.test(message);
      if (isAuthFailure) setInitError(message || "TomTom rejected the API key.");
    };
    map.on("error", onError);

    map.on("load", () => {
      // ── Pillars ──
      map.addSource(PILLAR_SOURCE, { type: "geojson", data: pillarsRef.current } as never);
      map.addLayer({
        id: GLOW_LAYER,
        type: "fill",
        source: PILLAR_SOURCE,
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.22 },
      } as never);
      map.addLayer({
        id: PILLAR_LAYER,
        type: "fill-extrusion",
        source: PILLAR_SOURCE,
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.8,
        },
      } as never);

      // ── Corridors (under the pillars so bases stay crisp) ──
      map.addSource(CORRIDOR_SOURCE, { type: "geojson", data: corridorsRef.current } as never);
      map.addLayer(
        {
          id: CORRIDOR_LAYER,
          type: "line",
          source: CORRIDOR_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": [
              "case",
              ["get", "magazine"],
              COLOR_MAGAZINE,
              COLOR_CORRIDOR,
            ],
            // Width encodes the solver's real volume — visual scaling only.
            "line-width": [
              "interpolate",
              ["linear"],
              ["get", "volume"],
              0,
              1.2,
              200,
              2.5,
              800,
              5,
            ],
            "line-opacity": 0.85,
            "line-dasharray": DASH_SEQUENCE[0],
          },
        } as never,
        PILLAR_LAYER,
      );
      // Invisible wide twin so thin corridors are actually clickable.
      map.addLayer(
        {
          id: CORRIDOR_HIT_LAYER,
          type: "line",
          source: CORRIDOR_SOURCE,
          paint: { "line-color": "#000000", "line-opacity": 0.001, "line-width": 16 },
        } as never,
        PILLAR_LAYER,
      );

      // Pending build marker — a brand-red pulse at the picked point, alive
      // until the confirm card resolves. Radius animates in the rAF loop.
      map.addSource(PENDING_SOURCE, {
        type: "geojson",
        data: pendingToFeature(pendingMarkerRef.current),
      } as never);
      map.addLayer({
        id: PENDING_LAYER,
        type: "circle",
        source: PENDING_SOURCE,
        paint: {
          "circle-radius": 8,
          "circle-color": "#E8112D",
          "circle-opacity": 0.55,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      } as never);

      addCityBuildings(map);
      readyRef.current = true;
      onReady(side, map);
    });

    // ── Interaction ──
    const onPillarClick = (e: { point: { x: number; y: number }; features?: unknown[] }) => {
      const feature = e.features?.[0] as { properties?: { id?: string } } | undefined;
      const id = feature?.properties?.id;
      if (!id) return;
      // Build mode: a click on a hub while a hub-pick is armed selects it
      // for the pending action (move_hub step 1) instead of opening the
      // tooltip.
      if (pickingRef.current === "hub" && onPickRef.current) {
        onPickRef.current({ kind: "hub", hubId: id });
        return;
      }
      setCorridorPopover(null);
      setSelectedHubId({ id, x: e.point.x, y: e.point.y });
    };

    const onCorridorClick = (e: { point: { x: number; y: number }; features?: unknown[] }) => {
      if (pickingRef.current) return; // build mode owns the click
      const feature = e.features?.[0] as
        | { properties?: { hub_id?: string; zone_id?: string; volume?: number } }
        | undefined;
      const props = feature?.properties;
      if (!props?.hub_id || !props?.zone_id) return;
      setSelectedHubId(null);
      const base: CorridorPopoverState = {
        hubId: props.hub_id,
        zoneId: props.zone_id,
        volume: props.volume ?? 0,
        x: e.point.x,
        y: e.point.y,
        cost: null,
        error: null,
      };
      setCorridorPopover(base);
      // Engine-computed cost — fetched, never calculated here.
      getRouteCost(props.hub_id, props.zone_id, scenarioIdRef.current)
        .then((cost) =>
          setCorridorPopover((current) =>
            current && current.hubId === base.hubId && current.zoneId === base.zoneId
              ? { ...current, cost }
              : current,
          ),
        )
        .catch((err: Error) =>
          setCorridorPopover((current) =>
            current && current.hubId === base.hubId && current.zoneId === base.zoneId
              ? { ...current, error: err.message }
              : current,
          ),
        );
    };

    const onMapClick = (e: {
      point: { x: number; y: number };
      lngLat?: { lng: number; lat: number };
    }) => {
      const hits = map.queryRenderedFeatures(e.point as never, {
        layers: [PILLAR_LAYER, CORRIDOR_HIT_LAYER],
      } as never) as { layer?: { id?: string } }[] | undefined;
      // Build mode: an armed location pick claims any click that isn't on a
      // hub pillar (corridors don't block placement).
      if (pickingRef.current === "location" && onPickRef.current && e.lngLat) {
        const onPillar = hits?.some((f) => f.layer?.id === PILLAR_LAYER);
        if (!onPillar) {
          onPickRef.current({ kind: "location", lat: e.lngLat.lat, lon: e.lngLat.lng });
          return;
        }
      }
      if (!hits || hits.length === 0) {
        setSelectedHubId(null);
        setCorridorPopover(null);
      }
    };
    const enter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const leave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", PILLAR_LAYER, onPillarClick as never);
    map.on("click", CORRIDOR_HIT_LAYER, onCorridorClick as never);
    map.on("click", onMapClick as never);
    map.on("mouseenter", PILLAR_LAYER, enter);
    map.on("mouseleave", PILLAR_LAYER, leave);
    map.on("mouseenter", CORRIDOR_HIT_LAYER, enter);
    map.on("mouseleave", CORRIDOR_HIT_LAYER, leave);

    // ── Marching-ants corridor animation + pending-marker pulse ──
    let rafId = 0;
    let lastStep = -1;
    const animate = (t: number) => {
      const step = Math.floor(t / DASH_TICK_MS) % DASH_SEQUENCE.length;
      if (step !== lastStep && readyRef.current && map.getLayer(CORRIDOR_LAYER)) {
        map.setPaintProperty(CORRIDOR_LAYER, "line-dasharray", DASH_SEQUENCE[step]);
        lastStep = step;
      }
      if (
        step !== lastPulseStep &&
        readyRef.current &&
        pendingMarkerRef.current &&
        map.getLayer(PENDING_LAYER)
      ) {
        // Slow sine breathe between 6px and 14px.
        map.setPaintProperty(PENDING_LAYER, "circle-radius", 10 + 4 * Math.sin(t / 260));
        lastPulseStep = step;
      }
      rafId = requestAnimationFrame(animate);
    };
    let lastPulseStep = -1;
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      try {
        sharedCameraRef.current = readCamera(map);
      } catch {
        /* torn down — keep previous camera */
      }
      readyRef.current = false;
      mapRef.current = null;
      onGone(side);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only on theme flip
  }, [isDarkMode, side, onReady, onGone]);

  // ── Push new engine data / corridor mode without rebuilding ───────────────
  useEffect(() => {
    scenarioIdRef.current = scenarioId;
  }, [scenarioId]);

  // Build-mode plumbing: keep refs current and show a crosshair while armed.
  useEffect(() => {
    pickingRef.current = picking;
    onPickRef.current = onPick;
    containerRef.current?.classList.toggle("build-picking", picking != null);
  }, [picking, onPick]);

  // Pending-build pulse: push the marker into its source without a rebuild.
  useEffect(() => {
    pendingMarkerRef.current = pendingMarker;
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(PENDING_SOURCE) as { setData?: (d: unknown) => void } | undefined)?.setData?.(
      pendingToFeature(pendingMarker),
    );
  }, [pendingMarker]);

  useEffect(() => {
    pillarsRef.current = pillars;
    corridorsRef.current = corridors;
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(PILLAR_SOURCE) as { setData?: (d: unknown) => void } | undefined)?.setData?.(
      pillars,
    );
    (map.getSource(CORRIDOR_SOURCE) as { setData?: (d: unknown) => void } | undefined)?.setData?.(
      corridors,
    );
  }, [pillars, corridors]);

  if (initError) return <MapUnavailable reason={initError} />;

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0, height: "100%" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {label && <PaneBadge label={label} accent={accent} />}

      {selectedHubId && selectedHub && (
        <PillarTooltip hub={selectedHub} x={selectedHubId.x} y={selectedHubId.y} />
      )}

      {corridorPopover && <CorridorPopover state={corridorPopover} />}
    </div>
  );
}

/** TomTom's vector style carries building footprints; extrude them so the 3D
 *  scene has real geometry under the pillars. Guarded — a style without a
 *  building source-layer must not take the map down with it. */
function addCityBuildings(map: tt.Map) {
  try {
    const style = map.getStyle() as { sources?: Record<string, { type?: string }> };
    const vectorSource = Object.entries(style.sources ?? {}).find(
      ([, src]) => src?.type === "vector",
    )?.[0];
    if (!vectorSource || map.getLayer(BUILDINGS_LAYER)) return;

    map.addLayer(
      {
        id: BUILDINGS_LAYER,
        type: "fill-extrusion",
        source: vectorSource,
        "source-layer": "Building",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": "#1e293b",
          "fill-extrusion-height": ["coalesce", ["get", "height"], 12],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.65,
        },
      } as never,
      PILLAR_LAYER,
    );
  } catch {
    /* No building geometry in this style — pillars are unaffected. */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Overlays
═══════════════════════════════════════════════════════════════════════════ */

function PaneBadge({ label, accent }: { label: string; accent: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 112, // below the header + command row (build tools / chips)
        left: "50%",
        transform: "translateX(-50%)",
        padding: "6px 18px",
        borderRadius: 999,
        background: "rgba(2,8,23,0.78)",
        border: `1px solid ${accent}45`,
        boxShadow: `0 0 22px ${accent}22, 0 8px 24px rgba(0,0,0,0.45)`,
        backdropFilter: "blur(10px)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.28em",
        color: accent,
        fontFamily: "var(--font-geist-mono, monospace)",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {label}
    </div>
  );
}

function PillarTooltip({ hub, x, y }: { hub: HubMapInfo; x: number; y: number }) {
  const isMagazine = hub.id === MAGAZINE_HUB_ID;
  const direction = hub.gap_direction ?? "balanced";
  const accent = isMagazine
    ? COLOR_MAGAZINE
    : direction === "understaffed"
      ? COLOR_UNDERSTAFFED
      : COLOR_STAFFED;
  const gap = hub.headcount_gap ?? 0;

  const rows: { label: string; value: string; color?: string }[] = [
    { label: "Required", value: `${hub.required_headcount ?? 0} couriers`, color: accent },
    { label: "Sustainable", value: `${hub.sustainable_headcount ?? 0} couriers` },
    { label: "Gap", value: `${gap > 0 ? "+" : ""}${gap}`, color: accent },
    { label: "Permanent", value: `${hub.required_permanent ?? 0}` },
    { label: "Outsourced", value: `${hub.required_outsourced ?? 0}` },
    { label: "Utilization", value: `${hub.utilization_pct.toFixed(1)}%` },
    { label: "Cost-to-serve", value: `${hub.cost_to_serve.toFixed(2)} AED` },
  ];

  return (
    <div
      style={{
        position: "absolute",
        left: Math.max(8, Math.min(x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) / 2 - 260)),
        top: y + 16,
        width: 236,
        background: "rgba(2,8,23,0.92)",
        border: `1px solid ${accent}40`,
        boxShadow: `0 0 26px ${accent}20, 0 8px 32px rgba(0,0,0,0.55)`,
        borderRadius: 12,
        padding: "12px 14px",
        pointerEvents: "none",
        backdropFilter: "blur(8px)",
        zIndex: 11,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 13,
          color: "#e2e8f0",
          marginBottom: 2,
          letterSpacing: "0.02em",
        }}
      >
        {hub.name}
        <span
          style={{
            fontWeight: 400,
            color: accent,
            marginLeft: 6,
            fontSize: 11,
            fontFamily: "var(--font-geist-mono, monospace)",
          }}
        >
          {hub.id}
        </span>
      </div>

      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: accent,
          marginBottom: 9,
        }}
      >
        {isMagazine ? "main magazine · " : ""}
        {direction}
        {hub.status !== "open" && " · closed"}
      </div>

      {rows.map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: 11,
            marginBottom: 3,
          }}
        >
          <span style={{ color: "rgba(148,163,184,0.7)" }}>{label}</span>
          <span
            style={{
              color: color ?? "#e2e8f0",
              fontFamily: "var(--font-geist-mono, monospace)",
              fontWeight: 500,
            }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function CorridorPopover({ state }: { state: CorridorPopoverState }) {
  const accent = COLOR_CORRIDOR;
  return (
    <div
      style={{
        position: "absolute",
        left: Math.max(8, state.x - 130),
        top: state.y + 14,
        width: 262,
        background: "rgba(2,8,23,0.94)",
        border: `1px solid ${accent}35`,
        boxShadow: `0 0 26px ${accent}18, 0 8px 32px rgba(0,0,0,0.55)`,
        borderRadius: 12,
        padding: "12px 14px",
        pointerEvents: "none",
        backdropFilter: "blur(8px)",
        zIndex: 11,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, color: "#e2e8f0", marginBottom: 2 }}>
        <span style={{ fontFamily: "var(--font-geist-mono, monospace)", color: accent }}>
          {state.hubId}
        </span>
        <span style={{ color: "rgba(148,163,184,0.6)", margin: "0 6px" }}>→</span>
        <span style={{ fontFamily: "var(--font-geist-mono, monospace)", color: accent }}>
          {state.zoneId}
        </span>
      </div>
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(148,163,184,0.7)",
          marginBottom: 9,
        }}
      >
        corridor · {state.volume.toLocaleString()} parcels routed
      </div>

      {state.error && (
        <div style={{ fontSize: 11, color: COLOR_UNDERSTAFFED }}>{state.error}</div>
      )}

      {!state.error && !state.cost && (
        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.7)" }}>
          Computing in engine…
        </div>
      )}

      {state.cost && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              marginBottom: 3,
            }}
          >
            <span style={{ color: "rgba(148,163,184,0.7)" }}>Distance</span>
            <span style={{ color: "#e2e8f0", fontFamily: "var(--font-geist-mono, monospace)" }}>
              {state.cost.distance_km.toFixed(1)} km · {Math.round(state.cost.time_min)} min
            </span>
          </div>
          <div
            style={{
              borderTop: "1px solid rgba(148,163,184,0.15)",
              margin: "8px 0 6px",
              paddingTop: 7,
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(148,163,184,0.55)",
            }}
          >
            cost / parcel by mode
          </div>
          {state.cost.modes.map((mode, i) => (
            <div
              key={mode.fleet_id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: 11,
                marginBottom: 3,
              }}
            >
              <span style={{ color: i === 0 ? "#34d399" : "rgba(148,163,184,0.8)" }}>
                {mode.fleet_name}
                {i === 0 && " ◂ cheapest"}
              </span>
              <span
                style={{
                  color: i === 0 ? "#34d399" : "#e2e8f0",
                  fontFamily: "var(--font-geist-mono, monospace)",
                  fontWeight: 500,
                }}
              >
                {mode.cost_per_parcel.toFixed(2)} AED
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function WorkforceLegend({ corridorMode }: { corridorMode: CorridorMode }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 376,
        background: "rgba(2,8,23,0.82)",
        border: "1px solid rgba(34,211,238,0.15)",
        backdropFilter: "blur(8px)",
        borderRadius: 10,
        padding: "8px 14px",
        fontSize: 11,
        display: "flex",
        gap: 14,
        alignItems: "center",
        zIndex: 10,
      }}
    >
      <span
        style={{
          fontWeight: 600,
          color: "rgba(148,163,184,0.7)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontSize: 10,
        }}
      >
        Headcount
      </span>
      <LegendSwatch color={COLOR_UNDERSTAFFED} label="understaffed" />
      <LegendSwatch color={COLOR_STAFFED} label="staffed" />
      <LegendSwatch color={COLOR_MAGAZINE} label="magazine" />
      <span
        style={{
          color: "rgba(148,163,184,0.55)",
          borderLeft: "1px solid rgba(148,163,184,0.2)",
          paddingLeft: 12,
        }}
      >
        {corridorMode === "magazine"
          ? "gold corridors = Magazine flow"
          : "dashes = solver-routed flow"}
      </span>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
          boxShadow: `0 0 6px ${color}b0`,
        }}
      />
      <span style={{ color: "#94a3b8" }}>{label}</span>
    </span>
  );
}

/** Deliberately explicit: a hackathon demo must never show a black rectangle
 *  and leave everyone guessing whether the map or the data is broken. */
function MapUnavailable({ reason }: { reason: string | null }) {
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 50% 40%, rgba(34,211,238,0.06), transparent 60%), #020817",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: "center",
          padding: "22px 26px",
          border: "1px solid rgba(34,211,238,0.2)",
          borderRadius: 12,
          background: "rgba(2,8,23,0.75)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(34,211,238,0.75)",
            marginBottom: 8,
          }}
        >
          Map unavailable
        </div>
        <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
          {reason ? "TomTom rejected the configured API key." : "No TomTom API key is configured."}
        </div>
        {reason && (
          <div
            style={{
              fontSize: 11,
              color: "rgba(148,163,184,0.75)",
              fontFamily: "var(--font-geist-mono, monospace)",
              marginBottom: 10,
              wordBreak: "break-word",
            }}
          >
            {reason}
          </div>
        )}
        <code
          style={{
            display: "block",
            fontSize: 11,
            color: "#94a3b8",
            fontFamily: "var(--font-geist-mono, monospace)",
            background: "rgba(148,163,184,0.08)",
            padding: "7px 10px",
            borderRadius: 6,
          }}
        >
          NEXT_PUBLIC_TOMTOM_KEY=your_key
        </code>
        <div style={{ color: "rgba(148,163,184,0.6)", fontSize: 11, marginTop: 10 }}>
          Add it to <span style={{ color: "#94a3b8" }}>frontend/.env.local</span> and restart the
          dev server. Every other panel keeps working without it.
        </div>
      </div>
    </div>
  );
}
