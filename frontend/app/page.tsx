"use client";

/**
 * HOME — the approved EMX interface (frontend/design/atlas-app.html), live
 * against the real engine with the official dataset as offline fallback.
 * The previous TomTom home lives at /vision; the classic UI at /classic.
 */

import dynamic from "next/dynamic";

const EmxAtlas = dynamic(() => import("@/components/EmxAtlas"), { ssr: false });

export default function HomePage() {
  return <EmxAtlas />;
}
