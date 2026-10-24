# Validation — local revision, 22 October 2026

## Checks exercised

| Check                                  | Result                            | What it establishes                                                                                                                             |
| -------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/contract regressions              | 135 tests across 19 files passed  | Arithmetic, grounding, matching, deadlines, mocked provider contracts, API validation and pipeline scheduling                                   |
| TypeScript                             | Passed                            | Static types for the application and scripts                                                                                                    |
| Real PostgreSQL                        | 16 checks passed                  | Migrations, idempotency, configurable quota, concurrent claiming, lease takeover, stale-write fencing, persisted evidence and heartbeat queries |
| Production Next.js build               | Passed                            | Server and frontend production compilation                                                                                                      |
| Production HTTP smoke                  | 9 checks passed                   | Homepage, health, synthetic arithmetic, input validation, authentication, origins and readiness restrictions                                    |
| Browser checks                         | Passed locally                    | Current UI observations are recorded below                                                                                                      |
| Static Pages build                     | Passed                            | Separate static frontend packaging                                                                                                              |
| Strict new live quote under 10 seconds | **Failed; optimization deferred** | The whole verified delivered quote was not available in this window; the user removed timing as a release blocker                               |

Mocked providers do not establish live correctness. SQL stubs do not establish PostgreSQL behavior. Readiness does not establish provider access. No CI run on GitHub or hosted deployment is claimed for these local changes.

## Meaningful regressions added

- Shipping keys change with price, tax, URL, pack size and composition.
- Voltage 5 V cannot inherit 12.5 V, an AC supply, or one endpoint of a published range; model suffixes remain significant.
- Stock counts do not establish package contents. Missing order rules remain unknown; offset HTML steps cannot be represented as absolute pack multiples.
- Published cheaper quantity tiers are considered while respecting actual stock.
- A stale worker cannot save result, normalized evidence, observations or completion after its lease changes owner.
- Provider waits and in-flight work respect deadline/cancellation signals.
- Complete source facts bypass the model. A complete retailer basket starts checking while the other retailer's fetch is still blocked.
- Merchant API SKU and price must agree with the listing. A nonempty isolated guest cart is left unchanged, and changed cart composition/price prevents a shipping estimate.
- Shipping estimates remain tax-unknown. Exact matching verified shipping takes precedence over an earlier estimate.
- Displaying the combined item/shipping estimate preserves unknown tax and verification status; absent costs or unavailable delivery do not produce a total.
- Real PostgreSQL checks confirm the hourly limit supplies a retry delay and `LIVE_QUOTES_PER_HOUR=0` permits local testing.
- Datasheet extraction uses explicit physical-header descriptions, rejects model suffix mismatches and ignores signal-only pin counts.

## Browser observations

The production UI calculated INR 370 after raising the first sample quantity to three, and INR 325 after removing the breadboard. Adding/restoring a component works, duplicate selections remain disabled, and invalid pincodes receive native form validation. Reset restores INR 295. An invalid team token produced an authorization error; the configured token showed database and worker readiness.

A desktop viewport at 1280 pixels had matching client/scroll widths with no horizontal overflow. The 390-pixel mobile breakpoint had matching client/scroll widths and no page overflow. Saved-quote restoration and retry were verified through the UI; its completed browser result was reused. The evidence view displayed API originals, datasheet records, the completed run ID and usage. Delivery includes current desktop, mobile and evidence captures.

## Real provider measurement

Quote `56233eb4-3367-4dfb-b9c9-50308307cb8c` used the unchanged three-line BOM with refresh enabled through the protected HTTP endpoint and normal worker. All three lines became eligible by 5.313 seconds; the INR 49 shipping estimate appeared by 7.464 seconds. Shipping tax remained unknown. The strict ten-second verdict failed; the server ended partial at 26.320 seconds. Original sources, parsed datasheet text, sanitized API data and the pending Agent run were retained.

See [performance](PERFORMANCE.md) for exact scope and reproduction. API keys, team tokens, database passwords and guest-cart cookies are excluded from public evidence and source packages.
