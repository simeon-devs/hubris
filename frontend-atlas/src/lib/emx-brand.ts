/**
 * EMX brand primitives shared by the app chrome and the PDF template.
 *
 * The bundled logo asset (emx-logo.svg.asset.json) points at a hosted URL
 * that is dead in this environment — the sidebar was showing a broken
 * image. Until the official files are dropped into the repo (see
 * OFFICIAL_LOGO_PATH below), the mark is recreated as a typographic
 * lockup: "em" in the display face + the brand's offset-bar X device as
 * pure SVG shapes, in the wordmark blue sampled from the brand files.
 */

export const EMX_BLUE = "#2431ae";

/** The OFFICIAL logo landed (2026-08-06): public/emx-logo.jpeg (blue latin,
 *  from /images at the repo root, where the black + Arabic variants also
 *  live). The chrome and the PDF use it; the recreated lockup below stays
 *  only as the PDF's non-browser fallback. */
export const OFFICIAL_LOGO_PATH = "/emx-logo.jpeg";

/** The X device: two offset bars that never touch — as an SVG fragment. */
export function emxXSvg(color: string, heightPx: number): string {
  return `<svg viewBox="0 0 100 100" style="height:${heightPx}px;width:auto;display:inline-block" aria-hidden="true">
  <g fill="${color}">
    <rect x="9" y="38.5" width="82" height="23" rx="2" transform="rotate(33 50 50)"/>
    <rect x="9" y="38.5" width="82" height="23" rx="2" transform="rotate(-33 50 50)"/>
  </g>
</svg>`;
}

/** The full "emx" lockup as an HTML string (for the PDF template). */
export function emxLockupHtml(fontPx: number, color: string = EMX_BLUE): string {
  return `<span style="display:inline-flex;align-items:center;gap:${Math.round(fontPx * 0.1)}px;color:${color};font-family:'Alexandria','Arial Black',sans-serif;font-weight:800;font-size:${fontPx}px;letter-spacing:-0.04em;line-height:1">em${emxXSvg(color, Math.round(fontPx * 0.86))}</span>`;
}
