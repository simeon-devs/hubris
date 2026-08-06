# "Where can we see it running?" — DEPLOYED (2026-08-06)

> Submission asks: *a live demo, deployed app, or hosted notebook — anything the judges can open.*
> Answer: a live deployed copy on Render (free tier), plus the local compose for the stage demo.

---

## The links (live)

| What | URL |
|---|---|
| **Judges' app — the one for the QR/slide** | **https://emx-atlas-app.onrender.com** |
| Engine API (health: `/health`) | https://emx-atlas-engine.onrender.com |
| Repo (one-command local run) | https://github.com/simeon-devs/hubris |

Deployed via `render.yaml` at the repo root (blueprint: two free web services + free
Postgres; migrations + self-seeding run on boot — the twin loads the real dataset
by itself, the watchdog raises the Abu Dhabi crisis on its own schedule).

## Keep-warm (LOAD-BEARING on demo day)

Free services sleep after 15 idle minutes (~50s wake — reads as "broken" to a judge).
**cron-job.org, every 10 minutes, BOTH URLs**, from before judging until the end:

- `https://emx-atlas-engine.onrender.com/health`
- `https://emx-atlas-app.onrender.com/`

## The rules

1. **The stage demo runs on localhost** (`docker compose up -d` — boots itself onto the
   real dataset). Never demo over venue wifi against a free-tier instance.
2. The deployed link is for the judges' own hands: slower than the laptop (0.1 CPU —
   Optimize takes ~20–40s there), but genuinely live and self-explanatory.
3. `ANTHROPIC_API_KEY` lives only in Render's dashboard (engine service → Environment).

## Fallbacks (cost almost nothing, do regardless)

- **90-second screen recording** of the three pitch scenarios + a verified chat answer —
  record after the UI is final; a video can't crash at 10:00.
- **The repo README quickstart** — a technical judge is on the real twin in two minutes.

## What goes in the submission field, verbatim

> Live app: https://emx-atlas-app.onrender.com — it boots on the real EMX dataset;
> try the chat's preset questions and the Simulate tab's 12 scenarios.
> 90-sec walkthrough: `<video link>`. Source + one-command run: https://github.com/simeon-devs/hubris
