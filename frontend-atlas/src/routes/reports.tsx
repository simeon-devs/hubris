import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { AtlasButton, Card, Chip, PageHead, SectionTitle } from "@/components/atlas/ui";
import { fmtInt, fmtNum } from "@/lib/atlas-data";
import { blendedCps, findBottleneck, networkTotals, predictedBreaks } from "@/lib/atlas-engine";
import { useAtlas, type SavedReport } from "@/lib/atlas-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — EMX ATLAS" },
      {
        name: "description",
        content: "Saved decision briefs from the EMX control tower — plain-language summaries with .md and .xlsx downloads.",
      },
      { property: "og:title", content: "Reports — EMX ATLAS" },
      { property: "og:description", content: "Saved decision briefs from the EMX control tower." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function downloadMd(report: SavedReport) {
  const blob = new Blob([`# ${report.title}\n\n_${report.date}_\n\n${report.summary}\n\n${report.bodyMd}`], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadXlsx(report: SavedReport) {
  const lines = report.bodyMd.replace(/^##+\s*/gm, "").split("\n").map((l) => l.replace(/^- /, "").trim()).filter(Boolean);
  const summary = XLSX.utils.aoa_to_sheet([
    ["EMX ATLAS — Decision Brief"],
    ["Title", report.title],
    ["Date", report.date],
    [],
    ["Summary", report.summary],
    [],
    ...lines.map((l) => [l]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summary, "Brief");
  const kpis = XLSX.utils.json_to_sheet(
    networkTotals().map((t) => ({
      Network: t.network,
      "Weekly shipments (W1)": Math.round(t.weeklyW1),
      "Weekly shipments (W13)": Math.round(t.weeklyW13),
      "Daily shipments (W13)": Math.round(t.dailyW13),
      "Growth W1→W13 (%)": Number((t.weeklyW1 > 0 ? ((t.weeklyW13 - t.weeklyW1) / t.weeklyW1) * 100 : 0).toFixed(1)),
    })),
  );
  XLSX.utils.book_append_sheet(wb, kpis, "Network KPIs");
  XLSX.writeFile(wb, `${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx`);
}

function ReportsPage() {
  const { savedReports } = useAtlas();

  const autoBrief = useMemo<SavedReport>(() => {
    const cps = blendedCps();
    const first = predictedBreaks(26)[0];
    const bottleneck = findBottleneck();
    const totals = networkTotals();
    const weekly = totals.reduce((s, t) => s + t.weeklyW13, 0);
    return {
      id: "auto-baseline",
      title: "Network baseline brief — Week 13",
      date: "2026-07-22",
      auto: true,
      summary: `The EMX network moved ~${fmtInt(Math.round(weekly))} shipments in week 13 across three networks at a blended, fully-loaded cost of ${fmtNum(cps, 2)} AED per shipment.${
        first ? ` The first predicted breaking point is ${first.name}, saturating in roughly ${first.weeks} weeks at current growth.` : " No hub is predicted to saturate within 26 weeks."
      }`,
      bodyMd: `## Network totals\n${totals.map((t) => `- ${t.network}: ~${fmtInt(Math.round(t.weeklyW13))} shipments/week (~${fmtInt(Math.round(t.dailyW13))}/day)`).join("\n")}\n\n## Blended cost / shipment\n- ${fmtNum(cps, 2)} AED, fully loaded across all three networks.\n\n## Biggest risk\n- ${bottleneck.why}\n\n## Cheapest fix\n- ${bottleneck.reason}\n`,
    };
  }, []);

  const reports = [autoBrief, ...savedReports];
  const [selectedId, setSelectedId] = useState(autoBrief.id);
  const selected = reports.find((r) => r.id === selectedId) ?? reports[0]!;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <PageHead
        kicker="Decision briefs"
        value={String(reports.length)}
        unit={reports.length === 1 ? "report" : "reports"}
        sub="Everything you adopt or save on the Simulate page lands here as a plain-language brief you can hand to leadership."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* List */}
        <div className="space-y-2">
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={cn(
                "w-full rounded-[13px] border bg-card/70 p-3.5 text-left backdrop-blur-md transition-colors hover:bg-muted/60",
                selectedId === r.id && "border-primary/40 bg-primary/8",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[12.5px] font-semibold text-foreground">{r.title}</p>
                {r.auto ? <Chip tone="teal">Auto</Chip> : null}
              </div>
              <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{r.date}</p>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-text-secondary">{r.summary}</p>
            </button>
          ))}
        </div>

        {/* Detail */}
        <Card className="p-5 lg:col-span-2">
          <SectionTitle hint={selected.date}>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" /> {selected.title}
            </span>
          </SectionTitle>
          <p className="rounded-xl bg-muted px-4 py-3 text-[12.5px] leading-relaxed text-foreground">{selected.summary}</p>
          <div className="mt-3 space-y-1.5">
            {selected.bodyMd
              .split("\n")
              .filter(Boolean)
              .map((l, i) =>
                l.startsWith("##") ? (
                  <p key={i} className="kicker pt-2">{l.replace(/^##+\s*/, "")}</p>
                ) : (
                  <p key={i} className="text-[12px] leading-relaxed text-text-secondary">{l.replace(/^- /, "· ")}</p>
                ),
              )}
          </div>
          <div className="mt-4 flex gap-2 border-t pt-4">
            <AtlasButton variant="outline" onClick={() => downloadMd(selected)}>
              <Download className="h-3.5 w-3.5" /> Download .md
            </AtlasButton>
            <AtlasButton variant="outline" onClick={() => downloadXlsx(selected)}>
              <Download className="h-3.5 w-3.5" /> Download .xlsx
            </AtlasButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
