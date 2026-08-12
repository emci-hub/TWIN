# Deploy — Phase 7

Free tier throughout, no card required: `/web` → Vercel, `/api` → Render, database →
Supabase. See `docs/STACK.md`'s "Free-tier watch-outs" for the cold-start/pause
caveats that come with that — they're expected, not bugs.

This doc is instructions for *you* to click through — the actual dashboards
(GitHub, Supabase, Render, Vercel) need your own accounts, so this build session
can prepare every config file and verify them locally, but can't create the
live services on your behalf. Config files this phase added, already committed:
`render.yaml` (repo root), `web/vercel.json`, `api/async-handler.ts` + a global
error handler in `api/server.ts` (see "A bug fixed for this phase" below).

## 0. Push to GitHub, if you haven't already

Render and Vercel both deploy from a Git repo.

```
cd twinarchitect
git remote add origin https://github.com/<you>/twinarchitect.git
git push -u origin master
```

(If you already have a remote set up, skip this — just make sure `master` is pushed.)

## 1. Database — Supabase

1. [supabase.com](https://supabase.com) → New project. Free tier, no card. Pick any
   region (closer to where Render will run in step 2 is marginally faster, not
   required).
2. Once it's provisioned: **Project Settings → Database → Connection string**.
3. **Use the "Connection pooling" string, not the direct connection one.**
   Supabase's direct connection (`db.<ref>.supabase.co:5432`) is IPv6-only on the
   free tier; Render's free plan is IPv4-only, so a direct connection will time
   out. The pooler (Supavisor) string is IPv4-compatible:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
   Use **Transaction mode** (port `6543`) — the API's connection pattern (short-lived
   queries per request, via `pg.Pool`) fits transaction mode; session mode is only
   needed for things like session-level prepared statements, which this app doesn't use.
4. Save the full string somewhere safe — you'll paste it into Render as `DATABASE_URL`
   in step 2. Nothing to run by hand: `api/schema.sql` applies itself automatically
   the first time the API boots against this database (`applySchema()` in `api/db.ts`,
   `create table if not exists` — safe to run on every boot, not just the first).

## 2. API — Render

1. [render.com](https://dashboard.render.com) → **New → Blueprint** → connect your
   GitHub account → pick the `twinarchitect` repo. Render reads `render.yaml` at the
   repo root and proposes one service, `twinarchitect-api`.
2. Before it deploys, it'll prompt for the env vars marked `sync: false` in
   `render.yaml`:
   - `DATABASE_URL` — the Supabase pooler string from step 1.
   - `LLM_PROVIDER` — start with `mock` to verify the deploy itself works end-to-end
     with zero API cost/risk, then switch to `anthropic` (see step 2b) once you've
     confirmed the quiz → results → chat path works.
   - `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com),
     only needed once `LLM_PROVIDER=anthropic`.
   - `OPENROUTER_API_KEY` — from [openrouter.ai](https://openrouter.ai/keys), only
     needed once/if `LLM_PROVIDER=openrouter`.
   - `ANTHROPIC_HARD_DAILY_CAP` — defaults to 50 in code if you leave this blank;
     set it explicitly here if you want a different ceiling on the deployed app's
     own daily Claude usage (this is separate from, and on top of, the Claude
     credit used to *build* the app — see `docs/CORE.md`).
3. Deploy. First boot takes a minute or two (installing `/api`'s dependencies).
   Watch the **Logs** tab — you should see:
   ```
   [store] using PostgresStore (DATABASE_URL set)
   TwinArchitect API listening on :10000 (LLM_PROVIDER=mock)
   ```
4. Once it's live, note the public URL Render gives you (`https://twinarchitect-api-xxxx.onrender.com`)
   and confirm:
   ```
   curl https://twinarchitect-api-xxxx.onrender.com/health
   ```
   should return `{"ok":true,"provider":"mock"}` (or `"anthropic"`/`"openrouter"` once
   you've flipped `LLM_PROVIDER`).

**2b. Switching to a real provider.** In the Render dashboard, **Environment** tab →
edit `LLM_PROVIDER` to `anthropic` (or `openrouter`) → the service redeploys
automatically. Test `/twin/chat` once more after the switch — you should get a real
model reply instead of the mock's canned one.

**Free-tier reality check (docs/STACK.md):** Render's free web services spin down
after 15 minutes idle — the first request after a quiet period takes ~1 minute to
wake back up. That's expected, not a bug; a returning visitor just sees a slow first
load. Supabase free projects pause after 7 days of total inactivity — if you come
back after a long gap and the API's logs show connection errors, un-pause the
Supabase project from its dashboard first.

## 3. Web — Vercel

1. [vercel.com](https://vercel.com) → **Add New… → Project** → import the same GitHub
   repo.
2. Before deploying, click **Edit** next to Root Directory and set it to `web`.
   Vercel auto-detects the Vite framework preset from there (`web/vercel.json`,
   committed this phase, pins `buildCommand`/`outputDirectory`/`framework`
   explicitly too, so this isn't relying on autodetection alone).
3. Add one environment variable: `VITE_API_URL` = the Render URL from step 2
   (e.g. `https://twinarchitect-api-xxxx.onrender.com`) — no trailing slash. This is
   the *only* place the API's URL is configured; nothing in `/web`'s code hardcodes it
   (see `web/src/lib/api.ts`).
4. Deploy. Vercel gives you a public URL (`https://twinarchitect-xxxx.vercel.app`).

No rewrites/SPA fallback config needed — the app uses hash-based routing
(`#quiz`, `#results`, …), so every real request Vercel sees is just `/`; Vite's
static output serves that correctly with zero extra config.

## 4. Test it (the Phase 7 criteria)

- Open the Vercel URL on your phone. You should land on Home in its empty state
  (no profile yet).
- Run a full quiz start to finish — same behavior verified locally in Phase 6
  (self-stops, Home shows the real filled state after).
- Deliberately trigger an error to confirm logging works: e.g. temporarily set
  `LLM_PROVIDER=anthropic` on Render *without* setting `ANTHROPIC_API_KEY`, send a
  chat message, and check Render's **Logs** tab — you should see the error logged
  (via the global error handler / `generateAnthropicReply`'s own error path, not a
  silently hung request), and the client should get a real "twin's resting" or
  "AI provider failed" message rather than a spinner that never resolves. Put
  `ANTHROPIC_API_KEY` back afterward.

## Known open items (not done this phase — flagged, not silent)

- **CORS is currently wide open** (`cors()` with no options in `api/server.ts`,
  allows any origin). Fine for a single-frontend MVP at this scale; if you want it
  locked to just your Vercel domain later, that's a small follow-up (an
  `ALLOWED_ORIGIN` env var passed to `cors({ origin: ... })`), intentionally not
  done unprompted since it's a hardening choice, not something broken.
- **No custom domain / HTTPS setup beyond what Vercel/Render provide by default**
  — both platforms terminate TLS on their own `*.vercel.app`/`*.onrender.com`
  subdomains already, so this only matters if you want your own domain name later.
- **Render's free-tier cold start** (above) isn't solved by anything in this repo —
  a low-cost mitigation (an external uptime pinger hitting `/health` every ~10 min)
  is possible later but wasn't added, since it would eat into the same free-tier
  hours it's trying to avoid losing, and this is a personal-scale hobby app, not
  one with real traffic yet.

## A bug fixed for this phase

While preparing this doc, a real gap turned up: most of `/api`'s async route
handlers (`/session`, `/answer`, `/compile`, `/session/:id`, the freeze route) had
no error handling around their `await store.*` calls. Express 4 doesn't catch a
promise rejection thrown out of an async handler on its own — a Postgres hiccup
(realistic on a free-tier DB that can pause/cold-start) would have hung the
request forever with nothing in the logs, which directly breaks this phase's
"errors show up in the logs" test criterion. Fixed with `api/async-handler.ts` (a
small wrapper forwarding rejected promises to `next()`) applied to every route,
plus a global Express error-handling middleware that logs via `console.error`
(so it lands in Render's log tail) and returns a generic 500 instead of hanging or
leaking a raw error/stack to the client. `index.ts` also gained
`unhandledRejection`/`uncaughtException` process-level handlers as a last-resort
net. Covered by a new test that spins up a real server with a store that throws
and confirms the request gets a real 500 (not a hang) and the error was logged
(`api/server.test.ts`, "global error handling" block). `/api` is now 43 Vitest
tests (was 42).

Also fixed: `tsx` was in `/api`'s `devDependencies`, but `npm start` runs
`tsx index.ts` directly (no compile step) — most hosts, Render included, set
`NODE_ENV=production` before `npm install`, which skips devDependencies by
default, which would have meant `tsx` itself was missing at runtime. Moved to
`dependencies`.

---

Sources checked for this doc (current as of build time, August 2026):
- [Supabase — IPv4/IPv6 compatibility troubleshooting](https://supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP)
- [Vercel — Using Monorepos](https://vercel.com/docs/monorepos)
