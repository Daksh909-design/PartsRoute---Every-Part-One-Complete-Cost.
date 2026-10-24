# Collection performance

## Latest recorded live measurement

On 21 October 2026 a fresh quote submitted through public HTTP returned **partial** after **26.647 seconds**, with two offers and no complete verified purchasing plan. One retailer batch timed out; another product was blocked. The strict 30-second complete-result check failed. [Original report](evidence/public-budgeted-collection-2026-10-21.json).

Earlier 7- and 10-second checks also failed. These results do not establish a service-level guarantee. Original reports remain in the evidence directory.

## Current execution

Two retailer Fetch batches run concurrently. Supported product templates preserve explicit prices and stock while AI extracts specifications and ordering details. Gemini concurrency defaults to eight. Fetch, extraction, shortlisted Agent checks and explanation share a 26-second worker processing window. Each request uses the remaining allowance; work that cannot finish returns unknown or partial fields.

This window bounds worker waiting, not queue delay or complete verified output. Aborting a request does not guarantee that a remote Agent run has stopped or incurred no charge. Saved run IDs are used for recovery.

The UI shows elapsed time, priced-line coverage and missing costs. It has no missed-deadline banner. An item estimate is not a delivered total.

## Fresh versus saved

**Collect & compare fresh offers** calls `POST /api/quotes`, forces refresh and new TinyFish/AI collection, and bypasses cross-job caches. Resuming the same job reuses its completed work to avoid duplicate charges.

**View saved observations** calls `POST /api/comparisons`. It performs no provider calls and shows source ages. Its fast timings are not live collection performance.

## Reproduce

Run `LIVE_BUDGET_MS=30000 pnpm benchmark:live-budget --follow` against a configured stack. The benchmark records success only for a complete verified plan, not a queued job, cached response or partial estimate. It consumes provider quota. `pnpm benchmark:http` measures the separate saved-data path.

Raw failed reports remain under [evidence](evidence/README.md). An unsuccessful compact-extraction experiment is retained as data only; its unused implementation was removed.
