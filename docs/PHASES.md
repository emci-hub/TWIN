# Phases

Brain first → API → screens → validation → live → social input → Apple.
Build the brain (`/core`) before any screens — it's the real product; everything
else is a face on it.

| # | Phase | Status |
|---|---|---|
| 0 | Setup | ✅ done — folders, docs, hello-world web app |
| 1 | Dimensions & weights | pending |
| 2 | Scoring engine ⭐ | pending |
| 3 | Question bank | pending |
| 4 | Question picker + stop rule | pending |
| 5 | Twin compiler ⭐ | pending |
| 5b | Social signal extractor (consent-gated) | post-MVP |
| 6 | API | pending |
| 7 | Web quiz | pending |
| 8 | Web results + twin chat | pending |
| 9 | Feedback | pending |
| 10 | Validation + audit (light for MVP) | pending |
| 11 | Accounts + privacy (trimmed for MVP) | pending |
| 12 | Deploy | pending |
| 13 | iOS app | later |

See `/TwinArchitect_Revised_Plan.md` (delivered separately) for the full reasoning,
free-tier details, and "what you'll see" per phase.

## Anti-drift check
After Phases 2, 4, 5, and before launch: open a fresh Claude session, point it at
`/docs/CORE.md` plus the current `/core` files, and ask *"Does this still match the
locked core? List any drift."*
