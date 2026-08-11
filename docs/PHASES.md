# Phases

Brain first → API → screens → validation → live → social input → Apple.
Build the brain (`/core`) before any screens — it's the real product; everything
else is a face on it.

| # | Phase | Status |
|---|---|---|
| 0 | Setup | ✅ done — folders, docs, hello-world web app |
| 1 | Dimensions & content sourcing (Big Five via IPIP, custom dims hand-written) | pending |
| 2 | Scoring engine ⭐ | pending |
| 3 | Question bank + delivery (Quick Start + sharpen batches, not one long quiz) | pending |
| 4 | Question picker + stop rule | pending |
| 4b | "Guess your twin's pick" mini-game | post-MVP |
| 5 | Twin compiler ⭐ | pending |
| 5b | Social signal extractor (screenshot upload, consent-gated) | post-MVP |
| 6 | API (twin chat via swappable provider adapter) | pending |
| 7 | Web quiz | pending |
| 8 | Web results + twin chat | pending |
| 9 | Feedback | pending |
| 10 | Validation + audit (lighter for MVP — IPIP items are pre-validated) | pending |
| 11 | Accounts + privacy (trimmed for MVP) | pending |
| 12 | Deploy | pending |
| 13 | iOS app | later |
| 14 | Multiplayer party games (Quiplash-style, builds on "Arena mode") | post-MVP |

Must-have path for the September credit window: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 12.

See `/TwinArchitect_Plan_v3.md` (delivered separately) for the full reasoning,
free-tier details, and "what you'll see" per phase.

## Anti-drift check
After Phases 2, 4, 5, and before launch: open a fresh Claude session, point it at
`/docs/CORE.md` plus the current `/core` files, and ask *"Does this still match the
locked core? List any drift."*
