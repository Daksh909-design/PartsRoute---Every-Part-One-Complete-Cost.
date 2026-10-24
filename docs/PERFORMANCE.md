# Fresh quote performance

Original performance target: **a complete, newly collected, verified purchasing plan within 10 seconds**. The user subsequently prioritized delivery and removed ten seconds as a release blocker. This remains an optional strict benchmark: queue acknowledgement, item-only coverage, shipping estimates, synthetic calculations and saved observations do not pass it.

## Local measurement — 22 October 2026

The real configured providers, PostgreSQL worker and protected HTTP API processed quote `56233eb4-3367-4dfb-b9c9-50308307cb8c`. The input was the unchanged three-line sample BOM, pincode 560001, `mode=live`, `refresh=true`.

| Measured event                                                                         | Elapsed from HTTP submission |
| -------------------------------------------------------------------------------------- | ---------------------------: |
| All three product lines eligible, with known item prices/tax and published order rules |                     5,313 ms |
| Exact guest-cart shipping estimate displayed                                           |                     7,464 ms |
| Strict complete-quote deadline                                                         | 10,007 ms observed; **FAIL** |
| Server terminal partial status                                                         |                    26,320 ms |

The estimate was INR 49.00, with shipping tax unknown. No delivered recommendation was emitted. Robu's batch returned four per-URL timeout errors. A TinyFish basket run was started and persisted; it was still pending at the collection deadline. The full report is `artifacts/live-budget.json` in the local test workspace; it contains no API keys. These are single-run observations, not p95 performance or an uptime guarantee.

The earlier local run on this revision already reached 3/3 eligible product lines, but waited for policy/model work and the second retailer until the shared window expired. The original baseline had 0/3 purchase-ready lines and no verified shipping.

## Changes affecting latency

- Read explicit listing facts deterministically; call the model only for unresolved facts or published quantity pricing.
- Read published SKU-specific quantity rules from Shopify Ajax and require agreement with listing prices.
- Retrieve and parse the retailer-linked datasheet in parallel. Actual pin-count and voltage extraction took about 1.5 seconds, avoiding an image-model probe that took about 7.4 seconds.
- Capture shipping policies as evidence without calling a model for a national rule that cannot establish basket/pincode applicability.
- Start a complete retailer's basket verification while another retailer is still collecting.
- Request an exact guest-cart shipping estimate while preserving unknown tax and final-total status.
- Bound per-URL collection time so one slow page does not discard successful batch entries. Expiry still produces a partial result, not a speed pass.
- Omit optional model-written explanations from the critical path; use deterministic facts and arithmetic.

## Reproduce the strict check

Start the local database, production web server and worker with private credentials, then:

```sh
pnpm benchmark:live-budget --follow
```

The script submits to the ordinary protected HTTP endpoint with a new idempotency key, forces refresh, polls the same job, and fails unless terminal status is complete with a verified full-coverage plan inside 10,000 ms. Follow-up diagnostics never change the deadline verdict. It separately records the first complete product coverage and the first shipping estimate.

`--local-submit` is an explicit operator diagnostic using the same database queue and HTTP polling; reports label that submission path. Do not use it to describe an ordinary browser benchmark.

`pnpm benchmark:http` measures only the separate saved-data endpoint. Its earlier millisecond timings do not meet the fresh-quote requirement.

## External blockers

Robu collection currently times out or encounters retailer blocking. Robocraze's public estimator returns rates but no shipping-tax inclusion or final checkout total; automated checkout access returned HTTP 403 during qualification. The app neither bypasses that block nor assumes shipping tax is zero. A genuine complete-quote pass still requires resolving these facts and repeating the same strict benchmark.

## Tax-aware API qualification

The retailer's publicly published Shopify Storefront endpoint was also tested with one isolated guest cart, the unchanged BOM and the same destination. It returned INR 297 in about 2.4 seconds, but explicitly reported `totalAmountEstimated=true`, `totalTaxAmount=null`, and `totalTaxAmountEstimated=true`. The supplied country/state/pincode were retained correctly. This was a research probe, not a production speed pass or a verified total.

Shopify's [tax deprecation notice](https://shopify.dev/changelog/posts/tax-and-duties-are-deprecated-in-storefront-cart-api) states that tax and duties are finalized at checkout. The retailer's shipping policy and FAQ did not provide an explicit shipping-tax inclusion rule. This confirms that the missing tax fact cannot be supplied by switching to a faster model. The production app continues to keep the complete delivered total unknown.
