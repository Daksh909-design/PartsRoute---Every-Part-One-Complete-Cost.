# PartsRoute

**Every part. One complete cost.**

PartsRoute helps Indian student teams, makers and electronics teams compare the complete cost of a small bill of materials. Buying each item from its cheapest listing can lose money once shipping, packs, minimum orders and tax are included. Similar product names can also hide a different connector or board version.

[Try the sample calculator](https://daksh909-design.github.io/PartsRoute---Every-Part-One-Complete-Cost./) · [Live server setup](docs/LIVE-SETUP.md) · [Engineering review](docs/REVIEW.md) · [Demo walkthrough](docs/DEMO-GUIDE.md)

## Status

| Area               | Current state                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample calculator  | Deployed to GitHub Pages. Synthetic data, real quantity and basket calculations.                                                                                                                                                                            |
| Server application | Next.js production server, PostgreSQL and worker running locally. Build, HTTP and real SQL checks passed.                                                                                                                                                   |
| Hosted live server | Temporary Cloudflare preview connected to the existing local stack. Requires the team computer to stay online; permanent hosting is not provisioned.                                                                                                        |
| Live qualification | Direct-key TinyFish Fetch and Agent checked; original responses saved. Replacement Gemini key generates successfully; real structured product extraction saved, with intermittent timeouts. A complete verified landed basket and human review remain open. |

**The first live milestone has not passed.** The Pages sample is not evidence of a live integration. See [feasibility](docs/FEASIBILITY.md) and [checks actually executed](docs/VALIDATION.md).

See the [current collector changes, conditional totals and timing measurements](docs/COLLECTOR-UPDATE.md). The current target is thirty seconds; it still requires a fresh verified delivered plan to pass. Apply migration 006 before deploying this revision.

## Implemented

- Three curated component types with quantities, exact models, required specifications and a delivery pincode. Input schemas allow three to five lines; the current catalogue has three distinct entries.
- Exact matches, rejected specifications, unknown fields and explicitly confirmed equivalents. Confirmation cannot override contradictory requirements.
- Integer-paise calculations for packs, minimum quantities, quantity multiples, price breaks, explicit tax treatment and consolidated retailer shipping.
- Complete-assignment enumeration, verified-plan ranking and partial alternatives. Unknown shipping is never treated as free.
- Fresh collection as the primary live action: new TinyFish Fetch requests with ttl=0 and new AI extraction, even if identical content was previously cached. A separate read-only saved-observations action shows observation ages.
- Live quote jobs, leases, worker heartbeat, readiness checks, saved observations and provider run recovery.
- Recovery of identical active team requests after browser refresh, bounded parallel extraction and direct reads of supported retailer price blocks while AI work is pending or unavailable. Conditional item estimates show priced-line coverage and never substitute for a verified delivered total.
- Separate comparison and evidence views, retry states, protected live endpoints, bounded API requests and per-team live quotas.

## Retailers

| Retailer          | Adapter       | Qualification gap                                                                                                       |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Robocraze         | Implemented   | Corrected DHT11 module candidate retrieved (TIFSS0029); complete pincode basket shipping remains unknown.               |
| Robu              | Implemented   | Correct shipping/refund policy retrieved; no applicable shipping charges published there. Checked breadboard is out of stock. |
| Evelta            | Research only | Exact overlapping catalogue and guest shipping path need qualification.                                                 |
| Amazon / Flipkart | Planned       | Seller, variant, stock and basket-shipping evidence must be established first.                                          |

Retailer coverage is provisional. Product URLs are curated in `src/domain/catalogue.ts`; arbitrary-name discovery is not implemented. The original Robocraze DHT11 URL led to a bare sensor. It was replaced with a retrieved module listing that explicitly describes a sensor and supporting components on a PCB. The old mismatch evidence is retained; distinct listings must not be treated as equivalents by name alone.

## Technology

Next.js App Router and TypeScript; Tailwind CSS; Zod; PostgreSQL with a separate Node.js worker; Vitest; Gemini REST structured outputs by default and an optional official OpenAI SDK adapter. Dependency versions are pinned in `package.json` and `pnpm-lock.yaml`.

## Local setup

Install Node **22.12+**, pnpm **11.25.0** and Docker Desktop (or PostgreSQL).

```sh
pnpm install --frozen-lockfile
# PowerShell: Copy-Item .env.example .env.local
# macOS/Linux: cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. The sample works without provider credentials. For a prepared local PostgreSQL installation, `pnpm local:start` runs migrations, builds and starts web/worker. For a reproducible Docker stack, fill `.env.local` privately and run:

```sh
docker compose -f compose.yaml -f compose.live.yaml up --build -d
```

Stop the development preview first if it occupies port 3000. Alternatively start PostgreSQL, run `pnpm db:migrate`, then run `pnpm dev` and `pnpm worker` in separate terminals. See [live setup](docs/LIVE-SETUP.md) for hosted deployment, diagnostics and acceptance steps.

## Environment

| Variable                         | Purpose                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | PostgreSQL connection used by web and worker                                            |
| `TINYFISH_API_KEY`               | Mandatory server-side Fetch and Agent credential                                        |
| `AI_PROVIDER`                    | `gemini` by default; optional `openai`                                                  |
| `GEMINI_API_KEY`                 | Server-side Google AI Studio credential                                                 |
| `GEMINI_MODEL`                   | Default `gemini-3.5-flash-lite`; structured extraction works, transient failures remain |
| `GEMINI_REQUEST_INTERVAL_MS`     | Optional delay between requests, default 0; not a quota guarantee                       |
| `GEMINI_TIMEOUT_MS`              | Background extraction timeout per attempt, default 30000 (max 30000)                    |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Only needed when explicitly selecting paid OpenAI                                       |
| `APP_ACCESS_TOKEN`               | Private team token, at least 24 characters, required for live API access                |
| `APP_ORIGIN`                     | Web application's browser origin                                                        |
| `APP_ALLOWED_ORIGINS`            | Exact additional browser origins; allows the Pages frontend to call the server          |
| `NEXT_PUBLIC_API_BASE_URL`       | Optional public HTTPS backend origin baked into a Pages build; never a secret           |
| `OBSERVATION_TTL_SECONDS`        | Cached observation freshness, default 900                                               |
| `MAX_BROWSER_CHECKS`             | Browser checks per quote, capped at three                                               |

Keep keys in the hosting secret settings or ignored `.env.local`. The website asks only for a team access token, never provider keys. Read [keys and costs](docs/KEYS-AND-COSTS.md) before making live calls: a model offered on a free tier can still incur charges when your project uses a paid tier.

## TinyFish integration

`src/server/tinyfish.ts` calls **Fetch** at `POST https://api.fetch.tinyfish.ai` to retrieve product and policy content. One batch per retailer retrieves the requested product pages and policy. Requests use Markdown, bounded timeouts and per-URL error inspection. HTTP 200 alone is not success. Original responses, normalized observations, source URLs and times are persisted.

For a small shortlist, **Agent** starts an asynchronous guest-basket check at `POST https://agent.tinyfish.ai/v1/automation/run-async`, persists the returned ID and polls `GET /v1/runs/{id}`. It may inspect variants and pincode controls. It does not log in, invent addresses, submit checkout, pay or place orders. Ambiguous creation is not retried automatically. A structured result is verified against the exact basket, quantities, pincode, subtotal and displayed arithmetic before shipping is accepted.

TinyFish Search is not used because automatic discovery is not implemented. There is no substitute scraping provider. [Saved connector captures](docs/evidence) are research evidence, separate from live app execution.

## AI and deterministic responsibilities

**Gemini is the default provider**, using Google's Interactions REST API with a JSON response schema and local Zod validation. The optional OpenAI adapter uses the official SDK and Responses Structured Outputs when `AI_PROVIDER=openai`. There is no automatic paid fallback. `AIProvider` isolates product/policy extraction and explanations from business logic. Grounding requires supporting excerpts, and missing values remain unknown. The model selects explanation facts already validated by the application; it does not calculate the purchasing plan.

Deterministic code validates specifications, excludes insufficient stock, rounds purchase quantities, applies published price tiers, adds only taxes not already included and charges shipping once per retailer basket. It enumerates complete assignments and checks up to three distinct finalist retailer baskets. The recommendation is the **best verified plan among checked options**, not the cheapest offer across the market.

## Response time

**Collect & compare fresh offers** starts a new live quote, bypasses page and extraction caches and displays elapsed time through completion. `POST /api/quotes` always creates or recovers a fresh job; it never returns a cached comparison. The secondary **View saved observations** action calls a different read-only endpoint and makes no new provider calls. Its earlier fast timings do not satisfy the mentor's requirement. The strict fresh-quote test **failed**: a new quote was still processing at seven seconds. The interface flags this missed target rather than reporting queue acceptance as completion. See [measurements and the mentor requirement](docs/PERFORMANCE.md).

## Tests and diagnostics

```sh
pnpm test
pnpm typecheck
pnpm build
# With the production web server running:
pnpm test:http
# Read-only benchmark after warming live observations:
pnpm benchmark:http
# After configuring the live stack:
pnpm doctor
pnpm doctor --providers
```

The test fixtures are explicitly synthetic. The sample's manual totals are ₹255 items + ₹40 shipping = **₹295** through Robocraze, versus **₹320** through Robu. Split baskets cost more in this example. Tests cover packs, minimums, breaks, tax, thresholds, matching, stock, unknown shipping, partial failure, provider responses, readiness and run recovery. Mocked SQL tests do not establish PostgreSQL behavior. See [validation](docs/VALIDATION.md).

## Deployment and limitations

`render.yaml` prepares a web service, worker and private PostgreSQL database. These always-on services incur charges; the owner must review the hosting estimate. Docker targets and a local Compose override are also included. [Deployment and recovery](docs/DEPLOYMENT.md) explains both processes.

`pnpm build:pages` builds an isolated static sample export. Without a configured backend it shows a setup screen for live quotes. With an actual `NEXT_PUBLIC_API_BASE_URL` and allowed backend origin, it can call the protected server. API keys never enter this build. Custom CI is an optional template in `docs/ci-workflow.yml.example`.

Earlier ten-second checks failed. The current bounded-window test returned fresh partial results in 26.46 seconds, with no verified delivered total; the strict thirty-second full-quote target has not passed. The main remaining gaps are extraction reliability, complete pincode shipping, two fully qualified retailers, human-reviewed extraction and real model evaluation. PostgreSQL persistence, concurrent claiming and expired-lease recovery have been exercised. Permanent public hosting is not provisioned. The Pages interface can now use a temporary protected live preview; see [preview setup](docs/PUBLIC-PREVIEW.md). No delivery deadline or guaranteed shipping fee is inferred from a banner or dispatch estimate.

## Roadmap

| Release             | Scope                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| MVP — in progress   | Qualify two retailers, configure the live server and prove one complete three-line landed basket with evidence. |
| Version 1 — planned | Expand the verified catalogue, extraction evaluation, pincode handling, monitoring and individual user access.  |
| Version 2 — planned | TinyFish Search discovery, qualified marketplace adapters, BOM import and split-line purchasing.                |

## Team and links

Built by **Team REsynced**, NSUT, for the AI/ML track of Kritical Hacks.

[Daksh Sachdev](https://github.com/Daksh909-design) — Team Leader; Niyati Jain, Parth, Tashi Saxena and Ritesh Kumar — Team Members.

[Repository](https://github.com/Daksh909-design/PartsRoute---Every-Part-One-Complete-Cost.) · [Public sample](https://daksh909-design.github.io/PartsRoute---Every-Part-One-Complete-Cost./). The public interface connects to a temporary live preview while the team computer is online. No permanent hosted-server or presentation URL is available.

Official integration references: [TinyFish Fetch](https://docs.tinyfish.ai/api-reference/fetch-and-extract-content-from-urls), [TinyFish async Agent](https://docs.tinyfish.ai/api-reference/automation/start-automation-asynchronously), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
