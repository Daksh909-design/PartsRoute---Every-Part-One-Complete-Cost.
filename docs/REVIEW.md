# Submission readiness review

Reviewed against the stated PartsRoute requirements on 20 October 2026. These are engineering priorities, not an official hackathon scoring rubric.

## Blocking a credible live submission

| Finding                                                           | Change made                                                                                                                   | Still required                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Pages was mistaken for a live deployment                          | Explicit sample/live modes, a server connection screen, backend-origin build support, Render and local Compose configurations | Owner hosting sign-in, approved service charges, provider keys and a provisioned database/worker |
| Configured keys could hide a stopped worker                       | Authenticated readiness endpoint, persistent worker heartbeat and a quote creation gate                                       | Execute migrations and verify worker recovery against PostgreSQL                                 |
| Provider failures could appear as schema errors or absent results | Explicit HTTP-200 Agent rejection handling, missing Fetch URL errors, current documented Fetch timeout, Markdown collection   | Validate the application's direct-key path with actual credentials                               |
| DHT11 product label suggests a false equivalent                   | Fresh TinyFish Agent inspection saved in evidence; matching still requires the breakout form attribute                        | Find and qualify the correct breakout product; do not relax requirements to make the demo pass   |
| Complete shipping remains unknown for the checked live basket     | Unknown costs remain unknown; no fabricated recommendation                                                                    | One complete live three-line basket, two qualified retailers and human sample verification       |

## Product and presentation changes

The previous page spent too much space on a generic hero, decorative circuit graphics, badges and empty cards. The revised interface leads with the parts list and the purchasing calculation. Requirements are editable as labelled fields rather than a raw `name=value` textarea. Sample status is explicit; live setup has an actionable explanation. Costs use a stable tabular layout, retailer baskets show actual purchased quantities, and source details sit alongside product-match outcomes. Provider debug JSON remains in the evidence screen.

The UI was separated into the workspace controller, quote results, evidence view and API client. Unused circuit art and its styling were removed. Polling uses a generation guard so an old response cannot replace a reset or a different mode's result. Browser-disabled local storage no longer prevents sample use. API response errors distinguish an unreachable backend from an HTML page returned instead of JSON.

## What a technical evaluator should be able to reproduce

1. Enter a small BOM and see exactly which specifications rule an offer in or out.
2. Watch an actual TinyFish collection, open the stored original and identify its time and run ID.
3. Change a quantity and see pack rounding, retailer shipping consolidation and taxes change deterministically.
4. Compare the recommendation with a manually calculated landed total, including a case where cheapest individual items lose after shipping.
5. Trigger a retailer or worker failure and see an honest partial result with an actionable recovery path.

The synthetic sample demonstrates calculator behavior. It does not establish live integration eligibility. A reliable complete live basket and evidence that users benefit should take priority over more visual decoration or extra retailer logos.

## Validation limits

See `VALIDATION.md` for executed checks. Docker/Render execution, real AI extraction, direct-key application TinyFish calls, complete live shipping, PostgreSQL crash/concurrency behavior and human review remain unverified unless that record is updated after execution.
