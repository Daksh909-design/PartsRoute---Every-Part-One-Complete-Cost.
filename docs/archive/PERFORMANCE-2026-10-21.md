# Response time and live verification

**Current target: thirty seconds.** The latest bounded-window operator test returned fresh partial results over public HTTP in 26.46 seconds. It did not return a verified delivered plan; the strict test still failed. The previous public run without the shared window took 54 seconds. See [current implementation and measurements](../COLLECTOR-UPDATE.md). The seven- and ten-second measurements below are historical. The interface's old ten-second deadline warning has been removed as requested; timers and unknown costs remain visible.

PartsRoute separates two operations:

| Operation                      | What happens                                                                          | Timing commitment                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Collect & compare fresh offers | New TinyFish Fetch, new Gemini extraction and bounded TinyFish Agent checks           | Primary action. Must be measured through a complete verified result; seven-second requirement has not passed |
| View saved observations        | PostgreSQL reads, current specification matching and deterministic basket calculation | Explicit cache-only view; its timings do not qualify                                                         |

`POST /api/comparisons` is protected and read-only. It never creates a job or calls a provider, including on a cache miss. A miss asks the user to refresh explicitly. The browser aborts API requests after six seconds and shows an actionable error. This timeout is not a guarantee of a successful result.

Every cached comparison shows the oldest product observation and missing pages. The default product cache lifetime is 15 minutes, configurable up to one hour; this local validation used a one-hour window after the final restart. Expired observations, obsolete normalizations and synthetic fixtures are excluded. A newer changed or failed source is not hidden behind an older success. Specification changes are re-matched, quantities are recalculated, and shipping is usable only for the exact basket and pincode. Unknown ordering constraints and shipping remain unknown.

One batched Fetch request retrieves up to five product pages and one policy per retailer. At most two retailer batches run concurrently. Fetch has a 30-second per-URL limit and a 65-second HTTP timeout. The Gemini default is `gemini-3.5-flash-lite`, with minimal thinking, no artificial 12-second interval, a 30-second per-attempt timeout, one retry for 502/503/504 and a per-job outage gate. There is no paid fallback. Successful structured extraction is cached by source content, requested model, provider model and prompt version. Grounding has a separate version. Sources retain their original observation times.

## Measurements on 20 October 2026

The first ten local HTTP comparisons completed in **13.47–386.53 ms**, with a **19.41 ms** median. A final ten-request batch after the provenance fixes completed in **10.79–301.95 ms**, median **17.92 ms**, with zero new jobs or provider-usage records. A browser comparison displayed **0.15 s**. These were real cached retailer observations with **zero purchase-ready lines** because ordering/specification/shipping gaps remain. Fast partial data does not prove a complete live quote.

Real Flash-Lite extraction calls took **3.0–17.2 seconds**, and another call timed out. A saved-page recheck took **89.8 seconds** overall. These observations rule out claiming a guaranteed seven-second cold collection. No public-network latency or hosted-backend benchmark has passed.

To reproduce, warm observations once using the live worker or `pnpm validate:live 560001` with the worker stopped, then run `pnpm benchmark:http`. It makes ten read-only comparisons, writes `artifacts/http-latency.json`, and fails if any response exceeds seven seconds. It refuses to create new collection jobs on a cache miss. Keep these measurements separate from the synthetic calculator, which requires no APIs.

The mentor explicitly requires every **new, fully verified live basket** within seven seconds. The current external workflow does **not** meet that requirement. Pre-collected evidence does not qualify.

## Freshness correction

The original primary button read cached observations. It now starts `POST /api/quotes`, which forces refresh=true even if an older client sends false. New quote jobs bypass both PostgreSQL page reuse and content-based AI reuse; TinyFish receives ttl=0 and the AI provider is called again. Retries and refresh recovery still reuse the same job's saved work to avoid duplicate provider charges. A separate View saved observations button is the only UI cache path. Queue acceptance is no longer displayed as the fresh output duration. The full timer continues until terminal status, and the UI flags a missed seven-second deadline. Worker pickup delay was reduced from two seconds to 250 ms. TinyFish response records now include actual elapsed request time; Evidence also displays provider request IDs and response-record timestamps.

`pnpm benchmark:live-budget --follow` retains the seven-second verdict and optionally follows the same saved job to terminal status, recording provider call IDs/timings without creating another job. It consumes provider quota once; later completion cannot turn a failed deadline into a pass.

The corrected fresh endpoint was tested through the public tunnel on 20 October 2026: quote `b7379c68-e973-44b0-a86c-3999a4adcbaf` was still processing at 7007.5 ms and later finished partial, after about 152 seconds on the server. Two new TinyFish Fetch responses took **15,771 ms** and **17,802 ms**. Four new Gemini responses took **24,848–29,958 ms**, with actual token usage recorded; a subsequent extraction timed out. Four offers were extracted, but no complete verified plan qualified. Thus even Fetch alone exceeded the requirement in this run. This is a failed performance result, not a seven-second workaround. [Sanitised full report](../evidence/fresh-cache-bypass-2026-10-20.json). Provider request IDs were not returned in these responses and remain null.

After this check, batch persistence was also corrected: every fetched URL is saved before model work starts, preserving response-time provenance and preventing model failures from leaving collected pages unsaved. Its regression path was tested with mocked providers; no additional paid live run was made for this persistence-only change.

## Executed strict fresh-quote check

`pnpm benchmark:live-budget` was executed on 20 October 2026 against the real local application with refresh=true. Quote `95324b58-c54e-478b-9a0c-181b2012252f` was still processing when the 7000 ms deadline elapsed (reported wall time 7002.51 ms). No complete verified plan had returned, so the check **failed**. The saved job continued; no automatic duplicate was created. Evidence: [strict budget report](../evidence/fresh-seven-second-budget-2026-10-20.json). Connecting the public preview does not change this result.
