# Build — copy/paste prompts, one phase at a time

Read `docs/CORE.md` and `docs/STACK.md` first (rules + tooling). Then work
through the phases below in order. Each phase: a one-line description, a
prompt block to paste as-is, then a test — do the test before moving on.

**Confirmed still in place from earlier planning** (nothing lost in this pass):
IPIP/DOSPERT/MSTAT-II/Need for Cognition content sourcing, the Evidence Gate,
the swappable AI provider adapter, and `docs/mockup.html` as the UI to port,
not redesign.

**Flow check:** dependency order is 0→1→2→3→4→5→6→7 — each phase only needs
what the ones before it built. No reordering needed.

**Merge check:** looked for phases to combine further. 1+3 would mix writing
content with writing an algorithm — different work, different tests, kept
apart. 5+6 would mix backend and frontend testing into one untestable step —
kept apart. No further merges without losing "one clean test per phase."

**Addition, not a new phase:** a `/core/content` convention and a
"no hardcoded content" rule — folded into `docs/CORE.md` and the phases below,
since it's a rule, not new work.

---

## Phase 0 — Setup
✅ Done. Folders, docs, hello-world web app, `docs/mockup.html`.

---

## Phase 1 — Dimensions & content

Sources the trait content instead of writing it cold. Only 4 of 12 dimensions get new questions.

```
Build Phase 1 (Dimensions & content) of TwinArchitect.
1. Create /core/content/dimensions.json — all 12 dimensions, each with a plain low/high description.
2. Create /core/content/questions.json — forced-choice items covering all 12 dimensions:
   - openness, conscientiousness, extraversion, agreeableness, neuroticism: adapt from IPIP (ipip.ori.org).
   - risk_tolerance: adapt from DOSPERT. ambiguity_tolerance: adapt from MSTAT-II. analytical_detail: adapt from the Need for Cognition scale.
   - verbosity, directness, formality, humor_dryness: write ~4 custom forced-choice questions each (no published scale covers these).
3. Tag every question with its source ("IPIP" / "DOSPERT" / "MSTAT-II" / "Need for Cognition" / "custom") and a weight-map entry: {dim, direction, strength}.
4. Write /core/content/coverage.ts — prints question count per dimension.
Everything content-related goes in /core/content — nothing hardcoded in components later.
Give complete files.
```

**Test it:** run the coverage script. Confirm: 12 dimensions listed, each with ≥4 questions, 8 of the 12 show a real source name (not "custom").

---

## Phase 2 — Scoring engine + Evidence Gate ⭐

The locked math, plus the gate that decides what's even allowed to reach it.

```
Build Phase 2 (Scoring engine + Evidence Gate) of TwinArchitect in /core.
1. Implement alpha/beta scoring exactly as in docs/CORE.md (value = alpha/(alpha+beta); confidence = E/(E+8), E = alpha+beta-2; weights weak .5 / moderate 1 / strong 1.5 / very strong 2).
2. Create /core/content/evidence-sources.json — a registry of source types, each: {feeds_profile: boolean, trust_tier: max strength allowed}. Seed it with "quiz": {feeds_profile: true, trust_tier: "very strong"}.
3. Implement /core/evidence-gate.ts — takes {dim, direction, strength, source}, checks the registry, caps or drops the evidence, only lets approved evidence reach scoring.
4. Add Vitest tests: order doesn't matter; values stay 0-1; one answer moves at most 3 dimensions; contradictions raise a flag; evidence from an unregistered source never reaches scoring; evidence above its source's trust_tier gets capped, not dropped.
Give complete files + how to run the tests.
```

**Test it:** tests all green. Then feed the gate a made-up "party_game" source that isn't in the registry — confirm it's rejected before it reaches scoring.

---

## Phase 3 — Question delivery

Quick Start + sharpen batches, not one long quiz. Uses Phase 1's content and Phase 2's confidence scores.

```
Build Phase 3 (Question delivery) of TwinArchitect in /core, using /core/content/questions.json.
1. Quick Start: ~8 questions, covering all 12 dimensions at least once.
2. Sharpen batches: ~6 questions each, targeting the lowest-confidence dimensions.
3. Stop rule: stop when overall confidence hits target, or max questions reached.
Add a test simulating (a) a consistent answerer, (b) a random answerer.
Give complete files.
```

**Test it:** consistent sim reaches target confidence in a sensible number of questions; random sim stays low or hits the max.

---

## Phase 4 — Twin compiler ⭐

Turns a profile into the twin's persona prompt. Hedged, disclaimed, never claims to be the real person.

```
Build Phase 4 (Twin compiler) of TwinArchitect in /core.
1. Turn a profile into a persona prompt.
2. Skip any dimension with confidence below 0.35.
3. Use hedged wording ("tends to," "often"). Always add a non-clinical disclaimer.
4. Never output "clone," "always," or "exact."
Add tests: low-confidence traits omitted; disclaimer present; banned words absent.
Give complete files.
```

**Test it:** a profile with one weak trait → that trait isn't mentioned; disclaimer present; no banned words.

---

## Phase 5 — API

Node + Express, imports `/core`, never reimplements it. Twin chat goes through a swappable AI adapter.

```
Build Phase 5 (API) of TwinArchitect in /api (Node + Express), importing /core.
Endpoints:
- POST /session (start)
- POST /answer -> updated profile + next question (evidence passed through the Evidence Gate)
- POST /compile -> the twin prompt
- POST /twin/chat -> proxies the twin chat AI (key server-side only)
Twin chat: implement generateTwinReply(profile, message) behind an env var LLM_PROVIDER=anthropic|openrouter — two swappable implementations; /core and /web never know which is active.
Add a message-length cap and a basic per-session rate limit on /twin/chat.
Save raw answers + profile to Postgres (Supabase).
Give complete files + a test script that runs a full quiz over HTTP.
```

**Test it:** the script runs start → finish → compile with no errors. Switch `LLM_PROVIDER` and confirm both paths respond.

---

## Phase 6 — Web app

Build the real screens from `docs/mockup.html` — port its layout, components, and Minimal/Neon theme. Don't redesign it.

```
Build Phase 6 (Web app) of TwinArchitect in /web (React + Vite + Tailwind).
Use docs/mockup.html as the reference for every screen — port its layout and components, and move its CSS variables (Minimal + Neon themes) into /web/src/theme.css rather than reinventing them.
Screens: Home (empty/filled profile state driven by the real API, not a mock toggle), Quick Start quiz, Sharpen batch, Results, "Why" trail, Twin chat, Settings (AI provider choice, profile freeze).
Anonymous session in localStorage — no signup yet. Name entry lives on Home, stored client-side.
Give complete files.
```

**Test it:** finish a quiz in the browser — it stops itself, a refresh mid-quiz keeps progress. Home shows the real empty state before answering anything, and the real profile after.

---

## Phase 7 — Deploy

```
Help me deploy TwinArchitect:
- Web (/web) to Vercel, API (/api) to Render, database on Supabase.
- Set up environment variables (including LLM_PROVIDER and provider API keys) and basic error logging.
Give step-by-step instructions and any config files.
```

**Test it:** open the public URL on your phone, run a full quiz start to finish; errors show up in the logs.

---

## After the MVP (not built yet — kept out of the main path on purpose)

| What | Content lives in |
|---|---|
| Feedback ("does this feel like you") | `/core/content` — rating copy |
| Guess-your-twin mini-game | `/core/content/guess-twin-bank.json` |
| Social signal extractor (screenshot upload) | n/a — reads user-provided text |
| Party games (Quiplash-style) | `/core/content/party-prompts.json` |
| Full accounts + validation suite | — |
| iOS app | — |

Same rule applies when we get here: game prompts and banks are JSON in
`/core/content`, never hardcoded in a component.
