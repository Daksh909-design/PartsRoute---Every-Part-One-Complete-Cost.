# Response time and the seven-second requirement

PartsRoute separates two operations:

| Operation                   | What happens                                                                          | Timing commitment                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Compare latest observations | PostgreSQL reads, current specification matching and deterministic basket calculation | Target under seven seconds with a warm server and usable cache; measured separately below |
| Refresh from retailers      | TinyFish Fetch, Gemini extraction and bounded TinyFish Agent checks                   | Background work. No seven-second completion guarantee                                     |

`POST /api/comparisons` is protected and read-only. It never creates a job or calls a provider, including on a cache miss. A miss asks the user to refresh explicitly. The browser aborts API requests after six seconds and shows an actionable error. This timeout is not a guarantee of a successful result.

Every cached comparison shows the oldest product observation and missing pages. The default product cache lifetime is 15 minutes, configurable up to one hour; this local validation used a one-hour window after the final restart. Expired observations, obsolete normalizations and synthetic fixtures are excluded. A newer changed or failed source is not hidden behind an older success. Specification changes are re-matched, quantities are recalculated, and shipping is usable only for the exact basket and pincode. Unknown ordering constraints and shipping remain unknown.

One batched Fetch request retrieves up to five product pages and one policy per retailer. At most two retailer batches run concurrently. Fetch has a 30-second per-URL limit and a 65-second HTTP timeout. The Gemini default is `gemini-3.5-flash-lite`, with minimal thinking, no artificial 12-second interval, a 30-second per-attempt timeout, one retry for 502/503/504 and a per-job outage gate. There is no paid fallback. Successful structured extraction is cached by source content, requested model, provider model and prompt version. Grounding has a separate version. Sources retain their original observation times.

## Measurements on 20 October 2026

The first ten local HTTP comparisons completed in **13.47–386.53 ms**, with a **19.41 ms** median. A final ten-request batch after the provenance fixes completed in **10.79–301.95 ms**, median **17.92 ms**, with zero new jobs or provider-usage records. A browser comparison displayed **0.15 s**. These were real cached retailer observations with **zero purchase-ready lines** because ordering/specification/shipping gaps remain. Fast partial data does not prove a complete live quote.

Real Flash-Lite extraction calls took **3.0–17.2 seconds**, and another call timed out. A saved-page recheck took **89.8 seconds** overall. These observations rule out claiming a guaranteed seven-second cold collection. No public-network latency or hosted-backend benchmark has passed.

To reproduce, warm observations once using the live worker or `pnpm validate:live 560001` with the worker stopped, then run `pnpm benchmark:http`. It makes ten read-only comparisons, writes `artifacts/http-latency.json`, and fails if any response exceeds seven seconds. It refuses to create new collection jobs on a cache miss. Keep these measurements separate from the synthetic calculator, which requires no APIs.

If the mentor requires every **new, fully verified live basket** within seven seconds, the current external workflow does **not** meet that requirement. Confirm whether pre-collected, timestamped evidence is acceptable before presenting this as a qualifying demo.

## Executed strict fresh-quote check

`pnpm benchmark:live-budget` was executed on 20 October 2026 against the real local application with refresh=true. Quote `95324b58-c54e-478b-9a0c-181b2012252f` was still processing when the 7000 ms deadline elapsed (reported wall time 7002.51 ms). No complete verified plan had returned, so the check **failed**. The saved job continued; no automatic duplicate was created. Evidence: [strict budget report](evidence/fresh-seven-second-budget-2026-10-20.json). Connecting the public preview does not change this result.
