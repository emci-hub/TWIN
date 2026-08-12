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

**Resource check (latest pass):** building here (this chat) is uncapped — spend
whatever credit it takes to get each phase right. The *running app* is a
different budget: nothing it calls may be hardcoded in a way that's hard to
change later (model names, provider URLs, limit numbers all live in
`/api/config.ts` or env vars — see `docs/CORE.md`), every outbound AI call goes
through a quota guard before it fires (Phase 5), and nothing in the design
polls or retries unboundedly — the quiz has a stop rule, retries are capped,
and anything live later pushes updates instead of polling. Verified against
the current phase list below; two fixes landed in Phase 5 as a result (the
quota guard and the retry cap).

**Methodology check (latest pass):** checked whether the forced-choice quiz is
actually the best way to read someone, versus alternatives. Answer: the
research backs combining methods, not picking one — self-report items
(IPIP/DOSPERT/etc.) plus behavioral/text signal (writing samples) plus a light
dose of situational-judgment items, which is what this plan already does via
the Evidence Gate. One real addition: a handful of scenario-based
("what would you do if...") items mixed into Phase 1 for the judgement-heavy
dimensions, alongside the preference items — research on situational judgment
tests shows they add signal in combination with self-report, not as a
replacement for it.

**Storage check (latest pass):** profiles and evidence logs are kilobytes per
person — Supabase's free 500MB comfortably holds well over 100k users on that
alone. The part that would actually blow the free tier is raw images. Fix:
screenshots/exports are processed in memory and never stored — only the
derived evidence and a one-line description survive the request. That's what
makes "runs forever, free, and grows" actually true rather than aspirational.
See Phase 5b below.

---

## Phase 0 — Setup
✅ Done. Folders, docs, hello-world web app, `docs/mockup.html`.

---

## Phase 1 — Dimensions & content
✅ Done. `/core/content/dimensions.json` (12), `/core/content/questions.json` (56: 48 preference + 8 situational), `/core/content/coverage.ts` — coverage script confirms all criteria below pass.

Sources the trait content instead of writing it cold. Only 4 of 12 dimensions get new questions. A handful of scenario-based items are mixed in for the "judgement" side of things, not just preference items.

```
Build Phase 1 (Dimensions & content) of TwinArchitect.
1. Create /core/content/dimensions.json — all 12 dimensions, each with a plain low/high description.
2. Create /core/content/questions.json — forced-choice items covering all 12 dimensions:
   - openness, conscientiousness, extraversion, agreeableness, neuroticism: adapt from IPIP (ipip.ori.org).
   - risk_tolerance: adapt from DOSPERT. ambiguity_tolerance: adapt from MSTAT-II. analytical_detail: adapt from the Need for Cognition scale.
   - verbosity, directness, formality, humor_dryness: write ~4 custom forced-choice questions each (no published scale covers these).
3. For risk_tolerance, ambiguity_tolerance, analytical_detail, directness: also write 2-3 short situational-judgment items each ("you're in [scenario] — do you A or B") alongside the trait-preference items above, same weight-map format. These sit next to the scale-adapted items, not instead of them — research on situational judgment tests finds they add real signal but work best combined with self-report, not alone.
4. Tag every question with its source ("IPIP" / "DOSPERT" / "MSTAT-II" / "Need for Cognition" / "custom" / "situational") and a weight-map entry: {dim, direction, strength}.
5. Write /core/content/coverage.ts — prints question count per dimension.
Everything content-related goes in /core/content — nothing hardcoded in components later.
Give complete files.
```

**Test it:** run the coverage script. Confirm: 12 dimensions listed, each with ≥4 questions, 8 of the 12 show a real source name (not "custom"), and the 4 targeted dimensions each have at least 2 situational items.

---

## Phase 2 — Scoring engine + Evidence Gate ⭐
✅ Done. `/core/scoring.ts` (locked math), `/core/content/evidence-sources.json` (seeded with `quiz`), `/core/evidence-gate.ts` (source trust + a new per-answer 3-dimension cap), `/core/profile.ts` (ties gate + scoring together, adds contradiction tracking and profile freeze). 22 Vitest tests, all green; `tsc --noEmit` clean.

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
✅ Done. `/core/content/quiz-config.json`, `/core/question-delivery.ts` (Quick Start, sharpen batches, stop rule, `QuizSession`). **Deviation, flagged not silent:** Quick Start is 12 questions, not ~8 — Phase 1's content ended up one-dimension-per-question, so 8 questions could only ever cover 8 of 12 dimensions; 12 (one per dimension) is the smallest size that still covers all 12 as required. 31 Vitest tests, all green (includes consistent + random simulations).

Quick Start + sharpen batches, not one long quiz. Uses Phase 1's content and Phase 2's confidence scores.

```
Build Phase 3 (Question delivery) of TwinArchitect in /core, using /core/content/questions.json.
1. Quick Start: ~8 questions, covering all 12 dimensions at least once.
2. Sharpen batches: ~6 questions each, targeting the lowest-confidence dimensions.
3. Stop rule: stop when overall confidence hits target, or max questions reached.
4. Never re-select a question_id already in this session's answered list.
Add a test simulating (a) a consistent answerer, (b) a random answerer.
Give complete files.
```

**Test it:** consistent sim reaches target confidence in a sensible number of questions; random sim stays low or hits the max. Confirm no question_id repeats across a full simulated run.

---

## Phase 4 — Twin compiler ⭐
✅ Done. `/core/content/twin-copy.json` (hedge phrases, disclaimer, intro/outro), `/core/twin-compiler.ts` (0.35 confidence gate, hedge-band selection, a runtime banned-word guard on top of the tests). 11 new tests (42 total), all green.

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
✅ Done. `/api/config.ts`, `/api/quota-guard.ts`, `/api/llm/{anthropic,openrouter,mock}.ts`, `/api/store.ts` (PostgresStore + MemoryStore), `/api/server.ts`, `/api/scripts/test-full-quiz.ts`. 30 Vitest tests (26 always run + 4 live-Postgres tests that run whenever `DATABASE_URL` is set, skipped otherwise). Verified against a real local Postgres instance, not just the in-memory fallback — see the test-it notes below.

Node + Express, imports `/core`, never reimplements it. Twin chat goes through a swappable AI adapter with a hard quota guard in front of it — nothing calls out uncapped.

```
Build Phase 5 (API) of TwinArchitect in /api (Node + Express), importing /core.
Endpoints:
- POST /session (start)
- POST /answer -> updated profile + next question (evidence passed through the Evidence Gate)
- POST /compile -> the twin prompt
- POST /twin/chat -> proxies the twin chat AI (key server-side only)

Twin chat AI, swappable:
1. /api/config.ts — provider name, model name/version, and each provider's free-tier call limits (requests/min, requests/day) as named constants. Nothing about a provider hardcoded anywhere else.
2. generateTwinReply(profile, message), behind env var LLM_PROVIDER=anthropic|openrouter — two swappable implementations; /core and /web never know which is active.
3. A quota guard that runs BEFORE every provider call: tracks calls made this minute/day (Postgres or in-memory counter is fine), checks against /api/config.ts's limit for the active provider, and refuses with a friendly "twin's resting, try again shortly" instead of calling through over the limit. For the anthropic provider specifically, also enforce a configurable hard daily-call cap so nothing can run past the Claude credit unattended.
4. express-rate-limit (free npm package) on /twin/chat for inbound abuse — separate from the outbound quota guard above.
5. A message-length cap on /twin/chat.
6. Any client retry logic gets a max-attempt cap (e.g. 3) — never unbounded/infinite retries.

Save raw answers + profile to Postgres (Supabase).
Give complete files + a test script that runs a full quiz over HTTP.
```

**Test it:** the script runs start → finish → compile with no errors. Switch `LLM_PROVIDER` and confirm both paths respond. Then manually drop the daily-call cap to 1 in config, call `/twin/chat` twice, and confirm the second call is refused instead of hitting the provider.

**Verification notes:** `npm run test:http` (from `/api`) does exactly this — over real HTTP, against a real spawned server, using `LLM_PROVIDER=mock` throughout (canned replies, same code path as the real providers, zero network calls or spend) so it never touches the Claude credit or needs a key. It ran a full 48-question quiz with zero repeats, compiled a clean twin prompt, got a chat reply, then re-ran with the daily cap set to 1 and confirmed call #2 comes back `429` with the friendly "twin's resting" message before ever reaching a provider. Also ran once with `DATABASE_URL` pointed at a real local Postgres instance to confirm the persistence path works for real, not just against the in-memory dev fallback — rows landed in `sessions`/`answers` as expected.
A real bug turned up during this: replaying stored answers to rebuild a session had to call `currentBatch()` after every replayed answer (not just once at the end), or the batch-advancement logic would desync from what the live session had actually served. Fixed in `server.ts`'s `rebuildSession`.

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
| Social signal extractor (screenshot upload) | see Phase 5b below — nothing persisted but the extracted evidence |
| Party games (Quiplash-style) | `/core/content/party-prompts.json` |
| Full accounts + validation suite | — |
| iOS app | — |

Same rule applies when we get here: game prompts and banks are JSON in
`/core/content`, never hardcoded in a component.

### Phase 5b — Social signal extractor (fully specified, still post-MVP)

Repeatable screenshot/writing-sample upload. Guides people toward useful screenshots instead of silently failing on bad ones. Never stores the image.

```
Build Phase 5b (Social signal extractor) of TwinArchitect in /api.
1. POST /signal/upload accepts one image (max 5MB) or pasted text, held in memory only — never written to disk or Supabase Storage.
2. First AI call: does this contain personally-authored text worth reading (a bio, a caption, an about-me), yes/no + why. If no, return specific guidance ("try a screenshot of your bio, or a caption with some personal writing") and stop — one round, not a retry loop.
3. If yes: extract {dim, direction, strength} evidence, source: "social_text", capped at moderate per docs/CORE.md. Pass through the Evidence Gate.
4. Store only: the evidence produced, and a short text description of what the image said (one sentence). Discard the image/text immediately after the request completes.
5. Route this call through the same quota guard as /twin/chat (docs/CORE.md's free-tier guardrail applies to this call too).
6. Consent checkbox captured once per twin, not re-asked on every upload; a Settings toggle can revoke it.
Give complete files.
```

**Test it:** upload a screenshot with no real text (e.g., a plain photo) — confirm it's rejected with specific guidance and nothing is stored. Upload one with a real bio — confirm evidence appears in the profile and no image bytes exist anywhere after the request finishes.
