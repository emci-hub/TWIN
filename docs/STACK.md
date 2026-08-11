# THE STACK — locked

Everything is TypeScript, except the iOS app (Swift) which comes later. One language
= fewer mistakes, more reuse.

| Part | Tool | Why |
|---|---|---|
| `/core` (the brain) | plain TypeScript + Vitest tests | no framework → portable + testable |
| `/api` | Node.js + Express | every AI knows it → consistent builds |
| `/web` | React + Vite + Tailwind CSS | standard, AI-friendly, reuses toward the app |
| Database | Postgres on Supabase | stores answers/profiles; free auth for later phases |
| Hosting | web → Vercel · API → Render · DB → Supabase | free tiers, no card required |
| Twin chat AI | one LLM provider API, called from `/api` only | keeps keys off the website |
| CI | GitHub Actions | free minutes; runs `npm test` + the `/core` validate script on every push |
| `/ios` (later) | SwiftUI, calling the same `/api` URLs | the app is just another client on the same API |

**The rule this locks in:** the website and the Apple app are both just *screens*
that call the same `/api`. The brain (`/core`) never changes when a new screen is
added.

## Free-tier watch-outs (checked August 2026)

- **Render**: free web services spin down after 15 min idle (~1 min cold start on
  the next request). 750 free instance-hours/month.
- **Supabase**: free projects pause after 7 days of inactivity — needs a manual
  un-pause or a trivial weekly ping if the project goes quiet.
- **GitHub Actions**: 2,000 free CI minutes/month — plenty for this project.
