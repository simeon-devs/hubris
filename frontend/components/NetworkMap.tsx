"use client";

import { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ArcLayer, ScatterplotLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import MapGL from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FlowMapInfo, HubMapInfo, ZoneMapInfo } from "@/lib/types";

// CARTO's free Positron raster basemap, no API key required. Defined
// inline (not fetched from CARTO's hosted vector style.json) since that
// vector style's schema version isn't consistently compatible across
// maplibre-gl releases — a plain raster XYZ source has no such risk.
const BASEMAP_STYLE = {
  version: 8 as const,
  sources: {
    "carto-light": {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      ],
      tileSize: 256,
      attribution: "© CARTO, © OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "carto-light-layer", type: "raster" as const, source: "carto-light", minzoom: 0, maxzoom: 20 },
  ],
};

const INITIAL_VIEW_STATE = {
  longitude: 54.9,
  latitude: 24.8,
  zoom: 6.7,
  pitch: 0,
  bearing: 0,
};

type RGB = [number, number, number];
const GREEN: RGB = [34, 197, 94];
const AMBER: RGB = [245, 158, 11];
const RED: RGB = [239, 68, 68];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/** Green (low) -> amber (mid) -> red (high, near/over capacity). */
function utilizationColor(pct: number): RGB {
  const clamped = Math.max(0, Math.min(100, pct));
  return clamped <= 50 ? lerpColor(GREEN, AMBER, clamped / 50) : lerpColor(AMBER, RED, (clamped - 50) / 50);
}

function hubRadius(capacity: number): number {
  return Math.max(1200, Math.min(6000, Math.sqrt(capacity) * 80));
}

interface SelectedHub {
  hub: HubMapInfo;
  x: number;
  y: number;
}

interface NetworkMapProps {
  hubs: HubMapInfo[];
  zones: ZoneMapInfo[];
  flows: FlowMapInfo[];
}

export default function NetworkMap({ hubs, zones, flows }: NetworkMapProps) {
  const [selected, setSelected] = useState<SelectedHub | null>(null);

  const hubById = useMemo(() => new Map(hubs.map((h) => [h.id, h])), [hubs]);
  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  const layers = [
    new HeatmapLayer<ZoneMapInfo>({
      id: "demand-heat",
      data: zones,
      getPosition: (z) => [z.lon, z.lat],
      getWeight: (z) => z.demand,
      radiusPixels: 45,
      opacity: 0.35,
    }),
    new ArcLayer<FlowMapInfo>({
      id: "flows",
      data: flows,
      getSourcePosition: (f) => {
        const hub = hubById.get(f.hub_id);
        return hub ? [hub.lon, hub.lat] : [0, 0];
      },
      getTargetPosition: (f) => {
        const zone = zoneById.get(f.zone_id);
        return zone ? [zone.lon, zone.lat] : [0, 0];
      },
      getSourceColor: [59, 130, 246, 130],
      getTargetColor: [59, 130, 246, 30],
      getWidth: (f) => Math.max(1, Math.sqrt(f.volume) / 6),
      pickable: false,
    }),
    new ScatterplotLayer<HubMapInfo>({
      id: "hubs",
      data: hubs,
      pickable: true,
      stroked: true,
      radiusUnits: "meters",
      getPosition: (h) => [h.lon, h.lat],
      getRadius: (h) => hubRadius(h.capacity),
      getFillColor: (h) => {
        const [r, g, b] = utilizationColor(h.utilization_pct);
        return h.status === "open" ? [r, g, b, 220] : [148, 163, 184, 140];
      },
      getLineColor: [255, 255, 255, 255],
      lineWidthMinPixels: 1.5,
      onClick: (info) => {
        if (info.object) {
          setSelected({ hub: info.object as HubMapInfo, x: info.x, y: info.y });
        }
      },
    }),
  ];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller
        layers={layers}
        onClick={(info) => {
          if (!info.object) setSelected(null);
        }}
      >
        <MapGL mapStyle={BASEMAP_STYLE} reuseMaps />
      </DeckGL>

      {selected && (
        <div
          style={{
            position: "absolute",
            left:
              typeof window !== "undefined"
                ? Math.min(selected.x + 12, window.innerWidth - 260)
                : selected.x + 12,
            top: selected.y + 12,
            width: 220,
            background: "rgba(17, 24, 39, 0.95)",
            color: "white",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            lineHeight: 1.5,
            pointerEvents: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {selected.hub.name} ({selected.hub.id})
          </div>
          <div>Status: {selected.hub.status}</div>
          <div>Utilization: {selected.hub.utilization_pct.toFixed(1)}%</div>
          <div>Capacity: {selected.hub.capacity.toLocaleString()} parcels</div>
          <div>Spare: {selected.hub.spare_capacity.toLocaleString()} parcels</div>
          <div>Cost-to-serve: {selected.hub.cost_to_serve.toFixed(2)} AED/parcel</div>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          background: "rgba(255,255,255,0.9)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600 }}>Utilization:</span>
        <LegendSwatch color={GREEN} label="low" />
        <LegendSwatch color={AMBER} label="mid" />
        <LegendSwatch color={RED} label="high" />
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: RGB; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: `rgb(${color.join(",")})`,
        }}
      />
      {label}
    </span>
  );
}
