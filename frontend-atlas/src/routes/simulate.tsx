import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  ChevronRight,
  CircleX,
  Combine,
  MapPinPlus,
  Maximize2,
  Merge,
  Minus,
  FileText,
  Play,
  Plus,
  Repeat,
  Save,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AtlasButton, Chip, FeasBadge, PageHead } from "@/components/atlas/ui";
import { ACTIVE_HUBS, DARK_STORES, DEMAND, FLEET, entityName, fmtInt, fmtNum } from "@/lib/atlas-data";
import type { ApiKpis } from "@/lib/api";
import {
  nearestZone,
  runBaseline,
  type HsComputation,
  type OpportunityAssessment,
  type ScenarioRun,
} from "@/lib/atlas-engine";
import {
  liveAbsorbHub,
  liveAddCustomer,
  liveCloseHub,
  liveComputation,
  liveConvertHub,
  liveCustomHub,
  liveDemandScale,
  liveFleetMix,
  liveMergeZones,
  liveResizeHub,
  liveRiders,
  liveSameDaySurge,
  liveShiftToNextDay,
} from "@/lib/atlas-live";
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
          "Twelve what-if scenarios on the EMX digital twin: close, absorb, open, convert, resize, fleet mix, surge, shift, merge areas, right-size riders, demand and new customers — simulated live on the network map.",
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

type ScenarioKind =
  | "close"
  | "absorb"
  | "open"
  | "convert"
  | "resize"
  | "fleet"
  | "surge"
  | "shift"
  | "merge"
  | "riders"
  | "demand"
  | "customer";

/** Engine id conventions (dataset_g_connector._slug): spaces -> _, / -> -. */
const slug = (s: string) => s.trim().replace(/ /g, "_").replace(/\//g, "-");

/** H&S delivery areas as the engine knows them, for the merge form. */
const MERGE_ZONES = DEMAND.filter((d) => d.network === "Hub & Spoke").map((d) => ({
  id: `${slug(d.emirate)}-${slug(d.zone)}-${slug(d.model)}`,
  label: `${d.zone} · ${d.model} (${d.emirate})`,
  emirate: d.emirate,
  model: d.model,
  daily: d.daily,
}));

const SCENARIOS: { kind: ScenarioKind; title: string; hint: string; icon: LucideIcon; runLabel: string }[] = [
  { kind: "close", title: "Close a hub", hint: "capacity redistributes to neighbours", icon: CircleX, runLabel: "Run scenario" },
  { kind: "absorb", title: "Absorb a micro hub", hint: "capacity + riders move to a Full hub", icon: Merge, runLabel: "Test absorption" },
  { kind: "open", title: "Open a hub", hint: "type → click the map → capacity", icon: MapPinPlus, runLabel: "Test this site" },
  { kind: "convert", title: "Convert hub type", hint: "Micro ↔ Full — same-day capability", icon: Repeat, runLabel: "Run conversion" },
  { kind: "resize", title: "Resize a hub", hint: "capacity up or down", icon: Maximize2, runLabel: "Run resize" },
  { kind: "fleet", title: "Fleet mix", hint: "± vans, cars, bikes at a hub", icon: Truck, runLabel: "Run fleet change" },
  { kind: "surge", title: "Same-day surge", hint: "Express demand only", icon: Zap, runLabel: "Run surge" },
  { kind: "shift", title: "Shift same-day → next-day", hint: "offload Express to Standard", icon: ArrowRightLeft, runLabel: "Run shift" },
  { kind: "merge", title: "Merge delivery areas", hint: "fold one zone's run into a neighbour's", icon: Combine, runLabel: "Run merge" },
  { kind: "riders", title: "Right-size riders", hint: "FTE / FTC flex", icon: Users, runLabel: "Run staffing" },
  { kind: "demand", title: "Demand surge", hint: "whole network", icon: TrendingUp, runLabel: "Run demand" },
  { kind: "customer", title: "New customer", hint: "opportunity assessor", icon: UserPlus, runLabel: "Assess opportunity" },
];

/** The 12 cards read as QUESTION TYPES first, then scenarios inside one. */
const SCENARIO_GROUPS: { title: string; kinds: ScenarioKind[] }[] = [
  { title: "Network shape", kinds: ["close", "absorb", "open", "convert"] },
  { title: "Capacity & people", kinds: ["resize", "riders", "fleet"] },
  { title: "Demand & service", kinds: ["surge", "shift", "merge", "demand"] },
  { title: "Growth", kinds: ["customer"] },
];

type SimNetwork = "hs" | "qcomm";

/** What can honestly run on the QComm twin from this UI: its facilities
 *  are dark stores (close / open / resize a store, scale demand). The
 *  H&S-only levers — Express/Standard mix, rider roster, fleet rows, the
 *  merge pair list — hide rather than pretend. */
const QCOMM_KINDS: ScenarioKind[] = ["close", "open", "resize", "demand"];

interface SimFacility { id: string; name: string; emirate: string; maxDaily: number }
const HS_FACILITIES: SimFacility[] = ACTIVE_HUBS.map((h) => ({ id: h.id, name: h.name, emirate: h.emirate, maxDaily: h.maxDaily }));
const QCOMM_FACILITIES: SimFacility[] = DARK_STORES.map((s) => ({ id: s.id, name: s.name, emirate: s.emirate, maxDaily: s.maxDailyOrders }));

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

function DeltaTile({ label, before, after, unit, goodWhenDown = true, decimals }: { label: string; before: number; after: number; unit: string; goodWhenDown?: boolean; decimals?: number }) {
  const delta = after - before;
  const good = delta === 0 ? null : goodWhenDown ? delta < 0 : delta > 0;
  const dp = decimals ?? (unit === "%" ? 1 : 2);
  return (
    <div className="rounded-xl border bg-background/50 px-3 py-2.5">
      <p className="kicker">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5 font-mono">
        <span className="text-[12px] text-muted-foreground">{fmtNum(before, dp)}</span>
        <span className="text-muted-foreground">→</span>
        <span className={cn("text-[15px] font-bold", good === null ? "text-foreground" : good ? "text-ok" : "text-risk")}>{fmtNum(after, dp)}</span>
        <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

/* ---------------- scenario-aware result tiles (fix: 5 of 8 scenarios
   showed 0.00% because the four fixed tiles measured things they don't
   move). Everything below is GROUPING of engine rows — no figure is
   computed that the engine didn't return. ---------------- */

interface TileSpec { label: string; before: number; after: number; unit: string; goodWhenDown?: boolean; decimals?: number }

const hubIn = (comp: ScenarioRun["baseline"], id: string | null | undefined) =>
  id ? comp.hubs.find((h) => h.id === id) : undefined;

/** Daily volume of one service model — sum of the engine's own flow rows. */
const modelDaily = (comp: ScenarioRun["baseline"], model: "Standard" | "Express") =>
  comp.assignments.filter((a) => a.model === model).reduce((s, a) => s + a.weekly, 0) / 7;

/** How many zone-flows changed serving hub between the two engine solves. */
function movedFlows(run: ScenarioRun): number {
  const before = new Map(run.baseline.assignments.map((a) => [`${a.emirate}|${a.zone}|${a.model}`, a.hubId]));
  return run.scenario.assignments.filter((a) => {
    const b = before.get(`${a.emirate}|${a.zone}|${a.model}`);
    return b !== undefined && b !== a.hubId;
  }).length;
}

function tilesFor(run: ScenarioRun): TileSpec[] {
  const kpi = (m: "cost_to_serve" | "utilization" | "coverage" | "spare_capacity") => ({
    b: run.res.baseline_kpis[m].value,
    a: run.res.scenario_kpis[m].value,
  });
  const cost = kpi("cost_to_serve");
  const util = kpi("utilization");
  const served = kpi("coverage");
  const spare = kpi("spare_capacity");
  const t = run.totals;
  const base: TileSpec[] = [
    { label: "Cost / parcel", before: cost.b, after: cost.a, unit: "AED" },
    // The pair that keeps a surge honest: per-parcel can fall while the
    // network bill rises. Both numbers are the engine's own breakdown.
    ...(t ? [{ label: "Total cost / day", before: t.baseline.totalCost, after: t.scenario.totalCost, unit: "AED", decimals: 0 } satisfies TileSpec] : []),
    { label: "Utilisation", before: util.b, after: util.a, unit: "%", goodWhenDown: false },
    { label: "Served", before: served.b, after: served.a, unit: "%", goodWhenDown: false },
    { label: "Spare / day", before: spare.b, after: spare.a, unit: "pcs", goodWhenDown: false, decimals: 0 },
  ];
  const demandTile: TileSpec[] = t
    ? [{ label: "Demand / day", before: t.baseline.totalDemand, after: t.scenario.totalDemand, unit: "pcs", goodWhenDown: false, decimals: 0 }]
    : [];
  const hb = hubIn(run.baseline, run.touchedId);
  const ha = hubIn(run.scenario, run.touchedId);

  switch (run.kind) {
    case "absorb":
      if (hb?.capacity !== undefined && ha?.capacity !== undefined) {
        return [
          { label: "Absorber capacity / day", before: hb.capacity, after: ha.capacity, unit: "pcs", goodWhenDown: false, decimals: 0 },
          ...(hb.riderWeeklyCost !== undefined && ha.riderWeeklyCost !== undefined
            ? [{ label: "Absorber wage bill / wk", before: hb.riderWeeklyCost, after: ha.riderWeeklyCost, unit: "AED", goodWhenDown: false, decimals: 0 } satisfies TileSpec]
            : []),
          ...base,
        ];
      }
      return base;
    case "resize":
      if (hb?.capacity !== undefined && ha?.capacity !== undefined) {
        return [
          { label: "Hub capacity / day", before: hb.capacity, after: ha.capacity, unit: "pcs", goodWhenDown: false, decimals: 0 },
          { label: "Hub utilisation", before: hb.util, after: ha.util, unit: "%", goodWhenDown: false },
          ...base,
        ];
      }
      return base;
    case "riders":
      if (hb?.riderWeeklyCost !== undefined && ha?.riderWeeklyCost !== undefined) {
        return [
          { label: "Wage bill / week", before: hb.riderWeeklyCost, after: ha.riderWeeklyCost, unit: "AED", decimals: 0 },
          { label: "Rider capacity / day", before: hb.riderCapacityDaily ?? 0, after: ha.riderCapacityDaily ?? 0, unit: "pcs", goodWhenDown: false, decimals: 0 },
          { label: "Riders — FTE", before: hb.ridersFte ?? 0, after: ha.ridersFte ?? 0, unit: "", goodWhenDown: false, decimals: 0 },
          { label: "Riders — FTC", before: hb.ridersFtc ?? 0, after: ha.ridersFtc ?? 0, unit: "", goodWhenDown: false, decimals: 0 },
          ...base.filter((t) => t.label === "Served" || t.label === "Utilisation"),
        ];
      }
      return base;
    case "shift":
    case "surge":
    case "convert":
      return [
        { label: "Same-day (Express) / day", before: modelDaily(run.baseline, "Express"), after: modelDaily(run.scenario, "Express"), unit: "pcs", goodWhenDown: false, decimals: 0 },
        { label: "Next-day (Standard) / day", before: modelDaily(run.baseline, "Standard"), after: modelDaily(run.scenario, "Standard"), unit: "pcs", goodWhenDown: false, decimals: 0 },
        ...base,
      ];
    case "fleet":
      if (hb?.fleetVehicles !== undefined && ha?.fleetVehicles !== undefined) {
        return [
          { label: "Fleet vehicles (hub)", before: hb.fleetVehicles, after: ha.fleetVehicles, unit: "", goodWhenDown: false, decimals: 0 },
          { label: "Fleet cost / day", before: hb.fleetDailyCost ?? 0, after: ha.fleetDailyCost ?? 0, unit: "AED", decimals: 0 },
          { label: "Fleet trip capacity", before: hb.fleetCapacityUnits ?? 0, after: ha.fleetCapacityUnits ?? 0, unit: "units", goodWhenDown: false, decimals: 0 },
          ...base.filter((t) => t.label === "Cost / parcel" || t.label === "Served"),
        ];
      }
      return base;
    case "merge":
      return [
        { label: "Delivery stops", before: run.baseline.assignments.length, after: run.scenario.assignments.length, unit: "", decimals: 0 },
        ...demandTile,
        ...base,
      ];
    case "demand":
      return [...demandTile, ...base];
    default:
      return base;
  }
}

/** One plain sentence on what the engine actually did — the tiles show the
 *  numbers, this says which lever moved. */
function whatChanged(run: ScenarioRun): string | null {
  const moved = movedFlows(run);
  const hb = hubIn(run.baseline, run.touchedId);
  const ha = hubIn(run.scenario, run.touchedId);
  switch (run.kind) {
    case "close":
      return moved > 0
        ? `The engine re-solved every flow: ${moved} zone-flow${moved === 1 ? "" : "s"} re-routed to the remaining hubs (amber on the map).`
        : "The engine re-solved every flow; no zone needed to move.";
    case "absorb": {
      const capLine =
        hb?.capacity !== undefined && ha?.capacity !== undefined && ha.capacity > hb.capacity
          ? `${ha.name} inherited the micro's capacity (${fmtInt(Math.round(hb.capacity))} → ${fmtInt(Math.round(ha.capacity))}/day) and its riders. `
          : "";
      return `${capLine}${
        moved > 0
          ? `${moved} zone-flow${moved === 1 ? "" : "s"} re-routed (amber on the map).`
          : "No zone needed to move."
      }`;
    }
    case "open":
      return moved > 0
        ? `${moved} zone-flow${moved === 1 ? "" : "s"} re-routed to the new site (amber on the map).`
        : "No zone re-routed to the new site — at today's demand, every zone is already served cheaper by an existing hub. The site's fixed cost is still added, which is why cost per parcel ticks up.";
    case "riders":
      return ha && hb
        ? "Wages are priced from the roster's own per-type rates. They sit outside the transport pool, so Cost/parcel does not move — the wage bill is the money line here."
        : null;
    case "resize":
      return "Capacity is the lever; flows were re-solved against the new limit. Watch hub utilisation and network spare.";
    case "shift":
      return "Volume moves between service models inside each zone — total demand is conserved by construction.";
    case "convert": {
      const exB = run.baseline.assignments.filter((a) => a.hubId === run.touchedId && a.model === "Express");
      const exA = run.scenario.assignments.filter((a) => a.hubId === run.touchedId && a.model === "Express");
      const name = ha?.name ?? run.touchedId ?? "the hub";
      if (exA.length > exB.length) {
        const pcs = Math.round(exA.reduce((s, a) => s + a.weekly, 0) / 7);
        return `${name} is now same-day capable: the engine routed ${exA.length} Express flow${exA.length === 1 ? "" : "s"} (${fmtInt(pcs)} pcs/day) to it that a Micro could not legally serve.`;
      }
      if (exB.length > 0 && exA.length === 0) {
        return `${name} no longer carries same-day: its ${exB.length} Express flow${exB.length === 1 ? "" : "s"} re-routed (amber) — watch the Served tile for whether the rest of the network could take them.`;
      }
      return "Capability changed. At today's costs no Express flow chose this hub — the corridors exist now, and a surge or closure can use them.";
    }
    case "fleet":
      return "Only the fleet moves: vehicle count, fleet cost/day and trip capacity are the hub's own Fleet_Roster figures re-totalled by the engine. Cost/parcel stays put deliberately — vehicle running cost is already calibrated inside the file's per-shipment rate.";
    case "merge":
      return `One delivery stop disappears (${run.baseline.assignments.length} → ${run.scenario.assignments.length}): the merged area's parcels ride the absorbing run at its corridor cost, and total demand is conserved.`;
    case "surge":
    case "demand": {
      const t = run.totals;
      if (!t) return null;
      const up = t.scenario.totalCost >= t.baseline.totalCost;
      return `The network bill ${up ? "rises" : "falls"}: ${fmtInt(Math.round(t.baseline.totalCost))} → ${fmtInt(Math.round(t.scenario.totalCost))} AED/day. Cost per parcel can move the other way — the fixed pool (${fmtInt(Math.round(t.scenario.fixedCost))} AED/day) does not grow with demand, so it spreads over ${fmtInt(Math.round(t.scenario.totalDemand))} parcels instead of ${fmtInt(Math.round(t.baseline.totalDemand))}.`;
    }
    default:
      return null;
  }
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
  const [runError, setRunError] = useState<string | null>(null);
  const [compare, setCompare] = useState<"baseline" | "scenario">("scenario");
  const [modelFilter, setModelFilter] = useState<"all" | "Standard" | "Express">("all");

  useEffect(() => {
    setRun(null);
    setOpp(null);
    setLabel("");
    setCompare("scenario");
  }, [kind]);

  // Which twin the workspace runs on. QComm = real what-ifs on the saved
  // dark-store network via /simulate's base_scenario_id — an engine base,
  // never a display filter.
  const [network, setNetwork] = useState<SimNetwork>("hs");
  const isQcomm = network === "qcomm";
  const base = isQcomm ? "qcomm_twin" : undefined;
  const facilities = isQcomm ? QCOMM_FACILITIES : HS_FACILITIES;
  const [qcommBase, setQcommBase] = useState<{ comp: HsComputation; kpis: ApiKpis } | null>(null);
  useEffect(() => {
    if (!isQcomm || qcommBase) return;
    let cancelled = false;
    liveComputation("qcomm_twin")
      .then((r) => {
        if (!cancelled) setQcommBase(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isQcomm, qcommBase]);

  // form state
  const [closeHubId, setCloseHubId] = useState("HUB_RAK_01");
  const [microHubId, setMicroHubId] = useState("HUB_AJM_01");
  const [absorbIntoId, setAbsorbIntoId] = useState(""); // "" = engine picks nearest Full Hub
  // Default = the boldest demo: Al Quoz is Dubai's biggest Full hub, so
  // → Micro visibly forces its same-day flows onto other hubs (amber).
  const [convertHubId, setConvertHubId] = useState("HUB_DXB_01");
  const [fleetHubId, setFleetHubId] = useState("HUB_DXB_01");
  const [fleetVehicle, setFleetVehicle] = useState("Van");
  const [fleetDelta, setFleetDelta] = useState(2);
  const [mergeAbsorbId, setMergeAbsorbId] = useState("Dubai-Al_Quoz-Standard");
  const [mergeMergedId, setMergeMergedId] = useState("Dubai-Business_Bay-Standard");
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
  const resizeHub = facilities.find((h) => h.id === resizeHubId);
  const openPreset = OPEN_TYPES[openType]!;

  const switchNetwork = (n: SimNetwork) => {
    if (n === network) return;
    setNetwork(n);
    setRun(null);
    setOpp(null);
    setLabel("");
    setRunError(null);
    setCompare("scenario");
    if (n === "qcomm") {
      // The crisis defaults: Al Reem is the store the watchdog's fix names.
      setCloseHubId("QED_DXB_05");
      setResizeHubId("QED_AUH_02");
      setResizePct(110);
      pickOpenType(2); // a dark store is the only type a QComm site can be
      if (!QCOMM_KINDS.includes(kind)) onSelectKind("resize");
    } else {
      setCloseHubId("HUB_RAK_01");
      setResizeHubId("HUB_RAK_01");
      setResizePct(150);
      pickOpenType(0);
    }
  };
  // Form DEFAULTS only (the engine prices the run): median daily fixed cost
  // and the candidates' pool-pure median handling from the dataset itself.
  const rents = ACTIVE_HUBS.map((h) => h.rent).sort((a, b) => a - b);
  const medianFixedCost = (rents[4]! + rents[5]!) / 2 / 30;
  const medianHandling = 10.8;
  const pickOpenType = (i: number) => {
    setOpenType(i);
    setOpenCap(OPEN_TYPES[i]!.cap);
    setOpenRiders(OPEN_TYPES[i]!.riders);
  };

  // REAL engine runs — async, with an honest error path (no fake latency).
  const execute = (lbl: string, compute: () => Promise<ScenarioRun>) => {
    setBusy(true);
    setRunError(null);
    compute()
      .then((out) => {
        setRun({ ...out, kind });
        setOpp(null);
        setLabel(lbl);
        setCompare("scenario");
        logEvent(`Tested — ${lbl}`);
      })
      .catch((e: Error) => {
        setRunError(e.message);
        setLabel("Engine error");
      })
      .finally(() => setBusy(false));
  };

  const runScenario = () => {
    switch (kind) {
      case "close": {
        const hub = facilities.find((h) => h.id === closeHubId);
        execute(`Close ${hub?.name ?? closeHubId}`, () => liveCloseHub(closeHubId, base));
        break;
      }
      case "absorb": {
        const hub = microHubs.find((h) => h.id === microHubId);
        const into = ACTIVE_HUBS.find((h) => h.id === absorbIntoId);
        execute(
          `Absorb ${hub?.name ?? microHubId} into ${into?.name ?? "nearest Full Hub"}`,
          () => liveAbsorbHub(microHubId, absorbIntoId || undefined),
        );
        break;
      }
      case "open": {
        if (!openLoc) return;
        {
          const near = nearestZone(openLoc.lat, openLoc.lng);
          execute(`Open ${openPreset.title} at ${openLoc.lat.toFixed(3)},${openLoc.lng.toFixed(3)}`, () =>
            liveCustomHub({
              id: `CUST_${Date.now()}`,
              name: `${openPreset.title} · custom`,
              lat: openLoc.lat,
              lng: openLoc.lng,
              maxDaily: openCap,
              kind: openPreset.kind,
              emirate: near?.emirate ?? "Dubai",
              // pre-filled from the current network's own medians (engine data)
              fixedCost: Math.round(medianFixedCost),
              handlingCost: medianHandling,
              ...(base ? { base } : {}),
            }),
          );
        }
        break;
      }
      case "convert": {
        const hub = ACTIVE_HUBS.find((h) => h.id === convertHubId);
        const to = hub?.hubType === "Micro Hub" ? "Full Hub" : "Micro Hub";
        execute(`Convert ${hub?.name ?? convertHubId} → ${to}`, () => liveConvertHub(convertHubId, to));
        break;
      }
      case "fleet": {
        const hub = ACTIVE_HUBS.find((h) => h.id === fleetHubId);
        execute(
          `Fleet at ${hub?.name ?? fleetHubId}: ${fleetDelta > 0 ? "+" : ""}${fleetDelta} ${fleetVehicle}`,
          () => liveFleetMix(`${fleetHubId}-${slug(fleetVehicle)}`, fleetHubId, fleetDelta),
        );
        break;
      }
      case "merge": {
        const absorb = MERGE_ZONES.find((z) => z.id === mergeAbsorbId);
        const merged = MERGE_ZONES.find((z) => z.id === mergeMergedId);
        execute(
          `Merge ${merged?.label ?? mergeMergedId} into ${absorb?.label ?? mergeAbsorbId}`,
          () => liveMergeZones(mergeAbsorbId, mergeMergedId),
        );
        break;
      }
      case "resize":
        execute(`Resize ${resizeHub?.name ?? ""} to ${resizePct}%`, () =>
          liveResizeHub(resizeHubId, Math.round(((resizeHub?.maxDaily ?? 1) * resizePct) / 100), base),
        );
        break;
      case "surge":
        execute(`Same-day surge +${surgePct}%`, () => liveSameDaySurge(surgePct));
        break;
      case "shift":
        execute(`Shift ${shiftPct}% same-day → next-day`, () => liveShiftToNextDay(shiftPct));
        break;
      case "riders": {
        const hub = ACTIVE_HUBS.find((h) => h.id === ridersHubId);
        execute(`Riders at ${hub?.name ?? ridersHubId}: FTE ${fteDelta >= 0 ? "+" : ""}${fteDelta}, FTC ${ftcDelta >= 0 ? "+" : ""}${ftcDelta}`, () =>
          liveRiders(ridersHubId, fteDelta, ftcDelta),
        );
        break;
      }
      case "demand":
        execute(`Demand ${demandPct > 0 ? "+" : ""}${demandPct}%`, () => liveDemandScale(1 + demandPct / 100, base));
        break;
      case "customer": {
        if (!custLoc) return;
        const z = nearestZone(custLoc.lat, custLoc.lng);
        if (!z) return;
        const model = (custPromise.split(" · ")[0] ?? "Standard") as "Standard" | "Express" | "QComm";
        const slaHours = model === "Express" ? 8 : model === "QComm" ? 0.25 : 24;
        execute(`New customer — ${custName.trim() || "Unnamed"} (${z.zone}, ${model})`, () =>
          liveAddCustomer({
            name: custName.trim() || "Unnamed customer",
            lat: custLoc.lat,
            lng: custLoc.lng,
            emirate: z.emirate,
            dailyVolume: Math.round(custVolume / 7),
            slaHours,
          }),
        );
        break;
      }
    }
  };

  const canRun =
    kind === "open"
      ? Boolean(openLoc)
      : kind === "customer"
        ? Boolean(custLoc)
        : kind === "riders"
          ? fteDelta !== 0 || ftcDelta !== 0
          : kind === "fleet"
            ? fleetDelta !== 0
            : kind === "merge"
              ? mergeAbsorbId !== mergeMergedId &&
                MERGE_ZONES.some(
                  (z) =>
                    z.id === mergeMergedId &&
                    MERGE_ZONES.some(
                      (a) => a.id === mergeAbsorbId && a.emirate === z.emirate && a.model === z.model,
                    ),
                )
              : true;

  const adoptResult = () => {
    adopt(label, run?.res.delta_pct.cost_to_serve ?? null);
  };

  const saveResult = () => {
    const reasoning = run?.res.reasoning ?? opp?.reasoning ?? [];
    // The report carries what the SCREEN showed: the scenario-aware tiles
    // (every figure engine-returned) + the what-changed sentence — not the
    // one-line param echo it used to be.
    const changed = run ? whatChanged(run) : null;
    const tileLines = run
      ? tilesFor(run).map(
          (t) =>
            `- ${t.label}: ${fmtNum(t.before, t.decimals ?? (t.unit === "%" ? 1 : 2))} → ${fmtNum(t.after, t.decimals ?? (t.unit === "%" ? 1 : 2))} ${t.unit}`.trimEnd(),
        )
      : [];
    saveReport({
      title: label,
      summary: changed ?? reasoning[0] ?? label,
      bodyMd: [
        `## ${label}`,
        `- Network: ${isQcomm ? "Dark stores (QComm twin)" : "Hub & Spoke"}`,
        ...reasoning.map((r) => `- ${r}`),
        ...(changed ? ["", "## What changed", changed] : []),
        ...(tileLines.length ? ["", "## Result — engine figures, before → after", ...tileLines] : []),
      ].join("\n"),
    });
  };

  const baseComp = isQcomm ? qcommBase?.comp ?? null : baseline.scenario;
  const shownComp = run ? (compare === "baseline" ? run.baseline : run.scenario) : baseComp;
  const errorBox = runError ? (
    <div className="rounded-lg border border-risk/30 bg-risk/10 px-3 py-2 text-[11px] text-risk">
      Engine error: {runError}
    </div>
  ) : null;
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
          {/* scenario navigator — the twelve simulations share this map */}
          <nav className="w-full shrink-0 border-b bg-sidebar/60 p-2 lg:w-[208px] lg:overflow-y-auto lg:border-b-0 lg:border-r" aria-label="Simulation scenarios">
            {/* Which twin this workspace simulates — an engine base, not a view */}
            <p className="kicker px-2 pb-1 pt-1">Network</p>
            <div className="grid grid-cols-2 gap-1 px-1 pb-1">
              {(
                [
                  ["hs", "Hub & Spoke"],
                  ["qcomm", "Dark stores"],
                ] as const
              ).map(([n, lbl]) => (
                <button
                  key={n}
                  onClick={() => switchNetwork(n)}
                  aria-pressed={network === n}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider transition-colors",
                    network === n
                      ? "border-primary/40 bg-primary/12 text-primary"
                      : "border-transparent bg-background/25 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <p className="px-2 pb-2 font-mono text-[8.5px] uppercase tracking-wider text-muted-foreground">
              {isQcomm ? "Live copy · 10 dark stores · 15-min promise" : "Live copy · 10 hubs · 17 zones · 6 emirates"}
            </p>

            <p className="kicker px-2 pb-1">Scenario library</p>
            {SCENARIO_GROUPS.map((group) => {
              const items = SCENARIOS.filter(
                (s) => group.kinds.includes(s.kind) && (!isQcomm || QCOMM_KINDS.includes(s.kind)),
              );
              if (!items.length) return null;
              return (
                <div key={group.title} className="pb-1.5">
                  <p className="px-2 pb-1 pt-1 font-mono text-[8.5px] font-semibold uppercase tracking-[0.16em] text-primary/70">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                    {items.map((scenario) => (
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
                </div>
              );
            })}
          </nav>
          {/* left — controls */}
          <aside className="w-full shrink-0 p-4 lg:w-[286px] lg:overflow-y-auto lg:border-r">
            <div className="flex flex-col gap-3.5">
              {kind === "close" ? (
                <Field label={isQcomm ? "Dark store to close" : "Hub to close"}>
                  <select
                    value={closeHubId}
                    onChange={(e) => setCloseHubId(e.target.value)}
                    className="w-full rounded-lg border bg-background/60 px-3 py-2 text-[12.5px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                  >
                    {facilities.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} — {h.emirate}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {kind === "absorb" ? (
                <>
                  <Field label="Micro hub to fold in">
                    <HubSelect value={microHubId} onChange={setMicroHubId} onlyMicro />
                  </Field>
                  <Field label="Absorbing hub">
                    <select
                      value={absorbIntoId}
                      onChange={(e) => setAbsorbIntoId(e.target.value)}
                      className="w-full rounded-lg border bg-background px-2.5 py-2 text-[12px] text-foreground"
                    >
                      <option value="">Auto — nearest Full Hub (engine picks)</option>
                      {ACTIVE_HUBS.filter((h) => h.hubType === "Full Hub").map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Unlike a plain close, the micro's capacity and riders MOVE into the absorbing hub — the building goes, the people and throughput stay.
                  </p>
                </>
              ) : null}

              {kind === "convert" ? (
                <>
                  <Field label="Hub to convert">
                    <HubSelect value={convertHubId} onChange={setConvertHubId} />
                  </Field>
                  {(() => {
                    const hub = ACTIVE_HUBS.find((h) => h.id === convertHubId);
                    const toFull = hub?.hubType === "Micro Hub";
                    return (
                      <p className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2 text-[11px] leading-relaxed text-text-secondary">
                        {toFull
                          ? `${hub?.name} is a Micro (next-day only). Converting → FULL adds the same-day capability: the engine derives real delivery corridors to every Express zone, priced exactly like a newly-built site.`
                          : `${hub?.name} is a Full hub. Converting → MICRO removes the same-day capability — its Express corridors are deleted and the engine shows where that demand goes (or that it can't).`}
                      </p>
                    );
                  })()}
                </>
              ) : null}

              {kind === "fleet" ? (
                <>
                  <Field label="Hub">
                    <HubSelect
                      value={fleetHubId}
                      onChange={(v) => {
                        setFleetHubId(v);
                        const first = FLEET.find((f) => f.id === v && f.network === "Hub & Spoke");
                        if (first) setFleetVehicle(first.vehicleType);
                      }}
                    />
                  </Field>
                  <Field label="Vehicle type">
                    <select
                      value={fleetVehicle}
                      onChange={(e) => setFleetVehicle(e.target.value)}
                      className="w-full rounded-lg border bg-background px-2.5 py-2 text-[12px] text-foreground"
                    >
                      {FLEET.filter((f) => f.id === fleetHubId && f.network === "Hub & Spoke").map((f) => (
                        <option key={f.vehicleType} value={f.vehicleType}>
                          {f.vehicleType} — {f.count} now · {f.capacityUnits} units each
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Vehicles to add / remove">
                    <Stepper value={fleetDelta} onChange={setFleetDelta} />
                  </Field>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Moves the hub's own fleet cost and trip capacity (from Fleet_Roster). The per-parcel rate stays put — vehicle running cost is already inside the file's cost sheet.
                  </p>
                </>
              ) : null}

              {kind === "merge" ? (
                <>
                  <Field label="Absorbing run (keeps its corridor)">
                    <select
                      value={mergeAbsorbId}
                      onChange={(e) => setMergeAbsorbId(e.target.value)}
                      className="w-full rounded-lg border bg-background px-2.5 py-2 text-[12px] text-foreground"
                    >
                      {MERGE_ZONES.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.label} · {fmtInt(z.daily)}/day
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Area folded into it (stop disappears)">
                    <select
                      value={mergeMergedId}
                      onChange={(e) => setMergeMergedId(e.target.value)}
                      className="w-full rounded-lg border bg-background px-2.5 py-2 text-[12px] text-foreground"
                    >
                      {MERGE_ZONES.filter((z) => {
                        const a = MERGE_ZONES.find((x) => x.id === mergeAbsorbId);
                        return a && z.id !== a.id && z.emirate === a.emirate && z.model === a.model;
                      }).map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.label} · {fmtInt(z.daily)}/day
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Same emirate, same promise only — the merged area's parcels ride the absorbing run at its corridor cost, and one delivery stop disappears.
                  </p>
                </>
              ) : null}

              {kind === "open" ? (
                <>
                  <Field label="Step 1 · Type">
                    {/* A dark store on the H&S twin would serve ZERO zones (no
                        QComm demand there) — and vice versa. Only offer types
                        the selected network can actually use. */}
                    <div className={cn("grid gap-1.5", isQcomm ? "grid-cols-1" : "grid-cols-2")}>
                      {OPEN_TYPES.map((t, i) =>
                        (isQcomm ? t.kind === "darkstore" : t.kind !== "darkstore") ? (
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
                        ) : null,
                      )}
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
                  <Field label={isQcomm ? "Dark store" : "Hub"}>
                    <select
                      value={resizeHubId}
                      onChange={(e) => setResizeHubId(e.target.value)}
                      className="w-full rounded-lg border bg-background/60 px-3 py-2 text-[12.5px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    >
                      {facilities.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} — {h.emirate}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-text-secondary">New capacity</span>
                    <span className="font-mono text-[13px] font-semibold text-primary">
                      {resizePct}% → {fmtInt(Math.round(((resizeHub?.maxDaily ?? 0) * resizePct) / 100))}/day
                    </span>
                  </div>
                  <Slider min={40} max={200} step={10} value={resizePct} onChange={setResizePct} />
                  {isQcomm && resizeHubId === "QED_AUH_02" ? (
                    <p className="rounded-lg border border-risk/30 bg-risk/8 px-2.5 py-2 text-[11px] leading-relaxed text-text-secondary">
                      This is the store the watchdog's verified fix names: Al Reem today drops 12/day. Any capacity ≥104% clears the whole Abu Dhabi shortfall — watch the Served tile.
                    </p>
                  ) : null}
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
            {SimMap && shownComp ? (
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
              {/* Which of the two engine solves the map is drawing */}
              <div className="flex items-center gap-1.5 rounded-full border bg-card/90 py-0.5 pl-2.5 pr-0.5 shadow-card backdrop-blur">
                <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted-foreground">Showing</span>
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
                    {c === "baseline" ? "Before" : "After"}
                  </button>
                ))}
              </div>
              {/* View filter only — hides flows of the other service model.
                  H&S-only: the QComm twin has one service (15-min). */}
              <div className={cn("flex items-center gap-1.5 rounded-full border bg-card/90 py-0.5 pl-2.5 pr-0.5 shadow-card backdrop-blur", isQcomm && "hidden")}>
                <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted-foreground">Service</span>
                {(["all", "Standard", "Express"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setModelFilter(m)}
                    className={cn(
                      "rounded-full px-3 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider transition-colors",
                      modelFilter === m ? "bg-muted text-foreground" : "text-text-secondary hover:text-foreground",
                    )}
                    title="View filter: show only this service model's flows"
                  >
                    {m === "all" ? "All" : m === "Standard" ? "Next-day" : "Same-day"}
                  </button>
                ))}
              </div>
            </div>

            {/* legend */}
            <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border bg-card/90 px-3 py-2 shadow-card backdrop-blur">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                <span className="inline-block h-0.5 w-5 bg-primary" /> current flow
                <span className="ml-2 inline-block h-0.5 w-5 bg-warn" /> re-routed
                <span className="ml-2 inline-block h-2 w-2 rounded-full bg-cyan" /> express zone
                <span className="ml-2 inline-block h-2 w-2 rounded-full" style={{ background: "#5b9dff" }} /> full hub
                <span className="ml-1 inline-block h-2 w-2 rounded-full" style={{ background: "#a9c6ff" }} /> micro hub
              </div>
            </div>
          </main>

          {/* right — results */}
          <aside className="w-full shrink-0 border-t p-4 lg:w-[348px] lg:overflow-y-auto lg:border-l lg:border-t-0">
            {errorBox}
            {!run && !opp ? (
              <div className="space-y-3">
                <p className="kicker">{isQcomm ? "Dark stores · live twin" : "Baseline · week 13"}</p>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {isQcomm
                    ? "The QComm network as it runs today — note Served below 100%: this twin genuinely cannot deliver every order. Fix it with a scenario."
                    : "This is the live network today. Configure the scenario on the left, run it — the map redraws with the simulated flows and this panel shows the full impact."}
                </p>
                {(() => {
                  const k = isQcomm ? qcommBase?.kpis : null;
                  const tiles = k
                    ? [
                        { label: "Cost / parcel", v: k.cost_to_serve.value, unit: "AED", down: true },
                        { label: "Utilisation", v: k.utilization.value, unit: "%", down: false },
                        { label: "Served", v: k.demand_served.value, unit: "%", down: false },
                        { label: "Spare / day", v: k.spare_capacity.value, unit: "pcs", down: false },
                      ]
                    : [
                        { label: "Cost / parcel", v: baseline.res.baseline_kpis.cost_to_serve.value, unit: "AED", down: true },
                        { label: "Utilisation", v: baseline.res.baseline_kpis.utilization.value, unit: "%", down: false },
                        { label: "Served", v: baseline.res.baseline_kpis.coverage.value, unit: "%", down: false },
                        { label: "Spare / day", v: baseline.res.baseline_kpis.spare_capacity.value, unit: "pcs", down: false },
                      ];
                  if (isQcomm && !k) {
                    return <p className="text-[11px] text-muted-foreground">Loading the dark-store twin…</p>;
                  }
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      {tiles.map((t) => (
                        <DeltaTile key={t.label} label={t.label} before={t.v} after={t.v} unit={t.unit} goodWhenDown={t.down} />
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : null}

            {run ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="kicker">Simulation result</p>
                  <FeasBadge feasible={feasible} />
                </div>
                <p className="text-[12.5px] font-semibold leading-snug text-foreground">{label}</p>
                {(() => {
                  const changed = whatChanged(run);
                  return changed ? (
                    <p className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2 text-[11px] leading-relaxed text-text-secondary">
                      {changed}
                    </p>
                  ) : null;
                })()}

                <div className="grid grid-cols-2 gap-2">
                  {tilesFor(run).map((t) => (
                    <DeltaTile key={t.label} {...t} />
                  ))}
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
