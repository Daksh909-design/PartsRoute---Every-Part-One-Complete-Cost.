# Live feasibility and first-milestone status

Research date: **20 October 2026**. Calls were made through the connected TinyFish tools, with Fetch cache tolerance `ttl: 0`. Original responses and a normalized research summary are in `docs/evidence`.

| Check                                 | Observation                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Robu DHT11                            | SKU 28586, ₹59 including GST, in stock, breakout-module description and one-unit package. Pin count not reliably established.                                                    |
| Robocraze HC-SR04                     | SKU TIFSS0171, ₹75 including GST, 1,989 left in stock, four pins and 5V documented.                                                                                              |
| Robocraze DHT11                       | SKU TIFSS0178, ₹65 including GST, 54 left; describes a four-pin sensor. This does not establish a breakout-module match.                                                         |
| Robocraze 400-point breadboard        | SKU TIFEC0055, ₹39 including GST, 9,681 left, 400 total tie points.                                                                                                              |
| Robu transparent 400-point breadboard | SKU 618305, ₹105 including GST, **out of stock**. Exclude.                                                                                                                       |
| Robu HC-SR04                          | First Fetch returned `bot_blocked`. One deliberate retry returned navigation-only content, not a usable product observation.                                                     |
| Robu shipping                         | Returned navigation and `Shipping Policy Page Content`, not a usable policy.                                                                                                     |
| Robocraze shipping                    | Free-shipping wording includes regional exclusions. A nationwide banner cannot establish pincode-specific shipping.                                                              |
| Evelta fallback                       | FAQ and humidity category successfully fetched. FAQ distinguishes before-GST threshold and paid express shipping. Exact overlapping catalogue and guest estimator not qualified. |

TinyFish Agent run [7a650199-7a13-41ad-b789-ac9119dd3d92](https://agent.tinyfish.ai/runs/7a650199-7a13-41ad-b789-ac9119dd3d92) checked **two HC-SR04 sensors for pincode 560001**, with a ₹150 item subtotal including GST and delivery serviceability. It did not obtain a shipping charge. Therefore:

```text
Items:        ₹150.00, observed
Shipping:     unknown
Additional item tax: ₹0.00 (listed item price includes GST)
Landed total: unknown
```

This is a valid partial calculation, **not a complete landed basket**. No deadline is promised from the page's delivery estimate.

## Milestone acceptance

### Debugging follow-up

A fresh TinyFish connector Fetch retrieved the Robocraze HC-SR04 page and shipping policy successfully on 20 October 2026 (`debug-fetch-2026-10-20.json`). It showed ₹75 including GST and a published stock count of 1,983; those observations are time-specific and do not establish a new complete basket.

Agent run [0719d7ea-f349-4c37-8e5d-82783e1b5558](https://agent.tinyfish.ai/runs/0719d7ea-f349-4c37-8e5d-82783e1b5558) inspected the DHT11 product and its variant controls. It reported a bare four-pin sensor, SKU TIFSS0178, and a separate pack-of-25 link labelled module. No breakout board with header was established. Pincode serviceability was not checked successfully. The original result is in `debug-agent-2026-10-20.json`. This is connector-level debugging evidence, not a direct-key application run or human verification.

- Actual responses saved: **yes**.
- Normalized research observations saved: **yes**.
- Source excerpt inspection by the coding agent: **yes**.
- Human manual verification: **not done**.
- Two qualified full retailer integrations: **not yet**.
- Applicable complete shipping for the sample: **not obtained**.
- One complete verified three-line live basket: **not obtained**.
- Application direct-key TinyFish/selected-AI pipeline: **not run without credentials**.

## Human review to perform

1. Run the application live pipeline with API keys and migrated PostgreSQL. Retain job ID and provider run IDs.
2. In your browser, inspect one product from each retailer. Record SKU, exact model/connector/pins, price, GST inclusion, package contents, minimum/step and stock against the saved excerpt. Record reviewer and time; correct the catalogue or extraction if needed.
3. Build exactly the same three-line basket and pincode in a guest estimator. Do not invent an address. If additional information is mandatory, shipping remains unknown.
4. Manually calculate pack counts, selected quantity tiers, applicable item tax, per-retailer shipping and shipping tax. Compare against the app result.
5. If Robu remains unsuitable, qualify Evelta with real overlapping product URLs, tax evidence and its actual checkout threshold basis. Add an adapter only after obtaining evidence; do not substitute synthetic offers.

The reproducible synthetic fixture separately has a hand-calculated complete ₹295 example. It is useful for business-logic tests, not live milestone acceptance.
