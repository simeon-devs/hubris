import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  ChevronRight,
  CircleX,
  MapPinPlus,
  Maximize2,
  Merge,
  Minus,
  FileText,
  Play,
  Plus,
  Save,
  TrendingUp,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AtlasButton, Chip, FeasBadge, PageHead } from "@/components/atlas/ui";
import { ACTIVE_HUBS, entityName, fmtInt, fmtNum } from "@/lib/atlas-data";
import {
  assessOpportunity,
  nearestZone,
  runBaseline,
  runCloseHub,
  runCustomHub,
  runDemandScale,
  runResizeHub,
  runRiders,
  runSameDaySurge,
  runShiftToNextDay,
  type OpportunityAssessment,
  type ScenarioRun,
} from "@/lib/atlas-engine";
import { useAtlas } from "@/lib/atlas-store";
import { cn } from "@/lib/utils";

type SimMapModule = typeof import("@/components/atlas/LeafletMap");

export const Route = createFileRoute("/simulate")({
  head: () => ({
    meta: [
      { title: "Simulate — EMX ATLAS" },
      {
        name: "description",
        content:
          "Nine what-if scenarios on the EMX digital twin: close, absorb, open, resize, surge, shift demand and right-size riders — simulated live on the network map.",
      },
      { property: "og:title", content: "Simulate — EMX ATLAS" },
      { property: "og:description", content: "What-if scenarios simulated live on the EMX network map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimulatePage,
});

/* ----------------------------- scenario menu ----------------------------- */

type ScenarioKind = "close" | "absorb" | "open" | "resize" | "surge" | "shift" | "riders" | "demand" | "customer";

const SCENARIOS: { kind: ScenarioKind; title: string; hint: string; icon: LucideIcon; runLabel: string }[] = [
  { kind: "close", title: "Close a hub", hint: "capacity redistributes to neighbours", icon: CircleX, runLabel: "Run scenario" },
  { kind: "absorb", title: "Absorb a micro hub", hint: "fold it into its full hub", icon: Merge, runLabel: "Test absorption" },
  { kind: "open", title: "Open a hub", hint: "type → click the map → capacity", icon: MapPinPlus, runLabel: "Test this site" },
  { kind: "resize", title: "Resize a hub", hint: "capacity up or down", icon: Maximize2, runLabel: "Run resize" },
  { kind: "surge", title: "Same-day surge", hint: "Express demand only", icon: Zap, runLabel: "Run surge" },
  { kind: "shift", title: "Shift same-day → next-day", hint: "offload Express to Standard", icon: ArrowRightLeft, runLabel: "Run shift" },
  { kind: "riders", title: "Right-size riders", hint: "FTE / FTC flex", icon: Users, runLabel: "Run staffing" },
  { kind: "demand", title: "Demand surge", hint: "whole network", icon: TrendingUp, runLabel: "Run demand" },
  { kind: "customer", title: "New customer", hint: "opportunity assessor", icon: UserPlus, runLabel: "Assess opportunity" },
];

const OPEN_TYPES = [
  { kind: "full", title: "Full Hub", cap: 1800, riders: 18, line: "Regional sort + line-haul — serves whole zones, lowest cost per shipment." },
  { kind: "micro", title: "Micro Hub", cap: 800, riders: 8, line: "Last-mile spoke — cheap overhead, fast to stand up." },
  { kind: "darkstore", title: "Dark store", cap: 400, riders: 10, line: "15-minute bike radius — premium q-commerce promise." },
] as const;

/* ------------------------------- form bits ------------------------------- */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-secondary">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function HubSelect({ value, onChange, onlyMicro }: { value: string; onChange: (v: string) => void; onlyMicro?: boolean }) {
  const list = onlyMicro ? ACTIVE_HUBS.filter((h) => h.hubType === "Micro Hub") : ACTIVE_HUBS;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border bg-background/60 px-3 py-2 text-[12.5px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
    >
      {list.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name} — {h.emirate}
        </option>
      ))}
    </select>
  );
}

function Slider({ min, max, step = 5, value, onChange }: { min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="atlas-slider w-full" />
      <div className="mt-1 flex justify-between font-mono text-[9.5px] text-muted-foreground">
        <span>{min > 0 ? `+${min}` : min}%</span>
        <span>{max > 0 ? `+${max}` : max}%</span>
      </div>
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange(value - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border bg-background/60 text-foreground hover:bg-muted" aria-label="Decrease">
        <Minus className="h-3 w-3" />
      </button>
      <span className={cn("w-9 text-center font-mono text-[13px] font-semibold", value === 0 ? "text-muted-foreground" : value > 0 ? "text-ok" : "text-risk")}>
        {value > 0 ? `+${value}` : value}
      </span>
      <button onClick={() => onChange(value + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border bg-background/60 text-foreground hover:bg-muted" aria-label="Increase">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ------------------------------ result tiles ------------------------------ */

function DeltaTile({ label, before, after, unit, goodWhenDown = true }: { label: string; before: number; after: number; unit: string; goodWhenDown?: boolean }) {
  const delta = after - before;
  const good = delta === 0 ? null : goodWhenDown ? delta < 0 : delta > 0;
  return (
    <div className="rounded-xl border bg-background/50 px-3 py-2.5">
      <p className="kicker">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5 font-mono">
        <span className="text-[12px] text-muted-foreground">{fmtNum(before, unit === "%" ? 1 : 2)}</span>
        <span className="text-muted-foreground">→</span>
        <span className={cn("text-[15px] font-bold", good === null ? "text-foreground" : good ? "text-ok" : "text-risk")}>{fmtNum(after, unit === "%" ? 1 : 2)}</span>
        <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

const utilColor = (u: number) => (u >= 92 ? "text-risk" : u >= 80 ? "text-warn" : "text-ok");
const utilBar = (u: number) => (u >= 92 ? "bg-risk" : u >= 80 ? "bg-warn" : "bg-ok");

/* --------------------------------- page --------------------------------- */

function SimulatePage() {
  const { decisions } = useAtlas();
  const [active, setActive] = useState<ScenarioKind>("close");
  const baseline = useMemo(() => runBaseline(), []);
  const cps = baseline.res.baseline_kpis.cost_to_serve.value;

  return (
    <div className="p-6">
      <div className="sr-only">
        <PageHead kicker="Live digital twin · baseline cost / shipment" value={fmtNum(cps, 2)} unit="AED" />
        {decisions.length} adopted decisions
      </div>
      <ScenarioWorkspace kind={active} baseline={baseline} onSelectKind={setActive} />
    </div>
  );
}

/* ------------------------- full-screen workspace ------------------------- */

function ScenarioWorkspace({ kind, baseline, onSelectKind }: { kind: ScenarioKind; baseline: ScenarioRun; onSelectKind: (kind: ScenarioKind) => void }) {
  const meta = SCENARIOS.find((s) => s.kind === kind)!;
  const { adopt, saveReport, logEvent } = useAtlas();

  const [SimMap, setSimMap] = useState<SimMapModule["SimMap"] | null>(null);
  useEffect(() => {
    void import("@/components/atlas/LeafletMap").then((m) => setSimMap(() => m.SimMap));
  }, []);
  const [run, setRun] = useState<ScenarioRun | null>(null);
  const [opp, setOpp] = useState<OpportunityAssessment | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<"baseline" | "scenario">("scenario");
  const [modelFilter, setModelFilter] = useState<"all" | "Standard" | "Express">("all");

  useEffect(() => {
    setRun(null);
    setOpp(null);
    setLabel("");
    setCompare("scenario");
  }, [kind]);

  // form state
  const [closeHubId, setCloseHubId] = useState("HUB_RAK_01");
  const [microHubId, setMicroHubId] = useState("HUB_AJM_01");
  const [openType, setOpenType] = useState(0);
  const [openLoc, setOpenLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [openCap, setOpenCap] = useState(1800);
  const [openRiders, setOpenRiders] = useState(18);
  const [resizeHubId, setResizeHubId] = useState("HUB_RAK_01");
  const [resizePct, setResizePct] = useState(150);
  const [surgePct, setSurgePct] = useState(40);
  const [shiftPct, setShiftPct] = useState(30);
  const [ridersHubId, setRidersHubId] = useState("HUB_RAK_01");
  const [fteDelta, setFteDelta] = useState(0);
  const [ftcDelta, setFtcDelta] = useState(3);
  const [demandPct, setDemandPct] = useState(30);
  const [custName, setCustName] = useState("");
  const [custPromise, setCustPromise] = useState("Standard · next-day");
  const [custVolume, setCustVolume] = useState(5000);
  const [custLoc, setCustLoc] = useState<{ lat: number; lng: number } | null>(null);

  const microHubs = ACTIVE_HUBS.filter((h) => h.hubType === "Micro Hub");
  const resizeHub = ACTIVE_HUBS.find((h) => h.id === resizeHubId);
  const openPreset = OPEN_TYPES[openType]!;
  const pickOpenType = (i: number) => {
    setOpenType(i);
    setOpenCap(OPEN_TYPES[i]!.cap);
    setOpenRiders(OPEN_TYPES[i]!.riders);
  };

  const execute = (lbl: string, compute: () => ScenarioRun) => {
    setBusy(true);
    setTimeout(() => {
      const out = compute();
      setRun(out);
      setOpp(null);
      setLabel(lbl);
      setCompare("scenario");
      logEvent(`Tested — ${lbl}`);
      setBusy(false);
    }, 180);
  };

  const executeOpp = (lbl: string, compute: () => OpportunityAssessment) => {
    setBusy(true);
    setTimeout(() => {
      const out = compute();
      setOpp(out);
      setRun(null);
      setLabel(lbl);
      logEvent(`Assessed — ${lbl}`);
      setBusy(false);
    }, 180);
  };

  const runScenario = () => {
    switch (kind) {
      case "close": {
        const hub = ACTIVE_HUBS.find((h) => h.id === closeHubId);
        execute(`Close ${hub?.name ?? closeHubId}`, () => runCloseHub(closeHubId));
        break;
      }
      case "absorb": {
        const hub = microHubs.find((h) => h.id === microHubId);
        execute(`Absorb ${hub?.name ?? microHubId} (micro)`, () => runCloseHub(microHubId));
        break;
      }
      case "open": {
        if (!openLoc) return;
        execute(`Open ${openPreset.title} at ${openLoc.lat.toFixed(3)},${openLoc.lng.toFixed(3)}`, () =>
          runCustomHub({
            id: `CUST_${Date.now()}`,
            name: `${openPreset.title} · custom`,
            lat: openLoc.lat,
            lng: openLoc.lng,
            maxDaily: openCap,
            kind: openPreset.kind,
          }),
        );
        break;
      }
      case "resize":
        execute(`Resize ${resizeHub?.name ?? ""} to ${resizePct}%`, () =>
          runResizeHub(resizeHubId, Math.round(((resizeHub?.maxDaily ?? 1) * resizePct) / 100)),
        );
        break;
      case "surge":
        execute(`Same-day surge +${surgePct}%`, () => runSameDaySurge(surgePct));
        break;
      case "shift":
        execute(`Shift ${shiftPct}% same-day → next-day`, () => runShiftToNextDay(shiftPct));
        break;
      case "riders": {
        const hub = ACTIVE_HUBS.find((h) => h.id === ridersHubId);
        execute(`Riders at ${hub?.name ?? ridersHubId}: FTE ${fteDelta >= 0 ? "+" : ""}${fteDelta}, FTC ${ftcDelta >= 0 ? "+" : ""}${ftcDelta}`, () =>
          runRiders(ridersHubId, fteDelta, ftcDelta),
        );
        break;
      }
      case "demand":
        execute(`Demand ${demandPct > 0 ? "+" : ""}${demandPct}%`, () => runDemandScale(1 + demandPct / 100));
        break;
      case "customer": {
        if (!custLoc) return;
        const z = nearestZone(custLoc.lat, custLoc.lng);
        if (!z) return;
        const model = (custPromise.split(" · ")[0] ?? "Standard") as "Standard" | "Express" | "QComm";
        executeOpp(`New customer — ${custName.trim() || "Unnamed"} (${z.zone})`, () =>
          assessOpportunity({ clientName: custName.trim() || "Unnamed customer", emirate: z.emirate, zone: z.zone, model, weeklyVolume: custVolume }),
        );
        break;
      }
    }
  };

  const canRun =
    kind === "open" ? Boolean(openLoc) : kind === "customer" ? Boolean(custLoc) : kind === "riders" ? fteDelta !== 0 || ftcDelta !== 0 : true;

  const adoptResult = () => {
    adopt(label, run?.res.delta_pct.cost_to_serve ?? null);
  };

  const saveResult = () => {
    const reasoning = run?.res.reasoning ?? opp?.reasoning ?? [];
    saveReport({
      title: label,
      summary: reasoning[0] ?? label,
      bodyMd: `## ${label}\n\n${reasoning.map((r) => `- ${r}`).join("\n")}\n`,
    });
  };

  const shownComp = run ? (compare === "baseline" ? run.baseline : run.scenario) : baseline.scenario;
  const showingScenario = Boolean(run) && compare === "scenario";
  const feasible = run ? run.res.scenario_flow_feasible : opp ? opp.verdict === "GO" : true;

  const impact = run
    ? run.scenario.hubs
        .map((h) => {
          const b = run.baseline.hubs.find((x) => x.id === h.id);
          return { id: h.id, name: h.name, dailyB: b?.daily ?? 0, dailyA: h.daily, utilB: b?.util ?? 0, utilA: h.util, cpsA: h.cps };
        })
        .filter((h) => h.dailyA > 0.5 || h.dailyB > 0.5)
        .sort((a, b) => b.utilA - a.utilA)
        .slice(0, 8)
    : [];

  const mapArmed = kind === "open" || kind === "customer";
  const pickMarker = kind === "open" ? openLoc : kind === "customer" ? custLoc : null;
  const onPlace = (lat: number, lng: number) => {
    if (kind === "open") setOpenLoc({ lat, lng });
    if (kind === "customer") setCustLoc({ lat, lng });
  };

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-background">
      <div className="relative m-2 flex min-h-0 flex-1 animate-workspace-in flex-col overflow-hidden rounded-2xl border bg-background shadow-tray md:m-4">
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <meta.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{meta.title}</h2>
              <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">{meta.hint}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {label ? <Chip tone={feasible ? "ok" : "risk"}>{label}</Chip> : <Chip tone="neutral">Configuring</Chip>}
            <Link to="/" className="flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Exit simulation and return to map" title="Exit to map">
              <X className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* scenario navigator — all nine simulations share this map */}
          <nav className="w-full shrink-0 border-b bg-sidebar/60 p-2 lg:w-[208px] lg:overflow-y-auto lg:border-b-0 lg:border-r" aria-label="Simulation scenarios">
            <p className="kicker px-2 pb-2 pt-1">Scenario library</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.kind}
                  onClick={() => onSelectKind(scenario.kind)}
                  className={cn(
                    "group flex min-h-12 w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    kind === scenario.kind
                      ? "border-primary/40 bg-primary/12 text-foreground"
                      : "border-transparent bg-background/25 text-text-secondary hover:border-border hover:bg-muted/60 hover:text-foreground",
                  )}
                  aria-current={kind === scenario.kind ? "page" : undefined}
                >
                  <scenario.icon className={cn("h-4 w-4 shrink-0", kind === scenario.kind ? "text-primary" : "text-muted-foreground")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold">{scenario.title}</span>
                    <span className="block truncate text-[9px] text-muted-foreground">{scenario.hint}</span>
                  </span>
                  <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", kind === scenario.kind ? "text-primary" : "text-muted-foreground")} />
                </button>
              ))}
            </div>
          </nav>
          {/* left — controls */}
          <aside className="w-full shrink-0 p-4 lg:w-[286px] lg:overflow-y-auto lg:border-r">
            <div className="flex flex-col gap-3.5">
              {kind === "close" ? (
                <Field label="Hub to close">
                  <HubSelect value={closeHubId} onChange={setCloseHubId} />
                </Field>
              ) : null}

              {kind === "absorb" ? (
                <>
                  <Field label="Micro hub">
                    <HubSelect value={microHubId} onChange={setMicroHubId} onlyMicro />
                  </Field>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {microHubs.length} micro hubs run thin volume — absorbing one cuts its fixed rent while neighbours take the load.
                  </p>
                </>
              ) : null}

              {kind === "open" ? (
                <>
                  <Field label="Step 1 · Type">
                    <div className="grid grid-cols-3 gap-1.5">
                      {OPEN_TYPES.map((t, i) => (
                        <button
                          key={t.title}
                          onClick={() => pickOpenType(i)}
                          title={t.line}
                          className={cn(
                            "rounded-lg border px-2 py-1.5 text-[10.5px] font-semibold transition-colors",
                            openType === i ? "border-primary bg-primary/12 text-primary" : "bg-background/60 text-text-secondary hover:text-foreground",
                          )}
                        >
                          {t.title}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{openPreset.line}</p>
                  </Field>
                  <div className="rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-[11px] leading-relaxed text-foreground">
                    Step 2 · <span className="font-semibold text-primary">Click the map</span> to drop the new {openPreset.title.toLowerCase()}.
                    {openLoc ? <span className="block font-mono text-[10px] text-muted-foreground">📍 {openLoc.lat.toFixed(4)}, {openLoc.lng.toFixed(4)}</span> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Step 3 · Capacity /day">
                      <input type="number" min={100} value={openCap} onChange={(e) => setOpenCap(Number(e.target.value) || openPreset.cap)} className="w-full rounded-lg border bg-background/60 px-3 py-1.5 font-mono text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-ring" />
                    </Field>
                    <Field label="Riders">
                      <input type="number" min={1} value={openRiders} onChange={(e) => setOpenRiders(Number(e.target.value) || openPreset.riders)} className="w-full rounded-lg border bg-background/60 px-3 py-1.5 font-mono text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-ring" />
                    </Field>
                  </div>
                </>
              ) : null}

              {kind === "resize" ? (
                <>
                  <Field label="Hub">
                    <HubSelect value={resizeHubId} onChange={setResizeHubId} />
                  </Field>
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-text-secondary">New capacity</span>
                    <span className="font-mono text-[13px] font-semibold text-primary">
                      {resizePct}% → {fmtInt(Math.round(((resizeHub?.maxDaily ?? 0) * resizePct) / 100))}/day
                    </span>
                  </div>
                  <Slider min={40} max={200} step={10} value={resizePct} onChange={setResizePct} />
                </>
              ) : null}

              {kind === "surge" ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-text-secondary">Express volume</span>
                    <span className="font-mono text-[15px] font-semibold text-primary">+{surgePct}%</span>
                  </div>
                  <Slider min={0} max={100} value={surgePct} onChange={setSurgePct} />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Scales only Express zone demand — the same-day model that already breaches at remote hubs.
                  </p>
                </>
              ) : null}

              {kind === "shift" ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-text-secondary">Shift share</span>
                    <span className="font-mono text-[15px] font-semibold text-primary">{shiftPct}%</span>
                  </div>
                  <Slider min={0} max={80} value={shiftPct} onChange={setShiftPct} />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Moves a share of Express demand to Standard — cheaper cost per shipment and more headroom.
                  </p>
                </>
              ) : null}

              {kind === "riders" ? (
                <>
                  <Field label="Hub">
                    <HubSelect value={ridersHubId} onChange={setRidersHubId} />
                  </Field>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-text-secondary">FTE riders</span>
                    <Stepper value={fteDelta} onChange={setFteDelta} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-text-secondary">FTC riders</span>
                    <Stepper value={ftcDelta} onChange={setFtcDelta} />
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Each rider adds their group's average deliveries/day of capacity and weekly cost (Courier_Capacity).
                  </p>
                </>
              ) : null}

              {kind === "demand" ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-text-secondary">All demand</span>
                    <span className="font-mono text-[15px] font-semibold text-primary">{demandPct > 0 ? `+${demandPct}` : demandPct}%</span>
                  </div>
                  <Slider min={-30} max={100} value={demandPct} onChange={setDemandPct} />
                </>
              ) : null}

              {kind === "customer" ? (
                <>
                  <div className="rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-[11px] leading-relaxed text-foreground">
                    <span className="font-semibold text-primary">Click the map</span> to place the customer site.
                    {custLoc ? (
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        📍 Zone: {nearestZone(custLoc.lat, custLoc.lng)?.zone ?? "—"}
                      </span>
                    ) : null}
                  </div>
                  <Field label="Customer name">
                    <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="e.g. Noon Grocery" className="w-full rounded-lg border bg-background/60 px-3 py-2 text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-ring" />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Volume / week">
                      <input type="number" min={100} step={100} value={custVolume} onChange={(e) => setCustVolume(Number(e.target.value) || 1000)} className="w-full rounded-lg border bg-background/60 px-3 py-1.5 font-mono text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-ring" />
                    </Field>
                    <Field label="Delivery promise">
                      <select value={custPromise} onChange={(e) => setCustPromise(e.target.value)} className="w-full rounded-lg border bg-background/60 px-2.5 py-2 text-[11px] font-medium outline-none focus:border-primary">
                        <option>QComm · 15-min</option>
                        <option>Express · same-day</option>
                        <option>Standard · next-day</option>
                      </select>
                    </Field>
                  </div>
                </>
              ) : null}

              <AtlasButton className="mt-1 w-full" loading={busy} disabled={!canRun} onClick={runScenario}>
                {canRun ? meta.runLabel : kind === "open" || kind === "customer" ? "Click the map first" : meta.runLabel} <Play className="h-3 w-3" />
              </AtlasButton>
            </div>
          </aside>

          {/* center — the simulated map */}
          <main className="relative min-h-[440px] min-w-0 flex-1">
            {SimMap ? (
              <SimMap
                comp={shownComp}
                closedId={showingScenario ? (run?.closedId ?? null) : null}
                newHub={showingScenario ? (run?.newHub ?? null) : null}
                touchedId={showingScenario ? (run?.touchedId ?? null) : null}
                modelFilter={modelFilter}
                armed={mapArmed}
                pickMarker={pickMarker}
                onPlace={onPlace}
                highlightId={opp?.servingId ?? null}
                customerPin={opp ? custLoc : null}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[12.5px] text-muted-foreground">Loading map…</div>
            )}

            {/* compare + model filter */}
            <div className="absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
              <div className="flex rounded-full border bg-card/90 p-0.5 shadow-card backdrop-blur">
                {(["baseline", "scenario"] as const).map((c) => (
                  <button
                    key={c}
                    disabled={c === "scenario" && !run}
                    onClick={() => setCompare(c)}
                    className={cn(
                      "rounded-full px-3 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-40",
                      compare === c ? "bg-primary text-primary-foreground" : "text-text-secondary hover:text-foreground",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex rounded-full border bg-card/90 p-0.5 shadow-card backdrop-blur">
                {(["all", "Standard", "Express"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setModelFilter(m)}
                    className={cn(
                      "rounded-full px-3 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider transition-colors",
                      modelFilter === m ? "bg-muted text-foreground" : "text-text-secondary hover:text-foreground",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* legend */}
            <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border bg-card/90 px-3 py-2 shadow-card backdrop-blur">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                <span className="inline-block h-0.5 w-5 bg-primary" /> current flow
                <span className="ml-2 inline-block h-0.5 w-5 bg-warn" /> re-routed
                <span className="ml-2 inline-block h-2 w-2 rounded-full bg-cyan" /> express zone
              </div>
            </div>
          </main>

          {/* right — results */}
          <aside className="w-full shrink-0 border-t p-4 lg:w-[348px] lg:overflow-y-auto lg:border-l lg:border-t-0">
            {!run && !opp ? (
              <div className="space-y-3">
                <p className="kicker">Baseline · week 13</p>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  This is the live network today. Configure the scenario on the left, run it — the map redraws with the simulated
                  flows and this panel shows the full impact.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <DeltaTile label="Cost / parcel" before={baseline.res.baseline_kpis.cost_to_serve.value} after={baseline.res.baseline_kpis.cost_to_serve.value} unit="AED" />
                  <DeltaTile label="Utilisation" before={baseline.res.baseline_kpis.utilization.value} after={baseline.res.baseline_kpis.utilization.value} unit="%" goodWhenDown={false} />
                  <DeltaTile label="Served" before={baseline.res.baseline_kpis.coverage.value} after={baseline.res.baseline_kpis.coverage.value} unit="%" goodWhenDown={false} />
                  <DeltaTile label="Spare / day" before={baseline.res.baseline_kpis.spare_capacity.value} after={baseline.res.baseline_kpis.spare_capacity.value} unit="pcs" goodWhenDown={false} />
                </div>
              </div>
            ) : null}

            {run ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="kicker">Simulation result</p>
                  <FeasBadge feasible={feasible} />
                </div>
                <p className="text-[12.5px] font-semibold leading-snug text-foreground">{label}</p>

                <div className="grid grid-cols-2 gap-2">
                  <DeltaTile label="Cost / parcel" before={run.res.baseline_kpis.cost_to_serve.value} after={run.res.scenario_kpis.cost_to_serve.value} unit="AED" />
                  <DeltaTile label="Utilisation" before={run.res.baseline_kpis.utilization.value} after={run.res.scenario_kpis.utilization.value} unit="%" goodWhenDown={false} />
                  <DeltaTile label="Served" before={run.res.baseline_kpis.coverage.value} after={run.res.scenario_kpis.coverage.value} unit="%" goodWhenDown={false} />
                  <DeltaTile label="Spare / day" before={run.res.baseline_kpis.spare_capacity.value} after={run.res.scenario_kpis.spare_capacity.value} unit="pcs" goodWhenDown={false} />
                </div>

                <div>
                  <p className="kicker mb-2">Hardest-working hubs after the change</p>
                  <div className="space-y-1.5">
                    {impact.map((h) => (
                      <div key={h.id} className="flex items-center gap-2 rounded-lg bg-background/50 px-2.5 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] font-medium text-foreground">{h.name}</p>
                          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full transition-[width] duration-500", utilBar(h.utilA))} style={{ width: `${Math.min(100, h.utilA)}%` }} />
                          </div>
                        </div>
                        <span className="w-[86px] shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                          {fmtInt(Math.round(h.dailyB))}→{fmtInt(Math.round(h.dailyA))}/d
                        </span>
                        <span className={cn("w-10 shrink-0 text-right font-mono text-[11px] font-bold", utilColor(h.utilA))}>{h.utilA.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <details open className="rounded-xl border bg-background/50">
                  <summary className="cursor-pointer list-none px-3.5 py-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-text-secondary hover:text-foreground">
                    Engine reasoning
                  </summary>
                  <ul className="space-y-1.5 px-3.5 pb-3.5 pt-1">
                    {run.res.reasoning.map((r, i) => (
                      <li key={i} className="text-[11px] leading-relaxed text-text-secondary">
                        <span className="mr-1.5 font-mono text-primary">{String(i + 1).padStart(2, "0")}</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </details>

                <div className="grid grid-cols-2 gap-2">
                  <AtlasButton className="w-full" onClick={adoptResult}><Save className="h-3.5 w-3.5" /> Adopt</AtlasButton>
                  <AtlasButton variant="outline" className="w-full" onClick={saveResult}><FileText className="h-3.5 w-3.5" /> Report</AtlasButton>
                </div>
              </div>
            ) : null}

            {opp ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="kicker">Opportunity verdict</p>
                  <Chip tone={opp.verdict === "GO" ? "ok" : opp.verdict === "CONDITIONAL" ? "warn" : "risk"}>{opp.verdict}</Chip>
                </div>
                <p className="text-[12.5px] font-semibold leading-snug text-foreground">{label}</p>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border bg-background/50 px-3 py-2.5">
                    <p className="kicker">Served by</p>
                    <p className="mt-1 truncate text-[12.5px] font-semibold text-foreground">{opp.servingId ? entityName(opp.servingId) : "No entity"}</p>
                    <p className="font-mono text-[9.5px] text-muted-foreground">{opp.servingNetwork ?? "—"} · {opp.distanceKm.toFixed(1)} km</p>
                  </div>
                  <DeltaTile label="Utilisation" before={opp.utilBefore} after={opp.utilAfter} unit="%" goodWhenDown />
                  <div className="rounded-xl border bg-background/50 px-3 py-2.5">
                    <p className="kicker">Hires needed</p>
                    <p className="mt-1 font-mono text-[15px] font-bold text-foreground">{opp.courierHires}</p>
                    <p className="font-mono text-[9.5px] text-muted-foreground">{opp.recruitDays}</p>
                  </div>
                  <div className="rounded-xl border bg-background/50 px-3 py-2.5">
                    <p className="kicker">Incremental cost</p>
                    <p className="mt-1 font-mono text-[15px] font-bold text-foreground">{fmtNum(opp.incrementalCps, 2)} <span className="text-[9.5px] text-muted-foreground">AED/ship</span></p>
                    <p className="font-mono text-[9.5px] text-muted-foreground">{fmtInt(Math.round(opp.weeklyAddedCost))} AED/week</p>
                  </div>
                </div>

                <details open className="rounded-xl border bg-background/50">
                  <summary className="cursor-pointer list-none px-3.5 py-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-text-secondary hover:text-foreground">
                    Engine reasoning
                  </summary>
                  <ul className="space-y-1.5 px-3.5 pb-3.5 pt-1">
                    {opp.reasoning.map((r, i) => (
                      <li key={i} className="text-[11px] leading-relaxed text-text-secondary">
                        <span className="mr-1.5 font-mono text-primary">{String(i + 1).padStart(2, "0")}</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </details>

                <div className="grid grid-cols-2 gap-2">
                  <AtlasButton className="w-full" onClick={adoptResult}><Save className="h-3.5 w-3.5" /> Adopt</AtlasButton>
                  <AtlasButton variant="outline" className="w-full" onClick={saveResult}><FileText className="h-3.5 w-3.5" /> Report</AtlasButton>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
