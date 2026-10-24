# Live feasibility and first-milestone status

Research date: **20 October 2026**. Earlier calls used the connected TinyFish tools. The debugging revision also exercised actual application API keys. Original and sanitized captures are in `docs/evidence`; the sections below distinguish those surfaces.

**Latest status:** Robu's correct `/shipping-and-refund-policy/` URL was retrieved through TinyFish on 20 October at 16:49 UTC. It contains a policy but no applicable shipping charge. The previous placeholder referred to the old URL. A complete verified delivered basket is still unavailable; the latest fresh public run took 46.189 seconds and failed the ten-second limit. See [current collector report](../COLLECTOR-UPDATE.md).

## Initial research observations (historical)

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

## Direct-key debugging follow-up

Actual API-key Fetch calls returned all three curated product pages and the policy URL from both retailers. Robu HC-SR04 now returned SKU 2444 at ₹79 including GST; the earlier blocked page is a historical observation. The Robu shipping response still contains a placeholder, and its checked breadboard remains out of stock. Transport success does not qualify content.

The incorrect Robocraze DHT11 URL was replaced by https://robocraze.com/products/dht11-humidity-temperature-sensor-module after actual Fetch established SKU TIFSS0029, ₹59 including GST, a one-module package and the statement that the sensor and other components are on a compact PCB. Ordering constraints and full match validation still require their evidence path.

Direct-key Agent run **52d7ca78-5076-4dbd-a08b-760a3d67c08c** completed a research cart containing two HC-SR04 sensors, one corrected DHT11 module and one 400-point breadboard. It reported ₹248 in items, but no usable shipping/serviceability and a mismatching-basket flag. Validation correctly retained an unknown landed total. The prompt was subsequently clarified so expected INR line totals cannot be confused with per-pack prices. The direct probe did not exercise the later order-control extension.

The actual Next.js/worker pipeline saved TinyFish originals and then failed with Google's generation-access HTTP 403. This is evidence of a working collection path and an external model-account block, not a successful AI quote. See the sanitized captures and live-quote failure record in docs/evidence.

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
- Application direct-key pipeline: **executed**. TinyFish product originals persisted; Gemini generation failed with project-denied HTTP 403. This is not a successful extraction or quote.

## Human review to perform

1. Run the application live pipeline with API keys and migrated PostgreSQL. Retain job ID and provider run IDs.
2. In your browser, inspect one product from each retailer. Record SKU, exact model/connector/pins, price, GST inclusion, package contents, minimum/step and stock against the saved excerpt. Record reviewer and time; correct the catalogue or extraction if needed.
3. Build exactly the same three-line basket and pincode in a guest estimator. Do not invent an address. If additional information is mandatory, shipping remains unknown.
4. Manually calculate pack counts, selected quantity tiers, applicable item tax, per-retailer shipping and shipping tax. Compare against the app result.
5. If Robu remains unsuitable, qualify Evelta with real overlapping product URLs, tax evidence and its actual checkout threshold basis. Add an adapter only after obtaining evidence; do not substitute synthetic offers.

The reproducible synthetic fixture separately has a hand-calculated complete ₹295 example. It is useful for business-logic tests, not live milestone acceptance.

## Later debugging validation, 20 October 2026

The replacement Gemini key restored generation. Flash-Lite structured extraction recovered Robocraze HC-SR04 ₹75 and DHT11 module ₹59, and Robu HC-SR04 ₹79 and DHT11 module ₹59, each backed by exact stored excerpts. This supersedes the earlier account-block status, not the historical captures. The HC-SR04 total pin count was not established by the retrieved text, ordering constraints were unknown, and later extraction attempts timed out. No complete verified plan resulted. A shortened Robu Fetch attempt timed out for all four URLs; later retrieval recovered the product text, while its policy still returned a placeholder.

Cached comparisons now avoid provider calls. They are a distinct evidence-reuse path and are not proof of a new live collection. See [PERFORMANCE.md](../PERFORMANCE.md).
