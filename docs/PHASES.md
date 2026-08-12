# Phases

Brain first → API → screens → live. Build the brain (`/core`) before any
screens — it's the real product; everything else is a face on it.

## Main path (target: before the September credit window closes)

| # | Phase | Status |
|---|---|---|
| 0 | Setup | ✅ done — folders, docs, hello-world web app |
| 1 | Dimensions & content (Big Five via IPIP, risk/ambiguity/analytical via DOSPERT/MSTAT-II/Need-for-Cognition, style dims hand-written) | ✅ done |
| 2 | Scoring engine ⭐ + Evidence Gate (see `docs/ARCHITECTURE.md`) | ✅ done |
| 3 | Question delivery (Quick Start + sharpen batches) | ✅ done |
| 4 | Twin compiler ⭐ | ✅ done |
| 5 | API (twin chat via swappable provider adapter: Anthropic / OpenRouter) | pending |
| 6 | Web app (ports `docs/mockup.html` — quiz, results, "why", twin chat, Home) | pending |
| 7 | Deploy | pending |

Copy-paste prompts + a test for each: `docs/BUILD.md`.

## Later / post-MVP

| Phase | What |
|---|---|
| Feedback | "does this feel like you" per-trait rating |
| Guess-your-twin mini-game | prediction + calibration game |
| Social signal extractor | screenshot/writing-sample upload, consent-gated |
| Validation + audit | lighter than originally planned — IPIP/DOSPERT/etc. are pre-validated |
| Accounts + privacy | full account claiming, export/delete |
| Multiplayer party games | Quiplash-style, builds on "Arena mode," Supabase Realtime |
| iOS app | SwiftUI, same API, no scoring logic in Swift |

See `docs/BUILD.md` for the phase-by-phase build prompts, `docs/ARCHITECTURE.md`
for the evidence-gate flow and trust tiers, and `docs/mockup.html` for a
clickable visual mockup of every screen (both themes).

## Anti-drift check
After Phases 2, 4, and before launch: open a fresh Claude session, point it at
`docs/CORE.md` + `docs/ARCHITECTURE.md` plus the current `/core` files, and ask
*"Does this still match the locked core? List any drift."*
