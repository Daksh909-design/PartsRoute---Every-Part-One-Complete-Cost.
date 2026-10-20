# Collector corrections and timing measurements

The current target is **thirty seconds**, following the owner's latest request. The earlier seven- and ten-second checks below remain historical evidence. Removing the visible ten-second warning does not alter their results or make an incomplete quote verified.

## Thirty-second revision

The ten-second warning was removed from the interface as requested. Elapsed duration, collection progress, conditional prices and shipping uncertainty remain visible.

Recognised product templates now use a smaller schema-constrained AI request for actual model, required specifications, explicit ordering rules and published bulk tiers. Directly read base prices, stock, pack quantities and tax inclusion are preserved. Exact excerpts still pass the same grounding and matching checks; unfamiliar templates use the complete extractor. Unlike the rejected batch experiment below, this runs per product and copies excerpts rather than generated line numbers. The provider interface and content cache support both paths, and fresh requests bypass both caches.

Gemini concurrency now defaults to eight, bounded between one and eight, so the six product and two policy requests can proceed without a second queue wave. This changes concurrency, not calls per quote. Published numeric stock limits are preserved by the template reader; normalization version v5 invalidates older normalized offers. Model usage records identify the extraction operation.

The strict benchmark defaults to 30000 ms. `passed` still requires a complete verified delivered plan. Separate `collectionFinished` and `collectionWithinBudget` fields report whether collection terminated, including partial results; neither field qualifies an incomplete purchasing plan. The first public validation attempt was refused by the existing hourly team quota and created no job. No provider-speed claim follows from that refusal. A fresh measurement will be recorded separately.

## Implemented changes

- Product extraction previously ran serially in both collector and Gemini adapter. Independent products now start together, with at most four Gemini calls per quote. GEMINI_CONCURRENCY accepts 1–4 and defaults to 4. Configured start spacing still applies; outages do not start a paid fallback.
- Identical active input from the same team recovers its running job after browser reload, rather than queueing a duplicate. Migration **006_active_request_recovery.sql** adds the actor hash and durable request aliases. An alias remains idempotent after completion. A new deliberate request after completion starts fresh work.
- Browser checks share a 45-second polling window instead of independent four-minute waits. Submission HTTP timeout is 20 seconds and status reads five seconds. This does not cancel remote runs or impose a guaranteed full-quote deadline. Existing run IDs remain recoverable.
- A narrow reader of the observed retailer templates publishes explicit listing prices, tax inclusion, stock and package contents before AI work. Exact excerpts still pass the grounding validator. Offers identify `extractionMethod=retailer-parser`; no unpublished ordering rule, physical pin count or shipping charge is inferred. AI extraction still runs. Pending source reads are reused only within that same job when it resumes.
- The UI shows conditional item-price arithmetic and priced-line coverage when a complete optimizer plan is unavailable. Missing components, minimums, specifications, tax and shipping are explicit. An estimate is never a recommendation or a verified delivered total.
- Protected saved quotes can be reopened with `?quote=<UUID>`. The link contains no token or provider key and needs team authentication. Reopening does not start another provider job.

## Latest investigation and corrections

Product and shipping-policy extraction now run independently under the same bounded model pool. Previously each retailer's policy waited for its products to finish. Robu's policy URL was corrected to `/shipping-and-refund-policy/`; a new TinyFish response confirmed the actual policy loads. It describes couriers and returns but publishes no applicable fee, so its shipping amount remains unknown.

Ordering evidence must explicitly label a minimum/MOQ or multiple/step. A loyalty reward such as "1 Robu Points" or a package quantity can no longer supply an ordering minimum. Conflicting values for the same required specification reject a product regardless of which value appears first. Normalization version `grounding-v4` prevents old normalized observations being treated as current; historical originals are preserved.

A separate compact extraction experiment asked for specifications and ordering rules for three saved product pages per model request. At a ten-second timeout both requests failed. With the normal allowance, responses took 19.722 and 22.751 seconds. One contained an out-of-range evidence reference; another mapped facts to unrelated lines. This experiment is **not used by live quotes**. Its schema/benchmark stay under `scripts/experiments` and `scripts/benchmark-enrichment.ts` for reproducibility. It consumes model quota, uses saved pages, and cannot establish fresh quote latency. [Recorded experiment](evidence/compact-enrichment-experiment-2026-10-20.json).

The latest new public quote, `14c87a8c-30ae-4565-9e0d-78cc38208cf4`, was still processing at 10014.64 ms. It finished partial after **46.189 seconds** on the server. Both fresh TinyFish Fetch batches succeeded (3.154 and 15.270 seconds), as did all eight Gemini extractions (8.862–22.675 seconds). Six offers were saved, with zero purchase-ready lines and no verified delivered total. The conditional listed-item estimate remains ₹248. This is another **failed** ten-second result, not evidence of a guaranteed improvement over earlier variable provider timings. [Latest full benchmark](evidence/parallel-policy-ten-second-budget-2026-10-20.json).

96 unit/fixture tests, 13 real PostgreSQL checks, TypeScript, production Next.js build, separate Pages build and nine public HTTP checks passed after these corrections. Shipping qualification and the full fresh timing target remain unfinished.

## Deployment

Run migrations through 006 before deploying the web application and worker from the same revision. The migration has been applied to the local live database and the dedicated test database. Keep provider credentials server-side. The connected Cloudflare preview remains temporary and depends on the team computer.

## Executed checks

The parallel-path public test created quote `083b318a-fe1f-4361-985d-92d00c54b823`. It was processing at **10007.82 ms** and finished partial after **68.842 seconds** on the server. TinyFish took **22.091 and 38.457 seconds**; four initiated Gemini calls timed out. There was no verified total. This was a **failed** ten-second result. [Report](evidence/parallel-ten-second-budget-2026-10-20.json).

The later source reader was checked against the saved real TinyFish pages without new provider calls. It recovered five listing prices, while product/order gaps and shipping remained unknown. That saved-page audit does not prove live latency. [Audit](evidence/source-price-reader-2026-10-20.json).

The subsequent real public run with the reader enabled collected **six offers** and displayed a **₹248 conditional item estimate** for all three requested component lines (2 × ₹75 HC-SR04, 1 × ₹59 DHT11 module, 1 × ₹39 breadboard). Both new Fetch calls ran: Robocraze took 3.303 seconds and Robu 22.472 seconds. Three Gemini extractions succeeded; other calls timed out. The server finished partial after **52.190 seconds**, with no verified complete plan. The strict ten-second check therefore **failed again**. This demonstrates live price recovery during AI outages, not a complete under-ten-second purchase. [Live reader report](evidence/live-reader-ten-second-budget-2026-10-20.json).

The default strict benchmark now uses **10000 ms**, writes `artifacts/live-budget.json`, and optionally follows the same job without changing the failed deadline verdict: `pnpm benchmark:live-budget --follow`. Set LIVE_BUDGET_MS=7000 to reproduce the earlier threshold. Partial prices, errors, cached data and queue acknowledgements cannot pass.

Thirteen real PostgreSQL checks passed, including active-request recovery, durable aliases, new work after completion, migrations, claiming, leases, observation persistence and timestamps. Provider/price-reader/concurrency unit tests are labelled fixtures and do not establish a successful live delivered basket. Final live reader results and browser verification are recorded in VALIDATION.md after deployment.
