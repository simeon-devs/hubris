"use client";

/**
 * AtlasVision — the approved design (frontend/design/atlasvision.html) as the
 * app's home page, wired to the REAL backend.
 *
 * Port rules honoured:
 *  - Visuals/animations/copy: copied from the prototype verbatim (CSS scoped
 *    under #av-root so nothing leaks into /classic and the other routes).
 *  - No TomTom here — the scene is the prototype's own 2D-canvas projection.
 *  - Every displayed number comes from API fields verbatim, except the
 *    spec-prescribed display load ((busy/100)*cap) used on hub cards.
 *  - All what-ifs run through POST /simulate; deltas shown are the response's
 *    delta_pct fields; undo = back to baseline + DELETE the saved scenario.
 *  - Fallbacks: fetch failure → amber "engine unreachable" banner over the
 *    last good scene; simulate failure → plain-words result card.
 */

import { useEffect, useRef, useState } from "react";
import {
  deleteSavedScenario,
  getBrief,
  getKpis,
  getNetwork,
  simulate,
} from "@/lib/api";
import {
  autoFitCamera,
  kpiView,
  medianCapacity,
  nearestZoneEmirate,
  toDesignModel,
  type DesignHub,
  type DesignModel,
} from "@/lib/atlas-adapter";
import type { KpisResponse, NetworkMapResponse, SimulateResponse } from "@/lib/types";

/* ─────────────────────────────────────────────────────────────────────────
   The prototype's CSS, verbatim values, scoped under #av-root.
───────────────────────────────────────────────────────────────────────── */
const CSS = `
#av-root {
  --bg: #04070f; --brand: #E8112D; --cyan: #37d6f0; --amber: #ffb02e;
  --red: #ff4d5e; --green: #3ddc97; --text: #eef2f8; --muted: #8b98ad;
  position:absolute; inset:0; overflow:hidden; background:var(--bg);
  font-family:'Segoe UI', system-ui, -apple-system, sans-serif; color:var(--text);
}
#av-root * { margin:0; padding:0; box-sizing:border-box; }
#av-root #scene { position:absolute; inset:0; }
#av-root canvas { position:absolute; inset:0; }
#av-root #atmo { position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(ellipse at 50% 42%, rgba(20,40,80,0.20) 0%, transparent 55%),
    radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(2,5,12,0.85) 100%); }
#av-root .av-header { position:absolute; top:0; left:0; right:0; height:58px; z-index:40;
  display:flex; align-items:center; justify-content:space-between; padding:0 22px;
  background:linear-gradient(180deg, rgba(4,7,15,0.85), rgba(4,7,15,0)); }
#av-root .brand { display:flex; align-items:center; gap:12px; }
#av-root .sevenx { width:30px; height:30px; border-radius:8px; background:var(--brand);
  display:flex; align-items:center; justify-content:center;
  font-weight:900; font-size:13px; color:#fff; box-shadow:0 0 22px rgba(232,17,45,0.55); }
#av-root .brand b { letter-spacing:0.14em; font-size:14px; }
#av-root .brand span { font-size:10px; letter-spacing:0.22em; color:var(--muted); margin-left:6px; }
#av-root .live { display:flex; align-items:center; gap:8px; font-size:11px; color:var(--muted); }
#av-root .live i { width:7px; height:7px; border-radius:50%; background:var(--green);
  box-shadow:0 0 8px var(--green); animation:av-pulse 2s infinite; display:inline-block; }
@keyframes av-pulse { 50% { opacity:0.3; } }
#av-root .pulse { animation:av-pulse 1.2s infinite; }
#av-root #kpis { position:absolute; top:74px; right:22px; z-index:30; display:flex;
  flex-direction:column; gap:10px; width:250px; }
#av-root .kpi { background:rgba(8,13,26,0.72); border:1px solid rgba(255,255,255,0.09);
  border-radius:16px; padding:13px 16px; backdrop-filter:blur(14px);
  box-shadow:0 10px 32px rgba(0,0,0,0.45); opacity:0; transform:translateX(16px);
  animation:av-slideIn 0.5s ease-out forwards; }
#av-root .kpi:nth-child(2){animation-delay:0.1s} #av-root .kpi:nth-child(3){animation-delay:0.2s}
#av-root .kpi:nth-child(4){animation-delay:0.3s}
@keyframes av-slideIn { to { opacity:1; transform:none; } }
#av-root .kpi .big { font-size:18.5px; font-weight:700; letter-spacing:-0.01em; line-height:1.3; }
#av-root .kpi .big em { font-style:normal; }
#av-root .kpi .sub { font-size:10.5px; color:var(--muted); margin-top:3px; letter-spacing:0.04em; }
#av-root .k-cyan .big em{ color:var(--cyan); text-shadow:0 0 16px rgba(55,214,240,0.5);}
#av-root .k-green .big em{ color:var(--green); text-shadow:0 0 16px rgba(61,220,151,0.5);}
#av-root .k-amber .big em{ color:var(--amber); text-shadow:0 0 16px rgba(255,176,46,0.45);}
#av-root .hubcard { position:absolute; z-index:25; width:172px; transform:translate(-50%,-100%);
  pointer-events:none; transition:opacity .25s; }
#av-root .hubcard .card { background:rgba(8,13,26,0.80); border:1px solid rgba(255,255,255,0.10);
  border-radius:14px; padding:10px 13px; backdrop-filter:blur(12px);
  box-shadow:0 14px 40px rgba(0,0,0,0.55); }
#av-root .hubcard .name { font-size:12px; font-weight:700; letter-spacing:0.02em; display:flex;
  align-items:center; gap:7px; }
#av-root .hubcard .dot { width:7px; height:7px; border-radius:50%; flex:none; }
#av-root .hubcard .plain { font-size:10.5px; color:var(--muted); margin-top:4px; line-height:1.45; }
#av-root .hubcard .bar { height:3px; border-radius:2px; background:rgba(255,255,255,0.10);
  margin-top:7px; overflow:hidden; }
#av-root .hubcard .bar i { display:block; height:100%; border-radius:2px; }
#av-root #leaders { position:absolute; inset:0; z-index:24; pointer-events:none; }
#av-root #caption { position:absolute; left:50%; bottom:108px; transform:translateX(-50%);
  z-index:45; max-width:620px; text-align:center; display:none; }
#av-root #caption .inner { background:rgba(6,10,20,0.88); border:1px solid rgba(255,255,255,0.12);
  border-radius:18px; padding:16px 26px; backdrop-filter:blur(16px);
  box-shadow:0 18px 60px rgba(0,0,0,0.6); font-size:16.5px; line-height:1.55;
  font-weight:500; letter-spacing:0.01em; min-height:56px; }
#av-root #caption .inner b { color:var(--cyan); }
#av-root #caption .inner .warn { color:var(--red); }
#av-root #caption .step { font-size:10px; letter-spacing:0.3em; color:var(--muted); margin-bottom:8px; }
#av-root #controls { position:absolute; left:22px; bottom:22px; z-index:40; display:flex; gap:12px; }
#av-root .btn { border:none; cursor:pointer; border-radius:14px; font-family:inherit;
  display:flex; align-items:center; gap:10px; transition:transform .15s, box-shadow .15s; }
#av-root .btn:hover { transform:translateY(-2px); }
#av-root .btn-primary { background:var(--brand); color:#fff; padding:14px 22px;
  font-size:14px; font-weight:700; letter-spacing:0.02em;
  box-shadow:0 8px 30px rgba(232,17,45,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset; }
#av-root .btn-primary:hover { box-shadow:0 10px 38px rgba(232,17,45,0.6); }
#av-root .btn-primary .ic { width:26px; height:26px; border-radius:50%; background:rgba(255,255,255,0.18);
  display:flex; align-items:center; justify-content:center; font-size:11px; }
#av-root .btn-ghost { background:rgba(10,16,30,0.78); color:var(--text); padding:14px 20px;
  font-size:13px; font-weight:600; border:1px solid rgba(255,255,255,0.14);
  backdrop-filter:blur(12px); box-shadow:0 8px 26px rgba(0,0,0,0.4); }
#av-root .btn-ghost:hover { border-color:rgba(255,255,255,0.3); }
#av-root .btn-ghost.active { border-color:var(--amber); color:var(--amber);
  box-shadow:0 0 24px rgba(255,176,46,0.25); }
#av-root #testband { position:absolute; top:74px; left:50%; transform:translateX(-50%);
  z-index:35; display:none; align-items:center; gap:10px;
  background:rgba(255,176,46,0.12); border:1px solid rgba(255,176,46,0.45);
  color:var(--amber); border-radius:999px; padding:8px 20px; font-size:12.5px;
  font-weight:700; letter-spacing:0.06em; backdrop-filter:blur(10px);
  box-shadow:0 0 30px rgba(255,176,46,0.2); }
#av-root #testband i { width:8px; height:8px; border-radius:50%; background:var(--amber);
  animation:av-pulse 1.2s infinite; display:inline-block; }
#av-root #armband { position:absolute; top:74px; left:50%; transform:translateX(-50%);
  z-index:36; display:none; align-items:center; gap:10px;
  background:rgba(55,214,240,0.10); border:1px solid rgba(55,214,240,0.45);
  color:var(--cyan); border-radius:999px; padding:8px 20px; font-size:12.5px;
  font-weight:700; letter-spacing:0.05em; backdrop-filter:blur(10px); }
#av-root #engineband { position:absolute; top:118px; left:50%; transform:translateX(-50%);
  z-index:36; display:none; align-items:center; gap:10px;
  background:rgba(255,176,46,0.12); border:1px solid rgba(255,176,46,0.45);
  color:var(--amber); border-radius:999px; padding:8px 20px; font-size:12.5px;
  font-weight:700; letter-spacing:0.05em; backdrop-filter:blur(10px); }
#av-root #resultCard { position:absolute; z-index:46; width:250px; display:none;
  background:rgba(8,13,26,0.92); border:1px solid rgba(255,255,255,0.14);
  border-radius:16px; padding:14px 16px; backdrop-filter:blur(16px);
  box-shadow:0 18px 60px rgba(0,0,0,0.65); transform:translate(-50%,-100%); }
#av-root #resultCard .rtitle { font-size:12.5px; font-weight:800; letter-spacing:0.02em;
  display:flex; align-items:center; gap:8px; }
#av-root #resultCard .rbody { font-size:11.5px; color:#c6d2e4; line-height:1.55; margin:8px 0 12px; }
#av-root #resultCard .rbody b { color:var(--green); } #av-root #resultCard .rbody .bad { color:var(--red); }
#av-root #resultCard .rrow { display:flex; gap:8px; }
#av-root #resultCard button { flex:1; border:none; cursor:pointer; border-radius:10px;
  padding:9px 0; font-size:11.5px; font-weight:700; font-family:inherit; }
#av-root #resultCard .keep { background:var(--green); color:#052; }
#av-root #resultCard .undo { background:rgba(255,255,255,0.08); color:var(--text);
  border:1px solid rgba(255,255,255,0.15); }
#av-root #hubAction { position:absolute; z-index:46; display:none; transform:translate(-50%,-100%);
  background:rgba(8,13,26,0.92); border:1px solid rgba(255,255,255,0.14);
  border-radius:14px; padding:12px 14px; backdrop-filter:blur(16px); width:210px;
  box-shadow:0 18px 60px rgba(0,0,0,0.65); }
#av-root #hubAction .han { font-size:12.5px; font-weight:800; margin-bottom:8px; }
#av-root #hubAction button { width:100%; border:none; cursor:pointer; border-radius:10px;
  padding:9px 0; font-size:11.5px; font-weight:700; font-family:inherit; margin-top:6px; }
#av-root #hubAction .rm { background:rgba(255,77,94,0.15); color:var(--red);
  border:1px solid rgba(255,77,94,0.4); }
#av-root #hubAction .cl { background:rgba(255,255,255,0.07); color:var(--muted);
  border:1px solid rgba(255,255,255,0.12); }
#av-root #reportOv { position:fixed; inset:0; z-index:90; display:none;
  background:rgba(2,4,10,0.78); backdrop-filter:blur(6px);
  align-items:flex-start; justify-content:center; overflow-y:auto; padding:40px 0; }
#av-root .repPage { width:640px; background:#fff; color:#16202e; border-radius:10px;
  box-shadow:0 30px 90px rgba(0,0,0,0.7); overflow:hidden; }
#av-root .repBrand { background:var(--brand); color:#fff; padding:20px 34px;
  display:flex; justify-content:space-between; align-items:center; }
#av-root .repBrand .t b{ font-size:17px; letter-spacing:0.1em; }
#av-root .repBrand .t div{ font-size:10px; letter-spacing:0.24em; opacity:0.85; margin-top:3px; }
#av-root .repBrand .d { font-size:11px; text-align:right; opacity:0.9; line-height:1.5; }
#av-root .repBody { padding:28px 34px 22px; }
#av-root .repBody h2 { font-size:12px; letter-spacing:0.18em; color:#98a3b3; margin:20px 0 10px;
  text-transform:uppercase; }
#av-root .repBody h2:first-child { margin-top:0; }
#av-root .repLead { font-size:14px; line-height:1.6; color:#2a3648; }
#av-root .repGrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
#av-root .repStat { border:1px solid #e5e9f0; border-radius:10px; padding:12px 14px; }
#av-root .repStat b { font-size:19px; } #av-root .repStat span { display:block; font-size:10.5px;
  color:#7c8798; margin-top:2px; }
#av-root .repList { font-size:12.5px; line-height:1.7; color:#2a3648; padding-left:18px; }
#av-root .repRec { background:#f6f8fb; border-left:4px solid var(--brand); border-radius:8px;
  padding:14px 16px; font-size:13px; line-height:1.6; color:#2a3648; }
#av-root .repRec b { color:#0c7a4d; }
#av-root .repFoot { border-top:1px solid #e5e9f0; padding:14px 34px; display:flex;
  justify-content:space-between; font-size:9.5px; color:#98a3b3; letter-spacing:0.06em; }
#av-root #repActions { position:sticky; top:0; display:flex; gap:10px; justify-content:center;
  padding-bottom:16px; }
#av-root #repActions .btn-primary { padding:11px 20px; font-size:12.5px; border-radius:11px; }
#av-root #repActions .btn-ghost { padding:11px 18px; font-size:12px; border-radius:11px; }
@media print {
  #av-root .av-header, #av-root #scene, #av-root #atmo, #av-root #kpis, #av-root #controls,
  #av-root #legend, #av-root #cards, #av-root #leaders, #av-root #caption, #av-root #testband,
  #av-root #armband, #av-root #engineband, #av-root #resultCard, #av-root #hubAction,
  #av-root #repActions { display:none !important; }
  #av-root #reportOv { display:block !important; position:static; background:#fff; padding:0; }
  #av-root .repPage { width:auto; box-shadow:none; border-radius:0; }
  body { background:#fff; }
}
#av-root #legend { position:absolute; right:22px; bottom:22px; z-index:30;
  background:rgba(8,13,26,0.72); border:1px solid rgba(255,255,255,0.09);
  border-radius:14px; padding:11px 16px; backdrop-filter:blur(12px);
  display:flex; gap:18px; font-size:11px; color:var(--muted); }
#av-root #legend span { display:flex; align-items:center; gap:7px; }
#av-root #legend i { width:9px; height:9px; border-radius:50%; display:inline-block; }
`;

/* Runtime scene types (prototype shapes, fed from the adapter). */
interface SceneHub extends DesignHub {
  active: boolean;
  anim: number;
  isNew: boolean;
  _screen?: { x: number; y: number; base: [number, number] };
}
interface SceneDot { lon: number; lat: number; s: number; hub: SceneHub | null }
interface Particle { d: SceneDot; t: number; speed: number }

export default function AtlasVision() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [engineDown, setEngineDown] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
      root.querySelector(sel) as T;

    const cv = $("#cv") as unknown as HTMLCanvasElement;
    const ctx = cv.getContext("2d")!;
    let W = 0, H = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let disposed = false;

    function resize() {
      W = root!.clientWidth; H = root!.clientHeight;
      cv.width = W * DPR; cv.height = H * DPR;
      cv.style.width = W + "px"; cv.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    /* ── camera (prototype maths, target set by auto-fit) ── */
    const cam = { lon: 55.05, lat: 24.92, zoom: 215, rot: -0.10, tilt: 0.62 };
    const camTarget = { ...cam };
    const homeCam = { ...cam }; // updated after auto-fit
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    function project(lon: number, lat: number, h = 0): [number, number] {
      const x = (lon - cam.lon) * cam.zoom;
      const y = -(lat - cam.lat) * cam.zoom * 0.92;
      const cs = Math.cos(cam.rot), sn = Math.sin(cam.rot);
      const rx = x * cs - y * sn; let ry = x * sn + y * cs;
      ry *= cam.tilt;
      return [W / 2 + rx, H * 0.52 + ry - h * (cam.zoom / 118)];
    }
    function unproject(X: number, Y: number): [number, number] {
      const rx = X - W / 2, ry = (Y - H * 0.52) / cam.tilt;
      const cs = Math.cos(-cam.rot), sn = Math.sin(-cam.rot);
      const x = rx * cs - ry * sn, y = rx * sn + ry * cs;
      return [cam.lon + x / cam.zoom, cam.lat - y / (cam.zoom * 0.92)];
    }

    /* ── decorative geography (prototype verbatim) ── */
    const uae: [number, number][] = [[51.62,24.28],[52.1,24.12],[52.65,24.16],[53.35,24.08],[53.95,24.22],
      [54.32,24.44],[54.55,24.58],[54.85,24.78],[55.05,25.00],[55.30,25.28],[55.48,25.46],
      [55.72,25.62],[55.95,25.79],[56.06,25.97],[56.14,25.68],[56.30,25.42],[56.36,25.12],
      [56.20,24.85],[55.90,24.20],[55.62,23.62],[55.10,23.10],[54.10,22.85],[52.80,22.95],
      [51.90,23.60],[51.62,24.28]];
    const roads: [number, number][][] = [
      [[54.37,24.46],[55.27,25.20]], [[55.27,25.20],[55.42,25.35]],
      [[55.42,25.35],[55.95,25.78]], [[55.27,25.20],[55.76,24.19]],
      [[54.37,24.46],[55.76,24.19]], [[55.42,25.35],[56.33,25.13]],
      [[55.95,25.78],[56.33,25.13]]];

    /* ── live scene state (REAL data lands here) ── */
    let hubs: SceneHub[] = [];
    let dots: SceneDot[] = [];
    let particles: Particle[] = [];
    let baselineNetwork: NetworkMapResponse | null = null;
    let baselineKpis: KpisResponse | null = null;
    let currentKpis: KpisResponse | null = null;
    let activeScenario: { id: string; kind: "add" | "close" | "stress" } | null = null;
    let stress = 0; let stressTarget = 0;
    let newHubCount = 0;
    const sessionLog: { t: string; entry: string }[] = [];
    const log = (entry: string) =>
      sessionLog.push({ t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), entry });

    const fmt = (n: number) => n.toLocaleString();
    const fmtDelta = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

    function busyNow(h: SceneHub) { return Math.min(160, Math.round(h.busy)); }
    function hubColor(h: SceneHub) {
      const busy = busyNow(h);
      if (busy >= 95) return { c: "#ff4d5e", glow: "rgba(255,77,94,", label: "over the limit" };
      if (busy >= 75) return { c: "#ffb02e", glow: "rgba(255,176,46,", label: "getting full" };
      return { c: "#37d6f0", glow: "rgba(55,214,240,", label: "running fine" };
    }

    /* ── build/refresh the scene from REAL API payloads ── */
    const cardsRoot = $("#cards");
    const cardEls: Record<string, HTMLElement> = {};

    function applyNetwork(network: NetworkMapResponse, kpis: KpisResponse) {
      const model: DesignModel = toDesignModel(network);
      const prev = new Map(hubs.map((h) => [h.id, h]));

      hubs = model.hubs.map((h) => {
        const old = prev.get(h.id);
        return {
          ...h,
          active: true,
          anim: old ? old.anim : h.id.startsWith("NEW") ? 0 : 1,
          isNew: h.id.startsWith("NEW"),
        };
      });
      // Hubs that vanished (closed in this scenario) collapse out gracefully.
      for (const [id, old] of prev) {
        if (!model.hubs.some((h) => h.id === id)) {
          hubs.push({ ...old, active: false });
        }
      }

      const hubById = new Map(hubs.map((h) => [h.id, h]));
      dots = model.dots.map((d) => ({ lon: d.lon, lat: d.lat, s: d.s, hub: d.hubId ? hubById.get(d.hubId) ?? null : null }));
      particles = [];
      dots.forEach((d) => {
        if (!d.hub) return;
        const count = Math.ceil(d.s);
        for (let i = 0; i < count; i++)
          particles.push({ d, t: Math.random(), speed: 0.0018 + Math.random() * 0.0025 });
      });

      currentKpis = kpis;
      refreshKpis();
      rebuildCards();
    }

    function refreshKpis() {
      if (!currentKpis) return;
      const k = kpiView(currentKpis);
      $("#kpiDeliver").textContent = k.deliver !== null ? fmt(k.deliver) : "—";
      $("#kpiRoom").textContent = k.room !== null ? fmt(k.room) : "—";
      $("#kpiCost").textContent = k.cost !== null ? k.cost.toFixed(2) + " AED" : "—";
    }

    function rebuildCards() {
      cardsRoot.innerHTML = "";
      for (const key of Object.keys(cardEls)) delete cardEls[key];
      hubs.filter((h) => h.card && h.active).forEach((h) => {
        const el = document.createElement("div");
        el.className = "hubcard"; el.id = "card-" + h.id;
        el.innerHTML = `<div class="card">
            <div class="name"><span class="dot"></span>${h.name}</div>
            <div class="plain"></div>
            <div class="bar"><i></i></div>
          </div>`;
        cardsRoot.appendChild(el); cardEls[h.id] = el;
      });
    }

    const leadersSvg = $("#leaders");
    function updateCards() {
      let leaderLines = "";
      hubs.filter((h) => h.card).forEach((h) => {
        const el = cardEls[h.id]; if (!el || !h._screen) return;
        el.style.display = h.active ? "" : "none";
        if (!h.active) return;
        const col = hubColor(h), busy = busyNow(h);
        const off = h.off ?? [-120, -46];
        const cx = h._screen.x + off[0], cy = h._screen.y + off[1];
        el.style.left = cx + "px";
        el.style.top = cy + "px";
        leaderLines += `<line x1="${cx}" y1="${cy - 4}" x2="${h._screen.x}" y2="${h._screen.y - 2}"
           stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
           <circle cx="${h._screen.x}" cy="${h._screen.y - 2}" r="2.4" fill="${col.c}"/>`;
        (el.querySelector(".dot") as HTMLElement).style.cssText = `background:${col.c};box-shadow:0 0 8px ${col.c}`;
        (el.querySelector(".plain") as HTMLElement).textContent =
          busy >= 95 ? `Over its limit — parcels will wait. Needs help now.` :
          busy >= 75 ? `${busy}% busy — one busy week from trouble.` :
          `${busy}% busy — handling ${fmt(Math.round(h.load))} parcels fine.`;
        const bar = el.querySelector(".bar i") as HTMLElement;
        bar.style.width = Math.min(100, busy) + "%";
        bar.style.background = col.c; bar.style.boxShadow = `0 0 8px ${col.c}`;
      });
      leadersSvg.innerHTML = leaderLines;
    }

    /* ── draw loop (prototype verbatim, data-driven) ── */
    let t0 = performance.now();
    let rafId = 0;
    function draw(now: number) {
      if (disposed) return;
      const dt = now - t0; t0 = now;
      cam.lon = lerp(cam.lon, camTarget.lon, 0.045);
      cam.lat = lerp(cam.lat, camTarget.lat, 0.045);
      cam.zoom = lerp(cam.zoom, camTarget.zoom, 0.045);
      cam.rot = lerp(cam.rot, camTarget.rot, 0.045);
      stress = lerp(stress, stressTarget, 0.08);

      ctx.clearRect(0, 0, W, H);

      ctx.fillStyle = "rgba(70,110,170,0.10)";
      const step = 34;
      for (let gx = 0; gx < W; gx += step) for (let gy = 0; gy < H; gy += step)
        ctx.fillRect(gx + ((gy / step) % 2) * step / 2, gy, 1.3, 1.3);

      ctx.beginPath();
      uae.forEach((p, i) => { const s = project(p[0], p[1]); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
      ctx.closePath();
      const land = ctx.createLinearGradient(0, H * 0.2, 0, H);
      land.addColorStop(0, "#0d1830"); land.addColorStop(1, "#0a1120");
      ctx.fillStyle = land; ctx.fill();
      ctx.strokeStyle = "rgba(90,140,210,0.14)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath();
      uae.slice(0, 17).forEach((p, i) => { const s = project(p[0], p[1]); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
      ctx.strokeStyle = "rgba(110,170,255,0.45)"; ctx.lineWidth = 1.6;
      ctx.shadowColor = "rgba(80,150,255,0.65)"; ctx.shadowBlur = 16; ctx.stroke();
      ctx.shadowBlur = 0;

      hubs.filter((h) => h.active).forEach((h) => {
        const s = project(h.lon, h.lat);
        const r = 26 + Math.sqrt(Math.max(0, h.load)) / 7;
        const g2 = ctx.createRadialGradient(s[0], s[1], 4, s[0], s[1], r);
        g2.addColorStop(0, "rgba(60,130,220,0.16)"); g2.addColorStop(1, "rgba(60,130,220,0)");
        ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(s[0], s[1], r, r * cam.tilt, 0, 0, 7); ctx.fill();
      });

      ctx.strokeStyle = "rgba(120,150,200,0.13)"; ctx.lineWidth = 1;
      roads.forEach((r) => { ctx.beginPath();
        const a = project(r[0][0], r[0][1]), b = project(r[1][0], r[1][1]);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });

      ctx.font = '600 10px "Segoe UI", sans-serif';
      ctx.fillStyle = "rgba(140,165,200,0.30)";
      ([["A B U   D H A B I",53.5,23.9],["D U B A I",55.02,25.02],["S H A R J A H",55.62,25.5],
        ["A L   A I N",55.6,23.95],["F U J A I R A H",56.42,25.28],["R A K",56.1,25.95]] as [string, number, number][])
        .forEach(([label, lo, la]) => { const s = project(lo, la); ctx.fillText(label, s[0], s[1]); });

      dots.forEach((d) => {
        const s = project(d.lon, d.lat);
        ctx.beginPath(); ctx.arc(s[0], s[1], 1.6 + d.s * 0.7, 0, 7);
        ctx.fillStyle = "rgba(110,150,210,0.45)"; ctx.fill();
      });

      dots.forEach((d) => {
        if (!d.hub || !d.hub.active) return;
        const a = project(d.hub.lon, d.hub.lat), b = project(d.lon, d.lat);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 14;
        ctx.quadraticCurveTo(mx, my, b[0], b[1]);
        ctx.strokeStyle = "rgba(80,120,190,0.10)"; ctx.lineWidth = 1; ctx.stroke();
      });
      particles.forEach((p) => {
        if (!p.d.hub || !p.d.hub.active) return;
        p.t += p.speed * (1 + stress * 0.7) * (dt / 16.7); if (p.t > 1) p.t = 0;
        const a = project(p.d.hub.lon, p.d.hub.lat), b = project(p.d.lon, p.d.lat);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 14;
        const u = p.t, iu = 1 - u;
        const x = iu * iu * a[0] + 2 * iu * u * mx + u * u * b[0];
        const y = iu * iu * a[1] + 2 * iu * u * my + u * u * b[1];
        const col = hubColor(p.d.hub);
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7);
        ctx.fillStyle = col.glow + "0.85)"; ctx.shadowColor = col.c; ctx.shadowBlur = 6;
        ctx.fill(); ctx.shadowBlur = 0;
      });

      hubs.filter((h) => h.anim > 0.02 || h.active).slice()
        .sort((a, b) => project(a.lon, a.lat)[1] - project(b.lon, b.lat)[1]).forEach((h) => {
        h.anim = lerp(h.anim, h.active ? 1 : 0, 0.10);
        if (h.anim <= 0.02 && !h.active) return;
        const col = hubColor(h);
        const base = project(h.lon, h.lat);
        const R = (7 + Math.sqrt(Math.max(1, h.cap)) / 27) * (0.4 + 0.6 * h.anim);
        const halo = ctx.createRadialGradient(base[0], base[1], 2, base[0], base[1], R * 3.1);
        halo.addColorStop(0, col.glow + "0.30)"); halo.addColorStop(1, col.glow + "0)");
        ctx.fillStyle = halo; ctx.beginPath();
        ctx.ellipse(base[0], base[1], R * 3.1, R * 3.1 * cam.tilt, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(base[0], base[1], R * 1.5, R * 1.5 * cam.tilt, 0, 0, 7);
        ctx.strokeStyle = col.glow + "0.55)"; ctx.lineWidth = 1.2; ctx.stroke();
        const hgt = (26 + (busyNow(h) / 100) * 60) * h.anim;
        const top: [number, number] = [base[0], base[1] - hgt];
        const w = R * 0.9, wt = w * 0.82;
        const g = ctx.createLinearGradient(0, top[1], 0, base[1]);
        g.addColorStop(0, col.c); g.addColorStop(1, col.glow + "0.12)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(base[0] - w, base[1]); ctx.lineTo(top[0] - wt, top[1]);
        ctx.lineTo(top[0] + wt, top[1]); ctx.lineTo(base[0] + w, base[1]); ctx.closePath();
        ctx.shadowColor = col.c; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.ellipse(top[0], top[1], wt, wt * 0.45, 0, 0, 7);
        ctx.fillStyle = col.c; ctx.fill();
        ctx.beginPath(); ctx.ellipse(top[0], top[1] - 1, wt * 0.55, wt * 0.22, 0, 0, 7);
        ctx.fillStyle = "rgba(255,255,255,0.30)"; ctx.fill();
        h._screen = { x: top[0], y: top[1], base };
      });

      updateCards();
      rafId = requestAnimationFrame(draw);
    }

    /* ── scenario plumbing (all REAL /simulate) ── */
    async function clearActiveScenario() {
      if (!activeScenario) return;
      const id = activeScenario.id;
      activeScenario = null;
      try { await deleteSavedScenario(id); } catch { /* already gone */ }
      if (baselineNetwork && baselineKpis) applyNetwork(baselineNetwork, baselineKpis);
    }

    async function runScenario(
      kind: "add" | "close" | "stress",
      scenarioName: string,
      params: Record<string, unknown>,
    ): Promise<{ res: SimulateResponse; net: NetworkMapResponse; kpis: KpisResponse } | null> {
      await clearActiveScenario();
      const saveAs = `vision-${kind}-${++newHubCount}`;
      try {
        const res = await simulate({ scenario_name: scenarioName, params, save_as: saveAs });
        const [net, kpis] = await Promise.all([getNetwork(saveAs), getKpis(saveAs)]);
        activeScenario = { id: saveAs, kind };
        applyNetwork(net, kpis);
        setEngineDown(false);
        return { res, net, kpis };
      } catch (err) {
        showResult(hubs[0] ?? null, "⚠ Test failed",
          `The engine couldn't run this test: ${(err as Error).message}`,
          () => { void clearActiveScenario(); });
        return null;
      }
    }

    /* ── UI elements ── */
    const stressBtn = $("#stressBtn"); const testband = $("#testband");
    const addBtn = $("#addBtn"); const armband = $("#armband");
    const resultCard = $("#resultCard"); const hubAction = $("#hubAction");
    const kpiCostSub = $("#kpiCostSub");
    const COST_SUB_DEFAULT = "target: cut this by 5% — engine is searching";

    let addArmed = false;
    function setArmed(on: boolean) {
      addArmed = on;
      addBtn.classList.toggle("active", on);
      armband.style.display = on ? "flex" : "none";
      cv.style.cursor = on ? "crosshair" : "default";
    }
    addBtn.onclick = () => setArmed(!addArmed);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setArmed(false);
        resultCard.style.display = "none"; hubAction.style.display = "none"; }
    };
    window.addEventListener("keydown", onKey);

    function showResult(h: SceneHub | null, title: string, body: string, onUndo: () => void) {
      const s = h ? project(h.lon, h.lat, 0) : [W / 2, H / 2];
      resultCard.style.left = Math.min(W - 150, Math.max(150, s[0])) + "px";
      resultCard.style.top = Math.max(150, s[1] - 70) + "px";
      resultCard.innerHTML = `<div class="rtitle">${title}</div>
        <div class="rbody">${body}</div>
        <div class="rrow"><button class="keep">✓ Keep this test</button>
        <button class="undo">↩ Undo</button></div>`;
      resultCard.style.display = "block";
      (resultCard.querySelector(".keep") as HTMLElement).onclick = () => { resultCard.style.display = "none"; };
      (resultCard.querySelector(".undo") as HTMLElement).onclick = () => { onUndo(); resultCard.style.display = "none"; };
    }

    /* busy-week toggle — a REAL demand_scale 1.3 simulation */
    let stressOn = false;
    async function setStress(on: boolean) {
      if (on === stressOn) return;
      stressOn = on;
      stressBtn.classList.toggle("active", on);
      testband.style.display = on ? "flex" : "none";
      stressTarget = on ? 1 : 0;
      if (on) {
        const before = new Map(hubs.map((h) => [h.id, busyNow(h)]));
        const out = await runScenario("stress", "demand_scale", { factor: 1.3 });
        if (out) {
          const overs = hubs.filter((h) => h.active && busyNow(h) >= 95 && (before.get(h.id) ?? 0) < 95)
            .map((h) => h.name);
          log(`Ran the busy-week test (+30% parcels) — ${overs.length ? overs.join(" and ") + " go over their limits" : "no hub goes over its limit"}`);
          kpiCostSub.textContent = `busy-week test (engine ${fmtDelta(out.res.delta_pct.cost_to_serve ?? 0)}%)`;
        } else { stressOn = false; stressTarget = 0; stressBtn.classList.remove("active"); testband.style.display = "none"; }
      } else {
        await clearActiveScenario();
        kpiCostSub.textContent = COST_SUB_DEFAULT;
      }
    }
    stressBtn.onclick = () => { void setStress(!stressOn); };

    /* clicks: add-hub placement · hub hit-test → remove test */
    const onCanvasClick = async (e: MouseEvent) => {
      const rect = cv.getBoundingClientRect();
      const X = e.clientX - rect.left, Y = e.clientY - rect.top;
      if (addArmed) {
        setArmed(false);
        const [lon, lat] = unproject(X, Y);
        const before = new Map(hubs.map((h) => [h.id, busyNow(h)]));
        const params = {
          id: `NEW${newHubCount + 1}`,
          name: "New Test Hub",
          lat, lon,
          emirate: nearestZoneEmirate(toDesignModel(baselineNetwork!).zones, lat, lon),
          capacity: medianCapacity(hubs.filter((h) => h.active && !h.isNew)),
          fixed_cost: 1000,
          handling_cost: 1.0,
        };
        const out = await runScenario("add", "add_hub", params);
        if (!out) return;
        const delta = out.res.delta_pct.cost_to_serve ?? 0;
        // The hub whose utilization dropped most — comparison of the two
        // /network responses; the number shown is the scenario's verbatim busy.
        let reliefHub: SceneHub | null = null; let relief = 0;
        hubs.filter((h) => h.active && !h.isNew).forEach((h) => {
          const d = (before.get(h.id) ?? 0) - busyNow(h);
          if (d > relief) { relief = d; reliefHub = h; }
        });
        const nh = hubs.find((h) => h.isNew) ?? null;
        kpiCostSub.textContent = `after your test hub (engine estimate ${fmtDelta(delta)}%)`;
        log(`Added a test hub — engine: cost ${fmtDelta(delta)}%` +
          (reliefHub ? `, ${(reliefHub as SceneHub).name} drops to ${busyNow(reliefHub)}% busy` : ""));
        showResult(nh, "⬢ New hub tested",
          `The engine re-routed nearby parcels to it.${reliefHub ? ` <b>${(reliefHub as SceneHub).name} drops to ${busyNow(reliefHub)}% busy.</b>` : ""} Cost per parcel: <b>${fmtDelta(delta)}%</b> <span style="color:#8b98ad">(engine estimate)</span>`,
          () => { void (async () => {
            await clearActiveScenario();
            kpiCostSub.textContent = COST_SUB_DEFAULT;
            log("Undid the test hub");
          })(); });
        return;
      }
      const hit = hubs.find((h) => { if (!h.active || !h._screen) return false;
        const b = h._screen.base; const dx = X - b[0], dy = Y - b[1];
        return (dx * dx + dy * dy < 900) || (Math.abs(X - h._screen.x) < 16 && Y > h._screen.y - 10 && Y < b[1] + 8); });
      if (hit) {
        const s = hit._screen!;
        hubAction.style.left = s.x + "px"; hubAction.style.top = (s.y - 14) + "px";
        hubAction.innerHTML = `<div class="han">${hit.name}</div>
          <div style="font-size:10.5px;color:#8b98ad">${busyNow(hit)}% busy · handles ${fmt(Math.round(hit.load))} parcels</div>
          <button class="rm">🗑 Test removing this hub</button>
          <button class="cl">Close</button>`;
        hubAction.style.display = "block";
        (hubAction.querySelector(".cl") as HTMLElement).onclick = () => { hubAction.style.display = "none"; };
        (hubAction.querySelector(".rm") as HTMLElement).onclick = () => { void (async () => {
          hubAction.style.display = "none";
          const before = new Map(hubs.map((h) => [h.id, busyNow(h)]));
          const out = await runScenario("close", "close_hub", { hub_id: hit.id });
          if (!out) return;
          const delta = out.res.delta_pct.cost_to_serve ?? 0;
          let worstHub: SceneHub | null = null; let worst = 0;
          hubs.filter((h) => h.active).forEach((h) => {
            const d = busyNow(h) - (before.get(h.id) ?? 0);
            if (d > worst) { worst = d; worstHub = h; }
          });
          const danger = worstHub !== null && busyNow(worstHub) >= 95;
          kpiCostSub.textContent = `without ${hit.name} (engine estimate ${fmtDelta(delta)}%)`;
          log(`Tested removing ${hit.name} — ${worstHub ? (worstHub as SceneHub).name + " jumps to " + busyNow(worstHub) + "% busy" : ""}${danger ? " (not safe)" : ""}, cost ${fmtDelta(delta)}%`);
          showResult(hit, "🗑 Hub removed (test)",
            `${worstHub ? `<span class="${danger ? "bad" : ""}">${(worstHub as SceneHub).name} jumps to ${busyNow(worstHub)}% busy${danger ? " — not safe." : "."}</span>` : ""} Cost per parcel: <span class="bad">${fmtDelta(delta)}%</span> <span style="color:#8b98ad">(engine estimate)</span>`,
            () => { void (async () => {
              await clearActiveScenario();
              kpiCostSub.textContent = COST_SUB_DEFAULT;
              log(`Restored ${hit.name}`);
            })(); });
        })(); };
      } else { hubAction.style.display = "none"; }
    };
    cv.addEventListener("click", onCanvasClick);

    /* ── story mode — same captions, REAL names/figures/simulation ── */
    const storyBtn = $("#storyBtn");
    const caption = $("#caption"); const captext = $("#captext"); const capstep = $("#capstep");
    let storyOn = false; let storyTimers: number[] = [];

    function typeText(html: string, done?: () => void) {
      captext.innerHTML = ""; let i = 0;
      const words = html.split(" ");
      (function w() { if (!storyOn) return;
        captext.innerHTML = words.slice(0, ++i).join(" ");
        if (i < words.length) storyTimers.push(window.setTimeout(w, 42));
        else if (done) storyTimers.push(window.setTimeout(done, 1400));
      })();
    }
    function fly(lon: number, lat: number, zoom: number, rot?: number) {
      camTarget.lon = lon; camTarget.lat = lat;
      camTarget.zoom = zoom; camTarget.rot = rot ?? camTarget.rot;
    }

    function playStory() {
      if (storyOn) { endStory(); return; }
      const byLoad = hubs.filter((h) => h.active).sort((a, b) => b.load - a.load);
      const first = byLoad[0]; const second = byLoad[1] ?? byLoad[0];
      if (!first) return;
      storyOn = true;
      (storyBtn.querySelector(".ic") as HTMLElement).textContent = "■";
      caption.style.display = "block";
      const story = [
        { pre() { fly(first.lon, first.lat, 300, -0.06); }, step: "HOW IT WORKS · 1/4",
          text: `This is <b>${first.name}</b> — the busiest building in the network. The moving dots are <b>real parcels</b> flowing to neighbourhoods.` },
        { pre() { fly(second.lon, second.lat, 340, -0.02); }, step: "HOW IT WORKS · 2/4",
          text: `<b>${second.name}</b> is ${busyNow(second)}% full. The bar on its card is like a fuel gauge — <span class="warn">red means trouble</span>.` },
        { pre() { fly(homeCam.lon, homeCam.lat, homeCam.zoom, -0.10); void setStress(true); }, step: "HOW IT WORKS · 3/4",
          text: `Now watch — we just asked: <b>what if parcels grow 30%?</b> Two hubs turn amber. Nothing real changed — this is a <b>safe test</b>.` },
        { pre() { /* hold */ }, step: "HOW IT WORKS · 4/4",
          text: `That answer took <b>8 seconds</b>. Today it takes planners <b>8 hours</b>. That is EMX ATLAS — test first, decide fast.` },
      ];
      let idx = 0;
      (function next() { if (!storyOn) return;
        if (idx >= story.length) { endStory(); return; }
        const s = story[idx++]; s.pre(); capstep.textContent = s.step;
        typeText(s.text, next);
      })();
    }
    function endStory() {
      storyOn = false; storyTimers.forEach(clearTimeout); storyTimers = [];
      caption.style.display = "none";
      (storyBtn.querySelector(".ic") as HTMLElement).textContent = "▶";
      fly(homeCam.lon, homeCam.lat, homeCam.zoom, -0.10); void setStress(false);
    }
    storyBtn.onclick = playStory;

    /* ── report — /kpis + /brief + the session log, verbatim fields ── */
    $("#reportBtn").onclick = () => { void (async () => {
      const open = hubs.filter((h) => h.active);
      const busiest = open.reduce((a, b) => (busyNow(a) > busyNow(b) ? a : b), open[0]);
      const k = currentKpis ? kpiView(currentKpis) : { deliver: null, room: null, cost: null };
      const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      let brief: Record<string, unknown> | null = null;
      try { brief = await getBrief(activeScenario?.id ?? null) as unknown as Record<string, unknown>; } catch { brief = null; }
      const sens = (brief?.sensitivity ?? {}) as Record<string, unknown>;
      const summary = typeof brief?.summary === "string" ? brief.summary : "—";
      const holds = typeof sens.demand_variation_pct === "number" && typeof sens.feasible_pct === "number" && typeof sens.trials === "number"
        ? `This recommendation holds even if demand swings ±${sens.demand_variation_pct}% — safe in ${sens.feasible_pct}% of ${sens.trials} stress trials.`
        : "—";
      const D = (v: number | null, f: (n: number) => string) => (v !== null ? f(v) : "—");
      $("#repPage").innerHTML = `
        <div class="repBrand">
          <div class="t" style="display:flex;align-items:center;gap:12px">
            <div style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-weight:900">7X</div>
            <div><b>EMX ATLAS</b><div>NETWORK DECISION BRIEF</div></div>
          </div>
          <div class="d">${today}<br>Prepared automatically · ready to share</div>
        </div>
        <div class="repBody">
          <h2>The network today</h2>
          <p class="repLead">The network is delivering <b>${D(k.deliver, fmt)} parcels</b> across ${open.length} hubs,
          with room for <b>${D(k.room, fmt)} more</b>. The busiest building is <b>${busiest?.name ?? "—"}</b>
          at <b>${busiest ? busyNow(busiest) : "—"}%</b> of its limit. Each parcel currently costs <b>${D(k.cost, (n) => n.toFixed(2))} AED</b> to deliver.</p>
          <div class="repGrid" style="margin-top:12px">
            <div class="repStat"><b>${D(k.deliver, fmt)}</b><span>parcels being delivered today</span></div>
            <div class="repStat"><b>${D(k.room, fmt)}</b><span>spare capacity — new business we can take</span></div>
            <div class="repStat"><b>${D(k.cost, (n) => n.toFixed(2))} AED</b><span>cost per parcel</span></div>
            <div class="repStat"><b>${busiest ? busyNow(busiest) : "—"}%</b><span>${busiest?.name ?? "—"} — the fullest hub</span></div>
          </div>
          <h2>What was tested in this session</h2>
          ${sessionLog.length
            ? `<ul class="repList">${sessionLog.map((l) => `<li><b>${l.t}</b> — ${l.entry}</li>`).join("")}</ul>`
            : `<p class="repLead" style="color:#7c8798">No what-if tests were run in this session yet.</p>`}
          <h2>Engine recommendation</h2>
          <div class="repRec">${summary}
          ${holds !== "—" ? holds : ""}</div>
        </div>
        <div class="repFoot"><span>GENERATED BY EMX ATLAS — A 7X PLATFORM</span>
        <span>EVERY FIGURE COMPUTED BY THE OPTIMISATION ENGINE · NOTHING ESTIMATED BY AI</span></div>`;
      $("#reportOv").style.display = "flex";
    })(); };
    $("#repClose").onclick = () => { $("#reportOv").style.display = "none"; };
    $("#repPrint").onclick = () => window.print();

    /* ── live clock ── */
    function tickClock() {
      const now = new Date();
      $("#liveClock").textContent = "LIVE · " +
        now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" }) +
        " · " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    tickClock();
    const clockTimer = window.setInterval(tickClock, 30_000);

    /* ── boot: fetch REAL data, auto-fit, intro flight ── */
    let retryTimer = 0;
    async function boot() {
      try {
        const [net, kpis] = await Promise.all([getNetwork(), getKpis()]);
        baselineNetwork = net; baselineKpis = kpis;
        applyNetwork(net, kpis);
        setEngineDown(false);
        const fit = autoFitCamera(toDesignModel(net), W, H);
        homeCam.lon = fit.lon; homeCam.lat = fit.lat; homeCam.zoom = fit.zoom;
        camTarget.lon = fit.lon; camTarget.lat = fit.lat;
        cam.lon = fit.lon; cam.lat = fit.lat;
        // intro flight (prototype: zoom 70 → target, tilt 0.95 → 0.62)
        cam.zoom = 70; cam.tilt = 0.95;
        camTarget.zoom = fit.zoom;
        const tiltTimer = window.setInterval(() => {
          cam.tilt = lerp(cam.tilt, 0.62, 0.06);
          if (Math.abs(cam.tilt - 0.62) < 0.01) { cam.tilt = 0.62; clearInterval(tiltTimer); }
        }, 16);
      } catch {
        setEngineDown(true);
        retryTimer = window.setTimeout(() => { void boot(); }, 15_000);
      }
    }
    void boot();
    rafId = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearInterval(clockTimer);
      clearTimeout(retryTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      cv.removeEventListener("click", onCanvasClick);
      storyTimers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div id="av-root" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div id="scene">
        <canvas id="cv" />
        <div id="atmo" />
      </div>

      <div className="av-header">
        <div className="brand">
          <div className="sevenx">7X</div>
          <b>EMX ATLAS</b>
          <span>THE NETWORK, LIVE</span>
        </div>
        <div className="live"><i /> <span id="liveClock">LIVE</span></div>
      </div>

      <div id="kpis">
        <div className="kpi k-cyan">
          <div className="big">Delivering <em id="kpiDeliver">—</em> parcels today</div>
          <div className="sub">across all 7 emirates · updated live</div>
        </div>
        <div className="kpi k-green">
          <div className="big">Room for <em id="kpiRoom">—</em> more</div>
          <div className="sub">spare capacity — we can take new business</div>
        </div>
        <div className="kpi k-amber">
          <div className="big">Each parcel costs <em id="kpiCost">—</em></div>
          <div className="sub" id="kpiCostSub">target: cut this by 5% — engine is searching</div>
        </div>
      </div>

      <div id="testband"><i /> TESTING: WHAT IF PARCELS GROW +30%? — NOTHING REAL IS CHANGING</div>

      <div id="caption">
        <div className="step" id="capstep">HOW IT WORKS · 1/4</div>
        <div className="inner" id="captext" />
      </div>

      <div id="armband">
        <i className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--cyan)", display: "inline-block" }} />{" "}
        CLICK ANYWHERE ON THE MAP TO PLACE A TEST HUB — ESC TO CANCEL
      </div>

      {engineDown && (
        <div id="engineband" style={{ display: "flex" }}>
          <i className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amber)", display: "inline-block" }} />{" "}
          LIVE ENGINE UNREACHABLE — SHOWING LAST KNOWN NETWORK
        </div>
      )}

      <div id="controls">
        <button className="btn btn-primary" id="storyBtn">
          <span className="ic">▶</span> Show me how it works{" "}
          <span style={{ opacity: 0.65, fontWeight: 500 }}>30 sec</span>
        </button>
        <button className="btn btn-ghost" id="stressBtn">⚡ Test a busy week</button>
        <button className="btn btn-ghost" id="addBtn">⬢ Add a hub</button>
        <button className="btn btn-ghost" id="reportBtn">📄 Get the report</button>
      </div>

      <div id="resultCard" />
      <div id="hubAction" />

      <div id="reportOv">
        <div>
          <div id="repActions">
            <button className="btn btn-primary" id="repPrint">⬇ Download PDF</button>
            <button className="btn btn-ghost" id="repClose">Close</button>
          </div>
          <div className="repPage" id="repPage" />
        </div>
      </div>

      <div id="legend">
        <span><i style={{ background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)" }} /> Hub — running fine</span>
        <span><i style={{ background: "var(--red)", boxShadow: "0 0 8px var(--red)" }} /> Hub — needs help</span>
        <span><i style={{ background: "#5a6b85" }} /> Moving parcels</span>
      </div>

      <svg id="leaders" />
      <div id="cards" />
    </div>
  );
}
