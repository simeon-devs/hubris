# SPEAKING SCRIPT — EMX ATLAS

> Plain words. Short sentences. Read it out loud twice. \[Brackets\] are what you do, not what you say.
> The pitch is a scenario walk: three live runs, each one answers a question the judges themselves asked.
> Numbers on the cue card (`CHEAT_SHEET.md`) — glance, don't memorise.

## Pick ONE route before you walk up

Every beat below is written to stand alone. Do not perform all of them — that is 5:45.

| Route | Beats to run | Spoken | Use when |
|---|---|---|---|
| **A — App-first** *(recommended)* | Map → Scenario 1 → Scenario 2 → Scenario 3 → AI → Findings → Close | **4:26** | The app is up and the link works. Skip 0:00 and 0:25 — the Map beat carries both the problem and the trust. |
| **B — Slides-first** | Problem → Trust → Scenario 2 → Scenario 3 → AI → Findings → Close | **4:06** | Projector unreliable, or you want the reconciliation table on screen early. Skip the Map beat. |
| **C — Everything** | All of it | 5:40 | Only if they explicitly give you six minutes. |

> Those are **spoken-word times at a calm pace** (~156 wpm), measured from this file.
> They do **not** include clicking, waiting for a run, or a pause for effect — budget
> **another 30–40 seconds** of real time. Route A lands near 5:00 in the room.

**Non-negotiable in every route: Scenario 3 and the AI beat.** They are the scoring beats.

**If you're running long, cut in this order:** Scenario 1 (30s) → Two findings (33s) →
Scenario 2 (26s). Cutting Scenario 1 alone brings Route A to about 4:30 in the room.

---

## 0:00 — The problem (25 seconds)

"If a planner at EMX wants to know something simple — can we take this customer, which hub has room — it takes about eight hours across spreadsheets. The bigger questions, like 'should we close a hub', never get asked at all, because there's no safe way to try.

We built the safe way to try. This is your real network — all three of them: hubs, dark stores, on-demand — rebuilt as a working copy from your own dataset."

---

## 0:25 — Trust first (40 seconds)

\[Slide 2: the reconciliation table.\]

"Before anything clever: why you can trust it.

We rebuilt your cost model and checked it against your own report. We got 10.91 per parcel — your sheet says 10.91. Fully loaded, 60.11 — your sheet says 60.11. Zero difference, on both networks.

And while checking, the system found something. It tried to serve every order and couldn't. Seventeen parcels a day in Abu Dhabi have nowhere to go — twelve in Al Reem, five in Khalidiyah. Your dark stores run at 87 to 102 percent. Your hubs run at 2 to 12. A shortage and a waste problem, at the same time. We didn't read that anywhere. The engine hit it."

---

## 1:05 — The Map: one screen, real state (60 seconds)

> **\[Switch to the app, `/` — the Map tab. This is the first thing they see running.\]**
> Run this beat only if you opened on slides. If you open on the app, this REPLACES 0:00–0:25 and you pick the story up at Scenario 1.

**\[0:00 — wave at the whole screen.\]**
"This is your entire network on one screen — all three of them: hubs, dark stores, on-demand. Every number computed live, from your own data."

**\[0:10 — point top-left: 43.16 AED.\]**
"Top left is the number that matters. Forty-three dirhams to move one parcel, fully loaded. Nobody typed that in — the engine computed it.

And of those forty-three, only **eleven** is driving. **Thirty-two is buildings.** Fuel free, drivers unpaid — you'd still pay thirty-two dirhams a parcel. Three quarters of your cost is buildings standing there."

**\[0:30 — click one hub, its live card opens.\]**
"The lines show which hub serves which zone right now. Click any hub, you get its live card — load, capacity, riders, cost per shipment.

And nothing here is a simulation. This is what's true today. Simulations are the next tab."

**\[0:45 — point at the red bar, then click it. Map flies to Al Reem, store selected, alert opens.\]**
"That red bar isn't a demo prop. An agent runs on its own and found seventeen orders a day in Abu Dhabi with nowhere to go. One click — and it takes me to the exact store, with the fix, checked by re-running the maths."

> **Held back on purpose** — say these only if asked, they're on the cue card:
> the 45,745 ÷ 1,060 arithmetic · the filters (same-day only, at-risk only) ·
> 60.11 vs 43.16 · why Dubai can't cover Abu Dhabi (3 hours vs a 15-minute promise).

---

## 2:05 — Scenario 1: the same-day question (35 seconds)

\[Simulate → New customer → click Business Bay → promise: Same-day → Run.\]

"You asked us: do we know the difference between a hub that serves next-day and same-day? It's in the model. Watch.

A new client in Business Bay wants same-day delivery. I run it.

Only your five Full Hubs can even bid for this — the five Micro hubs are next-day only, so the system won't offer them. It picks the hub, prices it, and confirms the network holds. That's a real rule from your data, enforced on every answer."

---

## 2:40 — Scenario 2: close a hub (35 seconds)

\[Simulate → Close a hub → Fujairah → Run.\]

"Now the question nobody dares ask. Fujairah costs 151 AED per shipment — three times Dubai. I close it.

The whole network recomputes: who picks up the work, the new cost, and whether anything breaks. Nothing broke — and this took the engine about four thousandths of a second. Your team's version of this analysis takes four to eight hours. And nothing real was touched. It's a copy."

---

## 3:15 — Scenario 3: the recommendation (45 seconds)

\[Optimize → the frontier card.\]

"So what's the best network? Here's where we're different — twice.

First: our early optimiser said save 44 percent by closing eight hubs. Then we taught the model that same-day delivery only works from Full Hubs — a rule from your own data — and it **withdrew its own answer**. The honest raw optimum is: close eight, save **34 percent**, still pushing 84 percent of parcels through one building. We are **not** recommending that either.

So we told the system: keep a hub in every emirate, cap any single hub at 40 percent. The recommendation becomes: close four, save **28 percent**. And the safety itself has a price — about 2,700 AED a day, computed, not guessed.

That's the real decision: not 'what's cheapest', but 'what's cheapest that you can actually live with' — with the cost of caution in dirhams."

---

## 4:00 — The AI, and why it can't lie (45 seconds)

\[Chat drawer → click a preset chip. Point at the badge.\]

"Everything you saw, you can also just ask for.

Two parts under the hood. The maths part is a real solver — the same family airlines use for routes. The words part is the AI — and it does **no maths at all**. It picks the calculation, runs it, and explains the result.

Then — see this badge — every number in the answer is checked against what the calculator actually returned, before you see it. If a number can't be traced, it gets flagged, by name. We measured why this matters: without the check, the model invented a figure in three of five runs. With it, an invented number cannot reach the screen."

---

## 4:45 — Two findings you're taking home (35 seconds)

"Two things your data told us that we didn't expect.

One: your 7-dirham-per-parcel target can't be reached by moving buildings. Your baseline is already 11.44, and closing hubs pushes that particular number *up* — parcels travel further. The target measures driving; 70 percent of your money is buildings. Different lever. Our tool tells you which lever moves which number.

Two: your contract riders cost 25 percent less than staff riders — at identical productivity, per your own roster. That's a saving the tool prices per hub, today."

---

## 5:20 — Close (25 seconds)

\[Slide 4 stays up: the three numbers + the link.\]

"Eight hours, now one second. A 28-percent recommendation with the price of safety attached. And every number traceable to a real calculation — or flagged.

It's running live — you can open it yourself at the link. Thank you."

---

## If you forget everything else, say these

1. "We reproduce your own numbers exactly. 10.91 against 10.91. 60.11 against 60.11."
2. "The maths does the numbers. The AI only explains them. Three of five answers had an invented number until we built the check."
3. "The maths says close eight, save 34. We recommend four, save 28 — and we can tell you exactly what the caution costs: 2,700 AED a day."

## If the demo breaks

Don't fix it on stage. Say: *"Let me show you the numbers instead."* Slide 2 (reconciliation) + Slide 4 (the choice) carry the whole story without a single click.
