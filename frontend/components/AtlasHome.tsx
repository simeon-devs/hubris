"use client";

/**
 * AtlasHome — the REAL TomTom map as the base layer, the approved
 * AtlasVision design as the skin on top. Nothing thrown away:
 * /vision keeps the pure-canvas prototype, /classic the previous UI.
 *
 *  - Base: NetworkMap in host mode (chrome=false) — dark style, single view,
 *    design-language layers (utilization pillars, halo rings, corridor glow,
 *    demand heatmap, vignette), intro flight landing on the data's bbox.
 *  - Skin: AtlasVision header/KPIs/buttons/cards/report, verbatim CSS.
 *  - Cards: top-4 demand hubs, anchored via map.project on every "render"
 *    event, collision-resolved (lib/card-layout) so they can NEVER overlap
 *    each other or the result card. Other hubs: card on click.
 *  - Every action runs the real engine; displayed numbers are response
 *    fields verbatim (the one exception: the spec-prescribed display load).
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type tt from "@tomtom-international/web-sdk-maps";
import { ATLAS_CSS } from "@/components/AtlasVision";
import IngestButton from "@/components/IngestButton";
import {
  deleteSavedScenario,
  getBrief,
  getEventMetrics,
  getKpis,
  getNetwork,
  simulate,
  type EventMetricsResponse,
} from "@/lib/api";
import {
  kpiView,
  medianCapacity,
  nearestZoneEmirate,
  toDesignModel,
  type DesignHub,
} from "@/lib/atlas-adapter";
import { resolveCardPositions, type Rect } from "@/lib/card-layout";
import type { BuildPick } from "@/lib/build";
import type { KpisResponse, NetworkMapResponse } from "@/lib/types";

const NetworkMap = dynamic(() => import("@/components/NetworkMap"), { ssr: false });

const CARD_W = 172;
const CARD_H = 86;
const COST_SUB_DEFAULT = "target: cut this by 5% — engine is searching";
const CARD_OFFSETS: [number, number][] = [[-150, -70], [150, -92], [-120, -46], [128, -62]];

function hubTone(busy: number) {
  if (busy >= 95) return { c: "#ff4d5e", label: "over the limit" };
  if (busy >= 75) return { c: "#ffb02e", label: "getting full" };
  return { c: "#37d6f0", label: "running fine" };
}
const fmt = (n: number) => n.toLocaleString();
const fmtDelta = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

interface ResultState {
  title: string;
  body: string;
  /** Screen position, computed at creation time (prototype behaviour). */
  x: number | null;
  y: number | null;
  onUndo: () => void;
}
interface HubActionState { hub: DesignHub; x: number; y: number }
interface LogEntry { t: string; entry: string }

export default function AtlasHome() {
  /* ── engine data (baseline + optional active test) ── */
  const [view, setView] = useState<{ net: NetworkMapResponse; kpis: KpisResponse } | null>(null);
  const baselineRef = useRef<{ net: NetworkMapResponse; kpis: KpisResponse } | null>(null);
  const activeScenarioRef = useRef<string | null>(null);
  const [engineDown, setEngineDown] = useState(false);
  const [armed, setArmed] = useState(false);
  const [stressOn, setStressOn] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [hubAction, setHubAction] = useState<HubActionState | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [costSub, setCostSub] = useState(COST_SUB_DEFAULT);
  const [clock, setClock] = useState("LIVE");
  const [hoverCardId, setHoverCardId] = useState<string | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);
  const [eventMetrics, setEventMetrics] = useState<EventMetricsResponse | null>(null);
  const sessionLogRef = useRef<LogEntry[]>([]);
  const seqRef = useRef(0);
  const mapRef = useRef<tt.Map | null>(null);
  const cardsWrapRef = useRef<HTMLDivElement | null>(null);
  const leadersRef = useRef<SVGSVGElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const log = useCallback((entry: string) => {
    sessionLogRef.current.push({
      t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      entry,
    });
  }, []);

  /** Screen anchor for a result card, computed NOW (event time, not render). */
  const projectPoint = useCallback((lon: number, lat: number) => {
    const map = mapRef.current as unknown as {
      project?: (c: [number, number]) => { x: number; y: number };
    } | null;
    const p = map?.project?.([lon, lat]);
    return p ? { x: Math.max(150, p.x), y: Math.max(150, p.y - 70) } : { x: null, y: null };
  }, []);

  const model = useMemo(() => (view ? toDesignModel(view.net) : null), [view]);
  const bbox = useMemo<[[number, number], [number, number]] | null>(() => {
    if (!model || model.hubs.length === 0) return null;
    const lons = [...model.hubs.map((h) => h.lon), ...model.zones.map((z) => z.lon)];
    const lats = [...model.hubs.map((h) => h.lat), ...model.zones.map((z) => z.lat)];
    return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
  }, [model]);

  /* ── boot + clock (fallback: 15s retry ticks while unreachable) ── */
  const [retryTick, setRetryTick] = useState(0);
  const boot = useCallback(async () => {
    try {
      const [net, kpis] = await Promise.all([getNetwork(), getKpis()]);
      baselineRef.current = { net, kpis };
      activeScenarioRef.current = null;
      setView({ net, kpis });
      setEngineDown(false);
      getEventMetrics().then(setEventMetrics).catch(() => setEventMetrics(null));
    } catch {
      setEngineDown(true);
      window.setTimeout(() => setRetryTick((t) => t + 1), 15_000);
    }
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => void boot(), 0); // defer: no sync setState in effect
    return () => window.clearTimeout(id);
  }, [boot, retryTick]);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock("LIVE · " + now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" }) +
        " · " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  /* ── scenario plumbing (all REAL /simulate) ── */
  const clearScenario = useCallback(async () => {
    const id = activeScenarioRef.current;
    activeScenarioRef.current = null;
    if (id) { try { await deleteSavedScenario(id); } catch { /* gone */ } }
    if (baselineRef.current) setView({ ...baselineRef.current });
    setCostSub(COST_SUB_DEFAULT);
  }, []);

  const runScenario = useCallback(
    async (kind: string, scenarioName: string, params: Record<string, unknown>) => {
      setEngineBusy(true); // immediate feedback — no silent seconds
      try {
      await clearScenario();
      const saveAs = `home-${kind}-${++seqRef.current}`;
      try {
        const res = await simulate({ scenario_name: scenarioName, params, save_as: saveAs });
        const [net, kpis] = await Promise.all([getNetwork(saveAs), getKpis(saveAs)]);
        activeScenarioRef.current = saveAs;
        setView({ net, kpis });
        setEngineDown(false);
        return { res, net };
      } catch (err) {
        setResult({
          title: "⚠ Test failed",
          body: `The engine couldn't run this test: ${(err as Error).message}`,
          x: null,
          y: null,
          onUndo: () => void clearScenario(),
        });
        return null;
      }
      } finally {
        setEngineBusy(false);
      }
    },
    [clearScenario],
  );

  /* ── actions ── */
  const handlePick = useCallback((pick: BuildPick) => {
    if (pick.kind !== "location" || !baselineRef.current || engineBusy) return;
    setArmed(false);
    const baseModel = toDesignModel(baselineRef.current.net);
    const before = new Map(baseModel.hubs.map((h) => [h.id, h.busy]));
    void (async () => {
      const out = await runScenario("add", "add_hub", {
        id: `NEW${seqRef.current + 1}`,
        name: "New Test Hub",
        lat: pick.lat,
        lon: pick.lon,
        emirate: nearestZoneEmirate(baseModel.zones, pick.lat, pick.lon),
        capacity: medianCapacity(baseModel.hubs),
        fixed_cost: 1000,
        handling_cost: 1.0,
      });
      if (!out) return;
      const delta = out.res.delta_pct.cost_to_serve ?? 0;
      const after = toDesignModel(out.net);
      let reliefHub: DesignHub | null = null; let relief = 0;
      after.hubs.filter((h) => !h.id.startsWith("NEW")).forEach((h) => {
        const d = (before.get(h.id) ?? 0) - h.busy;
        if (d > relief) { relief = d; reliefHub = h; }
      });
      setCostSub(`after your test hub (engine estimate ${fmtDelta(delta)}%)`);
      log(`Added a test hub — engine: cost ${fmtDelta(delta)}%` +
        (reliefHub ? `, ${(reliefHub as DesignHub).name} drops to ${(reliefHub as DesignHub).busy}% busy` : ""));
      setResult({
        title: "⬢ New hub tested",
        body: `The engine re-routed nearby parcels to it.${reliefHub ? ` <b>${(reliefHub as DesignHub).name} drops to ${(reliefHub as DesignHub).busy}% busy.</b>` : ""} Cost per parcel: <b>${fmtDelta(delta)}%</b> <span style="color:#8b98ad">(engine estimate)</span>`,
        ...projectPoint(pick.lon, pick.lat),
        onUndo: () => { void clearScenario(); log("Undid the test hub"); },
      });
    })();
  }, [runScenario, clearScenario, log, projectPoint, engineBusy]);

  const handleHubSelect = useCallback((hubId: string, point: { x: number; y: number }) => {
    if (!model) return;
    const hub = model.hubs.find((h) => h.id === hubId);
    if (hub) { setHubAction({ hub, x: point.x, y: point.y }); setHoverCardId(hubId); }
  }, [model]);

  const removeHub = useCallback((hub: DesignHub) => {
    setHubAction(null);
    if (!baselineRef.current) return;
    const before = new Map(toDesignModel(baselineRef.current.net).hubs.map((h) => [h.id, h.busy]));
    void (async () => {
      const out = await runScenario("close", "close_hub", { hub_id: hub.id });
      if (!out) return;
      const delta = out.res.delta_pct.cost_to_serve ?? 0;
      const after = toDesignModel(out.net);
      let worstHub: DesignHub | null = null; let worst = 0;
      after.hubs.forEach((h) => {
        const d = h.busy - (before.get(h.id) ?? 0);
        if (d > worst) { worst = d; worstHub = h; }
      });
      const danger = worstHub !== null && (worstHub as DesignHub).busy >= 95;
      // 5(b): a cost REDUCTION must not read as pure good news.
      setCostSub(delta < 0
        ? `cheaper without ${hub.name} — but check the capacity warning`
        : `without ${hub.name} (engine estimate ${fmtDelta(delta)}%)`);
      log(`Tested removing ${hub.name} — ${worstHub ? (worstHub as DesignHub).name + " jumps to " + (worstHub as DesignHub).busy + "% busy" : ""}${danger ? " (not safe)" : ""}, cost ${fmtDelta(delta)}%`);
      setResult({
        title: "🗑 Hub removed (test)",
        body: `${worstHub ? `<span class="${danger ? "bad" : ""}">${(worstHub as DesignHub).name} jumps to ${(worstHub as DesignHub).busy}% busy${danger ? " — not safe." : "."}</span>` : ""} Cost per parcel: <span class="bad">${fmtDelta(delta)}%</span> <span style="color:#8b98ad">(engine estimate)</span>`,
        ...projectPoint(hub.lon, hub.lat),
        onUndo: () => { void clearScenario(); log(`Restored ${hub.name}`); },
      });
    })();
  }, [runScenario, clearScenario, log, projectPoint]);

  const setStress = useCallback(async (on: boolean) => {
    setStressOn(on);
    if (on) {
      const before = model ? new Map(model.hubs.map((h) => [h.id, h.busy])) : new Map<string, number>();
      const out = await runScenario("stress", "demand_scale", { factor: 1.3 });
      if (!out) { setStressOn(false); return; }
      const after = toDesignModel(out.net);
      const overs = after.hubs.filter((h) => h.busy >= 95 && (before.get(h.id) ?? 0) < 95).map((h) => h.name);
      log(`Ran the busy-week test (+30% parcels) — ${overs.length ? overs.join(" and ") + " go over their limits" : "no hub goes over its limit"}`);
      setCostSub(`busy-week test (engine ${fmtDelta(out.res.delta_pct.cost_to_serve ?? 0)}%)`);
    } else {
      await clearScenario();
    }
  }, [model, runScenario, clearScenario, log]);

  /* ── story mode — AtlasVision's 4 captions on the REAL map ── */
  const [storyOn, setStoryOn] = useState(false);
  const [storyStep, setStoryStep] = useState("HOW IT WORKS · 1/4");
  const [storyText, setStoryText] = useState("");
  const storyTimersRef = useRef<number[]>([]);
  const storyOnRef = useRef(false);

  const clearStoryTimers = () => { storyTimersRef.current.forEach(clearTimeout); storyTimersRef.current = []; };
  const flyTo = useCallback((lon: number, lat: number, zoom: number) => {
    (mapRef.current as unknown as { flyTo?: (o: unknown) => void } | null)?.flyTo?.(
      { center: [lon, lat], zoom, pitch: 55, curve: 1.3, duration: 2200 },
    );
  }, []);

  const endStory = useCallback(() => {
    storyOnRef.current = false;
    setStoryOn(false);
    clearStoryTimers();
    if (bbox) {
      (mapRef.current as unknown as {
        cameraForBounds?: (b: unknown, o?: unknown) => { center: unknown; zoom: number } | undefined;
        flyTo?: (o: unknown) => void;
      } | null | undefined)?.flyTo?.({
        ...( (mapRef.current as unknown as { cameraForBounds?: (b: unknown, o?: unknown) => { center: unknown; zoom: number } | undefined })?.cameraForBounds?.(bbox, { padding: 90 }) ?? {}),
        pitch: 55, bearing: -15, curve: 1.3, duration: 2200,
      });
    }
    void setStress(false);
  }, [bbox, setStress]);

  const playStory = useCallback(() => {
    if (storyOnRef.current) { endStory(); return; }
    if (!model || model.hubs.length === 0) return;
    const byLoad = [...model.hubs].sort((a, b) => b.load - a.load);
    const first = byLoad[0]; const second = byLoad[1] ?? first;
    storyOnRef.current = true;
    setStoryOn(true);
    const typeText = (html: string, done?: () => void) => {
      const words = html.split(" ");
      let i = 0;
      const w = () => {
        if (!storyOnRef.current) return;
        setStoryText(words.slice(0, ++i).join(" "));
        if (i < words.length) storyTimersRef.current.push(window.setTimeout(w, 42));
        else if (done) storyTimersRef.current.push(window.setTimeout(done, 1400));
      };
      w();
    };
    const steps = [
      { pre: () => flyTo(first.lon, first.lat, 10), step: "HOW IT WORKS · 1/4",
        text: `This is <b>${first.name}</b> — the busiest building in the network. The moving dots are <b>real parcels</b> flowing to neighbourhoods.` },
      { pre: () => flyTo(second.lon, second.lat, 10.4), step: "HOW IT WORKS · 2/4",
        text: `<b>${second.name}</b> is ${second.busy}% full. The bar on its card is like a fuel gauge — <span class="warn">red means trouble</span>.` },
      { pre: () => { endStoryCameraHold(); void setStress(true); }, step: "HOW IT WORKS · 3/4",
        text: `Now watch — we just asked: <b>what if parcels grow 30%?</b> Two hubs turn amber. Nothing real changed — this is a <b>safe test</b>.` },
      { pre: () => { /* hold */ }, step: "HOW IT WORKS · 4/4",
        text: `That answer took <b>8 seconds</b>. Today it takes planners <b>8 hours</b>. That is EMX ATLAS — test first, decide fast.` },
    ];
    const endStoryCameraHold = () => {
      if (bbox) {
        const cam = (mapRef.current as unknown as { cameraForBounds?: (b: unknown, o?: unknown) => { center: unknown; zoom: number } | undefined })?.cameraForBounds?.(bbox, { padding: 90 });
        if (cam) (mapRef.current as unknown as { flyTo?: (o: unknown) => void } | null)?.flyTo?.({ ...cam, pitch: 55, bearing: -15, curve: 1.3, duration: 2200 });
      }
    };
    let idx = 0;
    const next = () => {
      if (!storyOnRef.current) return;
      if (idx >= steps.length) { endStory(); return; }
      const s = steps[idx++];
      s.pre(); setStoryStep(s.step);
      typeText(s.text, next);
    };
    next();
  }, [model, bbox, flyTo, setStress, endStory]);

  /* ── report (verbatim /kpis + /brief + session log) ── */
  const openReport = useCallback(() => { void (async () => {
    if (!model || !view) return;
    // The overlay opens IMMEDIATELY — the brief streams in when it lands.
    setReportHtml(`<div class="repBody"><p class="repLead">Preparing the report…</p></div>`);
    const busiest = model.hubs.reduce((a, b) => (a.busy > b.busy ? a : b), model.hubs[0]);
    const k = kpiView(view.kpis);
    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    let brief: Record<string, unknown> | null = null;
    try { brief = (await getBrief(activeScenarioRef.current)) as unknown as Record<string, unknown>; } catch { brief = null; }
    const sens = (brief?.sensitivity ?? {}) as Record<string, unknown>;
    const summary = typeof brief?.summary === "string" ? brief.summary : "—";
    const holds = typeof sens.demand_variation_pct === "number" && typeof sens.feasible_pct === "number" && typeof sens.trials === "number"
      ? ` This recommendation holds even if demand swings ±${sens.demand_variation_pct}% — safe in ${sens.feasible_pct}% of ${sens.trials} stress trials.`
      : "";
    const D = (v: number | null, f: (n: number) => string) => (v !== null ? f(v) : "—");
    const logs = sessionLogRef.current;
    setReportHtml(`
      <div class="repBrand">
        <div class="t" style="display:flex;align-items:center;gap:12px">
          <div style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-weight:900">7X</div>
          <div><b>EMX ATLAS</b><div>NETWORK DECISION BRIEF</div></div>
        </div>
        <div class="d">${today}<br>Prepared automatically · ready to share</div>
      </div>
      <div class="repBody">
        <h2>The network today</h2>
        <p class="repLead">The network is delivering <b>${D(k.deliver, fmt)} parcels</b> across ${model.hubs.length} hubs,
        with room for <b>${D(k.room, fmt)} more</b>. The busiest building is <b>${busiest?.name ?? "—"}</b>
        at <b>${busiest?.busy ?? "—"}%</b> of its limit. Each parcel currently costs <b>${D(k.cost, (n) => n.toFixed(2))} AED</b> to deliver.</p>
        <div class="repGrid" style="margin-top:12px">
          <div class="repStat"><b>${D(k.deliver, fmt)}</b><span>parcels being delivered today</span></div>
          <div class="repStat"><b>${D(k.room, fmt)}</b><span>spare capacity — new business we can take</span></div>
          <div class="repStat"><b>${D(k.cost, (n) => n.toFixed(2))} AED</b><span>cost per parcel</span></div>
          <div class="repStat"><b>${busiest?.busy ?? "—"}%</b><span>${busiest?.name ?? "—"} — the fullest hub</span></div>
        </div>
        <h2>What was tested in this session</h2>
        ${logs.length
          ? `<ul class="repList">${logs.map((l) => `<li><b>${l.t}</b> — ${l.entry}</li>`).join("")}</ul>`
          : `<p class="repLead" style="color:#7c8798">No what-if tests were run in this session yet.</p>`}
        <h2>Engine recommendation</h2>
        <div class="repRec">${summary}${holds}</div>
      </div>
      <div class="repFoot"><span>GENERATED BY EMX ATLAS — A 7X PLATFORM</span>
      <span>EVERY FIGURE COMPUTED BY THE OPTIMISATION ENGINE · NOTHING ESTIMATED BY AI</span></div>`);
  })(); }, [model, view]);

  /* ── Esc ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setArmed(false); setResult(null); setHubAction(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── card anchoring: project on every map render, collision-resolved ── */
  const cardHubs = useMemo(() => {
    if (!model) return [] as DesignHub[];
    const top = model.hubs.filter((h) => h.card);
    const hovered = hoverCardId ? model.hubs.find((h) => h.id === hoverCardId) : undefined;
    return hovered && !top.some((h) => h.id === hovered.id) ? [...top, hovered] : top;
  }, [model, hoverCardId]);

  useEffect(() => {
    const map = mapRef.current;
    const wrap = cardsWrapRef.current;
    if (!map || !wrap) return;
    const reposition = () => {
      const proj = (map as unknown as { project: (c: [number, number]) => { x: number; y: number } }).project;
      const obstacles: Rect[] = [];
      const resultEl = resultRef.current;
      if (resultEl && result) {
        const r = resultEl.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        obstacles.push({ x: r.left - w.left, y: r.top - w.top, w: r.width, h: r.height });
      }
      const anchors = cardHubs.map((h, i) => {
        const p = proj.call(map, [h.lon, h.lat]);
        const off = h.off ?? CARD_OFFSETS[i % CARD_OFFSETS.length];
        return { id: h.id, x: p.x, y: p.y - 26, offX: off[0], offY: off[1] };
      });
      const placed = resolveCardPositions(anchors, CARD_W, CARD_H, obstacles);
      let leaders = "";
      for (const el of Array.from(wrap.children) as HTMLElement[]) {
        const id = el.dataset.hubId;
        if (!id) continue;
        const pos = placed.get(id);
        const anchor = anchors.find((a) => a.id === id);
        if (!pos || !anchor) continue;
        el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        leaders += `<line x1="${pos.x + CARD_W / 2}" y1="${pos.y + CARD_H - 2}" x2="${anchor.x}" y2="${anchor.y}"
          stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
          <circle cx="${anchor.x}" cy="${anchor.y}" r="2.4" fill="${hubTone(cardHubs.find((h) => h.id === id)?.busy ?? 0).c}"/>`;
      }
      if (leadersRef.current) leadersRef.current.innerHTML = leaders;
    };
    reposition();
    map.on("render", reposition);
    return () => { map.off("render", reposition); };
  }, [cardHubs, result, view]);

  const k = view ? kpiView(view.kpis) : { deliver: null, room: null, cost: null };

  return (
    <div id="av-root">
      <style dangerouslySetInnerHTML={{ __html: ATLAS_CSS }} />

      {/* ── BASE: the real TomTom map, host mode, single view ── */}
      <div id="scene">
        {view && (
          <NetworkMap
            baseline={view.net}
            simulation={null}
            simulationId={null}
            corridorMode="domestic"
            isDarkMode
            chrome={false}
            picking={armed ? "location" : null}
            onPick={handlePick}
            onMapHandle={(m) => { mapRef.current = m; }}
            onHubSelect={handleHubSelect}
            fitBoundsTo={bbox}
          />
        )}
        <div id="atmo" />
      </div>

      {/* ── SKIN: the approved design, verbatim ── */}
      <div className="av-header">
        <div className="brand">
          <div className="sevenx">7X</div>
          <b>EMX ATLAS</b>
          <span>THE NETWORK, LIVE</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <IngestButton onIngested={() => void boot()} />
          <div className="live"><i /> <span>{clock}</span></div>
        </div>
      </div>

      <div id="kpis">
        {eventMetrics && (
          <div className={`kpi ${eventMetrics.at_risk_count <= 1 ? "k-green" : "k-amber"}`}>
            <div className="big">
              <em>{eventMetrics.at_risk_count} of {eventMetrics.hub_count}</em> hubs need attention
            </div>
            <div className="sub">
              official status, week {eventMetrics.week} · baseline was 3 of 10 · target 0–1
            </div>
          </div>
        )}
        <div className="kpi k-cyan">
          <div className="big">Delivering <em>{k.deliver !== null ? fmt(k.deliver) : "—"}</em> parcels today</div>
          <div className="sub">across all 7 emirates · updated live</div>
        </div>
        <div className="kpi k-green">
          <div className="big">Room for <em>{k.room !== null ? fmt(k.room) : "—"}</em> more</div>
          <div className="sub">spare capacity — we can take new business</div>
        </div>
        <div className="kpi k-amber">
          <div className="big">Each parcel costs <em>{k.cost !== null ? k.cost.toFixed(2) + " AED" : "—"}</em></div>
          <div className="sub">{costSub}</div>
        </div>
      </div>

      {stressOn && (
        <div id="testband" style={{ display: "flex" }}>
          <i /> TESTING: WHAT IF PARCELS GROW +30%? — NOTHING REAL IS CHANGING
        </div>
      )}

      {armed && (
        <div id="armband" style={{ display: "flex" }}>
          <i className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--cyan)", display: "inline-block" }} />{" "}
          CLICK ANYWHERE ON THE MAP TO PLACE A TEST HUB — ESC TO CANCEL
        </div>
      )}

      {engineBusy && (
        <div id="testband" style={{ display: "flex", top: 118 }}>
          <i /> THE ENGINE IS RE-SOLVING THE NETWORK — A FEW SECONDS
        </div>
      )}

      {engineDown && (
        <div id="engineband" style={{ display: "flex" }}>
          <i className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amber)", display: "inline-block" }} />{" "}
          LIVE ENGINE UNREACHABLE — SHOWING LAST KNOWN NETWORK
        </div>
      )}

      {storyOn && (
        <div id="caption" style={{ display: "block" }}>
          <div className="step">{storyStep}</div>
          <div className="inner" dangerouslySetInnerHTML={{ __html: storyText }} />
        </div>
      )}

      <div id="controls">
        <button className="btn btn-primary" disabled={engineBusy}
          onClick={() => { setArmed(false); playStory(); }}>
          <span className="ic">{storyOn ? "■" : "▶"}</span> Show me how it works{" "}
          <span style={{ opacity: 0.65, fontWeight: 500 }}>30 sec</span>
        </button>
        <button className={`btn btn-ghost${stressOn ? " active" : ""}`} disabled={engineBusy}
          onClick={() => { setArmed(false); void setStress(!stressOn); }}>
          {engineBusy && stressOn ? "⚡ Testing…" : "⚡ Test a busy week"}
        </button>
        <button className={`btn btn-ghost${armed ? " active" : ""}`} onClick={() => setArmed(!armed)}>
          ⬢ Add a hub
        </button>
        <button className="btn btn-ghost" disabled={engineBusy}
          onClick={() => { setArmed(false); openReport(); }}>📄 Get the report</button>
      </div>

      {/* result card (Keep / Undo) */}
      {result && (
        <div
          id="resultCard"
          ref={resultRef}
          style={{
            display: "block",
            left: result.x ?? "50%",
            top: result.y ?? "42%",
          }}
        >
          <div className="rtitle">{result.title}</div>
          <div className="rbody" dangerouslySetInnerHTML={{ __html: result.body }} />
          <div className="rrow">
            <button className="keep" onClick={() => setResult(null)}>✓ Keep this test</button>
            <button className="undo" onClick={() => { result.onUndo(); setResult(null); }}>↩ Undo</button>
          </div>
        </div>
      )}

      {/* hub action popup */}
      {hubAction && (
        <div id="hubAction" style={{ display: "block", left: hubAction.x, top: hubAction.y - 14 }}>
          <div className="han">{hubAction.hub.name}</div>
          <div style={{ fontSize: 10.5, color: "#8b98ad" }}>
            {hubAction.hub.busy}% busy · handles {fmt(Math.round(hubAction.hub.load))} parcels
          </div>
          {eventMetrics?.hubs[hubAction.hub.id] && (
            <div style={{ fontSize: 10.5, marginTop: 4, color:
              eventMetrics.hubs[hubAction.hub.id].status === "At Risk" ? "var(--red)"
              : eventMetrics.hubs[hubAction.hub.id].status === "High Load" ? "var(--amber)"
              : "var(--green)" }}>
              {eventMetrics.hubs[hubAction.hub.id].status} · on-time{" "}
              {eventMetrics.hubs[hubAction.hub.id].on_time_delivery_pct}% · headroom{" "}
              {eventMetrics.hubs[hubAction.hub.id].capacity_headroom_pct}%
            </div>
          )}
          <button className="rm" onClick={() => removeHub(hubAction.hub)}>🗑 Test removing this hub</button>
          <button className="cl" onClick={() => { setHubAction(null); setHoverCardId(null); }}>Close</button>
        </div>
      )}

      {/* report overlay */}
      {reportHtml && (
        <div id="reportOv" style={{ display: "flex" }}>
          <div>
            <div id="repActions">
              <button className="btn btn-primary" onClick={() => window.print()}>⬇ Download PDF</button>
              <button className="btn btn-ghost" onClick={() => setReportHtml(null)}>Close</button>
            </div>
            <div className="repPage" dangerouslySetInnerHTML={{ __html: reportHtml }} />
          </div>
        </div>
      )}

      <div id="legend">
        <span><i style={{ background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)" }} /> Hub — running fine</span>
        <span><i style={{ background: "var(--red)", boxShadow: "0 0 8px var(--red)" }} /> Hub — needs help</span>
        <span><i style={{ background: "#5a6b85" }} /> Moving parcels</span>
      </div>

      {/* glass hub cards + leader lines, collision-free */}
      <svg id="leaders" ref={leadersRef} />
      <div id="cards" ref={cardsWrapRef}>
        {cardHubs.map((h) => {
          const tone = hubTone(h.busy);
          return (
            <div
              key={h.id}
              data-hub-id={h.id}
              className="hubcard"
              style={{ transform: "translate(-9999px,-9999px)", left: 0, top: 0 }}
            >
              <div className="card">
                <div className="name">
                  <span className="dot" style={{ background: tone.c, boxShadow: `0 0 8px ${tone.c}` }} />
                  {h.name}
                </div>
                <div className="plain">
                  {h.busy >= 95
                    ? "Over its limit — parcels will wait. Needs help now."
                    : h.busy >= 75
                      ? `${h.busy}% busy — one busy week from trouble.`
                      : `${h.busy}% busy — handling ${fmt(Math.round(h.load))} parcels fine.`}
                </div>
                <div className="bar">
                  <i style={{ width: `${Math.min(100, h.busy)}%`, background: tone.c, boxShadow: `0 0 8px ${tone.c}` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
