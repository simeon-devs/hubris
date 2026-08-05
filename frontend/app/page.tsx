"use client";

/**
 * HOME — the REAL TomTom map with the approved AtlasVision skin on top.
 * The pure-canvas prototype lives at /vision; the previous UI at /classic.
 */

import dynamic from "next/dynamic";

const AtlasHome = dynamic(() => import("@/components/AtlasHome"), { ssr: false });

export default function HomePage() {
  return <AtlasHome />;
}
