# Submission readiness review

Reviewed against the stated PartsRoute requirements on 20 October 2026. These are engineering priorities, not an official hackathon scoring rubric.

## Blocking a credible live submission

| Finding                                          | Implemented and checked                                                                                                                         | Remaining gap                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Static Pages cannot run the live worker/database | Separate sample/live modes; local Next.js, PostgreSQL and worker running; hosting configurations prepared                                       | Public backend hosting requires an owner account; no paid service provisioned                  |
| Key presence did not prove working generation    | Actual Gemini call identified project-denied 403; actionable errors, recorded unknown usage and a five-minute repeat-creation gate              | An eligible Google project or permission repair, without enabling billing merely to retry      |
| Worker/database readiness could be misleading    | Migrations, heartbeat, persistence, exclusive claims and expired-lease SQL checks ran against PostgreSQL                                        | More process-crash and deployment testing                                                      |
| DHT11 URL pointed at a bare sensor               | Actual Fetch established a distinct module listing (TIFSS0029); catalogue corrected and old failure retained                                    | Human sample review and live structured extraction                                             |
| Markdown omitted ordering controls               | Agent can inspect exact-SKU min/step; provisional candidates never become recommendations; conflicts/unsupported offset steps remain ineligible | Execute this new control path with working model access                                        |
| Shipping was unknown                             | Direct Agent checked a three-line cart; its incomplete/mismatching result was correctly refused as shipping evidence                            | Exact pincode serviceability and a complete verified landed total from two qualified retailers |

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

See `VALIDATION.md` for executed checks. Direct-key Fetch/Agent and real SQL checks ran. Successful real AI extraction, the new order-control response path, complete shipping, broader process-crash recovery, human review and Docker/hosted deployment remain unverified.
