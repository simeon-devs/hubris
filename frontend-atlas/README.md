# EMX Atlas Pro

LOVABLE MASTER PROMPT — EMX ATLAS

Copy PART 1 into Lovable as your first prompt. Then use the PART 2 prompts one by one to refine. Give Lovable the two logo PNG files (blue English + blue Arabic) when it asks for assets, or upload them to the project.

═══════════════════════════════════════════════════════════════════ PART 1 — THE MASTER PROMPT (paste this whole block into Lovable) ═══════════════════════════════════════════════════════════════════

Build "EMX ATLAS" — an enterprise logistics network-intelligence platform for EMX (a UAE national delivery company, part of 7X Group). Multi-page app, React + Tailwind + shadcn/ui + react-router + react-leaflet + recharts.

BRAND (strict)

Primary: EMX blue #00229e (buttons, active nav, links, chart accent). Hover #1a3ad1.

Light theme: page background #f3f5fb, cards white with 1px border rgba(16,24,72,0.10), radius 13px, subtle shadow.

Text: #10173d primary, #4a5375 secondary, #8b93ad muted. Numbers in a monospace font, large.

Status colors (only for status, never decoration): green #0e9f4a (Normal), amber #e8960c (High Load), red #d2312e (At Risk).

I will upload the official EMX logo (English + Arabic). English logo top-left in sidebar; Arabic logo small in the top bar right. NO other logos, no emojis in headings.

Overall feel: calm, enterprise, government-grade. Like Linear/Stripe dashboards. Generous spacing. NO neon, NO glow.

LAYOUT

Left sidebar (216px, white): logo, then nav — Dashboard, Network Map, Simulate, Optimize, Reports. Bottom of sidebar: an "Engine status" pill (see API section). Top bar: breadcrumb left; right side: live clock, "Dataset: Official 7X (13 weeks)", Arabic logo.

PAGES

1. DASHBOARD (route /)

Row of 4 stat tiles (label uppercase 10px, huge mono number, small target chip): a) "Parcels / day — all networks": 7,682 with chips "Hub&Spoke 1,060" and "QComm 6,495" b) "Courier utilisation": 86.1% with amber chip "target 85%" c) "Hubs at risk": 1 of 10 with red chip "target 0–1" and note "RAK headroom 6.4%" d) "On-time delivery": 85.7% with amber chip "target 90%"

AI RECOMMENDATIONS strip: 3 clickable cards: · OPPORTUNITY (blue label): "Remote hubs cost 3× Dubai — Fujairah 151.68 & RAK 114.16 AED/shipment vs 49.51 in Dubai. Run the optimizer." → navigates to /optimize · THRESHOLD (amber): "RAK Hub is officially At Risk — 6.4% headroom at 93.3% utilisation. Find its breaking point." → /optimize · RECOMMENDATION (violet): "Test opening Sharjah Airport — official candidate, 2,500/day capacity." → /simulate

Two charts side by side (recharts): · Line chart "Demand — 13 weeks of history" from WEEKLY_DEMAND data, blue line, last point labeled "1,060/day". · Horizontal bar chart "Cost per shipment by hub" from COST_PER_HUB data, sorted descending, bars colored red if >90, amber if >55, green otherwise, value labels "xx.x AED".

Two panels side by side: · "Hub health — official weekly metrics": one row per hub — status badge (NORMAL/HIGH LOAD/AT RISK), hub name, utilisation progress bar in status color, percentage. · "Baseline targets — what we beat": rows with BEATEN (green) or TARGET (amber) badges: "Business assessment time: ~8 hours → seconds in ATLAS (BEATEN)", "Scenario simulation: 4–8 hours → ~2 seconds (BEATEN)", "Network visibility: Excel + phone calls → this live dashboard (BEATEN)", "Hubs at risk: 1 of 10 → optimizer proposes the fix (TARGET)", "Courier utilisation: 86% → target 85% (TARGET)".

2. NETWORK MAP (route /map)

Full-page react-leaflet map (CARTO light tiles https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png, dark option in a layer switcher), centered on UAE [24.9, 55.1] zoom 8.

One circle marker per hub from HUBS data: radius scaled by capacity, color by its status in OFFICIAL_METRICS (green/amber/red), popup showing: name, status badge, "Handles X parcels/day", "Capacity X/day", "Courier utilisation X%", "Headroom X%", "Cost per shipment X AED", and two buttons: "Test closing this hub" (calls close_hub scenario) and "Find breaking point" (navigates to /optimize with the hub preselected).

Small blue dots for each zone from ZONES data, tooltip "Name — X parcels/day".

Thin dashed blue lines from each hub to its assigned zones (ASSIGNMENTS data).

Dashed violet outline markers for the 3 CANDIDATES with popup "Open this hub (test)" button → runs add_hub scenario.

Right floating panel (white card): "Scenario — open/close hubs" list with a toggle per hub (toggling off runs close_hub scenario; only one closed at a time; toggling back restores baseline), and below it buttons: "＋ Add a hub anywhere" (arms click-to-place: next map click opens a small confirm card with name/capacity inputs then runs add_hub with those coords; Esc cancels, show an instruction banner while armed), "⚡ Busy week test (+30%)" (runs demand_scale factor 1.3), "↺ Back to baseline".

When any scenario returns: a bottom result tray (fixed, white, shadow) with 4 metrics — Cost per shipment, Utilisation, Coverage, Spare capacity — each showing new value, old value, and delta % as a colored pill (green good / red bad; for cost, negative delta is good). Plus buttons "✓ Adopt", "↺ Baseline", "✕". If the response says infeasible, show a red warning "Network cannot serve all demand in this scenario".

3. SIMULATE (route /simulate)

Three columns:

"Open a candidate hub": 3 cards from CANDIDATES (name, emirate, capacity/day, rent AED/mo) each with a blue "Open it in the twin ▷" button → add_hub scenario with that candidate's exact parameters; then show the same result tray.

"What-if controls": select "Close a hub" (all hubs) + button; "Demand change" slider −30%..+100% + button (demand_scale with factor 1+pct/100); both show the result tray.

"Adopted decisions": every time the user clicks Adopt anywhere, append a row "✓ {label} — {cost delta}% cost" here (green if negative). These rows also appear in the Report.

4. OPTIMIZE (route /optimize)

Two columns:

"Find the optimal network shape": explainer sentence ("The engine solves a facility-location problem (MILP) over hubs and candidates, then stress-tests the winner under ±20% demand across 50 trials."), blue "Run the optimizer" button → POST /optimize → show: list of changes ("◆ open CAND_DXB_01" etc. or "✓ Current shape is already optimal"), "Cost: 61.79 → 58.4 AED" with the after value green, robustness line "✓ Holds under ±20% demand — feasible 96% of 50 trials", and an Adopt button.

"Where does it break?": hub select + "Find its breaking point" → GET /threshold/demand-growth?hub_id=X → "HUB_X breaks at +N% demand growth (M% utilised at that point)". Below a divider: "Cheapest capacity unlock" button → GET /bottleneck → show its why text.

5. REPORTS (route /reports)

A4-style white report preview, EMX-blue header band with logo, titled "NETWORK DECISION BRIEF" + today's date + "Official 7X dataset · ready to share". Sections:

"The network today": paragraph + 4 stat boxes (parcels/day, hubs at risk, most expensive hub AED, "8 h → seconds").

"What was tested in this session": the adopted/tested actions with timestamps (from app state), or a placeholder line.

"Engine recommendation": highlighted box (blue left border) with the latest optimizer result if one was run, else a line inviting to run it.

Footer: "GENERATED BY EMX ATLAS — A 7X PLATFORM · EVERY FIGURE FROM THE OFFICIAL DATASET OR THE ENGINE". Buttons above: "⬇ Download PDF" (window.print with print CSS that shows only the report) and "↻ Refresh".

API CONTRACT (the real backend — FastAPI at a configurable base URL)

Store base URL in localStorage key ATLAS_API, default "http://localhost:8000". Settings gear in sidebar lets the user edit it.

GET /health → {status:"ok"} — poll every 20s. If ok: engine pill shows green "LIVE ENGINE". If failing: amber "VIEW MODE — showing official dataset" and ALL scenario/optimizer buttons show a toast "Engine offline — start the backend and Reconnect" instead of calling.

GET /network → {hubs:[{id,name,lat,lon,emirate,capacity,status,utilization_pct,spare_capacity,cost_to_serve,required_headcount}], zones:[{id,name,lat,lon,emirate,demand}], flows:[{hub_id,zone_id,volume}], distance_mode}

GET /kpis → {cost_to_serve:{value,unit,breakdown}, utilization:{value}, coverage:{value}, spare_capacity:{value}, network_summary:{...}}

POST /simulate body {scenario_name, params, save_as} where scenario_name ∈ close_hub|add_hub|demand_scale (params: close_hub {hub_id}; add_hub {id,name,lat,lon,emirate,capacity,fixed_cost,handling_cost,status:"open"}; demand_scale {factor}) → {baseline_kpis, scenario_kpis, delta:{}, delta_pct:{cost_to_serve,utilization,coverage,spare_capacity}, scenario_flow_feasible, scenario_id}

POST /optimize body {} → {changes:[{action,hub_id}], cost_to_serve_before, cost_to_serve_after, robustness:{demand_variation_pct,trials,feasible_pct,holds_under_variation}}

GET /threshold/demand-growth?hub_id=X → {threshold_found, growth_pct_threshold, hub_utilization_pct, reason}

GET /bottleneck → {bottleneck_found, why, reason} RULES: every displayed number comes from these responses or the embedded dataset VERBATIM — never compute derived figures client-side beyond formatting. Every request: 25s timeout, spinner on the button, errors shown as a toast in plain words. The app must NEVER freeze or show a blank area — if data is missing, show the embedded dataset and the amber pill.

EMBEDDED OFFICIAL DATASET (fallback + initial render — use exactly these values)

HUBS = [ {id:"HUB_DXB_01",name:"Al Quoz Logistics Hub",lat:25.1348,lon:55.2308,emirate:"Dubai",capacity:3500}, {id:"HUB_DXB_02",name:"Al Nahda Dispatch Hub",lat:25.291,lon:55.37,emirate:"Dubai",capacity:3000}, {id:"HUB_DXB_03",name:"Deira Delivery Hub",lat:25.2697,lon:55.3095,emirate:"Dubai",capacity:1400}, {id:"HUB_DXB_04",name:"Jebel Ali Hub",lat:25.0114,lon:55.1341,emirate:"Dubai",capacity:4000}, {id:"HUB_AUH_01",name:"Mussafah Central Hub",lat:24.3672,lon:54.5029,emirate:"Abu Dhabi",capacity:2800}, {id:"HUB_AUH_02",name:"Khalidiyah Micro Hub",lat:24.4702,lon:54.3433,emirate:"Abu Dhabi",capacity:1000}, {id:"HUB_SHJ_01",name:"Sharjah Industrial Hub",lat:25.3184,lon:55.4358,emirate:"Sharjah",capacity:1800}, {id:"HUB_RAK_01",name:"RAK Logistics Hub",lat:25.7833,lon:55.9532,emirate:"Ras Al Khaimah",capacity:600}, {id:"HUB_AJM_01",name:"Ajman Micro Hub",lat:25.3857,lon:55.4653,emirate:"Ajman",capacity:500}, {id:"HUB_FUJ_01",name:"Fujairah City Hub",lat:25.1223,lon:56.3342,emirate:"Fujairah",capacity:400}] CANDIDATES = [ {id:"CAND_DXB_01",name:"Dubai South",emirate:"Dubai",lat:24.886,lon:55.161,capacity:4200,fixed_cost:5666.67,handling_cost:2.5,rent_month:170000}, {id:"CAND_AUH_01",name:"Al Reem Island",emirate:"Abu Dhabi",lat:24.4964,lon:54.4090,capacity:1200,fixed_cost:3000,handling_cost:2.5,rent_month:90000}, {id:"CAND_SHJ_01",name:"Sharjah Airport",emirate:"Sharjah",lat:25.3286,lon:55.5172,capacity:2500,fixed_cost:3666.67,handling_cost:2.5,rent_month:110000}] ZONES = [ {id:"Z_AL_QUOZ",name:"Al Quoz",lat:25.121,lon:55.227,emirate:"Dubai",demand:439,hub:"HUB_DXB_01"}, {id:"Z_BUSINESS_BAY",name:"Business Bay",lat:25.186,lon:55.263,emirate:"Dubai",demand:0,hub:"HUB_DXB_01"}, {id:"Z_AL_NAHDA",name:"Al Nahda",lat:25.291,lon:55.37,emirate:"Dubai",demand:143,hub:"HUB_DXB_02"}, {id:"Z_DEIRA",name:"Deira",lat:25.271,lon:55.316,emirate:"Dubai",demand:73,hub:"HUB_DXB_03"}, {id:"Z_JEBEL_ALI",name:"Jebel Ali",lat:25.011,lon:55.134,emirate:"Dubai",demand:89,hub:"HUB_DXB_04"}, {id:"Z_MUSSAFAH",name:"Mussafah",lat:24.367,lon:54.503,emirate:"Abu Dhabi",demand:121,hub:"HUB_AUH_01"}, {id:"Z_KHALIDIYAH",name:"Khalidiyah",lat:24.470,lon:54.343,emirate:"Abu Dhabi",demand:44,hub:"HUB_AUH_02"}, {id:"Z_INDUSTRIAL",name:"Industrial",lat:25.318,lon:55.436,emirate:"Sharjah",demand:90,hub:"HUB_SHJ_01"}, {id:"Z_AL_NAKHEEL",name:"Al Nakheel",lat:25.783,lon:55.953,emirate:"Ras Al Khaimah",demand:25,hub:"HUB_RAK_01"}, {id:"Z_AL_NUAIMIA",name:"Al Nuaimia",lat:25.386,lon:55.465,emirate:"Ajman",demand:21,hub:"HUB_AJM_01"}, {id:"Z_CITY_CENTRE",name:"City Centre",lat:25.122,lon:56.334,emirate:"Fujairah",demand:15,hub:"HUB_FUJ_01"}] OFFICIAL_METRICS = {HUB_DXB_01:{util:84.4,on_time:77.7,headroom:12.9,status:"High Load"},HUB_DXB_02:{util:91.8,on_time:86.2,headroom:10.7,status:"High Load"},HUB_DXB_03:{util:91.8,on_time:76.6,headroom:7.1,status:"High Load"},HUB_DXB_04:{util:84.9,on_time:88.8,headroom:12.6,status:"High Load"},HUB_AUH_01:{util:84.4,on_time:91.3,headroom:15.8,status:"High Load"},HUB_AUH_02:{util:88.6,on_time:93.8,headroom:11.4,status:"High Load"},HUB_SHJ_01:{util:73.2,on_time:91.1,headroom:28.4,status:"Normal"},HUB_RAK_01:{util:93.3,on_time:87.4,headroom:6.4,status:"At Risk"},HUB_AJM_01:{util:79.8,on_time:83.8,headroom:21.2,status:"Normal"},HUB_FUJ_01:{util:89.0,on_time:80.4,headroom:9.6,status:"High Load"}} COST_PER_HUB = {HUB_FUJ_01:151.68,HUB_RAK_01:114.16,HUB_AUH_02:110.17,HUB_AJM_01:108.79,HUB_DXB_03:94.18,HUB_AUH_01:54.82,HUB_DXB_02:52.07,HUB_SHJ_01:50.85,HUB_DXB_04:50.58,HUB_DXB_01:49.51} WEEKLY_DEMAND = {1:1005,2:1013,3:1021,4:1028,5:1030,6:1034,7:1040,8:1043,9:1047,10:1050,11:1053,12:1057,13:1060} QCOMM = {stores:10, daily_orders:6495, couriers:433}; ON_DEMAND = {couriers:47}

Build all five pages fully working with the embedded data first, wire the API second. Every button must respond instantly (spinner or toast). No page may ever be blank.

═══════════════════════════════════════════════════════════════════ PART 2 — REFINEMENT PROMPTS (use in Lovable one at a time, if needed) ═══════════════════════════════════════════════════════════════════

2a) "The map popups: make them compact white cards with a bold title, status badge, five label/value rows separated by hairlines, and full-width buttons. Buttons must show a spinner while the API call runs."

2b) "Add an armed-mode banner for 'Add a hub anywhere': while armed, show a red pill banner top-center of the map 'CLICK THE MAP TO PLACE THE NEW HUB — ESC TO CANCEL', crosshair cursor, Esc cancels."

2c) "The result tray: slide up animation, and the delta pills must compare correctly — for cost lower is better (green), for coverage and spare capacity higher is better, utilization is neutral gray."

2d) "Print stylesheet: when printing, hide everything except the report preview so Download PDF produces a clean A4 brief."

2e) "Add a Settings dialog (gear icon bottom of sidebar) with one field: Engine API URL, saved to localStorage key ATLAS_API, with a Test Connection button hitting GET /health."

═══════════════════════════════════════════════════════════════════ PART 3 — CONNECTING LOVABLE TO YOUR BACKEND (critical, read carefully) ═══════════════════════════════════════════════════════════════════

Lovable's preview runs on the internet — it CANNOT see http://localhost:8000 on your laptop, and your backend currently only allows localhost origins. Two things fix this:

Backend CORS — have your backend developer (or Claude Code) change the FastAPI CORS middleware to: allow_origins=["*"] (one line in hubris/api/main.py). For a hackathon this is fine.

Expose the backend so the Lovable preview can reach it. Easiest: npx localtunnel --port 8000 (or: ngrok http 8000, or: cloudflared tunnel --url http://localhost:8000) Copy the https URL it prints → open your Lovable app → Settings (gear) → Engine API URL → paste it → Test Connection → green LIVE ENGINE.

OR skip tunnels entirely: click "Export/Download code" in Lovable, run it on your laptop (npm i && npm run dev) — then http://localhost:8000 works directly.

Make sure the backend has the official dataset loaded (EMX_canonical.xlsx was made for exactly this — your backend developer ingests it once at boot).

DEMO SAFETY: even with zero backend, the app fully renders from the embedded dataset in VIEW MODE — the judges always see a working product.

the logo that i need use is ther on here and use the color also and i need this UI/UX for Optimization the data and Visualizathion

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/55184af2-55ae-408c-b5b3-88f685b87e09).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
