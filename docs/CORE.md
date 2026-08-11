# THE CORE — never change this without asking first

- Scoring + twin logic live in **`/core` only**, behind an **API**. Never rebuilt anywhere else (not in `/web`, not in `/ios`).
- **Raw answers = source of truth.** The profile is always calculated from them, never stored as the "real" state on its own.
- **Scoring = evidence counts (alpha/beta):**
  - Each answer adds weight `w` to `alpha` (pushes high) or `beta` (pushes low).
  - Weights: weak `.5` · moderate `1` · strong `1.5` · very strong `2`
  - `value = alpha / (alpha + beta)`
  - `confidence = E / (E + 8)`, where `E = alpha + beta − 2`
- **12 fixed dimensions** (don't add/rename/merge without a written decision):
  `openness, conscientiousness, extraversion, agreeableness, neuroticism · risk_tolerance, analytical_detail, ambiguity_tolerance · verbosity, directness, formality, humor_dryness`
- **Twin output is always hedged, confidence-gated, disclaimed.** Never "this is exactly you," never clinical language. Dimensions below confidence 0.35 are omitted from the twin prompt entirely.
- **Consent rule:** a twin may only be built from data the profiled person explicitly authorized — themselves, or an opt-in invite they accepted. No arbitrary-target scanning, ever, regardless of whether the source is public.
- **Evidence Gate:** every input — quiz, writing sample, mini-game, party game, anything added later — is converted to the same shape (`{dim, direction, strength}`) and must pass through `/core/evidence-gate` before it can touch alpha/beta. The gate checks a registry (`/core/evidence-sources.json`) for that source's `trust_tier` (max strength it's allowed) and `feeds_profile` (whether it's allowed to touch the profile at all). **New sources default to `feeds_profile: false`** — a game only ever affects the profile if someone deliberately registers it with a tier, never by default. This is what stops a casual/party game from moving someone's traits. See `docs/ARCHITECTURE.md` for the full flow and the current tier table.
- **Profile freeze:** a user can freeze their profile so nothing — including gate-approved sources — moves it further.
- **Folders:** `/core` (logic + tests) · `/api` · `/web` · `/ios` (later) · `/validation` · `/docs`

## What gets stored per user (reference)

```
answers: [ {question_id, option_id, timestamp} ]      <- source of truth
12 dimensions, each: {value, confidence, alpha, beta, contradiction_flag}
metadata: {items_answered, profile_confidence, min_items_for_twin: 12}
```

## Social-signal evidence (Phase 5b, post-MVP)

A social-derived signal is just another evidence source feeding the same alpha/beta
engine through the Evidence Gate above — never a separate scoring path.

```
{ source: "social_text", dim, direction: "+"|"-", strength: "weak"|"moderate" }
```

Capped at `strength: "moderate"` max (never "strong"/"very strong") — text inference
is noisier than a direct forced-choice answer. Only ever generated from data the
profiled person explicitly provided or authorized (see Consent rule above).
