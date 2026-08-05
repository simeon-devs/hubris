# "Where can we see it running?" — the plan

> Submission asks: *a live demo, deployed app, or hosted notebook — anything the judges can open.*
> Our answer has three layers: what we SAY, what we LINK, what we FALL BACK on.

---

## Layer 1 — the pitch itself: live app on our laptop (ready now)

`docker compose up -d` → the app boots **itself** onto the real dataset (baseline + the QComm
crisis + the boot alert — no seeding steps, no clicks). This is what we demo from. Zero new work.

## Layer 2 — the LINK for the submission form: a deployed copy (~2h, needs a go-decision)

The strongest possible answer to their question: a URL where a judge clicks around the real twin.

**Why we're unusually deployable:** one `docker compose` (Postgres + API + UI), migrations run on
startup, and the app seeds itself from the bundled dataset on boot. There is no setup story.

**Steps (in order, ~2h total):**
1. Pick host — smallest VPS (Hetzner/DigitalOcean) running our compose verbatim is the most
   faithful; Railway/Render work too but split the compose into services.
2. Set `ANTHROPIC_API_KEY` on the server (chat works); everything else needs no config.
3. Rebuild the frontend with `NEXT_PUBLIC_API_URL=https://<host>:8000` (it's baked at build time).
4. Add the public frontend origin to CORS (one line, `backend/hubris/api/main.py`).
5. Smoke the 6 chat chips + 3 demo scenarios on the public URL. Put the URL on Slide 4 + a QR.

**Accepted risks (48h event window):** the API is open — anyone can run simulations (fine; state
resets on restart) — and the chat spends our API key (acceptable; usage is tiny).

**Decision needed from Sims:** deploy tonight yes/no, which host, whose account + key.

## Layer 3 — fallbacks that cost almost nothing (do these regardless)

- **90-second screen recording** of the three pitch scenarios + the verified chat answer.
  Record AFTER the frontend is final. Link it in the submission next to the URL — a video can't
  crash at 10:00.
- **The GitHub repo** — README already carries the quickstart; a technical judge can
  `docker compose up` and be on the real twin in two minutes. Include the repo link in the form.
- **The MCP line** (say it, don't rely on it): "the same tools are exposed over MCP — you can
  operate this twin from Claude on your own machine." That's the 'is it a platform?' answer.

## What goes in the submission field, verbatim

> Live app: `<deployed URL>` (open it — it boots on the real EMX dataset; try the chat's preset
> questions). 90-sec walkthrough: `<video link>`. Source + one-command run: `<repo link>`.

If the deployment doesn't happen tonight, the field is the video + repo — still a real answer,
just one click weaker.
