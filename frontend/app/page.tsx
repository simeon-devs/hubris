"use client";

/**
 * HOME — the approved AtlasVision design (frontend/design/atlasvision.html)
 * wired to the live engine. The previous Command view lives on at /classic.
 */

import dynamic from "next/dynamic";

const AtlasVision = dynamic(() => import("@/components/AtlasVision"), { ssr: false });

export default function HomePage() {
  return <AtlasVision />;
}
