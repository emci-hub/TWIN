# Architecture — the black box

Same pipeline for every input, whether it's a quiz answer, a writing sample, a
mini-game, or a party game. Nothing bypasses it.

```
Input → Adapter → Evidence Gate → Scoring engine (locked) → Profile → Twin compiler → Outputs
```

1. **Input** — quiz answer, writing sample upload, "guess your twin's pick,"
   personality game, party game (Quiplash-style), anything added later.
2. **Adapter** — converts whatever that input looks like into the one shape
   evidence always has: `{dimension, direction, strength}`. A quiz answer and a
   game answer are indistinguishable past this point.
3. **Evidence Gate** (`/core/evidence-gate`) — checks the source against
   `/core/content/evidence-sources.json`: is this source allowed to touch the profile at
   all (`feeds_profile`), and if so, capped at what max strength (`trust_tier`)?
   New sources default to `feeds_profile: false`. Nothing reaches scoring without
   passing this.
4. **Scoring engine** (`/core`) — unchanged, locked. Only gate-approved evidence
   ever reaches alpha/beta.
5. **Profile** — one computed record per user in Postgres, recalculated from the
   full evidence-event log. Never edited directly by any game or screen. A
   frozen profile stops accepting new evidence entirely.
6. **Twin compiler + outputs** — the profile feeds the twin's persona prompt
   (confidence-gated, hedged) and the results/"why" screens, which trace every
   trait back to the specific evidence events that produced it.

## Where things live

- **Profile** — one row per user, computed, never hand-edited. Lives in Postgres
  (Supabase), rebuilt from the evidence log whenever new approved evidence arrives.
- **Games** — each is just a screen/route. If it's registered in the gate as a
  scoring source, its outputs become evidence like anything else, capped per its
  tier. If it's not registered (the default), it's purely a game: its own score,
  its own table, zero contact with the profile.

## Trust tiers (current)

| Source | Touches profile? | Cap |
|---|---|---|
| Quiz (IPIP / DOSPERT / MSTAT-II / Need for Cognition / custom style items) | Yes | Full range (weak → very strong) |
| Writing sample (screenshot / export) | Yes | Capped at moderate |
| "Guess your twin's pick" | Yes | Can only reinforce a trait's existing direction, never introduce a new one |
| New personality games | No, until checked | Launch display-only; promote to a capped tier only once its answers correlate with the quiz-based score for the same trait |
| Party games (Quiplash-style) | No | Permanently display-only — social performance isn't trait signal |

Research check (Aug 2026): game-based personality measures do correlate with
traditional questionnaires, but only moderately and inconsistently (meta-analysis
across 18 studies, r ≈ .52, no standardized validation framework) — see
[Convergent Validity of Game-Based Assessment](https://journal.seriousgamessociety.org/index.php/IJSG/article/view/1028).
That's the basis for capping/opt-in-only on anything game-derived rather than
trusting it at full weight by default.

## Built-in protection beyond the gate

The alpha/beta math itself resists single-item swings: the more confidence a trait
already has, the less any one new answer — even a fully-trusted quiz item — can
move it. The gate controls *what's allowed in*; the math controls *how much any one
thing matters once it's in*.
