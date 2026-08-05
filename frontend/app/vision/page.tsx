"use client";

/**
 * /vision — the previous home: the real TomTom map wearing the AtlasVision
 * skin (intro flight, story mode, glass hub cards). Preserved in full.
 */

import dynamic from "next/dynamic";

const AtlasHome = dynamic(() => import("@/components/AtlasHome"), { ssr: false });

export default function VisionPage() {
  return <AtlasHome />;
}
