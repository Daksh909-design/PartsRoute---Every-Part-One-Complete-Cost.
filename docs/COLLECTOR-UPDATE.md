# Collector implementation

Fresh quotes submit new TinyFish requests with `ttl=0`, followed by new AI extraction. Recovery reuses the same job's completed work; saved comparisons are a different endpoint.

- Fetch batches run concurrently for the two retailers.
- Recognised templates preserve explicit commercial facts before AI enrichment; unfamiliar templates use full extraction.
- Required model/specification differences, labelled ordering constraints and bulk tiers use schema-constrained extraction and source excerpts.
- Conflicting specifications are rejected. Whole breadboard point counts are distinguished from component tie-point rows.
- Gemini concurrency defaults to eight. All collection stages share the remaining 26-second processing window.
- Expiry retains partial observations and unknown costs. It does not verify incomplete baskets or guarantee cancellation of remote Agent runs.

Apply migrations through 006 and deploy web and worker from the same revision. `QUOTE_COLLECTION_BUDGET_MS` supports 1000–26000 ms. Current grounding/extraction versions are defined in source; obsolete observations do not qualify for saved comparisons.

See [performance](PERFORMANCE.md) for the latest measured result and [validation](VALIDATION.md) for checks and gaps. The [historical collector log](archive/COLLECTOR-UPDATE-2026-10-21.md) and original evidence retain unsuccessful attempts. The unused compact extraction experiment was removed from executable scripts; its recorded result remains available.
