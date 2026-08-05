import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet";

import {
  ACTIVE_HUBS,
  CANDIDATES,
  CYAN_HEX,
  DARK_STORES,
  DEMAND,
  ELECTRIC_HEX,
  HUBS,
  OD_NETWORK,
  STATUS_HEX,
  VIOLET_HEX,
  fmtInt,
  fmtNum,
  perfOf,
  zoneInfo,
  type HubInfo,
  type HubStatus,
} from "@/lib/atlas-data";
import type { HsComputation, ScenarioNewHub } from "@/lib/atlas-engine";
import { UAE_LAND_RINGS } from "@/lib/uae-boundary";

const CARTO_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

/**
 * The complete UAE frame, including the western Abu Dhabi islands, the full
 * southern border and the Musandam-facing islands in the north-east.
 *
 * Display bounds are fitted on first render instead of relying on one fixed
 * zoom, which used to crop the country in narrow simulation workspaces.
 * Pan bounds are deliberately wider so Leaflet never pushes an edge of the
 * Emirates out of view while enforcing maxBounds.
 */
// Fixed national frame. It intentionally extends beyond every supplied land
// ring so the western islands, southern border and the north-east coast can
// never touch (or be clipped by) the edge of a map panel.
const UAE_DISPLAY_BOUNDS = L.latLngBounds([
  [22.35, 51.15],
  [26.35, 56.75],
]);
const UAE_FIT_PADDING: L.PointExpression = [36, 36];

/** Everything outside the Emirates gets masked — no radius circles on the ocean. */
const WORLD_RING: [number, number][] = [
  [-85, -179],
  [85, -179],
  [85, 179],
  [-85, 179],
];
const MASK_HEX = "#04071A"; // deeper than the tiles, so EMX land reads as the lit territory

function UaeMask() {
  return (
    <>
      <Polygon
        positions={[WORLD_RING, ...UAE_LAND_RINGS]}
        pathOptions={{ fillColor: MASK_HEX, fillOpacity: 1, stroke: false, fillRule: "evenodd" }}
        interactive={false}
      />
      {/* A whisper of EMX blue over home territory so the land pops from the masked sea */}
      <Polygon
        positions={UAE_LAND_RINGS}
        pathOptions={{ fillColor: ELECTRIC_HEX, fillOpacity: 0.05, stroke: false }}
        interactive={false}
      />
      {UAE_LAND_RINGS.map((ring, i) => (
        <Polyline
          key={i}
          positions={ring}
          pathOptions={{ color: ELECTRIC_HEX, weight: 1, opacity: 0.28 }}
          interactive={false}
        />
      ))}
    </>
  );
}

/* ------------------------------- markers ------------------------------- */

function hubIcon(hub: HubInfo, status: HubStatus, selected: boolean): L.DivIcon {
  const sz = Math.round(20 + hub.maxDaily / 130); // capacity-sized: 23…51 px
  const color = STATUS_HEX[status];
  const badge = hub.hubType === "Full Hub" ? "FULL" : "MICRO";
  return L.divIcon({
    className: "atlas-divicon",
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
    html: `<div class="hub-pin${selected ? " hub-pin-selected" : ""}" style="width:${sz}px;height:${sz}px;border-color:${color};background:${color}2e;color:${color}">
      <span class="hub-pin-dot" style="background:${color}"></span>
      <span class="hub-pin-badge" style="border-color:${color}66;color:${color}">${badge}</span>
    </div>`,
  });
}

const BIKE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;

function storeIcon(breaching: boolean): L.DivIcon {
  const color = breaching ? STATUS_HEX["At Risk"] : VIOLET_HEX;
  return L.divIcon({
    className: "atlas-divicon",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="store-pin" style="border-color:${color};color:${color}">${BIKE_SVG}</div>`,
  });
}

function candidateIcon(c: HubInfo): L.DivIcon {
  const sz = Math.round(18 + c.maxDaily / 160);
  return L.divIcon({
    className: "atlas-divicon",
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
    html: `<div class="hub-pin" style="width:${sz}px;height:${sz}px;border-style:dashed;border-color:${VIOLET_HEX};background:${VIOLET_HEX}14;color:${VIOLET_HEX}">
      <span class="hub-pin-badge" style="border-color:${VIOLET_HEX}66;color:${VIOLET_HEX}">CANDIDATE</span>
    </div>`,
  });
}

const pickIcon = L.divIcon({
  className: "atlas-divicon",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: `<div class="pick-pin"></div>`,
});

const closedIcon = L.divIcon({
  className: "atlas-divicon",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  html: `<div class="sim-closed-pin">✕</div>`,
});

function newHubIcon(maxDaily: number): L.DivIcon {
  const sz = Math.round(22 + maxDaily / 140);
  return L.divIcon({
    className: "atlas-divicon",
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
    html: `<div class="sim-new-pin" style="width:${sz}px;height:${sz}px"><span class="hub-pin-badge" style="border-color:${CYAN_HEX}88;color:${CYAN_HEX}">NEW</span></div>`,
  });
}

/* --------------------------- demand flow data --------------------------- */

const HS_ZONE_ROWS = DEMAND.filter((d) => d.network === "Hub & Spoke").map((d) => {
  const hub = ACTIVE_HUBS.find((h) => h.id === d.servingId);
  const z = zoneInfo(d.emirate, d.zone);
  return {
    key: `${d.zone}-${d.model}`,
    zone: d.zone,
    model: d.model,
    weekly: d.weekly[12] ?? 0,
    lat: z?.lat ?? hub?.lat ?? 0,
    lng: z?.lng ?? hub?.lng ?? 0,
    servingId: d.servingId,
  };
});

/** zone|model → the hub that serves it today (to flag re-routed flows). */
const ORIGINAL_SERVING = new Map(
  DEMAND.filter((d) => d.network === "Hub & Spoke").map((d) => [`${d.emirate}|${d.zone}|${d.model}`, d.servingId]),
);

const HUB_BY_ID = new Map(HUBS.map((h) => [h.id, h]));

/* ------------------------------ controllers ------------------------------ */

export interface MapFocus {
  lat: number;
  lng: number;
  zoom?: number;
  /** Bump to re-trigger flyTo for the same target. */
  stamp?: number;
}

/**
 * Traveling particles riding every flow path — SMIL animateMotion circles injected
 * into Leaflet's SVG overlay, tinted to match each flow's stroke. Zero JS animation cost.
 */
export function FlowParticles({ dep }: { dep?: unknown }) {
  const map = useMap();
  useEffect(() => {
    const svg = map.getPanes().overlayPane?.querySelector("svg");
    if (!svg) return;
    let nodes: SVGCircleElement[] = [];
    let timer = 0;
    const clear = () => {
      nodes.forEach((n) => n.remove());
      nodes = [];
    };
    const build = () => {
      clear();
      const paths = Array.from(svg.querySelectorAll("path.flow-line")).slice(0, 24);
      paths.forEach((p, i) => {
        const d = p.getAttribute("d");
        if (!d) return;
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("r", "2.1");
        c.setAttribute("fill", p.getAttribute("stroke") ?? "#6EA8FF");
        c.setAttribute("class", "flow-particle");
        const m = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
        m.setAttribute("dur", `${2.4 + (i % 5) * 0.6}s`);
        m.setAttribute("begin", `${-((i * 0.53) % 2.4)}s`);
        m.setAttribute("repeatCount", "indefinite");
        m.setAttribute("path", d);
        c.appendChild(m);
        svg.appendChild(c);
        nodes.push(c);
      });
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(build, 90);
    };
    const t0 = window.setTimeout(build, 60);
    map.on("zoomend moveend", schedule);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(t0);
      map.off("zoomend moveend", schedule);
      clear();
    };
  }, [map, dep]);
  return null;
}

function FocusRing({ focus }: { focus?: MapFocus | null | undefined }) {
  if (!focus) return null;
  // The point of concern, visibly different from ordinary pins: a pulsing
  // double ring at the exact target the alert/copilot named.
  return (
    <>
      <CircleMarker center={[focus.lat, focus.lng]} radius={18} pathOptions={{ color: "#f0504d", weight: 2, fillOpacity: 0.06, className: "focus-ring" }} interactive={false} />
      <CircleMarker center={[focus.lat, focus.lng]} radius={7} pathOptions={{ color: "#f0504d", weight: 2, fillColor: "#f0504d", fillOpacity: 0.5 }} interactive={false} />
    </>
  );
}

function FocusController({ focus }: { focus?: MapFocus | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], focus.zoom ?? 11, { duration: 0.9 });
  }, [focus, map]);
  return null;
}

/**
 * Leaflet's `bounds` option runs before animated route layouts have reached
 * their final size. Fit again after layout, and whenever the map panel really
 * changes size, so the complete UAE remains visible on every screen shape.
 */
function FullUaeViewport({ focus }: { focus?: MapFocus | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    let lastWidth = 0;
    let lastHeight = 0;

    const fit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
        map.fitBounds(UAE_DISPLAY_BOUNDS, {
          padding: UAE_FIT_PADDING,
          animate: false,
          maxZoom: 8,
        });
      });
    };

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const changed = Math.abs(width - lastWidth) > 2 || Math.abs(height - lastHeight) > 2;
      lastWidth = width;
      lastHeight = height;
      if (changed && !focus) fit();
    });

    observer.observe(container);
    fit();
    const settleTimer = window.setTimeout(fit, 180);
    return () => {
      observer.disconnect();
      window.clearTimeout(settleTimer);
      window.cancelAnimationFrame(frame);
    };
  }, [focus, map]);
  return null;
}

function ClickHandler({ armed, onPlace }: { armed: boolean; onPlace?: ((lat: number, lon: number) => void) | undefined }) {
  useMapEvents({
    click(e) {
      if (armed && onPlace) onPlace(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/* --------------------------------- map --------------------------------- */

export interface MapLayers {
  hubs: boolean;
  stores: boolean;
  od: boolean;
}

interface LeafletMapProps {
  layers?: MapLayers;
  focus?: MapFocus | null;
  selectedHubId?: string | null;
  onSelectHub?: (hub: HubInfo) => void;
  armed?: boolean;
  onPlace?: (lat: number, lon: number) => void;
  pickMarker?: { lat: number; lng: number } | null;
  mini?: boolean;
  typeFilter?: "all" | "Full Hub" | "Micro Hub";
  statusFilter?: "all" | "At Risk" | "High Load" | "Normal";
  showCandidates?: boolean;
}

export function LeafletMap({
  layers = { hubs: true, stores: true, od: true },
  focus,
  selectedHubId,
  onSelectHub,
  armed = false,
  onPlace,
  pickMarker,
  mini = false,
  typeFilter = "all",
  statusFilter = "all",
  showCandidates = true,
}: LeafletMapProps) {
  return (
    <MapContainer
      center={[24.35, 54.15]}
      zoom={6}
      minZoom={5}
      zoomSnap={0.25}
      zoomControl={false}
      attributionControl={!mini}
      className="h-full w-full"
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer url={CARTO_DARK} attribution={CARTO_ATTR} />
      {!mini ? <ZoomControl position="bottomright" /> : null}
      <FullUaeViewport focus={focus} />
      <FocusController focus={focus} />
      <FocusRing focus={focus} />
      <ClickHandler armed={armed} onPlace={onPlace} />

      {/* ——— On-Demand: soft city shading, no markers ——— */}
      {layers.od
        ? OD_NETWORK.map((o) => (
            <Circle
              key={o.id}
              center={[o.lat, o.lng]}
              radius={16000}
              pathOptions={{ color: CYAN_HEX, weight: 1, dashArray: "5 7", fillColor: CYAN_HEX, fillOpacity: 0.06, opacity: 0.5 }}
            >
              <Tooltip>
                <span className="font-medium">
                  {o.emirate} On-Demand — {o.bikeCouriers} riders · avg {fmtNum(o.avgResponseMin, 0)} min response
                </span>
              </Tooltip>
            </Circle>
          ))
        : null}

      {/* ——— Hubs: animated flows + capacity-sized pins with FULL/MICRO badges ——— */}
      {layers.hubs
        ? HS_ZONE_ROWS.map((z) => {
            const hub = ACTIVE_HUBS.find((h) => h.id === z.servingId);
            if (!hub) return null;
            return (
              <Polyline
                key={`flow-${z.key}`}
                positions={[
                  [hub.lat, hub.lng],
                  [z.lat, z.lng],
                ]}
                pathOptions={{ color: ELECTRIC_HEX, weight: 1.2, opacity: 0.42, dashArray: "5 9", className: "flow-line" }}
              />
            );
          })
        : null}
      {layers.hubs ? <FlowParticles dep={layers.hubs} /> : null}

      {/* Dark-store delivery radii (drawn before the mask so the sea stays clean) */}
      {layers.stores
        ? DARK_STORES.map((s) => (
            <Circle
              key={`radius-${s.id}`}
              center={[s.lat, s.lng]}
              radius={4000}
              pathOptions={{ color: VIOLET_HEX, weight: 0.8, fillColor: VIOLET_HEX, fillOpacity: 0.05, opacity: 0.45 }}
              interactive={false}
            />
          ))
        : null}

      {/* ——— Land mask: nothing leaks onto the ocean ——— */}
      <UaeMask />

      {layers.hubs
        ? ACTIVE_HUBS.filter(
            (hub) =>
              (typeFilter === "all" || hub.hubType === typeFilter) &&
              (statusFilter === "all" || (perfOf(hub.id)?.status ?? "Normal") === statusFilter),
          ).map((hub) => {
            const perf = perfOf(hub.id);
            const status = perf?.status ?? "Normal";
            const util = perf ? (perf.util[12] ?? 0) : 0;
            return (
              <Marker
                key={hub.id}
                position={[hub.lat, hub.lng]}
                icon={hubIcon(hub, status, selectedHubId === hub.id)}
                eventHandlers={{ click: () => onSelectHub?.(hub) }}
              >
                <Tooltip>
                  <span className="block text-[11px] font-bold">{hub.name}</span>
                  <span className="block text-[10px]">
                    {hub.hubType === "Full Hub" ? "FULL · next-day + same-day" : "MICRO · next-day only"} · {status}
                  </span>
                  <span className="block text-[10px]">
                    {fmtInt(hub.maxDaily)}/day capacity · util {fmtNum(util, 1)}% (official W13)
                  </span>
                  <span className="block text-[9.5px] opacity-70">click for the full live card</span>
                </Tooltip>
              </Marker>
            );
          })
        : null}

      {layers.hubs && showCandidates
        ? CANDIDATES.map((c) => (
            <Marker key={c.id} position={[c.lat, c.lng]} icon={candidateIcon(c)}>
              <Tooltip>
                <span className="font-medium">
                  {c.name} — candidate · {fmtInt(c.maxDaily)}/day
                </span>
              </Tooltip>
            </Marker>
          ))
        : null}

      {/* ——— Dark stores: bike pins (radii drawn under the mask above) ——— */}
      {layers.stores
        ? DARK_STORES.map((s) => {
            const perf = perfOf(s.id);
            const breaching = (perf?.avgMinW13 ?? 0) > s.targetMin;
            return (
              <Marker key={s.id} position={[s.lat, s.lng]} icon={storeIcon(breaching)}>
                <Tooltip>
                  <span className="font-medium">
                    {s.name} — {s.bikeCouriers} riders · target {s.targetMin} min{breaching ? " · BREACHING" : ""}
                  </span>
                </Tooltip>
              </Marker>
            );
          })
        : null}

      {/* Placement pin (simulate mini-maps) */}
      {pickMarker ? <Marker position={[pickMarker.lat, pickMarker.lng]} icon={pickIcon} /> : null}
    </MapContainer>
  );
}

/* ====================== SimMap — the simulated network ====================== */

export interface SimMapProps {
  /** The flow computation to draw (baseline before a run, scenario after). */
  comp: HsComputation;
  closedId?: string | null;
  newHub?: ScenarioNewHub | null;
  /** Hub whose capacity/riders changed — gets a dashed highlight ring. */
  touchedId?: string | null;
  modelFilter?: "all" | "Standard" | "Express";
  armed?: boolean;
  pickMarker?: { lat: number; lng: number } | null;
  onPlace?: (lat: number, lon: number) => void;
  /** Entity to ring (serving entity of a new-customer assessment). */
  highlightId?: string | null;
  customerPin?: { lat: number; lng: number } | null;
  focus?: MapFocus | null;
}

const simStatus = (util: number): HubStatus => (util >= 92 ? "At Risk" : util >= 80 ? "High Load" : "Normal");

export function SimMap({
  comp,
  closedId = null,
  newHub = null,
  touchedId = null,
  modelFilter = "all",
  armed = false,
  pickMarker = null,
  onPlace,
  highlightId = null,
  customerPin = null,
  focus = null,
}: SimMapProps) {
  const flows = useMemo(
    () =>
      comp.assignments
        .filter((a) => modelFilter === "all" || a.model === modelFilter)
        .map((a) => {
          // Live runs carry their own engine coords; embedded lookup is the fallback.
          const live = a as typeof a & { lat?: number; lng?: number };
          const z =
            zoneInfo(a.emirate, a.zone) ??
            (live.lat !== undefined && live.lng !== undefined
              ? { emirate: a.emirate, zone: a.zone, lat: live.lat, lng: live.lng }
              : null);
          const hub = HUB_BY_ID.get(a.hubId) ?? (newHub && newHub.id === a.hubId ? newHub : null);
          const reassigned = ORIGINAL_SERVING.get(`${a.emirate}|${a.zone}|${a.model}`) !== a.hubId;
          return { a, z, hub, reassigned };
        })
        .filter((f) => f.z && f.hub),
    [comp, modelFilter, newHub],
  );

  const zones = useMemo(() => {
    const byZone = new Map<string, { lat: number; lng: number; weekly: number; models: Set<string> }>();
    for (const f of flows) {
      const key = `${f.a.emirate}|${f.a.zone}`;
      const cur = byZone.get(key) ?? { lat: f.z!.lat, lng: f.z!.lng, weekly: 0, models: new Set<string>() };
      cur.weekly += f.a.weekly;
      cur.models.add(f.a.model);
      byZone.set(key, cur);
    }
    return [...byZone.entries()].map(([key, v]) => ({ key, ...v }));
  }, [flows]);

  const hubResult = useMemo(() => new Map(comp.hubs.map((h) => [h.id, h])), [comp]);

  const highlightEntity = highlightId
    ? HUB_BY_ID.get(highlightId) ??
      DARK_STORES.find((s) => s.id === highlightId) ??
      OD_NETWORK.find((o) => o.id === highlightId) ??
      null
    : null;

  return (
    <MapContainer
      center={[24.35, 54.15]}
      zoom={6}
      minZoom={5}
      zoomSnap={0.25}
      attributionControl={false}
      zoomControl={false}
      className="h-full w-full"
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer url={CARTO_DARK} attribution={CARTO_ATTR} />
      <ZoomControl position="bottomright" />
      <FullUaeViewport focus={focus} />
      <FocusController focus={focus} />
      <FocusRing focus={focus} />
      <ClickHandler armed={armed} onPlace={onPlace} />

      {/* Animated flows — amber = re-routed by the scenario */}
      {flows.map((f) => {
        const w = Math.min(4.5, 0.9 + f.a.weekly / 700);
        return (
          <Polyline
            key={`${f.a.emirate}|${f.a.zone}|${f.a.model}|${f.a.hubId}`}
            positions={[
              [f.hub!.lat, f.hub!.lng],
              [f.z!.lat, f.z!.lng],
            ]}
            pathOptions={{
              color: f.reassigned ? STATUS_HEX["High Load"] : ELECTRIC_HEX,
              weight: w,
              opacity: f.reassigned ? 0.8 : 0.38,
              dashArray: "5 9",
              className: "flow-line",
            }}
          />
        );
      })}

      {/* Traveling particles on every flow — demand in motion */}
      <FlowParticles dep={comp} />

      {/* Zone demand dots — sized by weekly volume */}
      {zones.map((z) => {
        const express = z.models.has("Express") && !z.models.has("Standard");
        const color = express ? CYAN_HEX : ELECTRIC_HEX;
        return (
          <CircleMarker
            key={z.key}
            center={[z.lat, z.lng]}
            radius={Math.min(11, 3.5 + Math.sqrt(z.weekly) / 7)}
            pathOptions={{ color, weight: 1, fillColor: color, fillOpacity: 0.45, opacity: 0.8, className: "zone-dot" }}
            interactive={false}
          />
        );
      })}

      {/* New-hub coverage halo */}
      {newHub ? (
        <Circle
          center={[newHub.lat, newHub.lng]}
          radius={9000}
          pathOptions={{ color: CYAN_HEX, weight: 1.2, dashArray: "4 7", fillColor: CYAN_HEX, fillOpacity: 0.05, opacity: 0.7 }}
          interactive={false}
        />
      ) : null}

      {/* Touched hub (resize / riders) highlight */}
      {touchedId && HUB_BY_ID.get(touchedId) ? (
        <Circle
          center={[HUB_BY_ID.get(touchedId)!.lat, HUB_BY_ID.get(touchedId)!.lng]}
          radius={6000}
          pathOptions={{ color: ELECTRIC_HEX, weight: 1.4, dashArray: "2 6", fillOpacity: 0, opacity: 0.8 }}
          interactive={false}
        />
      ) : null}

      {/* Overload alarm rings */}
      {comp.hubs
        .filter((h) => h.util > 100)
        .map((h) => {
          const hub = HUB_BY_ID.get(h.id);
          if (!hub) return null;
          return (
            <Circle
              key={`over-${h.id}`}
              center={[hub.lat, hub.lng]}
              radius={7000}
              pathOptions={{ color: STATUS_HEX["At Risk"], weight: 2, fillColor: STATUS_HEX["At Risk"], fillOpacity: 0.08, className: "overload-ring" }}
              interactive={false}
            />
          );
        })}

      {/* Land mask — keeps every radius off the ocean */}
      <UaeMask />

      {/* Hub pins, coloured by SIMULATED utilisation */}
      {ACTIVE_HUBS.map((hub) => {
        if (closedId === hub.id) {
          return (
            <Marker key={hub.id} position={[hub.lat, hub.lng]} icon={closedIcon}>
              <Tooltip>
                <span className="font-medium">{hub.name} — CLOSED in this scenario</span>
              </Tooltip>
            </Marker>
          );
        }
        const r = hubResult.get(hub.id);
        const util = r?.util ?? 0;
        const status = simStatus(util);
        return (
          <Marker key={hub.id} position={[hub.lat, hub.lng]} icon={hubIcon(hub, status, touchedId === hub.id)}>
            <Tooltip>
              <span className="font-medium">
                {hub.name} — {fmtInt(Math.round(r?.daily ?? 0))}/day of {fmtInt(Math.round((r?.daily ?? 0) / Math.max(1, util / 100)))} · {util.toFixed(0)}% util
                {util > 100 ? " · OVER CAPACITY" : ""}
              </span>
            </Tooltip>
          </Marker>
        );
      })}

      {/* The new hub, pulsing cyan */}
      {newHub ? (
        <Marker position={[newHub.lat, newHub.lng]} icon={newHubIcon(newHub.maxDaily)}>
          <Tooltip>
            <span className="font-medium">
              {newHub.name} — NEW · {fmtInt(newHub.maxDaily)}/day
            </span>
          </Tooltip>
        </Marker>
      ) : null}

      {/* New-customer assessment: serving entity ring + link line */}
      {highlightEntity ? (
        <Circle
          center={[highlightEntity.lat, highlightEntity.lng]}
          radius={4500}
          pathOptions={{ color: CYAN_HEX, weight: 2, dashArray: "4 6", fillColor: CYAN_HEX, fillOpacity: 0.06, opacity: 0.9 }}
          interactive={false}
        />
      ) : null}
      {customerPin && highlightEntity ? (
        <Polyline
          positions={[
            [highlightEntity.lat, highlightEntity.lng],
            [customerPin.lat, customerPin.lng],
          ]}
          pathOptions={{ color: CYAN_HEX, weight: 2, opacity: 0.85, dashArray: "6 8", className: "flow-line" }}
        />
      ) : null}
      {customerPin ? (
        <Marker position={[customerPin.lat, customerPin.lng]} icon={pickIcon}>
          <Tooltip>
            <span className="font-medium">New customer site</span>
          </Tooltip>
        </Marker>
      ) : null}

      {/* Placement pin while arming a location pick */}
      {pickMarker ? <Marker position={[pickMarker.lat, pickMarker.lng]} icon={pickIcon} /> : null}
    </MapContainer>
  );
}
