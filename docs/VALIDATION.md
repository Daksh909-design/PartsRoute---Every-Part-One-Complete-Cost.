# Validation

Application checks and external integration qualification are reported separately. Original responses remain in [evidence](evidence/README.md). Earlier development notes are available in Git history.

## Render service checks — 24 October 2026

- Main site https://partsroute.onrender.com/ and `/api/health` returned HTTP 200.
- Authenticated `/api/integration/status` returned HTTP 200 and `ready: true`: provider keys configured, database connected/migrated, recent worker heartbeat.
- The same readiness endpoint without authentication returned HTTP 401.
- GitHub Pages-origin preflight returned HTTP 403; Pages links to the hosted app instead of calling it cross-origin.
- No new quote or provider call was made in these checks. The provider accounts, complete basket flow and database/worker hosting locations were not independently verified.

## Local checks — 24 October 2026

- 112 unit/fixture tests in 17 files passed, including timeout/network-error and repository-link regressions.
- Standalone TypeScript check, production Next.js build and the separate Pages build passed.
- Local documentation links passed in all 10 Markdown files after consolidating setup and deployment notes.
- All 26 original evidence hashes matched. Tracked files and the generated public entry files contained none of the configured private provider keys or team token.
- These checks did not call providers or rerun PostgreSQL integration checks. Those results are listed separately below.

The public sample has no configured backend origin and shows live setup instructions.

## Earlier recorded checks — 21 October 2026

| Check                                          | Recorded result                                     |
| ---------------------------------------------- | --------------------------------------------------- |
| Unit/fixture tests                             | 108 passed in 16 files                              |
| Dedicated PostgreSQL integration checks        | 13 passed                                           |
| Production Next.js build, including TypeScript | Passed                                              |
| Separate Pages build                           | Passed                                              |
| Public HTTP smoke checks                       | 9 passed through the then-running temporary preview |
| Stored response integrity                      | 26 evidence hashes matched                          |

These are dated results, not a claim that today's public backend is running.

## Live APIs

TinyFish Fetch, TinyFish Agent and Gemini structured extraction were exercised with real credentials. The latest fresh quote used public HTTP and returned **partial** after **26.647 seconds**: two offers, no complete verified plan, and no delivered total. The strict complete-result benchmark failed. [Original report](evidence/public-budgeted-collection-2026-10-21.json).

The main frontend now runs on Render; Pages remains a static sample. The earlier development tunnel is no longer used.

## Still unverified

- A complete live basket with exact pincode shipping and manual arithmetic review.
- Fully qualified retailer/product coverage and a labelled extraction evaluation.
- Full cloud deployment configuration, Docker execution and real process-kill recovery beyond SQL lease tests.
- A successful fresh verified quote within the requested latency target.

## Reproduce

Run `pnpm test`, `pnpm typecheck`, `pnpm build` and `pnpm build:pages`. PostgreSQL checks require a dedicated disposable `TEST_DATABASE_URL`; provider checks are opt-in and consume quota. See the README and deployment guide before running them.
