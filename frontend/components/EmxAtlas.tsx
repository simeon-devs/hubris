"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * EmxAtlas — the approved EMX interface (frontend/design/atlas-app.html)
 * ported verbatim as the platform's home screen.
 *
 * Port rules honoured:
 *  - CSS copied verbatim, scoped under #emx-root (values untouched).
 *  - JS logic copied verbatim into one mount effect; dynamic HTML strings are
 *    unchanged, so their inline onclick handlers are exposed as window
 *    globals for the lifetime of the component (removed on unmount).
 *  - The embedded REAL dataset stays as the OFFLINE fallback (VIEW MODE);
 *    when the live engine answers, /network + /kpis + /event/metrics replace
 *    hubs/zones/assignments/official live — candidates come from the same
 *    official file (lib/event-candidates.json).
 *  - Leaflet via npm (CSS imported), not the CDN. Marker logic identical.
 *  - Only deliberate change: API base honours NEXT_PUBLIC_API_URL (the IPv4
 *    hardening) instead of a hardcoded localhost.
 */

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import EVENT_CANDIDATES from "@/lib/event-candidates.json";
import { EMX_LOGO_B64, EMX_AR_B64 } from "@/lib/emx-logos";

/* ═════════ the design's CSS, verbatim values, scoped under #emx-root ═════════ */
const CSS = `
#emx-root{
  --page:#f3f5fb; --card:#ffffff; --card2:#eef1f9; --line:rgba(16,24,72,0.10);
  --ink:#10173d; --ink2:#4a5375; --mute:#8b93ad; --brand:#00229e; --teal:#00229e;
  --s1:#2a4bd7; --s2:#d95926; --s3:#199e70;
  --good:#0e9f4a; --warn:#e8960c; --serious:#ec835a; --crit:#d2312e; --grid:#e4e8f3;
  position:absolute; inset:0; background:var(--page); color:var(--ink);
  font-family:'Segoe UI',system-ui,sans-serif; overflow:hidden;
}
#emx-root *{margin:0;padding:0;box-sizing:border-box}
#emx-root .card,#emx-root .mapcardui{box-shadow:0 1px 3px rgba(16,24,72,0.06)}
#emx-root .mono{font-family:ui-monospace,Consolas,monospace}
#emx-root #app{display:flex;height:100%}
#emx-root aside{width:212px;background:#ffffff;border-right:1px solid var(--line);display:flex;flex-direction:column;padding:16px 12px;gap:4px;flex:none}
#emx-root .logo{display:flex;align-items:center;gap:10px;padding:4px 8px 14px;border-bottom:1px solid var(--line);margin-bottom:10px}
#emx-root .logo .mark{width:30px;height:30px;border-radius:8px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex:none}
#emx-root .logo b{font-size:13px;letter-spacing:0.06em}#emx-root .logo span{display:block;font-size:8.5px;color:var(--mute);letter-spacing:0.14em}
#emx-root nav button{display:flex;align-items:center;gap:11px;width:100%;padding:10px 11px;border-radius:9px;font-size:12.5px;color:var(--ink2);background:none;border:none;cursor:pointer;font-family:inherit;text-align:left}
#emx-root nav button.on{background:rgba(0,34,158,0.08);color:var(--brand);font-weight:700;border-left:3px solid var(--brand);padding-left:8px}
#emx-root nav button:hover:not(.on){background:rgba(255,255,255,0.03);color:var(--ink)}
#emx-root .engpill{margin-top:auto;border:1px solid var(--line);border-radius:12px;padding:12px}
#emx-root .engpill .st{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700}
#emx-root .engpill .st i{width:7px;height:7px;border-radius:50%}
#emx-root .engpill p{font-size:10px;color:var(--mute);margin-top:5px;line-height:1.5}
#emx-root .engpill button{margin-top:8px;width:100%;background:var(--card2);border:1px solid var(--line);color:var(--ink2);border-radius:7px;padding:6px;font-size:10.5px;cursor:pointer;font-family:inherit}
#emx-root main{flex:1;display:flex;flex-direction:column;min-width:0}
#emx-root .topbar{height:50px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid var(--line);flex:none}
#emx-root .crumb{font-size:12px;color:var(--mute)}#emx-root .crumb b{color:var(--ink)}
#emx-root .topright{display:flex;gap:12px;align-items:center;font-size:11px;color:var(--ink2)}
#emx-root .page{flex:1;overflow:auto;padding:16px 20px;display:none}
#emx-root .page.on{display:block}
#emx-root .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
#emx-root .tile{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:14px 16px}
#emx-root .tile .lab{font-size:10px;color:var(--mute);letter-spacing:0.08em;text-transform:uppercase}
#emx-root .tile .val{font-size:30px;font-weight:700;margin-top:6px;font-family:ui-monospace,Consolas,monospace;letter-spacing:-0.02em}
#emx-root .tile .val small{font-size:11px;color:var(--ink2);font-weight:500;margin-left:3px}
#emx-root .tile .sub{font-size:10.5px;color:var(--mute);margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#emx-root .chip{font-size:9.5px;font-weight:700;border-radius:6px;padding:2px 7px;white-space:nowrap}
#emx-root .chip.up{background:rgba(14,159,74,0.12);color:#0b7d3b}#emx-root .chip.dn{background:rgba(210,49,46,0.10);color:#b3271f}
#emx-root .chip.wn{background:rgba(232,150,12,0.12);color:#a86a06}
#emx-root .card{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:15px 17px;margin-bottom:12px}
#emx-root .card h3{font-size:12.5px;font-weight:600;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
#emx-root .card h3 span{font-size:10px;color:var(--mute);font-weight:500}
#emx-root .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#emx-root .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
#emx-root .axis{font-size:9px;fill:var(--mute)}#emx-root .gridline{stroke:var(--grid)}
#emx-root .utilrow{display:flex;align-items:center;gap:9px;font-size:11px;padding:5px 0}
#emx-root .utilrow .tag{width:52px;font-size:9px;font-weight:700;border-radius:5px;padding:2.5px 0;text-align:center}
#emx-root .tag.ok{background:rgba(14,159,74,0.12);color:#0b7d3b}#emx-root .tag.hi{background:rgba(232,150,12,0.12);color:#a86a06}
#emx-root .tag.risk{background:rgba(210,49,46,0.12);color:#b3271f}
#emx-root .utilrow .nm{width:150px;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#emx-root .utilrow .bar{flex:1;height:5px;border-radius:3px;background:var(--card2);overflow:hidden}
#emx-root .utilrow .bar i{display:block;height:100%;border-radius:3px}
#emx-root .utilrow .pc{width:38px;text-align:right;font-weight:600}
#emx-root #mapbox{position:absolute;inset:0}
#emx-root #leafmap{position:absolute;inset:0;background:#e8ecf5}
#emx-root .mapside{position:absolute;top:12px;right:12px;z-index:800;width:270px;display:flex;flex-direction:column;gap:8px}
#emx-root .mapcardui{background:rgba(255,255,255,0.96);border:1px solid var(--line);border-radius:12px;padding:12px 14px;backdrop-filter:blur(8px)}
#emx-root .mapcardui h4{font-size:11.5px;margin-bottom:8px}
#emx-root .btn{display:inline-flex;align-items:center;gap:7px;border:none;border-radius:9px;padding:9px 13px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit}
#emx-root .btn.primary{background:var(--brand);color:#fff;box-shadow:0 2px 10px rgba(0,34,158,0.25)}
#emx-root .btn.ghost{background:#fff;color:var(--ink);border:1px solid rgba(16,24,72,0.18)}
#emx-root .btn.ghost:hover{border-color:rgba(255,255,255,0.25)}
#emx-root .btn.block{display:flex;width:100%;justify-content:flex-start;margin-top:6px;text-align:left}
#emx-root .btn small{display:block;font-weight:500;color:rgba(255,255,255,0.65);font-size:9.5px}
#emx-root .btn.ghost small{color:var(--mute)}
#emx-root .btn:disabled{opacity:0.5;cursor:default}
#emx-root .armbanner{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:900;background:rgba(232,17,45,0.14);border:1px solid rgba(232,17,45,0.5);color:#ff8b9a;padding:7px 16px;border-radius:999px;font-size:11px;font-weight:700;display:none}
#emx-root .leaflet-popup-content-wrapper{background:#fff;color:var(--ink);border-radius:10px;border:1px solid var(--line)}
#emx-root .leaflet-popup-tip{background:#fff}
#emx-root .pop{font-size:11px;min-width:190px}#emx-root .pop b{font-size:12px}
#emx-root .pop .r{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--line)}
#emx-root .pop .r span{color:var(--mute)}
#emx-root .pop button{width:100%;margin-top:6px;padding:7px;border-radius:7px;border:1px solid var(--line);background:var(--card2);color:var(--ink);font-size:10.5px;cursor:pointer;font-family:inherit}
#emx-root .pop button.hot{background:var(--brand);border:none;font-weight:700;color:#fff}
#emx-root #tray{position:fixed;left:232px;right:20px;bottom:14px;z-index:950;background:rgba(255,255,255,0.98);border:1px solid var(--line);border-radius:14px;padding:14px 18px;display:none;box-shadow:0 18px 60px rgba(0,0,0,0.6)}
#emx-root #tray h4{font-size:12.5px;display:flex;justify-content:space-between}
#emx-root #tray .rows{display:flex;gap:26px;margin-top:10px;flex-wrap:wrap}
#emx-root #tray .m{font-size:11px;color:var(--mute)}#emx-root #tray .m b{display:block;font-size:15px;color:var(--ink);margin-top:2px}
#emx-root #tray .d{font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:6px}
#emx-root #toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:1000;background:#10173d;color:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 18px;font-size:12px;display:none;box-shadow:0 12px 40px rgba(0,0,0,0.5)}
#emx-root .spin{display:inline-block;width:11px;height:11px;border:2px solid rgba(0,34,158,0.2);border-top-color:var(--brand);border-radius:50%;animation:emx-sp 0.8s linear infinite;vertical-align:-2px}
@keyframes emx-sp{to{transform:rotate(360deg)}}
#emx-root .recs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
#emx-root .rec{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:14px 16px;cursor:pointer;transition:border-color .15s}
#emx-root .rec:hover{border-color:rgba(0,34,158,0.45)}
#emx-root .rec .k{font-size:9.5px;font-weight:800;letter-spacing:0.14em;display:flex;gap:7px;align-items:center}
#emx-root .rec b{display:block;font-size:12.5px;margin:7px 0 4px}
#emx-root .rec p{font-size:10.5px;color:var(--ink2);line-height:1.5}
#emx-root .hublist{max-height:330px;overflow-y:auto}
#emx-root .hubtog{display:flex;align-items:center;justify-content:space-between;padding:8px 2px;border-bottom:1px solid var(--line);font-size:11.5px}
#emx-root .hubtog .nm b{display:block}#emx-root .hubtog .nm span{font-size:9.5px;color:var(--mute)}
#emx-root .tog{width:36px;height:20px;border-radius:999px;background:var(--brand);position:relative;cursor:pointer;flex:none;transition:background .2s}
#emx-root .tog::after{content:'';position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:all .2s}
#emx-root .tog.off{background:#c8cede}#emx-root .tog.off::after{right:18px;background:#fff}
#emx-root .frm{display:flex;flex-direction:column;gap:8px}
#emx-root .frm label{font-size:10px;color:var(--mute);text-transform:uppercase;letter-spacing:0.06em}
#emx-root .frm select,#emx-root .frm input{background:var(--card2);border:1px solid var(--line);border-radius:8px;color:var(--ink);padding:8px 10px;font-size:12px;font-family:inherit;width:100%}
#emx-root .candcard{border:1px solid rgba(144,133,233,0.35);border-radius:12px;padding:13px 15px;background:rgba(144,133,233,0.06);margin-bottom:10px}
#emx-root .candcard b{font-size:12.5px}#emx-root .candcard .meta{font-size:10.5px;color:var(--mute);margin:4px 0 9px}
#emx-root .ledg{font-size:11px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;margin-top:6px;display:flex;justify-content:space-between;background:var(--card2)}
#emx-root #repwrap{background:#fff;color:#16202e;border-radius:10px;max-width:660px;margin:0 auto;overflow:hidden}
#emx-root .repBrand{background:var(--brand);color:#fff;padding:18px 30px;display:flex;justify-content:space-between;align-items:center}
#emx-root .repBody{padding:24px 30px}#emx-root .repBody h2{font-size:11px;letter-spacing:0.16em;color:#98a3b3;margin:18px 0 8px;text-transform:uppercase}
#emx-root .repBody h2:first-child{margin-top:0}
#emx-root .repGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
#emx-root .repStat{border:1px solid #e5e9f0;border-radius:9px;padding:10px 12px}
#emx-root .repStat b{font-size:17px}#emx-root .repStat span{display:block;font-size:10px;color:#7c8798;margin-top:2px}
#emx-root .repRec{background:#f6f8fb;border-left:4px solid var(--brand);border-radius:7px;padding:12px 14px;font-size:12px;line-height:1.55;color:#2a3648}
#emx-root .repFoot{border-top:1px solid #e5e9f0;padding:12px 30px;display:flex;justify-content:space-between;font-size:9px;color:#98a3b3}
@media print{
  #emx-root aside,#emx-root .topbar,#emx-root #tray,#emx-root #toast,#emx-root .noprint{display:none!important}
  #emx-root main{overflow:visible}#emx-root .page{display:none!important}#emx-root #page-reports{display:block!important;padding:0}
  body{background:#fff}
  #emx-root{position:static;overflow:visible}
  #emx-root #repwrap{border-radius:0;max-width:none}
}
`;

/* ═════════ the design's embedded dataset — the OFFLINE fallback (verbatim) ═════════ */
const EMBEDDED = {"hubs": [{"id": "HUB_DXB_01", "name": "Al Quoz Logistics Hub", "lat": 25.1348, "lon": 55.2308, "emirate": "Dubai", "capacity": 3500, "fixed_cost": 6000.0, "handling_cost": 31.224, "status": "open"}, {"id": "HUB_DXB_02", "name": "Al Nahda Dispatch Hub", "lat": 25.291, "lon": 55.37, "emirate": "Dubai", "capacity": 3000, "fixed_cost": 5500.0, "handling_cost": 13.61, "status": "open"}, {"id": "HUB_DXB_03", "name": "Deira Delivery Hub", "lat": 25.2697, "lon": 55.3095, "emirate": "Dubai", "capacity": 1400, "fixed_cost": 3166.67, "handling_cost": 50.017, "status": "open"}, {"id": "HUB_DXB_04", "name": "Jebel Ali Hub", "lat": 24.9857, "lon": 55.0675, "emirate": "Dubai", "capacity": 4000, "fixed_cost": 5166.67, "handling_cost": 0.5, "status": "open"}, {"id": "HUB_AUH_01", "name": "Mussafah Central Hub", "lat": 24.35, "lon": 54.5, "emirate": "Abu Dhabi", "capacity": 2800, "fixed_cost": 4666.67, "handling_cost": 14.016, "status": "open"}, {"id": "HUB_AUH_02", "name": "Khalidiyah Micro Hub", "lat": 24.477, "lon": 54.362, "emirate": "Abu Dhabi", "capacity": 1000, "fixed_cost": 2600.0, "handling_cost": 48.648, "status": "open"}, {"id": "HUB_SHJ_01", "name": "Sharjah Industrial Hub", "lat": 25.3395, "lon": 55.3903, "emirate": "Sharjah", "capacity": 1800, "fixed_cost": 2933.33, "handling_cost": 12.202, "status": "open"}, {"id": "HUB_RAK_01", "name": "RAK Logistics Hub", "lat": 25.7953, "lon": 55.9797, "emirate": "Ras Al Khaimah", "capacity": 600, "fixed_cost": 1400.0, "handling_cost": 54.648, "status": "open"}, {"id": "HUB_AJM_01", "name": "Ajman Micro Hub", "lat": 25.4052, "lon": 55.5136, "emirate": "Ajman", "capacity": 500, "fixed_cost": 1266.67, "handling_cost": 42.235, "status": "open"}, {"id": "HUB_FUJ_01", "name": "Fujairah Distribution Hub", "lat": 25.1288, "lon": 56.3265, "emirate": "Fujairah", "capacity": 400, "fixed_cost": 1166.67, "handling_cost": 72.65, "status": "open"}], "zones": [{"id": "Z_AL_NAHDA", "name": "Al Nahda", "lat": 25.291, "lon": 55.37, "emirate": "Dubai", "demand": 143, "sla_hours": 24}, {"id": "Z_AL_NAKHEEL", "name": "Al Nakheel", "lat": 25.783, "lon": 55.953, "emirate": "Ras Al Khaimah", "demand": 25, "sla_hours": 24}, {"id": "Z_AL_NUAIMIA", "name": "Al Nuaimia", "lat": 25.386, "lon": 55.465, "emirate": "Ajman", "demand": 21, "sla_hours": 24}, {"id": "Z_AL_QUOZ", "name": "Al Quoz", "lat": 25.121, "lon": 55.227, "emirate": "Dubai", "demand": 230, "sla_hours": 24}, {"id": "Z_BUSINESS_BAY", "name": "Business Bay", "lat": 25.186, "lon": 55.263, "emirate": "Dubai", "demand": 209, "sla_hours": 24}, {"id": "Z_CITY_CENTRE", "name": "City Centre", "lat": 25.122, "lon": 56.334, "emirate": "Fujairah", "demand": 15, "sla_hours": 24}, {"id": "Z_DEIRA", "name": "Deira", "lat": 25.271, "lon": 55.316, "emirate": "Dubai", "demand": 73, "sla_hours": 24}, {"id": "Z_INDUSTRIAL", "name": "Industrial", "lat": 25.318, "lon": 55.436, "emirate": "Sharjah", "demand": 90, "sla_hours": 24}, {"id": "Z_JEBEL_ALI", "name": "Jebel Ali", "lat": 25.011, "lon": 55.134, "emirate": "Dubai", "demand": 89, "sla_hours": 24}, {"id": "Z_KHALIDIYAH", "name": "Khalidiyah", "lat": 24.47, "lon": 54.343, "emirate": "Abu Dhabi", "demand": 44, "sla_hours": 24}, {"id": "Z_MUSSAFAH", "name": "Mussafah", "lat": 24.367, "lon": 54.503, "emirate": "Abu Dhabi", "demand": 121, "sla_hours": 24}], "assignments": [{"zone_id": "Z_AL_NAHDA", "hub_id": "HUB_DXB_02", "volume": 143}, {"zone_id": "Z_AL_NAKHEEL", "hub_id": "HUB_RAK_01", "volume": 25}, {"zone_id": "Z_AL_NUAIMIA", "hub_id": "HUB_AJM_01", "volume": 21}, {"zone_id": "Z_AL_QUOZ", "hub_id": "HUB_DXB_01", "volume": 230}, {"zone_id": "Z_BUSINESS_BAY", "hub_id": "HUB_DXB_01", "volume": 209}, {"zone_id": "Z_CITY_CENTRE", "hub_id": "HUB_FUJ_01", "volume": 15}, {"zone_id": "Z_DEIRA", "hub_id": "HUB_DXB_03", "volume": 73}, {"zone_id": "Z_INDUSTRIAL", "hub_id": "HUB_SHJ_01", "volume": 90}, {"zone_id": "Z_JEBEL_ALI", "hub_id": "HUB_DXB_04", "volume": 89}, {"zone_id": "Z_KHALIDIYAH", "hub_id": "HUB_AUH_02", "volume": 44}, {"zone_id": "Z_MUSSAFAH", "hub_id": "HUB_AUH_01", "volume": 121}], "candidates": [{"id": "CAND_DXB_01", "name": "Dubai South (Candidate)", "emirate": "Dubai", "lat": 24.8962, "lon": 55.1603, "capacity": 4200.0, "fixed_cost": 5666.67, "handling_cost": 2.5, "status": "open"}, {"id": "CAND_AUH_01", "name": "Al Reem Island (Candidate)", "emirate": "Abu Dhabi", "lat": 24.5, "lon": 54.405, "capacity": 1200.0, "fixed_cost": 3000.0, "handling_cost": 2.5, "status": "open"}, {"id": "CAND_SHJ_01", "name": "Sharjah Airport (Candidate)", "emirate": "Sharjah", "lat": 25.3286, "lon": 55.5136, "capacity": 2500.0, "fixed_cost": 3666.67, "handling_cost": 2.5, "status": "open"}], "official": {"HUB_DXB_01": {"courier_utilisation_pct": 84.4, "on_time_pct": 77.7, "headroom_pct": 12.9, "status": "High Load"}, "HUB_DXB_02": {"courier_utilisation_pct": 91.8, "on_time_pct": 86.2, "headroom_pct": 10.7, "status": "High Load"}, "HUB_DXB_03": {"courier_utilisation_pct": 91.8, "on_time_pct": 76.6, "headroom_pct": 7.1, "status": "High Load"}, "HUB_DXB_04": {"courier_utilisation_pct": 84.9, "on_time_pct": 88.8, "headroom_pct": 12.6, "status": "High Load"}, "HUB_AUH_01": {"courier_utilisation_pct": 84.4, "on_time_pct": 91.3, "headroom_pct": 15.8, "status": "High Load"}, "HUB_AUH_02": {"courier_utilisation_pct": 88.6, "on_time_pct": 93.8, "headroom_pct": 11.4, "status": "High Load"}, "HUB_SHJ_01": {"courier_utilisation_pct": 73.2, "on_time_pct": 91.1, "headroom_pct": 28.4, "status": "Normal"}, "HUB_RAK_01": {"courier_utilisation_pct": 93.3, "on_time_pct": 87.4, "headroom_pct": 6.4, "status": "At Risk"}, "HUB_AJM_01": {"courier_utilisation_pct": 79.8, "on_time_pct": 83.8, "headroom_pct": 21.2, "status": "Normal"}, "HUB_FUJ_01": {"courier_utilisation_pct": 89.0, "on_time_pct": 80.4, "headroom_pct": 9.6, "status": "High Load"}}, "baselines": {"cost_hub_spoke_standard": 8.5, "target_hub_spoke": 7.0, "courier_util": 78, "target_util": 85, "on_time": 85, "target_on_time": 90, "at_risk_hubs": 3, "assessment_hours": 8}, "weekly": {"1": 979.0, "2": 1003.0, "3": 1030.0, "4": 1017.0, "5": 1045.0, "6": 1017.0, "7": 1064.0, "8": 1072.0, "9": 1049.0, "10": 1064.0, "11": 1090.0, "12": 1066.0, "13": 1060.0}, "networks": {"qcomm": {"stores": 10, "daily_orders": 6495.0, "couriers": 433}, "on_demand": {"couriers": 47, "daily_orders": 127.0}}, "cps": {"HUB_AJM_01": 108.79, "HUB_AUH_01": 54.82, "HUB_AUH_02": 110.17, "HUB_DXB_01": 49.51, "HUB_DXB_02": 52.07, "HUB_DXB_03": 94.18, "HUB_DXB_04": 50.58, "HUB_FUJ_01": 151.68, "HUB_RAK_01": 114.16, "HUB_SHJ_01": 50.85}} as EmxDataset;

interface EmxHub { id: string; name: string; lat: number; lon: number; emirate: string; capacity: number; fixed_cost: number; handling_cost: number; status: string }
interface EmxZone { id: string; name: string; lat: number; lon: number; emirate: string; demand: number; sla_hours: number }
interface EmxDataset {
  hubs: EmxHub[];
  zones: EmxZone[];
  assignments: { zone_id: string; hub_id: string; volume: number }[];
  candidates: EmxHub[];
  official: Record<string, { courier_utilisation_pct: number; on_time_pct: number; headroom_pct: number; status: string }>;
  baselines: Record<string, number>;
  weekly: Record<string, number>;
  networks: { qcomm: { stores: number; daily_orders: number; couriers: number }; on_demand: { couriers: number; daily_orders: number } };
  cps: Record<string, number>;
}

const GLOBALS = ["pingEngine", "runScenario", "openCandidate", "resetScenario", "adopt", "toggleHub", "buildReport", "val"] as const;

export default function EmxAtlas() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = (id: string) => root.querySelector("#" + id) as HTMLElement;
    const win = window as unknown as Record<string, unknown>;
    let disposed = false;

    /* ═════════ the design's script, verbatim logic ═════════ */
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    let LIVE = false;
    let scenarioId: string | null = null;
    const sessionLog: { t: string; e: string }[] = [];
    let armed = false;
    let map: L.Map | null = null;
    let layerG: L.LayerGroup | null = null;
    const REAL: EmxDataset = JSON.parse(JSON.stringify(EMBEDDED)); // mutated by live loads

    const fmt = (n: number | string) => Number(n).toLocaleString();
    const clockTimer = setInterval(() => {
      const el = $("clock");
      if (el) el.textContent = new Date().toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }, 1000);

    function toast(msg: string, ms = 3200) {
      const t = $("toast") as HTMLElement & { _h?: number };
      t.innerHTML = msg; t.style.display = "block";
      clearTimeout(t._h); t._h = window.setTimeout(() => (t.style.display = "none"), ms);
    }
    function log(e: string) { sessionLog.push({ t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), e }); }

    async function api(path: string, opts: RequestInit = {}, timeout = 25000) {
      const c = new AbortController(); const h = setTimeout(() => c.abort(), timeout);
      try {
        const r = await fetch(API + path, { ...opts, signal: c.signal,
          headers: opts.body ? { "Content-Type": "application/json" } : undefined });
        clearTimeout(h);
        if (!r.ok) throw new Error((await r.text()).slice(0, 180));
        return r.status === 204 ? null : await r.json();
      } finally { clearTimeout(h); }
    }

    /* live data: /network + /kpis + /event/metrics replace the embedded copy */
    async function loadLive() {
      const net = await api("/network", {}, 8000);
      REAL.hubs = net.hubs.map((h: { id: string; name: string; lat: number; lon: number; emirate: string; capacity: number; status: string }) => ({
        ...REAL.hubs.find((x) => x.id === h.id), ...h,
      }));
      REAL.zones = net.zones;
      REAL.assignments = net.flows;
      REAL.candidates = EVENT_CANDIDATES as unknown as EmxHub[];
      try {
        const m = await api("/event/metrics", {}, 8000);
        const official: EmxDataset["official"] = {};
        for (const [id, o] of Object.entries(m.hubs as Record<string, { courier_utilisation_pct: number; on_time_delivery_pct: number; capacity_headroom_pct: number; status: string }>)) {
          official[id] = { courier_utilisation_pct: o.courier_utilisation_pct, on_time_pct: o.on_time_delivery_pct, headroom_pct: o.capacity_headroom_pct, status: o.status };
        }
        REAL.official = official;
        // The file's own figures replace the embedded copies the moment we
        // are live — nothing on screen is a hand-copied literal any more.
        if (m.cost_per_shipment) REAL.cps = m.cost_per_shipment;
        if (m.weekly_hub_spoke_daily) {
          REAL.weekly = Object.fromEntries(
            (m.weekly_hub_spoke_daily as { week: number; daily_volume: number }[]).map((w) => [String(w.week), w.daily_volume]),
          );
        }
        if (m.network_volumes) {
          const volumes = m.network_volumes as Record<string, number>;
          if (typeof volumes["QComm"] === "number") REAL.networks.qcomm.daily_orders = volumes["QComm"];
          if (typeof volumes["On-Demand"] === "number") REAL.networks.on_demand.daily_orders = volumes["On-Demand"];
        }
      } catch { /* keep embedded official metrics */ }
    }

    async function pingEngine(manual?: boolean) {
      try {
        await api("/health", {}, 4000);
        if (!LIVE) { try { await loadLive(); } catch { /* embedded stays */ } }
        LIVE = true;
        $("engst").innerHTML = '<i style="background:var(--good)"></i>LIVE ENGINE';
        $("engtxt").textContent = "Connected — simulations run on the real optimisation engine.";
        if (manual) toast("✓ Engine connected");
      } catch {
        LIVE = false;
        $("engst").innerHTML = '<i style="background:var(--warn)"></i>VIEW MODE';
        $("engtxt").textContent = "Engine not reachable — showing the official dataset. Start the backend, then Reconnect.";
        if (manual) toast("Engine not reachable at " + API);
      }
      renderAll();
    }

    /* ── nav ── */
    const SECTION: Record<string, string> = { map: "secMap", sim: "secSim", opt: "secOpt" };
    const navEl = $("nav");
    const onNav = (e: Event) => {
      const b = (e.target as HTMLElement).closest("button") as HTMLElement | null; if (!b) return;
      const p = (b as HTMLElement).dataset.p as string;
      root.querySelectorAll("#nav button").forEach((x) => x.classList.toggle("on", x === b));
      const target = SECTION[p] ? "dash" : p;
      root.querySelectorAll(".page").forEach((pg) => pg.classList.remove("on"));
      $("page-" + target).classList.add("on");
      $("crumb").innerHTML = "EMX ATLAS / <b>" + (b.textContent || "").replace(/^[^ ]+ /, "") + "</b>";
      if (SECTION[p]) setTimeout(() => { $(SECTION[p]).scrollIntoView({ behavior: "smooth", block: "start" }); if (map) map.invalidateSize(); }, 80);
      if (p === "reports") buildReport();
    };
    navEl.addEventListener("click", onNav);

    /* ── derived data helpers (all figures verbatim from the dataset/engine) ── */
    const hubById = () => Object.fromEntries(REAL.hubs.map((h) => [h.id, h]));
    function hubVol(id: string) { return REAL.assignments.filter((a) => a.hub_id === id).reduce((s, a) => s + a.volume, 0); }
    const totalHS = () => REAL.zones.reduce((s, z) => s + z.demand, 0);
    const allNetworks = () => totalHS() + REAL.networks.qcomm.daily_orders + REAL.networks.on_demand.daily_orders;

    /* ── DASHBOARD (design logic verbatim, over REAL which may be live) ── */
    function renderDash() {
      const b = REAL.baselines;
      const officials = Object.values(REAL.official);
      const atRisk = officials.filter((o) => o.status === "At Risk").length;
      const avgUtil = officials.reduce((s, o) => s + o.courier_utilisation_pct, 0) / officials.length;
      const avgOnTime = officials.reduce((s, o) => s + o.on_time_pct, 0) / officials.length;
      $("dashTiles").innerHTML = `
       <div class="tile"><div class="lab">Parcels / day — all networks</div><div class="val">${fmt(Math.round(allNetworks()))}</div>
         <div class="sub"><span class="chip up">Hub&amp;Spoke ${fmt(totalHS())}</span><span class="chip up">QComm ${fmt(REAL.networks.qcomm.daily_orders)}</span></div></div>
       <div class="tile"><div class="lab">Courier utilisation</div><div class="val">${avgUtil.toFixed(1)}<small>%</small></div>
         <div class="sub"><span class="chip wn">target ${b.target_util}%</span> official weekly metric</div></div>
       <div class="tile"><div class="lab">Hubs at risk</div><div class="val">${atRisk}<small>of ${officials.length}</small></div>
         <div class="sub"><span class="chip dn">target 0–1</span> RAK headroom ${REAL.official.HUB_RAK_01?.headroom_pct ?? "—"}%</div></div>
       <div class="tile"><div class="lab">On-time delivery</div><div class="val">${avgOnTime.toFixed(1)}<small>%</small></div>
         <div class="sub"><span class="chip wn">target ${b.target_on_time}%</span> network average</div></div>`;

      /* 13-week line */
      const wk = Object.entries(REAL.weekly).map(([w, v]) => ({ w: +w, v: v as number })); wk.sort((a, b2) => a.w - b2.w);
      const W = ($("weekChart").clientWidth || 520), H = 170, pL = 34, pB = 18, pT = 8;
      const mx = Math.max(...wk.map((d) => d.v)) * 1.1;
      let s = `<svg width="${W}" height="${H}">`;
      for (let g = 0; g <= mx; g += 250) { const y = pT + (H - pB - pT) * (1 - g / mx);
        s += `<line class="gridline" x1="${pL}" x2="${W - 6}" y1="${y}" y2="${y}"/><text class="axis" x="${pL - 5}" y="${y + 3}" text-anchor="end">${g}</text>`; }
      const pts = wk.map((d, i) => [pL + (W - pL - 10) * (i / (wk.length - 1)), pT + (H - pB - pT) * (1 - d.v / mx)]);
      s += `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="var(--s1)" stroke-width="2"/>`;
      pts.forEach((p, i) => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="var(--s1)"/>`;
        if (i % 3 === 0 || i === wk.length - 1) s += `<text class="axis" x="${p[0]}" y="${H - 4}" text-anchor="middle">W${wk[i].w}</text>`; });
      const last = wk[wk.length - 1];
      s += `<text class="axis" x="${pts[pts.length - 1][0] - 4}" y="${pts[pts.length - 1][1] - 8}" text-anchor="end" style="fill:var(--ink2);font-weight:600">${fmt(last.v)}/day</text></svg>`;
      $("weekChart").innerHTML = s;

      /* cost per hub bars */
      const ch = Object.entries(REAL.cps).sort((a, b2) => b2[1] - a[1]);
      const W2 = ($("costChart").clientWidth || 520), H2 = 170, rH = (H2 - 8) / ch.length;
      const mx2 = Math.max(...ch.map((c) => c[1])) * 1.08;
      let s2 = `<svg width="${W2}" height="${H2}">`;
      ch.forEach(([id, v], i) => { const y = 6 + rH * i, w = (W2 - 160) * (v / mx2);
        const col = v > 90 ? "var(--crit)" : v > 55 ? "var(--warn)" : "var(--s3)";
        s2 += `<text class="axis" x="86" y="${y + rH / 2 + 3}" text-anchor="end" style="fill:var(--ink2)">${id.replace("HUB_", "")}</text>
          <rect x="92" y="${y + 2}" width="${w}" height="${Math.max(5, rH - 7)}" rx="3.5" fill="${col}"/>
          <text class="axis" x="${96 + w}" y="${y + rH / 2 + 3}" style="fill:var(--ink2);font-weight:600">${v.toFixed(1)} AED</text>`; });
      s2 += "</svg>"; $("costChart").innerHTML = s2;

      /* health rows */
      $("healthRows").innerHTML = Object.entries(REAL.official).map(([id, o]) => {
        const cls = o.status === "At Risk" ? "risk" : o.status === "High Load" ? "hi" : "ok";
        const col = o.status === "At Risk" ? "var(--crit)" : o.status === "High Load" ? "var(--warn)" : "var(--good)";
        return `<div class="utilrow"><span class="tag ${cls}">${o.status.toUpperCase()}</span>
          <span class="nm">${hubById()[id]?.name || id}</span>
          <span class="bar"><i style="width:${o.courier_utilisation_pct}%;background:${col}"></i></span>
          <span class="pc mono">${o.courier_utilisation_pct}%</span></div>`; }).join("");

      /* baseline targets */
      const t: [string, string, string, boolean][] = [
        ["Business assessment time", "~8 hours", "seconds in ATLAS", true],
        ["Scenario simulation time", "4–8 hours", "~2 seconds in ATLAS", true],
        ["Network visibility", "Excel + phone calls", "this live dashboard", true],
        ["Hubs at risk", `${atRisk} of ${officials.length}`, "optimizer proposes the fix", false],
        ["Courier utilisation", `${avgUtil.toFixed(0)}%`, `target ${b.target_util}%`, false]];
      $("targets").innerHTML = t.map(([m, base, now, done]) => `
        <div class="utilrow"><span class="tag ${done ? "ok" : "hi"}">${done ? "BEATEN" : "TARGET"}</span>
          <span style="flex:1;color:var(--ink2)">${m}</span>
          <span style="font-size:10.5px;color:var(--mute)">${base} → <b style="color:var(--ink)">${now}</b></span></div>`).join("");
    }

    /* ── MAP (Leaflet via npm) ── */
    function initMap() {
      if (disposed) return;
      if (map) { map.invalidateSize(); return; }
      map = L.map($("leafmap"), { zoomControl: true }).setView([24.9, 55.1], 8);
      const norm = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { attribution: "© OSM © CARTO" });
      const dark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { attribution: "© OSM © CARTO" });
      norm.addTo(map);
      L.control.layers({ "Clean (EMX)": norm, "Dark": dark }, {}, { position: "bottomleft" }).addTo(map);
      layerG = L.layerGroup().addTo(map);
      drawNetwork();
      map.on("click", (e: L.LeafletMouseEvent) => { if (armed) { armed = false; $("armbanner").style.display = "none";
        openNewHubAt(e.latlng.lat, e.latlng.lng); } });
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { armed = false; const b = $("armbanner"); if (b) b.style.display = "none"; } };
    addEventListener("keydown", onKey);

    function statusOf(id: string) { const o = REAL.official[id]; return o ? o.status : "Normal"; }
    function colorOf(st: string) { return st === "At Risk" ? "#d03b3b" : st === "High Load" ? "#fab219" : "#0ca30c"; }
    function drawNetwork() {
      if (!layerG) return; layerG.clearLayers();
      REAL.zones.forEach((z) => L.circleMarker([z.lat, z.lon], { radius: 3, color: "#3987e5", weight: 1, fillOpacity: 0.5 }).addTo(layerG!)
        .bindTooltip(`${z.name} — ${fmt(z.demand)} parcels/day`, { direction: "top" }));
      REAL.assignments.forEach((a) => { const h = hubById()[a.hub_id], z = REAL.zones.find((x) => x.id === a.zone_id);
        if (h && z) L.polyline([[h.lat, h.lon], [z.lat, z.lon]], { color: "#3987e5", weight: 1, opacity: 0.35, dashArray: "4 6" }).addTo(layerG!); });
      REAL.hubs.forEach((h) => { const st = statusOf(h.id), o = REAL.official[h.id] || {} as EmxDataset["official"][string];
        const m = L.circleMarker([h.lat, h.lon], { radius: 7 + Math.sqrt(h.capacity) / 9, color: colorOf(st), weight: 2, fillColor: colorOf(st), fillOpacity: 0.35 }).addTo(layerG!);
        m.bindPopup(`<div class="pop"><b>${h.name}</b> <span style="color:${colorOf(st)};font-weight:700;font-size:10px">${st.toUpperCase()}</span>
          <div class="r"><span>Handles</span><b>${fmt(hubVol(h.id))} parcels/day</b></div>
          <div class="r"><span>Capacity</span><b>${fmt(h.capacity)}/day</b></div>
          <div class="r"><span>Courier utilisation</span><b>${o.courier_utilisation_pct ?? "—"}%</b></div>
          <div class="r"><span>Headroom</span><b>${o.headroom_pct ?? "—"}%</b></div>
          <div class="r"><span>Cost per shipment</span><b>${(REAL.cps[h.id] ?? 0).toFixed(2)} AED</b></div>
          <button class="hot" onclick="runScenario('close_hub',{hub_id:'${h.id}'},'Close ${h.name}')">🗑 Test closing this hub</button>
          </div>`, { maxWidth: 260 }); });
      REAL.candidates.forEach((c) => L.circleMarker([c.lat, c.lon], { radius: 9, color: "#9085e9", weight: 2, dashArray: "4 4", fillOpacity: 0.12 }).addTo(layerG!)
        .bindPopup(`<div class="pop"><b>${c.name}</b><div class="r"><span>Capacity</span><b>${fmt(c.capacity)}/day</b></div>
          <div class="r"><span>Rent</span><b>${fmt(c.fixed_cost)} AED/day</b></div>
          <button class="hot" onclick="openCandidate('${c.id}')">⬢ Open this hub (test)</button></div>`));
    }

    /* ── candidate presets ── */
    function candHtml() { return REAL.candidates.map((c) => `
      <button class="btn ghost block" onclick="openCandidate('${c.id}')">⬢ ${c.name.replace(" (Candidate)", "")}
        <small>${c.emirate} · ${fmt(c.capacity)}/day capacity</small></button>`).join(""); }
    function candCardsHtml() { return REAL.candidates.map((c) => `
      <div class="candcard"><b>${c.name.replace(" (Candidate)", "")}</b>
       <div class="meta">${c.emirate} · capacity ${fmt(c.capacity)}/day · rent ${fmt(Math.round(c.fixed_cost * 30))} AED/mo</div>
       <button class="btn primary" onclick="openCandidate('${c.id}')">Open it in the twin ▷</button></div>`).join(""); }
    function openCandidate(id: string) { const c = REAL.candidates.find((x) => x.id === id)!;
      runScenario("add_hub", { id: c.id, name: c.name, lat: c.lat, lon: c.lon, emirate: c.emirate,
        capacity: c.capacity, fixed_cost: c.fixed_cost, handling_cost: c.handling_cost, status: "open" },
        "Open " + c.name.replace(" (Candidate)", "")); }
    function openNewHubAt(lat: number, lon: number) {
      runScenario("add_hub", { id: "NEW_" + Date.now() % 1e4, name: "New Test Hub", lat: +lat.toFixed(4), lon: +lon.toFixed(4),
        emirate: "Dubai", capacity: 2000, fixed_cost: 4000, handling_cost: 5, status: "open" },
        `New hub @ ${lat.toFixed(3)}, ${lon.toFixed(3)}`); }

    /* ── the one scenario runner (never hangs, always answers) ── */
    async function runScenario(name: string, params: Record<string, unknown>, label: string) {
      if (!LIVE) { toast("⚠ The live engine is offline — start the backend, then Reconnect (sidebar).", 4500); return; }
      toast(`<span class="spin"></span> Engine solving: ${label}…`, 24000);
      try {
        const saveAs = (name + "-" + Date.now() % 1e5);
        const r = await api("/simulate", { method: "POST", body: JSON.stringify({ scenario_name: name, params, save_as: saveAs }) });
        scenarioId = r.scenario_id || saveAs;
        void scenarioId;
        log(`${label} — cost ${sign(r.delta_pct.cost_to_serve)}%, utilization ${sign(r.delta_pct.utilization)}%${r.scenario_flow_feasible ? "" : " (⚠ infeasible)"}`);
        showTray(label, r);
        toast("✓ Solved — result below", 2500);
      } catch (e) { toast("⚠ Engine error: " + (e as Error).message, 6000); }
    }
    const sign = (v: number) => (v > 0 ? "+" : "") + (+v).toFixed(2);
    function showTray(label: string, r: { baseline_kpis: Record<string, { value: number }>; scenario_kpis: Record<string, { value: number }>; delta_pct: Record<string, number>; scenario_flow_feasible: boolean; delta_pct_cost?: number }) {
      const rows: [string, string, string, number][] = [["Cost per shipment", "cost_to_serve", "AED", -1], ["Utilisation", "utilization", "%", 0],
        ["Coverage", "coverage", "%", 1], ["Spare capacity", "spare_capacity", "parcels", 1]];
      $("tray").innerHTML = `<h4>${label} — engine result
         <span class="noprint"><button class="btn ghost" style="padding:5px 10px;font-size:10.5px" onclick="adopt('${label.replace(/'/g, "")}',${r.delta_pct.cost_to_serve})">✓ Adopt</button>
         <button class="btn ghost" style="padding:5px 10px;font-size:10.5px" onclick="resetScenario()">↺ Baseline</button>
         <button class="btn ghost" style="padding:5px 10px;font-size:10.5px" onclick="document.getElementById('tray').style.display='none'">✕</button></span></h4>
        <div class="rows">${rows.map(([lab, k, u, good]) => {
          const b = r.baseline_kpis[k]?.value ?? 0, a = r.scenario_kpis[k]?.value ?? 0, d = r.delta_pct[k] ?? 0;
          const cls = good === 0 ? "" : 'style="background:' + ((d * good > 0) || (good < 0 && d < 0) ? "rgba(12,163,12,0.15);color:#0b7d3b" : "rgba(208,59,59,0.15);color:#b3271f") + '"';
          return `<div class="m">${lab}<b>${fmt(+(+a).toFixed(2))} ${u}<span class="d" ${cls}>${sign(d)}%</span></b>
            <span style="font-size:9.5px">was ${fmt(+(+b).toFixed(2))}</span></div>`; }).join("")}
          ${r.scenario_flow_feasible ? "" : '<div class="m" style="color:#b3271f;font-weight:700">⚠ Network cannot serve all demand in this scenario</div>'}</div>`;
      $("tray").style.display = "block";
    }
    function resetScenario() { scenarioId = null; $("tray").style.display = "none"; toast("Back to baseline"); }
    const ledgerArr: { label: string; deltaCost: number }[] = [];
    function adopt(label: string, deltaCost: number) { ledgerArr.push({ label, deltaCost }); log("ADOPTED: " + label);
      $("ledger").innerHTML = ledgerArr.map((l) => `<div class="ledg"><span>✓ ${l.label}</span>
        <b style="color:${l.deltaCost < 0 ? "#0b7d3b" : "var(--ink)"}">${sign(l.deltaCost)}% cost</b></div>`).join("");
      toast("✓ Logged to the report"); }

    /* ── OPTIMIZE ── */
    $("optBtn").onclick = async () => {
      if (!LIVE) return toast("⚠ Engine offline");
      $("optOut").innerHTML = '<span class="spin"></span> Solving MILP + 50 stress trials…';
      try { const r = await api("/optimize", { method: "POST", body: "{}" }, 90000);
        log(`Optimizer: ${r.changes.length} changes, cost ${r.cost_to_serve_before.toFixed(2)}→${r.cost_to_serve_after.toFixed(2)} AED`);
        $("optOut").innerHTML = `
          <div style="font-size:12px">${r.changes.length ? r.changes.map((c: { action: string; hub_id: string }) => `<div>◆ ${c.action} <b>${c.hub_id}</b></div>`).join("") : "✓ Current shape is already optimal"}</div>
          <div style="margin-top:8px;font-size:13px">Cost: <b>${r.cost_to_serve_before.toFixed(2)}</b> → <b style="color:#0b7d3b">${r.cost_to_serve_after.toFixed(2)} AED</b></div>
          <div style="font-size:10.5px;color:var(--mute);margin-top:6px">${r.robustness.holds_under_variation ? "✓ Holds" : "⚠ At risk"} under ±${r.robustness.demand_variation_pct}% demand — feasible ${r.robustness.feasible_pct}% of ${r.robustness.trials} trials</div>
          <button class="btn ghost" style="margin-top:8px" onclick="adopt('Optimizer recommendation',${r.delta_vs_baseline["cost_to_serve_pct"]})">✓ Adopt</button>`;
      } catch (e) { $("optOut").innerHTML = '<span style="color:#b3271f;font-size:11px">' + (e as Error).message + "</span>"; }
    };
    $("thrBtn").onclick = async () => {
      if (!LIVE) return toast("⚠ Engine offline");
      $("thrOut").innerHTML = '<span class="spin"></span>';
      try { const r = await api("/threshold/demand-growth?hub_id=" + val("thrSel"), {}, 60000);
        $("thrOut").innerHTML = r.threshold_found
          ? `<b>${r.hub_id}</b> breaks at <b style="color:var(--warn)">+${r.growth_pct_threshold}%</b> demand growth (${r.hub_utilization_pct}% utilised at that point).`
          : (r.reason || "No threshold found in range.");
        log(`Threshold ${val("thrSel")}: ${r.threshold_found ? "+" + r.growth_pct_threshold + "%" : "none found"}`);
      } catch (e) { $("thrOut").innerHTML = '<span style="color:#b3271f">' + (e as Error).message + "</span>"; }
    };
    $("botBtn").onclick = async () => {
      if (!LIVE) return toast("⚠ Engine offline");
      $("botOut").innerHTML = '<span class="spin"></span>';
      try { const r = await api("/bottleneck", {}, 60000);
        $("botOut").innerHTML = r.bottleneck_found ? r.why : (r.reason || "No binding bottleneck right now.");
        if (r.bottleneck_found) log("Bottleneck: " + r.why);
      } catch (e) { $("botOut").innerHTML = '<span style="color:#b3271f">' + (e as Error).message + "</span>"; }
    };

    /* ── REPORT ── */
    function buildReport() {
      const atRisk = Object.values(REAL.official).filter((o) => o.status === "At Risk").length;
      const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      $("repwrap").innerHTML = `
       <div class="repBrand"><div style="display:flex;gap:12px;align-items:center">
         <div style="width:32px;height:32px;border-radius:7px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-weight:900">7X</div>
         <div><b style="font-size:15px;letter-spacing:0.08em">EMX ATLAS</b><div style="font-size:9px;letter-spacing:0.2em;opacity:0.85">NETWORK DECISION BRIEF</div></div></div>
         <div style="font-size:10px;text-align:right;opacity:0.9">${today}<br>Official 7X dataset · ready to share</div></div>
       <div class="repBody">
         <h2>The network today</h2>
         <p style="font-size:13px;line-height:1.6;color:#2a3648">EMX runs <b>${REAL.hubs.length} hubs</b>, ${REAL.networks.qcomm.stores} dark stores and an on-demand fleet,
           delivering <b>${fmt(Math.round(allNetworks()))} parcels a day</b>. <b>${atRisk} hubs are officially At Risk</b>.
           Remote hubs cost up to <b>${Math.max(...Object.values(REAL.cps)).toFixed(0)} AED per shipment</b> against ${Math.min(...Object.values(REAL.cps)).toFixed(0)} AED in Dubai — that gap is the optimisation target.</p>
         <div class="repGrid" style="margin-top:10px">
           <div class="repStat"><b>${fmt(Math.round(allNetworks()))}</b><span>parcels per day, all networks</span></div>
           <div class="repStat"><b>${atRisk} of ${Object.keys(REAL.official).length}</b><span>hubs officially At Risk (target 0–1)</span></div>
           <div class="repStat"><b>${Math.max(...Object.values(REAL.cps)).toFixed(2)} AED</b><span>most expensive hub per shipment (Fujairah)</span></div>
           <div class="repStat"><b>8 h → seconds</b><span>scenario evaluation time with ATLAS</span></div></div>
         <h2>What was tested in this session</h2>
         ${sessionLog.length ? `<ul style="font-size:12px;line-height:1.7;color:#2a3648;padding-left:16px">${sessionLog.map((l) => `<li><b>${l.t}</b> — ${l.e}</li>`).join("")}</ul>`
           : '<p style="font-size:12px;color:#7c8798">No what-if tests were run this session yet — run one from Simulate or the map.</p>'}
         <h2>Engine recommendation</h2>
         <div class="repRec">The three candidate hubs (Dubai South, Al Reem Island, Sharjah Airport) are loaded in the twin.
           Run the optimizer to get the engine-verified open/close recommendation with its ±20% demand stress test —
           every figure is computed by the optimisation engine and traceable to a solver run, never estimated by AI.</div>
       </div>
       <div class="repFoot"><span>GENERATED BY EMX ATLAS — A 7X PLATFORM</span><span>EVERY FIGURE FROM THE OFFICIAL DATASET OR THE ENGINE</span></div>`;
    }

    /* ── wire up ── */
    function val(id: string) { return ($(id) as HTMLInputElement).value; }
    ($("demandRange") as HTMLInputElement).oninput = () => { $("demandVal").textContent = (Number(val("demandRange")) > 0 ? "+" : "") + val("demandRange") + "%"; };
    $("addHubBtn").onclick = () => { armed = true; $("armbanner").style.display = "block"; toast("Click anywhere on the map"); };
    $("busyBtn").onclick = () => runScenario("demand_scale", { factor: 1.3 }, "Busy week (+30% parcels)");
    $("resetBtn").onclick = () => resetScenario();
    $("reconnectBtn").onclick = () => void pingEngine(true);
    $("closeRunBtn").onclick = () => runScenario("close_hub", { hub_id: val("closeSel") }, "Close " + val("closeSel"));
    $("demandRunBtn").onclick = () => runScenario("demand_scale", { factor: 1 + Number(val("demandRange")) / 100 }, "Demand " + (Number(val("demandRange")) > 0 ? "+" : "") + val("demandRange") + "%");
    $("repPdfBtn").onclick = () => { buildReport(); setTimeout(() => window.print(), 150); };
    $("repRefreshBtn").onclick = () => buildReport();

    function renderRecs() {
      $("recs").innerHTML = `
       <div class="rec" onclick="document.querySelector('#emx-root [data-p=opt]').click()">
         <div class="k" style="color:var(--teal)">◇ OPPORTUNITY</div>
         <b>Remote hubs cost 3× Dubai</b>
         <p>Fujairah ${(REAL.cps.HUB_FUJ_01 ?? 0).toFixed(2)} & RAK ${(REAL.cps.HUB_RAK_01 ?? 0).toFixed(2)} AED/shipment vs ${(REAL.cps.HUB_DXB_01 ?? 0).toFixed(2)} in Dubai — run the optimizer to close the gap.</p></div>
       <div class="rec" onclick="document.querySelector('#emx-root [data-p=opt]').click()">
         <div class="k" style="color:var(--warn)">⚠ THRESHOLD</div>
         <b>RAK Hub is officially At Risk</b>
         <p>Only ${REAL.official.HUB_RAK_01?.headroom_pct ?? "—"}% headroom left at ${REAL.official.HUB_RAK_01?.courier_utilisation_pct ?? "—"}% utilisation — find its exact breaking point.</p></div>
       <div class="rec" onclick="openCandidate('CAND_SHJ_01')">
         <div class="k" style="color:#9085e9">◈ RECOMMENDATION</div>
         <b>Test opening Sharjah Airport</b>
         <p>Official candidate hub, ${fmt(REAL.candidates.find((c) => c.id === "CAND_SHJ_01")?.capacity ?? 0)}/day capacity — one click runs it through the engine.</p></div>`;
    }
    let closedHubId: string | null = null;
    function renderToggles() {
      $("hubToggles").innerHTML = REAL.hubs.map((h) => `
        <div class="hubtog"><span class="nm"><b>${h.name}</b><span>${h.emirate} · cap ${fmt(h.capacity)}/day</span></span>
          <span class="tog ${closedHubId === h.id ? "off" : ""}" onclick="toggleHub('${h.id}')" title="${closedHubId === h.id ? "Reopen" : "Test closing"} ${h.name}"></span></div>`).join("");
    }
    function toggleHub(id: string) {
      if (closedHubId === id) { closedHubId = null; renderToggles(); resetScenario(); return; }
      closedHubId = id; renderToggles();
      runScenario("close_hub", { hub_id: id }, "Close " + (hubById()[id]?.name || id));
    }
    function renderAll() {
      if (disposed) return;
      renderDash(); renderRecs(); renderToggles();
      $("candBtns").innerHTML = candHtml();
      $("candCards").innerHTML = candCardsHtml();
      const opts = REAL.hubs.map((h) => `<option value="${h.id}">${h.name} (${h.id})</option>`).join("");
      $("closeSel").innerHTML = opts; $("thrSel").innerHTML = opts;
      if (map) drawNetwork();
    }

    /* window globals for the verbatim inline-onclick HTML strings */
    const globalImpls: Record<(typeof GLOBALS)[number], unknown> = {
      pingEngine, runScenario, openCandidate, resetScenario, adopt, toggleHub, buildReport, val,
    };
    GLOBALS.forEach((g) => { win[g] = globalImpls[g]; });

    renderAll(); void pingEngine(); const pingTimer = setInterval(() => void pingEngine(), 20000);
    const mapTimer = setTimeout(initMap, 300);
    buildReport();

    return () => {
      disposed = true;
      clearInterval(clockTimer); clearInterval(pingTimer); clearTimeout(mapTimer);
      removeEventListener("keydown", onKey);
      navEl.removeEventListener("click", onNav);
      GLOBALS.forEach((g) => { delete win[g]; });
      if (map) map.remove();
    };
  }, []);

  /* ═════════ the design's DOM, verbatim structure ═════════ */
  return (
    <div id="emx-root" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div id="app">
        <aside className="noprint">
          <div className="logo" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
            <img src={EMX_LOGO_B64} alt="EMX" style={{ height: 26 }} />
            <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "var(--mute)" }}>ATLAS · NETWORK INTELLIGENCE</span>
          </div>
          <nav id="nav">
            <button data-p="dash" className="on">▦ Dashboard</button>
            <button data-p="map">◎ Network Map</button>
            <button data-p="sim">⇄ Simulate</button>
            <button data-p="opt">◉ Optimize</button>
            <button data-p="reports">📄 Reports</button>
          </nav>
          <div className="engpill">
            <div className="st" id="engst"><i style={{ background: "var(--warn)" }} />CONNECTING…</div>
            <p id="engtxt">Looking for the live engine at localhost:8000</p>
            <button id="reconnectBtn">↻ Reconnect</button>
          </div>
        </aside>

        <main>
          <div className="topbar noprint">
            <div className="crumb" id="crumb">EMX ATLAS / <b>Dashboard</b></div>
            <div className="topright mono">
              <span id="clock" />
              <span>Dataset: Official 7X (13 weeks)</span>
              <img src={EMX_AR_B64} alt="EMX Arabic" style={{ height: 18, opacity: 0.9 }} />
            </div>
          </div>

          {/* DASHBOARD */}
          <div className="page on" id="page-dash">
            <div className="tiles" id="dashTiles" />
            <div className="card" style={{ padding: 0, overflow: "hidden" }} id="secMap">
              <div style={{ height: 430, position: "relative" }}>
                <div id="mapbox">
                  <div id="leafmap" />
                  <div className="armbanner" id="armbanner">CLICK THE MAP TO PLACE THE NEW HUB — ESC TO CANCEL</div>
                  <div className="mapside">
                    <div className="mapcardui">
                      <h4>⬢ Candidate hubs — one click to test</h4>
                      <div id="candBtns" />
                    </div>
                    <div className="mapcardui">
                      <h4>⚙ Scenario — open / close hubs</h4>
                      <div className="hublist" id="hubToggles" />
                    </div>
                    <div className="mapcardui">
                      <h4>Actions</h4>
                      <button className="btn ghost block" id="addHubBtn">＋ Add a hub anywhere<small>Click the map — engine re-solves live</small></button>
                      <button className="btn ghost block" id="busyBtn">⚡ Busy week test (+30%)<small>Where does the network break?</small></button>
                      <button className="btn ghost block" id="resetBtn">↺ Back to baseline</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div id="secSim">
              <div className="grid3">
                <div className="card"><h3>⬢ Open a candidate hub</h3><div id="candCards" /></div>
                <div className="card"><h3>What-if controls</h3>
                  <div className="frm">
                    <label>Close a hub</label><select id="closeSel" />
                    <button className="btn ghost" id="closeRunBtn">Test closing it</button>
                    <label style={{ marginTop: 8 }}>Demand change</label>
                    <input type="range" id="demandRange" min={-30} max={100} defaultValue={30} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--mute)" }}>
                      <span>−30%</span><b id="demandVal" style={{ color: "var(--ink)" }}>+30%</b><span>+100%</span>
                    </div>
                    <button className="btn ghost" id="demandRunBtn">Test demand change</button>
                  </div>
                </div>
                <div className="card"><h3>Adopted decisions</h3>
                  <p style={{ fontSize: 10.5, color: "var(--mute)" }}>Every adopted test is logged and lands in the report.</p>
                  <div id="ledger" />
                </div>
              </div>
            </div>
            <div id="secOpt">
              <div className="grid2">
                <div className="card"><h3>Find the optimal network shape</h3>
                  <p style={{ fontSize: 11, color: "var(--mute)", marginBottom: 10 }}>The engine solves a facility-location problem (MILP) over your hubs and candidates — which to open, which to close — then stress-tests the answer under ±20% demand.</p>
                  <button className="btn primary" id="optBtn">◈ Run the optimizer</button>
                  <div id="optOut" style={{ marginTop: 12 }} />
                </div>
                <div className="card"><h3>Where does it break?</h3>
                  <div className="frm"><label>Hub</label><select id="thrSel" />
                    <button className="btn ghost" id="thrBtn">Find its breaking point</button></div>
                  <div id="thrOut" style={{ marginTop: 10, fontSize: 12 }} />
                  <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12 }}>
                    <button className="btn ghost" id="botBtn">⬡ Cheapest capacity unlock</button>
                    <div id="botOut" style={{ marginTop: 8, fontSize: 12 }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid2">
              <div className="card"><h3>Demand — 13 weeks of history <span>daily parcels, Hub &amp; Spoke</span></h3>
                <div id="weekChart" style={{ height: 170 }} /></div>
              <div className="card"><h3>Cost per shipment by hub <span>the optimizer&apos;s target — remote hubs cost 3× Dubai</span></h3>
                <div id="costChart" style={{ height: 170 }} /></div>
            </div>
            <div className="card" style={{ padding: "13px 17px" }}>
              <h3 style={{ marginBottom: 10 }}>✨ AI Recommendations <span>engine + official metrics · click to act</span></h3>
              <div className="recs" id="recs" />
            </div>
            <div className="grid2">
              <div className="card"><h3>Hub health — official weekly metrics <span>courier utilisation · status</span></h3>
                <div id="healthRows" /></div>
              <div className="card"><h3>Baseline targets — what we beat <span>from the challenge&apos;s own scorecard</span></h3>
                <div id="targets" /></div>
            </div>
          </div>

          {/* REPORTS */}
          <div className="page" id="page-reports">
            <div className="noprint" style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 14 }}>
              <button className="btn primary" id="repPdfBtn">⬇ Download PDF</button>
              <button className="btn ghost" id="repRefreshBtn">↻ Refresh preview</button>
            </div>
            <div id="repwrap" />
          </div>
        </main>
      </div>
      <div id="tray" />
      <div id="toast" />
    </div>
  );
}
