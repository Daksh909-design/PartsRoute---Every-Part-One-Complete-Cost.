# Validation

This file separates application tests from external integration qualification. Historical execution logs are retained in [the archive](archive/VALIDATION-2026-10-21.md); original responses remain in [evidence](evidence/README.md).

## Latest recorded checks — 21 October 2026
## Repository cleanup checks — 24 October 2026

- 112 unit/fixture tests in 17 files passed, including timeout/network-error and repository-link regressions.
- Standalone TypeScript check, production Next.js build and the separate Pages build passed.
- Local documentation links passed in all 19 Markdown files.
- All 26 original evidence hashes matched. Tracked files and the generated public entry files contained none of the configured private provider keys or team token.
- No new provider calls or PostgreSQL integration checks were run for this cleanup. Their earlier results below remain dated observations.

The public sample is built without the expired temporary backend origin. Live setup remains available; the server implementation was not removed.

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

The public frontend is a static sample. The earlier tunnel depended on the local computer and is no longer a deployment guarantee. No permanent backend has been provisioned.

## Still unverified

- A complete live basket with exact pincode shipping and manual arithmetic review.
- Fully qualified retailer/product coverage and a labelled extraction evaluation.
- Independent cloud deployment, Docker execution and real process-kill recovery beyond SQL lease tests.
- A successful fresh verified quote within the requested latency target.

## Reproduce

Run `pnpm test`, `pnpm typecheck`, `pnpm build` and `pnpm build:pages`. PostgreSQL checks require a dedicated disposable `TEST_DATABASE_URL`; provider checks are opt-in and consume quota. See the README and deployment guide before running them.
