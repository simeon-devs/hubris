import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Card, Chip, PageHead, SectionTitle } from "@/components/atlas/ui";
import { DEMAND, entityName, fmtInt, fmtNum } from "@/lib/atlas-data";
import {
  findBottleneck,
  frontierOptimize,
  hubEconomics,
  optimizeNetwork,
  predictedBreaks,
  rankedNetworkShapes,
} from "@/lib/atlas-engine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/optimize")({
  head: () => ({
    meta: [
      { title: "Optimize — EMX ATLAS" },
      {
        name: "description",
        content:
          "MILP-style network optimisation over the EMX digital twin: recommendations, the raw-vs-recommended frontier with resilience premium, per-hub economics and breaking-point limits.",
      },
      { property: "og:title", content: "Optimize — EMX ATLAS" },
      { property: "og:description", content: "Network optimisation, hub economics, frontier and limits for the EMX UAE network." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OptimizePage,
});

const W13 = 12;
const monthlyShipments =
  DEMAND.filter((d) => d.network === "Hub & Spoke").reduce((s, d) => s + (d.weekly[W13] ?? 0), 0) * (30 / 7);

function Money({ v }: { v: number }) {
  return <span className="font-mono font-semibold text-foreground">{fmtInt(Math.round(v))} AED/day</span>;
}

const cpsTone = (cps: number) => (cps >= 14 ? "text-risk" : cps >= 10 ? "text-warn" : "text-ok");
const utilTone = (u: number) => (u >= 92 ? "bg-risk" : u >= 80 ? "bg-warn" : "bg-ok");

function OptimizePage() {
  const opt = useMemo(() => optimizeNetwork(), []);
  const bottleneck = useMemo(() => findBottleneck(), []);
  const breaks = useMemo(() => predictedBreaks(26), []);
  const econ = useMemo(() => hubEconomics(), []);
  const shapes = useMemo(() => rankedNetworkShapes(8), []);

  const [minHubs, setMinHubs] = useState(1);
  const [maxShare, setMaxShare] = useState(45);
  const frontier = useMemo(() => frontierOptimize(minHubs, maxShare), [minHubs, maxShare]);

  const [emirateFilter, setEmirateFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"cps" | "util" | "cost" | "rent">("cps");

  const monthlySave = Math.max(0, (opt.cost_to_serve_before - opt.cost_to_serve_after) * monthlyShipments);
  const first = breaks[0];

  const emirates = useMemo(() => ["all", ...Array.from(new Set(econ.map((r) => r.emirate)))], [econ]);
  const econRows = useMemo(() => {
    const rows = econ.filter((r) => emirateFilter === "all" || r.emirate === emirateFilter);
    const key = {
      cps: (r: (typeof econ)[number]) => -r.cps,
      util: (r: (typeof econ)[number]) => -r.util,
      cost: (r: (typeof econ)[number]) => -r.totalAedDay,
      rent: (r: (typeof econ)[number]) => -r.rentAedMonth,
    }[sortBy];
    return [...rows].sort((a, b) => key(a) - key(b));
  }, [econ, emirateFilter, sortBy]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <PageHead
        kicker="Potential monthly saving"
        value={fmtInt(Math.round(monthlySave))}
        unit="AED / month"
        sub={
          opt.changes.length > 0
            ? `${opt.changes.map((c) => `${c.action} ${entityName(c.hub_id)}`).join(" + ")} — feasible in ${opt.robustness.feasible_pct.toFixed(0)}% of ±20% demand stress tests.`
            : "No open/close combination beats the current layout while keeping 100% coverage and every hub under 95% utilisation."
        }
      />

      {/* 1 · Recommendation */}
      <Card className="p-5">
        <SectionTitle hint={`evaluated ${shapes.evaluated} network shapes`}>Recommendation</SectionTitle>
        {opt.changes.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {opt.changes.map((c) => (
              <Chip key={c.hub_id} tone={c.action === "Close" ? "risk" : "ok"}>
                {c.action} · {entityName(c.hub_id)}
              </Chip>
            ))}
            <Chip tone="teal">
              {fmtNum(opt.cost_to_serve_before, 2)} → {fmtNum(opt.cost_to_serve_after, 2)} AED / shipment
            </Chip>
          </div>
        ) : (
          <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-[12px] text-text-secondary">
            The current 10-hub layout is already the cheapest feasible shape.
          </p>
        )}
        <details className="rounded-xl border bg-background/50">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-text-secondary hover:text-foreground">
            Engine reasoning
          </summary>
          <ul className="space-y-1.5 px-3.5 pb-3.5 pt-1">
            {opt.reasoning.map((r, i) => (
              <li key={i} className="text-[11.5px] leading-relaxed text-text-secondary">
                <span className="mr-1.5 font-mono text-primary">{String(i + 1).padStart(2, "0")}</span>
                {r}
              </li>
            ))}
          </ul>
        </details>
      </Card>

      {/* 2 · Ranked shapes — optimizer transparency */}
      <Card className="p-5">
        <SectionTitle hint={`${shapes.feasibleCount} feasible of ${shapes.evaluated} layouts scored`}>Ranked network shapes</SectionTitle>
        <div className="space-y-1.5">
          {shapes.shapes.map((s) => (
            <div
              key={s.rank}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2",
                s.isRecommended ? "border border-primary/30 bg-primary/5" : s.isCurrent ? "border border-dashed bg-background/40" : "bg-background/50",
              )}
            >
              <span className={cn("w-7 font-mono text-[11px] font-bold", s.isRecommended ? "text-primary" : "text-muted-foreground")}>
                {s.isRecommended ? "★" : `#${s.rank}`}
              </span>
              <Chip tone={s.isCurrent ? "neutral" : s.saveAedMonth > 0 ? "teal" : "warn"}>
                {s.isCurrent ? "current" : s.hubsOpen + " hubs"}
              </Chip>
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{s.label}</span>
              <span className="font-mono text-[12px] font-semibold text-foreground">{fmtNum(s.cps, 2)} AED/shipment</span>
              <span className="font-mono text-[10.5px] text-muted-foreground">{fmtInt(Math.round(s.aedDay))} AED/day</span>
              <span className={cn("font-mono text-[10.5px] font-semibold", s.saveAedMonth > 0 ? "text-ok" : "text-muted-foreground")}>
                {s.saveAedMonth > 0 ? `saves ${fmtInt(Math.round(s.saveAedMonth))}/mo` : "no saving"}
              </span>
              <span className={cn("font-mono text-[10.5px]", s.stressPct >= 80 ? "text-ok" : s.stressPct >= 60 ? "text-warn" : "text-risk")}>
                {s.stressPct.toFixed(0)}% stress-safe
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
          Stress-safe = share of demand scenarios from −20% to +20% where the layout still serves 100% of demand with no hub over
          capacity. A cheap layout that breaks under +10% demand is a trap — this is why the recommendation weighs both columns.
        </p>
      </Card>

      {/* 3 · Hub economics — the X-ray */}
      <Card className="p-5">
        <SectionTitle hint="fully-loaded cost vs direct revenue, per hub">Hub economics</SectionTitle>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {emirates.map((e) => (
              <button
                key={e}
                onClick={() => setEmirateFilter(e)}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider transition-colors",
                  emirateFilter === e ? "border-primary/40 bg-primary/12 text-primary" : "bg-background/50 text-text-secondary hover:text-foreground",
                )}
              >
                {e === "all" ? "All emirates" : e}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="kicker">Sort</span>
            {(["cps", "util", "cost", "rent"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider transition-colors",
                  sortBy === k ? "border-primary/40 bg-primary/12 text-primary" : "bg-background/50 text-text-secondary hover:text-foreground",
                )}
              >
                {k === "cps" ? "Cost/ship" : k === "util" ? "Util" : k === "cost" ? "Cost/day" : "Rent"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          {econRows.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg bg-background/50 px-3 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_auto_auto_auto_auto]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[12.5px] font-medium text-foreground">{r.name}</p>
                  <Chip tone="neutral">{r.emirate}</Chip>
                  <Chip tone={r.hubType === "Full Hub" ? "teal" : "neutral"}>{r.hubType}</Chip>
                </div>
                <div className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", utilTone(r.util))} style={{ width: `${Math.min(100, r.util)}%` }} />
                </div>
                {r.verdict !== "Efficient" ? (
                  <p className="mt-1.5 max-w-[320px] text-[10.5px] leading-snug text-muted-foreground">{r.note}</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="kicker">Util</p>
                <p className="font-mono text-[12px] font-semibold text-foreground">{r.util.toFixed(0)}%</p>
              </div>
              <div className="text-right">
                <p className="kicker">Cost/ship</p>
                <p className={cn("font-mono text-[12px] font-semibold", cpsTone(r.cps))}>{fmtNum(r.cps, 2)}</p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="kicker">Loaded/day</p>
                <p className="font-mono text-[12px] font-semibold text-foreground">{fmtInt(Math.round(r.totalAedDay))}</p>
              </div>
              <div className="text-right">
                <Chip tone={r.verdict === "Efficient" ? "ok" : r.verdict === "Watch" ? "warn" : "risk"}>{r.verdict}</Chip>
                <p className="mt-1 font-mono text-[9px] text-muted-foreground">rent {fmtInt(r.rentAedMonth)}/mo</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
          Verdicts come straight from the optimizer: <span className="font-semibold text-foreground">Fix now</span> = over 92%
          utilisation (breach risk), <span className="font-semibold text-foreground">Watch</span> = cost per shipment ≥ 1.8× the
          network median or running hot, <span className="font-semibold text-foreground">Efficient</span> = healthy. Check the
          Limits card before resizing anything that is saturating.
        </p>
      </Card>

      {/* 4 · Frontier */}
      <Card className="p-5">
        <SectionTitle hint="resilience policy vs pure cost">Frontier</SectionTitle>

        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              Min hubs per emirate
            </label>
            <input
              type="number"
              min={1}
              max={3}
              value={minHubs}
              onChange={(e) => setMinHubs(Math.max(1, Math.min(3, Number(e.target.value) || 1)))}
              className="mt-1.5 w-28 rounded-lg border bg-background/60 px-3 py-1.5 font-mono text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              Max hub share · %
            </label>
            <input
              type="number"
              min={10}
              max={60}
              step={5}
              value={maxShare}
              onChange={(e) => setMaxShare(Math.max(10, Math.min(60, Number(e.target.value) || 45)))}
              className="mt-1.5 w-28 rounded-lg border bg-background/60 px-3 py-1.5 font-mono text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
          {frontier.constraintsRelaxed ? <Chip tone="warn">Policy too strict — relaxed</Chip> : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {([frontier.raw, frontier.recommended] as const).map((col, i) => (
            <div
              key={i}
              className={
                i === 0
                  ? "rounded-xl border border-dashed bg-background/40 p-4"
                  : "rounded-xl border border-primary/30 bg-primary/5 p-4"
              }
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-secondary">{col.note}</p>
                <Chip tone={i === 0 ? "neutral" : "teal"}>{col.hubsOpen} hubs</Chip>
              </div>
              <div className="space-y-1.5 text-[12px]">
                <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                  <span className="text-muted-foreground">Variable-only</span>
                  <Money v={col.variableAedDay} />
                </div>
                <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                  <span className="text-muted-foreground">Fully loaded</span>
                  <Money v={col.fullyLoadedAedDay} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cost / shipment</span>
                  <span className="font-mono font-semibold text-foreground">{fmtNum(col.cps, 2)} AED</span>
                </div>
              </div>
              {col.opens.length + col.closes.length > 0 ? (
                <p className="mt-2.5 font-mono text-[10px] text-muted-foreground">
                  {[...col.opens.map((id) => `+ open ${entityName(id)}`), ...col.closes.map((id) => `− close ${entityName(id)}`)].join("  ·  ")}
                </p>
              ) : (
                <p className="mt-2.5 font-mono text-[10px] text-muted-foreground">current 10-hub layout</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-warn/25 bg-warn/8 px-4 py-2.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-warn">Resilience premium</span>
          <span className="font-mono text-[14px] font-bold text-foreground">{fmtInt(Math.round(frontier.premiumAedDay))} AED/day</span>
        </div>
      </Card>

      {/* 5 · Limits */}
      <Card className="p-5">
        <SectionTitle hint="predictive — compounding zone growth">Limits</SectionTitle>
        {first ? (
          <div className="mb-4 flex items-baseline gap-3">
            <span className="font-mono text-[32px] font-bold leading-none text-risk">~{first.weeks} wks</span>
            <p className="text-[12px] text-text-secondary">
              until <span className="font-semibold text-foreground">{first.name}</span> saturates — the first breaking point in the network.
            </p>
          </div>
        ) : null}
        <p className="rounded-lg bg-muted px-3 py-2 text-[12px] leading-relaxed text-text-secondary">{bottleneck.why}</p>
        <p className="mt-2 rounded-lg border border-ok/25 bg-ok/8 px-3 py-2 text-[12px] leading-relaxed text-foreground">
          <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-ok">Cheapest fix · </span>
          {bottleneck.reason}
        </p>

        <div className="mt-4 space-y-1.5">
          {breaks.slice(0, 5).map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-background/50 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[12px] font-medium text-foreground">{b.name}</span>
                <Chip tone="neutral">{b.network}</Chip>
              </div>
              <span className="shrink-0 font-mono text-[11.5px] font-semibold text-risk">~{b.weeks} wks</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
