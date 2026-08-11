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
| Twin chat AI | swappable provider adapter in `/api` (`anthropic` default, `openrouter` free-tier fallback) | keeps keys off the website; not locked to one AI |
| Question content | [IPIP](https://ipip.ori.org/) (public domain) for the Big Five; hand-written only for the 5-7 style/behavior dims IPIP doesn't cover | validated research instead of inventing items from scratch |
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
- **OpenRouter free tier**: 20+ free models, ~20 req/min, no card/expiry (checked
  August 2026) — good fallback once Claude API credit runs out.

## Twin chat provider adapter (Phase 6)

`/api` calls one function, `generateTwinReply(profile, message)`, with two
implementations behind an env var (`LLM_PROVIDER=anthropic|openrouter`). `/core` and
`/web` never know which one is active. Lets you use a Claude API key while credit
lasts, then flip one env var to a free tier — no app code changes.
