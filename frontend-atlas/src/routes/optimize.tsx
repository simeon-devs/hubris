import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { Card, Chip, PageHead, SectionTitle } from "@/components/atlas/ui";
import { HUBS, entityName, fmtInt, fmtNum } from "@/lib/atlas-data";
import {
  getBottleneck,
  getDemandGrowthBreak,
  getNetwork,
  getRankedShapes,
  optimize,
  optimizeFrontier,
  type ApiBottleneck,
  type ApiFrontier,
  type ApiNetwork,
  type ApiOptimizeResponse,
  type ApiRankedShape,
  type ApiThreshold,
} from "@/lib/api";
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

function Money({ v }: { v: number }) {
  return <span className="font-mono font-semibold text-foreground">{fmtInt(Math.round(v))} AED/day</span>;
}

function MoneyParcel({ v }: { v: number }) {
  return <span className="font-mono font-semibold text-foreground">{fmtNum(v)} AED/parcel</span>;
}

const cpsTone = (cps: number) => (cps >= 14 ? "text-risk" : cps >= 10 ? "text-warn" : "text-ok");
const utilTone = (u: number) => (u >= 92 ? "bg-risk" : u >= 80 ? "bg-warn" : "bg-ok");

function OptimizePage() {
  // Everything on this page is a REAL engine result, fetched on mount.
  const [opt, setOpt] = useState<ApiOptimizeResponse | null>(null);
  const [bottleneck, setBottleneck] = useState<ApiBottleneck | null>(null);
  const [threshold, setThreshold] = useState<ApiThreshold | null>(null);
  const [net, setNet] = useState<ApiNetwork | null>(null);
  const [ranked, setRanked] = useState<{ shapes: ApiRankedShape[]; evaluated?: number; feasible_count?: number } | null>(null);
  const [frontierBusy, setFrontierBusy] = useState(false);
  const [frontierError, setFrontierError] = useState<string | null>(null);
  const [frontierRes, setFrontierRes] = useState<ApiFrontier | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([optimize(), getBottleneck(), getNetwork(), getRankedShapes(8)])
      .then(([o, b, n, r]) => {
        if (cancelled) return;
        setOpt(o);
        setBottleneck(b);
        setNet(n);
        setRanked(r);
        // break-even for the hub the engine says is busiest right now
        const hottest = [...n.hubs]
          .filter((h) => h.status === "open")
          .sort((a, b2) => b2.utilization_pct - a.utilization_pct)[0];
        if (hottest) {
          getDemandGrowthBreak(hottest.id)
            .then((t) => !cancelled && setThreshold(t))
            .catch(() => {});
        }
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const [minHubs, setMinHubs] = useState(1);
  const [maxShare, setMaxShare] = useState(45);
  useEffect(() => {
    let cancelled = false;
    setFrontierBusy(true);
    setFrontierError(null);
    optimizeFrontier({ min_hubs_per_emirate: minHubs, max_hub_volume_share: maxShare / 100 })
      .then((f) => {
        if (!cancelled) setFrontierRes(f);
      })
      .catch((e: Error) => {
        // Never leave stale numbers standing with no warning.
        if (!cancelled) setFrontierError(e.message);
      })
      .finally(() => {
        if (!cancelled) setFrontierBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [minHubs, maxShare]);

  // Adapt the API frontier into the card's column shape (labels only).
  const frontier = useMemo(() => {
    if (!frontierRes) return null;
    const column = (side: ApiFrontier["unconstrained"], note: string) => ({
      opens: side.changes.filter((c) => c.action === "open_hub").map((c) => c.hub_id),
      closes: side.changes.filter((c) => c.action === "close_hub").map((c) => c.hub_id),
      hubsOpen: side.hubs_open_count,
      cps: side.cost_to_serve_after,
      variableAedDay: side.cost_pools.variable_only_aed_per_parcel,
      fullyLoadedAedDay: side.cost_pools.fully_loaded_aed_per_parcel,
      note,
    });
    return {
      raw: column(frontierRes.unconstrained, "raw optimum"),
      recommended: column(frontierRes.constrained, "resilient optimum"),
      premiumAedDay: frontierRes.resilience_premium.total_cost_delta,
      constraintsRelaxed: !frontierRes.constrained.constraints_enforced,
      reasoning: [
        "Both columns are real MILP solves; the recommended one adds the resilience policy (min hubs per emirate, max single-hub share).",
        "The premium is the engine-computed cost of not concentrating the network.",
      ],
    };
  }, [frontierRes]);

  // Hub economics from the engine's own per-hub fields + the file's rents.
  const econ = useMemo(() => {
    if (!net) return [];
    const rentById = new Map(HUBS.map((h) => [h.id, h.rent]));
    return net.hubs
      .filter((h) => h.status === "open")
      .map((h) => ({
        id: h.id,
        name: h.name,
        emirate: h.emirate,
        hubType: h.hub_type ?? "Hub",
        status: "Normal",
        daily: h.rider_capacity_daily ?? 0,
        util: h.utilization_pct,
        cps: h.cost_to_serve,
        varAedDay: 0,
        fixedAedDay: 0,
        rentAedMonth: rentById.get(h.id) ?? 0,
        verdict: h.cost_to_serve >= 90 ? "Fix now" : h.cost_to_serve >= 55 ? "Watch" : "Efficient",
        note: "",
      }));
  }, [net]);

  const shapes = useMemo(() => {
    if (!ranked) return { shapes: [], evaluated: 0, shown: 0, feasibleCount: 0, baselineCps: 0 };
    return {
      shapes: ranked.shapes.map((r) => ({
        rank: r.rank,
        label: r.label,
        opens: r.opens,
        closes: r.closes,
        hubsOpen: r.hubs_open,
        cps: r.cps,
        aedDay: r.aed_day,
        saveAedMonth: r.save_aed_month,
        stressPct: r.stress_safe_pct,
        isCurrent: r.is_current,
        isRecommended: r.is_recommended,
      })),
      evaluated: ranked.evaluated ?? ranked.shapes.length,
      shown: ranked.shapes.length,
      feasibleCount: ranked.feasible_count ?? ranked.shapes.filter((r) => r.feasible !== false).length,
      baselineCps: 0,
    };
  }, [ranked]);

  const [emirateFilter, setEmirateFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"cps" | "util" | "rent">("cps");

  // The engine's own monthly saving for the recommended shape (ranked row).
  const monthlySave = shapes.shapes.find((s) => s.isRecommended)?.saveAedMonth ?? 0;

  const emirates = useMemo(() => ["all", ...Array.from(new Set(econ.map((r) => r.emirate)))], [econ]);
  const econRows = useMemo(() => {
    const rows = econ.filter((r) => emirateFilter === "all" || r.emirate === emirateFilter);
    const key = {
      cps: (r: (typeof econ)[number]) => -r.cps,
      util: (r: (typeof econ)[number]) => -r.util,
      rent: (r: (typeof econ)[number]) => -r.rentAedMonth,
    }[sortBy];
    return [...rows].sort((a, b) => key(a) - key(b));
  }, [econ, emirateFilter, sortBy]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Card className="p-5 text-[12px] text-risk">
          Engine unreachable: {loadError}. Start the backend and reload — nothing on this page is
          computed client-side.
        </Card>
      </div>
    );
  }
  if (!opt || !bottleneck || !net || !frontier) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Card className="p-5 text-[12px] text-muted-foreground">
          Running the engine — MILP, frontier, 16 ranked shape evaluations…
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <PageHead
        kicker="Recommended saving — the plan you can live with"
        value={fmtInt(Math.round(monthlySave))}
        unit="AED / month"
        sub={
          frontier.recommended.closes.length > 0
            ? `Close ${frontier.recommended.closes.map((id) => entityName(id)).join(", ")} — a hub stays in every emirate, no hub over ${maxShare}% of volume.`
            : "With your policy, the current layout is already the best shape."
        }
      />

      {/* 1 · Recommendation — the RESILIENT plan (the ★ below). The raw
          optimum saves more but concentrates the network; it is shown as
          evidence in the Frontier card, never recommended. */}
      <Card className="p-5">
        <SectionTitle hint="what we would actually do">Recommendation</SectionTitle>
        {frontier.recommended.closes.length + frontier.recommended.opens.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {frontier.recommended.opens.map((id) => (
              <Chip key={id} tone="ok">open · {entityName(id)}</Chip>
            ))}
            {frontier.recommended.closes.map((id) => (
              <Chip key={id} tone="risk">close · {entityName(id)}</Chip>
            ))}
            <Chip tone="teal">
              {fmtNum(opt.cost_to_serve_before, 2)} → {fmtNum(frontier.recommended.cps, 2)} AED / shipment
            </Chip>
          </div>
        ) : (
          <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-[12px] text-text-secondary">
            Under your resilience policy, the current 10-hub layout is already the cheapest feasible shape.
          </p>
        )}
        <p className="mb-3 rounded-lg border border-warn/25 bg-warn/8 px-3 py-2 text-[11.5px] leading-relaxed text-text-secondary">
          The <span className="font-semibold text-foreground">raw optimum saves more</span> — close{" "}
          {frontier.raw.closes.length}, down to {fmtNum(frontier.raw.cps, 2)} AED/shipment — but it concentrates
          the network into {frontier.raw.hubsOpen} hub{frontier.raw.hubsOpen === 1 ? "" : "s"}. It is shown in the
          Frontier below as evidence, not recommended.
        </p>
        <details className="rounded-xl border bg-background/50">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-text-secondary hover:text-foreground">
            Engine reasoning
          </summary>
          <ul className="space-y-1.5 px-3.5 pb-3.5 pt-1">
            {[
              "MILP facility-location (CBC) with a wired-in greedy fallback; objective = total cost/day.",
              `Resilience policy enforced IN the solver: at least ${minHubs} hub(s) per emirate, no hub above ${maxShare}% of network volume.`,
              `Robustness of the raw optimum: ${opt.robustness.trials} Monte-Carlo re-solves at ±${opt.robustness.demand_variation_pct}% demand — feasible in ${opt.robustness.feasible_pct}% of trials.`,
              "Service capability is enforced: same-day (Express) demand can only route to Full Hubs.",
            ].map((r, i) => (
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
        <SectionTitle hint={`engine evaluated ${shapes.evaluated} layouts · showing top ${shapes.shown} · ${shapes.feasibleCount} feasible`}>Ranked network shapes</SectionTitle>
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
            {(["cps", "util", "rent"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider transition-colors",
                  sortBy === k ? "border-primary/40 bg-primary/12 text-primary" : "bg-background/50 text-text-secondary hover:text-foreground",
                )}
              >
                {k === "cps" ? "Cost/ship" : k === "util" ? "Util" : "Rent"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          {econRows.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg bg-background/50 px-3 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_auto_auto_auto]">
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
              <div className="text-right">
                <Chip tone={r.verdict === "Efficient" ? "ok" : r.verdict === "Watch" ? "warn" : "risk"}>{r.verdict}</Chip>
                <p className="mt-1 font-mono text-[9px] text-muted-foreground">rent {fmtInt(r.rentAedMonth)}/mo</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
          Every figure is the engine's; the verdicts are display labels on its cost-to-serve:{" "}
          <span className="font-semibold text-foreground">Fix now</span> ≥ 90 AED/shipment,{" "}
          <span className="font-semibold text-foreground">Watch</span> ≥ 55,{" "}
          <span className="font-semibold text-foreground">Efficient</span> below. Check the Limits card before
          resizing anything that is saturating.
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
          {frontierBusy ? <Chip tone="teal">re-solving with your policy…</Chip> : null}
        </div>
        {frontierError ? (
          <p className="mb-3 rounded-lg border border-risk/30 bg-risk/10 px-3 py-2 text-[11px] text-risk">
            Policy re-solve failed ({frontierError}) — the numbers below are the LAST successful solve, not your
            current knobs.
          </p>
        ) : null}

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
                  <span className="text-muted-foreground" title="The pool the dataset's ≤7.00 AED target is defined on">Variable-only</span>
                  <MoneyParcel v={col.variableAedDay} />
                </div>
                <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                  <span className="text-muted-foreground">Fully loaded</span>
                  <MoneyParcel v={col.fullyLoadedAedDay} />
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
        <SectionTitle hint="engine binary search — real re-solves">Limits</SectionTitle>
        {threshold?.threshold_found ? (
          <div className="mb-4 flex items-baseline gap-3">
            <span className="font-mono text-[32px] font-bold leading-none text-risk">
              +{fmtNum(threshold.growth_pct_threshold ?? 0)}%
            </span>
            <p className="text-[12px] text-text-secondary">
              demand growth breaks <span className="font-semibold text-foreground">{entityName(threshold.hub_id ?? "")}</span> — the busiest hub, at {fmtNum(threshold.hub_utilization_pct ?? 0)}% utilisation at that point.
            </p>
          </div>
        ) : null}
        <p className="rounded-lg bg-muted px-3 py-2 text-[12px] leading-relaxed text-text-secondary">
          {bottleneck.bottleneck_found ? bottleneck.why : bottleneck.reason ?? "No binding bottleneck at current demand — the network has headroom everywhere."}
        </p>
        {bottleneck.bottleneck_found ? (
          <p className="mt-2 rounded-lg border border-ok/25 bg-ok/8 px-3 py-2 text-[12px] leading-relaxed text-foreground">
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-ok">Cheapest verified fix · </span>
            computed by re-solving the flow, not extrapolated — see the alert drawer for the action card.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
