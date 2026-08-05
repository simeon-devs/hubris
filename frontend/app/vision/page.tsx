"use client";

/**
 * /vision — the pure-canvas AtlasVision prototype, kept intact (real data,
 * no map SDK). The home page carries the same skin over the real TomTom map.
 */

import dynamic from "next/dynamic";

const AtlasVision = dynamic(() => import("@/components/AtlasVision"), { ssr: false });

export default function VisionPage() {
  return <AtlasVision />;
}
