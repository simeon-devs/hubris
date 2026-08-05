# CUE CARD — read this on the way in

One page. Glance at it, don't memorise it. Every figure here was pulled from the
running engine, not typed from memory. If a number here disagrees with the app,
**the app is right and this file is stale — say the app's number.**

---

## The three numbers that carry the whole pitch

| | Say it like this |
|---|---|
| **43.16 AED** | "Forty-three dirhams to move one parcel, fully loaded." |
| **11 driving / 32 buildings** | "Only eleven of it is driving. Thirty-two is buildings." |
| **−28%** | "Close four hubs, save twenty-eight percent." |

If you remember nothing else, those three sentences are the pitch.

---

## Where 43.16 comes from (you WILL be asked)

> 45,745 AED a day ÷ 1,060 parcels a day = **43.16**

| Pile | Per day | Per parcel |
|---|---|---|
| Driving — fuel, drivers, vans | 12,130 AED | **11.44** |
| Buildings — rent, overhead | 33,615 AED | **31.72** |
| **Total** | **45,745 AED** | **43.16** |

**The line to land:** *"Fuel free, drivers unpaid — you'd still pay thirty-two dirhams a parcel."*

---

## "Your slide says 60.11, your screen says 43.16"

Same money. Different number of parcels to divide it by. **Their workbook contains
two sheets that disagree about their own daily volume.**

| Counting parcels from | Parcels/day | Buildings | Driving | Total |
|---|---|---|---|---|
| Their **cost** sheet | 683 | 49.19 | 10.91 | **60.11** |
| Their **demand** sheet *(what we run on)* | 1,060 | 31.72 | 11.44 | **43.16** |

Gap: **1.55× network-wide.** (2.7× is the worst *single* hub, Al Quoz — do not
quote it as the network figure.)

**Say:** *"Your cost sheet and your demand sheet disagree about your own volume by
about half again. We found it, we didn't average it away, and we show both labelled."*
This is a **strength**. Nobody who merely imported the spreadsheet can say it.

---

## The network, in facts

- **10 open hubs** — 5 Full (same-day + next-day), 5 Micro (next-day only) — plus **3 candidates**
- **Full:** DXB_01, DXB_02, DXB_04, AUH_01, SHJ_01 · **Micro:** DXB_03, AUH_02, RAK_01, AJM_01, FUJ_01
- **10 dark stores**, **17 zones**, **6 emirates**, ~1,190 riders
- Hub utilisation **2–12%** · dark-store utilisation **87–102%** — *shortage and waste at the same time*
- Fujairah costs **151 AED/shipment** — about three times Dubai
- Most expensive hub to keep, cheapest to question

---

## The Abu Dhabi crisis — real, not staged

| Zone | Needs/day | Store holds | Short |
|---|---|---|---|
| Al Reem | 537 | 525 | **12** |
| Khalidiyah | 605 | 600 | **5** |
| | | | **17/day** |

Both columns are **their own spreadsheet**, same week. Dubai has spare room but is
**3 hours away** and these are **15-minute** deliveries — so it cannot help.

**The fix:** +17 units at the Al Reem store (QED_AUH_02). Costs **30.74 AED/day more**
in transport — *it buys service, not savings*. Verified by re-running the solve.

---

## The recommendation

| | Hubs closed | Saving | Why not this one |
|---|---|---|---|
| Old optimum | 8 | −44% | **Illegal** — kept Micro hubs that can't do same-day. The model withdrew it. |
| Honest raw optimum | 8 | **−34%** | 84% of parcels through one building |
| **What we recommend** | **4** | **−28%** | A hub in every emirate, no hub over 40% |

Price of that caution: **≈2,700 AED/day**, computed.

**The line:** *"Not what's cheapest — what's cheapest that you can actually live with,
with the cost of caution in dirhams."*

---

## The AI guardrail

- The solver does the maths. The AI does **no arithmetic at all** — it picks the
  calculation, runs it, explains it.
- Every number in an answer is checked against what the solver returned, **before**
  you see it. Untraceable → flagged **by name**.
- Measured: without the check, the model invented a figure in **3 of 5 runs**.
- Badge meanings: **verified** = clean first pass · **self-corrected** = the guardrail
  caught the first draft and forced a fix · **flagged** = shown with the bad figures named.

---

## Two findings they take home

1. **The 7-dirham target is the wrong lever.** It measures driving; three quarters of
   the money is buildings. Closing hubs pushes the driving number *up* (parcels travel
   further). Our tool tells you which lever moves which number.
2. **Contract riders cost 25% less than staff riders at identical productivity** — per
   their own roster. Priced per hub, today.

---

## Traps — do not say these

| Don't say | Say instead |
|---|---|
| "2.7× volume gap" | "About 1.55× — half again" |
| "The moving lines are a simulation" | "That's the live assignment. Simulations are the next tab." |
| "Coverage is 100% but demand is unserved" *(sounds contradictory)* | "Two different networks — hubs serve everything, dark stores are the ones short." |
| "It saves money by adding capacity in Abu Dhabi" | "It buys service. It costs 30 dirhams more a day." |
| "About a hundredth of a second" | "About four thousandths of a second" *(measured: 3.6ms)* |

---

## Before you walk on

- [ ] Crisis alert **unacknowledged** — the red bar only shows while it is. Don't ack it in rehearsal.
- [ ] **Never run the test suite before demoing** — it pollutes the shared database.
- [ ] Map tab open, engine pill says **live**.
- [ ] The link works from a phone, not just your laptop.

## If the demo breaks

Don't fix it on stage. Say: *"Let me show you the numbers instead."* Slide 2
(reconciliation) and Slide 4 (the choice) carry the whole story without a click.
