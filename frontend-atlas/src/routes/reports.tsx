import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AtlasButton, Card, Chip, PageHead, SectionTitle } from "@/components/atlas/ui";
import { exportUrl } from "@/lib/api";
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
  // Chat-saved reports keep their captured text; the download itself is the
  // backend's export (the engine-composed brief), never client-assembled.
  window.open(exportUrl("/export/report.md"), "_blank");
  void report;
}

function downloadXlsx(report: SavedReport) {
  window.open(exportUrl("/export/report.xlsx?include_optimizer=true"), "_blank");
  void report;
}

function ReportsPage() {
  const { savedReports } = useAtlas();

  const [autoBrief, setAutoBrief] = useState<SavedReport>({
    id: "auto-baseline",
    title: "Network decision brief — live",
    date: "",
    auto: true,
    summary: "Fetching the engine-composed decision brief…",
    bodyMd: "",
  });
  useEffect(() => {
    let cancelled = false;
    fetch(exportUrl("/brief"))
      .then((r) => r.json())
      .then((brief: { generated_at?: string; summary?: string; current_state?: Record<string, unknown>; sensitivity?: Record<string, unknown> }) => {
        if (cancelled) return;
        const cur = brief.current_state ?? {};
        const sens = brief.sensitivity ?? {};
        setAutoBrief({
          id: "auto-baseline",
          title: "Network decision brief — live",
          date: String(brief.generated_at ?? "").slice(0, 10),
          auto: true,
          summary: String(brief.summary ?? ""),
          bodyMd: [
            "## Current state",
            ...Object.entries(cur).map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`),
            "",
            "## Sensitivity",
            ...Object.entries(sens).map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${String(v)}`),
          ].join("\n"),
        });
      })
      .catch(() => {
        if (!cancelled)
          setAutoBrief((b) => ({ ...b, summary: "Engine unreachable — start the backend to load the live brief." }));
      });
    return () => {
      cancelled = true;
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
