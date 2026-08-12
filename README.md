# TwinArchitect

A quiz that scores a personality profile (with confidence), then turns it into a
safe, bounded AI "twin" you can chat with. Web first, Apple app later.

## For any AI picking this up

Read `docs/CORE.md` and `docs/STACK.md` before writing anything. In short:

1. Do NOT change the locked core (scoring math, 12 dimensions, API structure,
   raw-answers-are-source-of-truth, the consent rule). If something looks wrong,
   stop and ask — don't silently change it.
2. Logic lives in `/core` only. Never reimplement scoring anywhere else.
3. Match the files that already exist. If you add, rename, or deviate, say so
   clearly at the top of your reply.
4. Give complete, runnable files, not fragments.
5. Confirm what already exists (check `docs/PHASES.md`) before writing new code.

See `docs/BUILD.md` for the actual copy-paste prompts (one phase at a time, with
a test after each), `docs/PHASES.md` for a quick status table, and
`docs/CORE.md` / `docs/STACK.md` / `docs/ARCHITECTURE.md` for the rules those
phases follow.

## Folders

- `/core` — scoring + twin logic + tests (plain TypeScript, Vitest). The real product.
- `/api` — Node + Express, imports `/core`, never reimplements it.
- `/web` — React + Vite + Tailwind. A screen on top of `/api`.
- `/docs` — the rules (`CORE.md`, `STACK.md`, `ARCHITECTURE.md`), the build
  prompts (`BUILD.md`), progress (`PHASES.md`), and the UI reference (`mockup.html`).
- `/ios` — later. SwiftUI, calls the same `/api`.
- `/validation` — simulations and audits (Phase 10+).

## Running the web app locally

```
cd web
npm install
npm run dev
```
