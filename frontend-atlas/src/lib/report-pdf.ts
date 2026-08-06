/**
 * The ready-to-serve decision-brief template. "Download PDF" opens this
 * as a print-styled A4 document and triggers the browser's print dialog —
 * Save as PDF gives a branded file. Content is EXACTLY the report on
 * screen (summary + body, every figure engine-returned); this module only
 * lays it out. No external assets except the same Google fonts the app
 * already uses.
 */

import { EMX_BLUE, emxLockupHtml } from "@/lib/emx-brand";
import type { SavedReport } from "@/lib/atlas-store";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Section {
  heading: string | null;
  rows: { label: string; value: string }[];
  bullets: string[];
  paras: string[];
}

/** Body lines -> sections; "- Label: A → B unit" lines become table rows. */
function parseBody(bodyMd: string): Section[] {
  const sections: Section[] = [];
  let cur: Section = { heading: null, rows: [], bullets: [], paras: [] };
  const push = () => {
    if (cur.heading || cur.rows.length || cur.bullets.length || cur.paras.length) sections.push(cur);
  };
  for (const raw of bodyMd.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("##")) {
      push();
      cur = { heading: line.replace(/^#+\s*/, ""), rows: [], bullets: [], paras: [] };
    } else if (line.startsWith("- ")) {
      const item = line.slice(2);
      const idx = item.indexOf(": ");
      if (idx > 0 && item.includes("→")) {
        cur.rows.push({ label: item.slice(0, idx), value: item.slice(idx + 2) });
      } else {
        cur.bullets.push(item);
      }
    } else {
      cur.paras.push(line);
    }
  }
  push();
  return sections;
}

function sectionHtml(s: Section): string {
  const heading = s.heading
    ? `<h2>${esc(s.heading)}</h2>`
    : "";
  const paras = s.paras.map((p) => `<p class="para">${esc(p)}</p>`).join("");
  const bullets = s.bullets.length
    ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
    : "";
  const rows = s.rows.length
    ? `<table><tbody>${s.rows
        .map(
          (r) =>
            `<tr><td class="lbl">${esc(r.label)}</td><td class="val">${esc(r.value)}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";
  return `<section>${heading}${paras}${bullets}${rows}</section>`;
}

export function reportPdfHtml(report: SavedReport): string {
  const date = report.date || new Date().toISOString().slice(0, 10);
  const sections = parseBody(report.bodyMd).map(sectionHtml).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(report.title)} — EMX ATLAS</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" />
<style>
  @page { size: A4; margin: 16mm 16mm 20mm; }
  * { box-sizing: border-box; margin: 0; }
  html, body { background: #fff; }
  body {
    font-family: 'Alexandria', 'Segoe UI', sans-serif;
    color: #16181f; font-size: 11.5px; line-height: 1.55;
    max-width: 178mm; margin: 0 auto; padding: 24px 0 40px;
  }
  header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 3px solid ${EMX_BLUE}; }
  .doc-meta { text-align: right; }
  .doc-meta .k { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #6a6f80; font-weight: 600; }
  .doc-meta .d { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #3a3f4e; }
  h1 { font-size: 21px; font-weight: 800; letter-spacing: -0.01em; margin: 22px 0 4px; }
  .badge { display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${EMX_BLUE}; border: 1px solid ${EMX_BLUE}44; border-radius: 99px; padding: 2px 10px; margin-bottom: 14px; }
  .summary { background: ${EMX_BLUE}0d; border-left: 3px solid ${EMX_BLUE}; border-radius: 6px; padding: 12px 14px; font-size: 12px; margin-bottom: 6px; }
  h2 { font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: ${EMX_BLUE}; margin: 20px 0 8px; }
  .para { margin: 6px 0; color: #2a2f3c; }
  ul { padding-left: 16px; margin: 6px 0; }
  li { margin: 3px 0; color: #2a2f3c; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { padding: 6px 10px; border-bottom: 1px solid #e6e8f0; }
  td.lbl { color: #3a3f4e; width: 46%; }
  td.val { font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 11px; color: #16181f; }
  tr:nth-child(odd) td { background: #f7f8fc; }
  footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e6e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #6a6f80; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <header>
    ${emxLockupHtml(30)}
    <div class="doc-meta">
      <p class="k">EMX Atlas · Decision brief</p>
      <p class="d">${esc(date)}</p>
    </div>
  </header>
  <h1>${esc(report.title)}</h1>
  <span class="badge">${report.auto ? "Engine-composed · live network" : "Simulation run · engine-verified"}</span>
  <div class="summary">${esc(report.summary)}</div>
  ${sections}
  <footer>
    <span>Every figure computed by the EMX ATLAS engine — never estimated.</span>
    <span>emx atlas · digital network twin</span>
  </footer>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 350);
    });
  </script>
</body>
</html>`;
}
