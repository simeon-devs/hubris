/**
 * The EMX wordmark as a live component — "em" in the display face plus
 * the brand's offset-bar X device, in the wordmark blue. Replaces the
 * dead-hosted logo asset (broken image in the chrome); drop the official
 * SVG into public/ and swap per emx-brand.ts to use the real files.
 */

import { EMX_BLUE } from "@/lib/emx-brand";

export function EmxLockup({ label, fontPx, color = EMX_BLUE }: { label: string; fontPx: number; color?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex items-center leading-none"
      style={{
        color,
        gap: Math.round(fontPx * 0.1),
        fontFamily: "'Alexandria','Arial Black',sans-serif",
        fontWeight: 800,
        fontSize: fontPx,
        letterSpacing: "-0.04em",
      }}
    >
      em
      <svg viewBox="0 0 100 100" style={{ height: Math.round(fontPx * 0.86), width: "auto" }} aria-hidden="true">
        <g fill="currentColor">
          <rect x="9" y="38.5" width="82" height="23" rx="2" transform="rotate(33 50 50)" />
          <rect x="9" y="38.5" width="82" height="23" rx="2" transform="rotate(-33 50 50)" />
        </g>
      </svg>
    </span>
  );
}
