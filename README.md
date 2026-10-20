# PartsRoute

Compare the **complete cost** of a small electronics parts list across Indian retailers. PartsRoute is for student teams, makers and small electronics teams whose cheapest individual listings can become an expensive split purchase after shipping, packs and tax.

This repository contains a Next.js App Router application, a PostgreSQL-backed quote queue, a separate Node worker, direct TinyFish Fetch/Agent integration, OpenAI Structured Outputs, a deterministic purchasing-plan calculator, labelled synthetic fixtures and tests. It does not buy anything.

## Team REsynced

Built for the AI/ML track of Kritical Hacks by **Team REsynced**, NSUT.

| Member | Role |
|---|---|
| [Daksh Sachdev](https://github.com/Daksh909-design) | Team Leader |
| Niyati Jain | Team Member |
| Parth | Team Member |
| Tashi Saxena | Team Member |
| Ritesh Kumar | Team Member |

GitHub owner: [Daksh909-design](https://github.com/Daksh909-design). The intended repository visibility is **public**; publication status is recorded below.

## Current status

The saved-data application is runnable without provider credentials. Live collection and worker code are implemented but the application's direct-key end-to-end path needs your credentials and PostgreSQL validation. **The first live milestone has not passed.** Do not present this as a completed hackathon submission yet.

During development, actual TinyFish connector calls fetched Robu/Robocraze product pages and shipping pages, and a TinyFish Agent inspected a Robocraze guest cart. Its two HC-SR04 sensors cost ₹150 including GST, with serviceability confirmed for 560001; shipping and landed total remained unknown. These observations are saved under [docs/evidence](docs/evidence). They establish connector-level feasibility, not successful execution of the application HTTP adapters. No human verification is claimed.

## Implemented features

- Three curated component lines, editable quantities (1–100), exact models, required attributes and one Indian pincode. Schema allows 3–5 lines; the initial catalogue contains three distinct entries.
- Exact matches, rejected specifications, unknown attributes and explicitly confirmed model equivalents. Required-spec conflicts cannot be overridden by confirmation.
- Integer paise, pack rounding, minimum packs, multiples, price breaks, explicit item/ship tax handling and shipping consolidated by retailer basket.
- Enumeration of complete assignments and at most three distinct finalist retailer-basket browser checks per quote.
- PostgreSQL jobs, worker leases, cached original observations with original timestamps, normalized observations, protected evidence/usage endpoints and recoverable TinyFish run IDs.
- Separate live and synthetic modes, progress, refresh, partial results, retries, comparisons and source links.
- Server-only provider keys, a shared team token for live endpoints, durable live quotas and same-origin browser access.

## Retailers and catalogue

**Robu and Robocraze adapters are implemented; reliability is provisional.** They are not advertised as fully qualified integrations.

| Retailer | Observed feasibility | Current limitation |
|---|---|---|
| Robocraze | HC-SR04, DHT11 and 400-point breadboard pages fetched; Agent checked a guest basket and pincode | Guest cart did not reveal a pincode-only shipping charge. The DHT11 URL describes a four-pin sensor and does not establish the sample's breakout-module requirement. |
| Robu | DHT11 and 400-point breadboard pages fetched | HC-SR04 was bot-blocked, then returned navigation only. Shipping policy was a placeholder. The checked breadboard was out of stock. |
| Evelta, fallback research only | FAQ shipping policy and humidity category fetched | Overlapping exact catalogue and guest shipping path not established; no application adapter enabled. |

Product URLs are curated in `src/domain/catalogue.ts`. There is no arbitrary-name discovery and **TinyFish Search is not used**. Never add a replacement retailer by filling synthetic offers into live mode. See [the feasibility report](docs/FEASIBILITY.md) and saved original responses.

## Local setup

Install Node.js **22.12 or newer**, pnpm **11.25.0**, and Docker Desktop (or an existing PostgreSQL server).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000](http://localhost:3000) and select **Saved-data demo**. It uses invented fixtures, performs real server-side calculation, and needs neither a database nor API keys.

For live mode:

```sh
# macOS/Linux; PowerShell: Copy-Item .env.example .env.local
cp .env.example .env.local
docker compose up -d db
```

Fill `.env.local` using your own API credentials. Generate a team token with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
pnpm db:migrate
pnpm dev
```

In another terminal, from this repository:

```sh
pnpm worker
```

Select **Live TinyFish**, enter the team access token and run the comparison. Do not enter API keys into the interface. Restart web and worker after changing environment variables. Keep both processes on the same database.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string; local example in `.env.example`. Use TLS in production using your provider's connection parameters. |
| `TINYFISH_API_KEY` | Your TinyFish API key with Fetch and paid Agent access/credits. |
| `OPENAI_API_KEY` | API project key; ChatGPT app access alone is not an API credential. |
| `OPENAI_MODEL` | Defaults to `gpt-6-luna`; configurable, no silent fallback. Confirm access in your API project. |
| `APP_ACCESS_TOKEN` | Shared private-team token, at least 24 characters; protects every live quote and evidence endpoint. |
| `APP_ORIGIN` | Exact public origin, such as `http://localhost:3000` locally. |
| `OBSERVATION_TTL_SECONDS` | Application observation cache freshness, clamped to 0–3600 seconds; default 900. |
| `MAX_BROWSER_CHECKS` | Maximum distinct finalist baskets checked per quote, clamped to 1–3; default 3. |

Production secrets must be configured independently on the web process and worker. No `NEXT_PUBLIC_` provider secrets exist.

## Exact TinyFish integration

The core collector uses TinyFish; no alternative scraper is present.

1. `POST https://api.fetch.tinyfish.ai`, with `X-API-Key`, retrieves allowlisted curated product URLs and shipping policies. Semantic HTML is requested so quantity-control evidence can survive extraction. The response `results[]` and `errors[]` are inspected separately even for HTTP 200. `final_url` is validated against the retailer allowlist before content is used. A provider-side redirect may already have happened; this application does not claim to intercept TinyFish browser traffic.
2. Original responses, retrieval timestamps and normalized results are saved in PostgreSQL. Unusable or blocked pages remain failures. Fresh same-URL observations can be reused; **Refresh live observations** sets Fetch `ttl: 0` and creates a new quote. Reopening/retrying an existing quote reuses that quote's saved work.
3. Deterministic code generates complete assignments and shortlists promising plans by known prices. Unknown shipping is retained, never assigned zero. Policy information is displayed as evidence; live policy rules alone do not establish pincode applicability and cannot verify a plan.
4. `POST https://agent.tinyfish.ai/v1/automation/run-async` asks TinyFish to inspect one exact guest basket, variants/quantities and pincode shipping estimator. It may change a temporary guest cart but cannot log in, invent personal details, submit checkout, pay or order. Agent duration is bounded to 180 seconds. Beta-gated `max_steps` and strict mode are omitted.
5. Persist the returned `run_id`; recover status with `GET https://agent.tinyfish.ai/v1/runs/{id}`. Only a matching basket, pincode, item subtotal, shipping, serviceability, quoted amounts and arithmetic-consistent displayed total can become verified. `COMPLETED` is not enough; goal failures and invalid outputs remain unknown.

Browser run creation is never automatically retried. A network failure during submission may have started a paid run. Such an operation is marked uncertain and requires recovery of its existing ID; see [deployment and recovery](docs/DEPLOYMENT.md). A browser refresh does not start another run.

The integration view provides original responses and actual run IDs for judging. Fetch often exposes no usage count; it is recorded as unknown. Agent steps and provider usage fields are recorded when returned. No API-cost figure is invented.

Official references reviewed on 20 October 2026: [TinyFish Fetch](https://docs.tinyfish.ai/fetch-api/reference), [Agent reference](https://docs.tinyfish.ai/agent-api/reference), [run lifecycle](https://docs.tinyfish.ai/key-concepts/runs), [structured-output subset](https://docs.tinyfish.ai/key-concepts/structured-output).

## AI responsibilities

`AIProvider` in `src/server/ai.ts` separates extraction/explanation from provider choice. Only OpenAI is implemented. Its official SDK calls `responses.parse` with Zod-constrained Structured Outputs. It extracts main-product facts, normalizes names/units, and supplies specifications that deterministic code compares. Exact supporting excerpts and numeric checks ground commercially relevant fields. Unknown values remain null, and grounding is deliberately conservative.

For explanations the model selects only indices into facts already validated by the application. It cannot introduce new claims or amounts. Prices, quantities, taxes, shipping arithmetic and ranking are deterministic.

The current [GPT-6 Luna documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) describes it as an efficient model for focused tasks, making it the initial extraction candidate. Structured Outputs support was checked in official documentation, but **account access, latency and extraction quality are not yet evaluated with a real API key**. `OPENAI_MODEL` must remain configurable. See [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Optimization approach

Each component line is assigned to one eligible offer. Ordering constraints are measured in packs. Required packs are rounded up for units, minimum order and multiples before selecting the applicable pack-price tier. Out-of-stock, unknown-stock, insufficient-stock and mismatched offers are excluded.

`total = listed item costs + additional item tax + shipping per retailer basket + additional shipping tax`

Included tax is not added again. Exclusive tax requires an observed rate for that charge; there is no universal GST rate. Shipping threshold comparisons support strict/inclusive boundaries and either before-tax or payable-item bases. Unknown threshold basis remains unknown. Plans with an unknown cost do not get a complete numeric total.

Only complete verified finalists can become a live recommendation, using **“best verified plan among checked options.”** Estimated/unknown alternatives remain visible. Dispatch estimates are never converted into deadline promises. Coupons, COD fees, arbitrary substitutions, multiple offers for one line, and buying extra just to cross a shipping threshold are not optimized.

## Tests and validation

```sh
pnpm test
pnpm typecheck
pnpm build
```

Tests cover pack rounding, minimums/multiples, quantity tiers, shipping consolidation, strict/inclusive threshold boundaries, shipping tax, inclusive/exclusive item tax, missing GST, wrong models/connectors/pins, missing specs, stock, unknown shipping, partial collection and hand-calculated ranking. Contract tests use **mocked TinyFish HTTP responses**, not paid APIs. They do not prove live API success.

For the real application pipeline after setup:

```sh
# Run while the regular worker is stopped; this command processes its own persisted quote.
pnpm validate:live 560001
```

The command requires credentials and migrated PostgreSQL. It saves actual originals in the database and the result to ignored `artifacts/live-<id>.json`. A partial result is not a passed live milestone. Complete the human checks in [docs/FEASIBILITY.md](docs/FEASIBILITY.md). See [validation status](docs/VALIDATION.md) for checks actually executed during this build.

## Live versus saved data

| Mode | Collection | Arithmetic | What it proves |
|---|---|---|---|
| Live | Direct TinyFish Fetch and Agent + OpenAI extraction | Shared deterministic calculator | Actual checked observations, only if those calls ran successfully. |
| Saved-data demo | Invented fixture with conspicuous synthetic labels | Same calculator and ranking | Reproducible business behavior, not live connectivity or current prices. |
| Saved feasibility captures | Real earlier TinyFish connector responses | Normalized research observations | What was observed at those times, not a fresh quote or direct-adapter validation. |

The demo sample's manually calculated totals are ₹320 for all Robu, ₹295 for all Robocraze and ₹345 for the lowest-item-price split. **These amounts are fictional** and exist to test shipping consolidation.

## Limitations

- The live milestone is incomplete: two reliable full retailers, complete shipping and human verification remain to qualify.
- Retailer pages change, bot protection occurs, and checkout can require more than a pincode. Unknown shipping prevents a recommendation.
- Quantity controls may be absent from Fetch content. Missing pack/minimum/multiple evidence prevents calculation instead of defaulting to one.
- Curated catalogue only; no broad discovery. The sample DHT11 mismatch deliberately exposes an important real-world ambiguity.
- Shared team token and global hourly quota are suitable for a private hackathon demo; this is not multi-user identity or tenant isolation. Put public deployments behind access control.
- Only three distinct lines are currently in the catalogue. No delivery deadline guarantees, arbitrary-pincode region inference or automatic state lookup.
- Original observation/cache storage needs retention policies for longer production use. Worker leases recover failures but external APIs cannot guarantee exactly-once execution after ambiguous submission.
- Unit/contract tests do not replace real PostgreSQL/worker restart and provider tests. Consult validation status before claiming deployment readiness.

## Roadmap

| Stage | Implemented | Remaining |
|---|---|---|
| MVP | App/worker/schema, two retailer adapters, TinyFish/OpenAI code, calculator, synthetic demo, evidence | Credentials, human review, reliable complete shipping and direct end-to-end qualification. |
| Version 1 | Planned | Expand curated verified catalogue, qualify Evelta, retailer-specific quantity parsing, robust pincode mapping, extraction evaluation set, deployment monitoring and identity. |
| Version 2 | Planned | TinyFish Search discovery, richer equivalence review, supplier inventory/lead-time evidence, split-line optimization, optional Gemini adapter and team BOM import. |

## Architecture and deployment

See [architecture](docs/ARCHITECTURE.md), [deployment/recovery](docs/DEPLOYMENT.md) and [getting started checklist](START-HERE.md). Web and worker deploy as separate Node services against one PostgreSQL database.

## Demo, presentation and GitHub

No public demo, presentation or repository URL is available. The local Git repository and committed source are the deliverable; publishing commands are in `START-HERE.md`. Add real links only after publication succeeds.
