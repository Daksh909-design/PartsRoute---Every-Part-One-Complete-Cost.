# Acceptance status

Local work starts from `96bd214`. Hosting stays local; paid hosting is not authorized. The frontend, backend and local launch package are delivered with the live limitations below. The user prioritized finishing the local product over further work on the ten-second target.

- [x] Grounding regressions cover numeric/specification/model boundaries and source price/tax evidence.
- [x] Shipping observations bind to the exact commercial basket, including prices and tax treatment.
- [x] Worker ownership is fenced by owner, attempt and unexpired lease; stale writes are rejected and local requests receive cancellation.
- [x] Provider waits use the shared deadline/cancellation signal. Remote Agent work may outlive a local request and retains a recoverable ID.
- [x] Published price tiers and quantity/stock bounds are considered without defaulting absent ordering rules.
- [x] Live search accepts arbitrary component listings from the integrated retailers, with no three-line limit; sample fixtures remain clearly labeled.
- [x] PostgreSQL, web and worker start with the documented local launcher.
- [x] Unit, real PostgreSQL, HTTP, type and production/static build checks have passed locally.
- [x] CI workflow is included; local checks below are independent of any GitHub workflow result.
- [x] Demo documentation separates synthetic, saved, estimated and verified data.
- [x] Final desktop/mobile and retained-evidence views verified and captured. Packaging is recorded with the delivery manifest.
- [x] Items plus shipping estimates are shown with explicit missing-tax qualifications and never promoted to verified totals.
- [x] Hourly quota is disabled for this prepared local testing token; the configurable default remains six new quotes per rolling hour.
- [ ] Two retailers reliably return qualifying live observations.
- [ ] Product, shipping and tax verification produce a complete delivered total within ten seconds.

## Measured limitations

The original ten-second target meant **the full delivered total, with product/shipping/tax verification finished**. The 5.313-second product coverage and 7.464-second shipping estimate do not pass. The user subsequently removed this timing target as a release blocker. The strict benchmark remains available and its historical result is unchanged.

The last measured fresh job ended partial after 26.320 seconds. Its Agent result later claimed a matching basket while showing INR 209 rather than the expected INR 248 subtotal. The validator rejected it. Same-job recovery reuses that run and retains the supported INR 49 estimator separately.

A separate official Storefront GraphQL qualification returned INR 297 in about 2.4 seconds, but `totalAmountEstimated=true`, `totalTaxAmount=null` and `totalTaxAmountEstimated=true`. Shopify documents that tax is finalized at checkout. This experiment is not integrated as a verified-total path. Retailer checkout returned HTTP 403 to direct automation, and published policy/FAQ material did not establish shipping-tax inclusion. No address, tax rate or final charge was invented.

An authoritative retailer quote/tax source or a qualified checkout integration is still required for a fully verified live delivered total. The app exposes this limitation through estimated/partial states. Docker execution, paid/public hosting and human accuracy evaluation are not claimed.
