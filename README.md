# PartsRoute

**Every part. One complete cost.**

PartsRoute helps Indian student teams, makers and electronics teams compare the complete cost of a small bill of materials. Buying each item from its cheapest listing can lose money once shipping, packs, minimum orders and tax are included. Similar product names can also hide a different connector or board version.

[Try the sample calculator](https://daksh909-design.github.io/PartsRoute---Every-Part-One-Complete-Cost./) · [Live server setup](docs/LIVE-SETUP.md) · [Engineering review](docs/REVIEW.md) · [Demo walkthrough](docs/DEMO-GUIDE.md)

## Status

| Area               | Current state                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample calculator  | Deployed to GitHub Pages. Synthetic data, real quantity and basket calculations.                                                                                                          |
| Server application | Next.js production server, PostgreSQL and worker running locally. Build, HTTP and real SQL checks passed.                                                                                 |
| Hosted live server | Deployment configuration prepared. Not provisioned; needs owner sign-in, API keys and approval of hosting charges.                                                                        |
| Live qualification | Direct-key TinyFish Fetch and Agent checked; original responses saved. Gemini generation returns project-denied HTTP 403. A complete verified landed basket and human review remain open. |

**The first live milestone has not passed.** The Pages sample is not evidence of a live integration. See [feasibility](docs/FEASIBILITY.md) and [checks actually executed](docs/VALIDATION.md).

## Implemented

- Three curated component types with quantities, exact models, required specifications and a delivery pincode. Input schemas allow three to five lines; the current catalogue has three distinct entries.
- Exact matches, rejected specifications, unknown fields and explicitly confirmed equivalents. Confirmation cannot override contradictory requirements.
- Integer-paise calculations for packs, minimum quantities, quantity multiples, price breaks, explicit tax treatment and consolidated retailer shipping.
- Complete-assignment enumeration, verified-plan ranking and partial alternatives. Unknown shipping is never treated as free.
- Live quote jobs, leases, worker heartbeat, readiness checks, saved observations, provider run recovery, visible freshness and deliberate refresh.
- Separate comparison and evidence views, retry states, protected live endpoints, bounded API requests and per-team live quotas.

## Retailers

| Retailer          | Adapter       | Qualification gap                                                                                                       |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Robocraze         | Implemented   | Corrected DHT11 module candidate retrieved (TIFSS0029); complete pincode basket shipping remains unknown.               |
| Robu              | Implemented   | Fresh HC-SR04/DHT11 pages retrieved; shipping page still contains a placeholder and checked breadboard is out of stock. |
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

| Variable                         | Purpose                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`                   | PostgreSQL connection used by web and worker                                   |
| `TINYFISH_API_KEY`               | Mandatory server-side Fetch and Agent credential                               |
| `AI_PROVIDER`                    | `gemini` by default; optional `openai`                                         |
| `GEMINI_API_KEY`                 | Server-side Google AI Studio credential                                        |
| `GEMINI_MODEL`                   | Default `gemini-3.8-flash`; current project generation access denied (403)     |
| `GEMINI_REQUEST_INTERVAL_MS`     | Delay between Gemini requests, default 12000; not a quota guarantee            |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Only needed when explicitly selecting paid OpenAI                              |
| `APP_ACCESS_TOKEN`               | Private team token, at least 24 characters, required for live API access       |
| `APP_ORIGIN`                     | Web application's browser origin                                               |
| `APP_ALLOWED_ORIGINS`            | Exact additional browser origins; allows the Pages frontend to call the server |
| `NEXT_PUBLIC_API_BASE_URL`       | Optional public HTTPS backend origin baked into a Pages build; never a secret  |
| `OBSERVATION_TTL_SECONDS`        | Cached observation freshness, default 900                                      |
| `MAX_BROWSER_CHECKS`             | Browser checks per quote, capped at three                                      |

Keep keys in the hosting secret settings or ignored `.env.local`. The website asks only for a team access token, never provider keys. Read [keys and costs](docs/KEYS-AND-COSTS.md) before making live calls: a model offered on a free tier can still incur charges when your project uses a paid tier.

## TinyFish integration

`src/server/tinyfish.ts` calls **Fetch** at `POST https://api.fetch.tinyfish.ai` to retrieve product and policy content. Requests use Markdown, bounded timeouts and per-URL error inspection. HTTP 200 alone is not success. Original responses, normalized observations, source URLs and times are persisted.

For a small shortlist, **Agent** starts an asynchronous guest-basket check at `POST https://agent.tinyfish.ai/v1/automation/run-async`, persists the returned ID and polls `GET /v1/runs/{id}`. It may inspect variants and pincode controls. It does not log in, invent addresses, submit checkout, pay or place orders. Ambiguous creation is not retried automatically. A structured result is verified against the exact basket, quantities, pincode, subtotal and displayed arithmetic before shipping is accepted.

TinyFish Search is not used because automatic discovery is not implemented. There is no substitute scraping provider. [Saved connector captures](docs/evidence) are research evidence, separate from live app execution.

## AI and deterministic responsibilities

**Gemini is the default provider**, using Google's Interactions REST API with a JSON response schema and local Zod validation. The optional OpenAI adapter uses the official SDK and Responses Structured Outputs when `AI_PROVIDER=openai`. There is no automatic paid fallback. `AIProvider` isolates product/policy extraction and explanations from business logic. Grounding requires supporting excerpts, and missing values remain unknown. The model selects explanation facts already validated by the application; it does not calculate the purchasing plan.

Deterministic code validates specifications, excludes insufficient stock, rounds purchase quantities, applies published price tiers, adds only taxes not already included and charges shipping once per retailer basket. It enumerates complete assignments and checks up to three distinct finalist retailer baskets. The recommendation is the **best verified plan among checked options**, not the cheapest offer across the market.

## Tests and diagnostics

```sh
pnpm test
pnpm typecheck
pnpm build
# With the production web server running:
pnpm test:http
# After configuring the live stack:
pnpm doctor
pnpm doctor --providers
```

The test fixtures are explicitly synthetic. The sample's manual totals are ₹255 items + ₹40 shipping = **₹295** through Robocraze, versus **₹320** through Robu. Split baskets cost more in this example. Tests cover packs, minimums, breaks, tax, thresholds, matching, stock, unknown shipping, partial failure, provider responses, readiness and run recovery. Mocked SQL tests do not establish PostgreSQL behavior. See [validation](docs/VALIDATION.md).

## Deployment and limitations

`render.yaml` prepares a web service, worker and private PostgreSQL database. These always-on services incur charges; the owner must review the hosting estimate. Docker targets and a local Compose override are also included. [Deployment and recovery](docs/DEPLOYMENT.md) explains both processes.

`pnpm build:pages` builds an isolated static sample export. Without a configured backend it shows a setup screen for live quotes. With an actual `NEXT_PUBLIC_API_BASE_URL` and allowed backend origin, it can call the protected server. API keys never enter this build. Custom CI is an optional template in `docs/ci-workflow.yml.example`.

The main remaining gaps are Google project generation access, complete pincode shipping, two fully qualified retailers, human-reviewed extraction and real model evaluation. PostgreSQL persistence, concurrent claiming and expired-lease recovery have been exercised. Public live hosting is not provisioned. No delivery deadline or guaranteed shipping fee is inferred from a banner or dispatch estimate.

## Roadmap

| Release             | Scope                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| MVP — in progress   | Qualify two retailers, configure the live server and prove one complete three-line landed basket with evidence. |
| Version 1 — planned | Expand the verified catalogue, extraction evaluation, pincode handling, monitoring and individual user access.  |
| Version 2 — planned | TinyFish Search discovery, qualified marketplace adapters, BOM import and split-line purchasing.                |

## Team and links

Built by **Team REsynced**, NSUT, for the AI/ML track of Kritical Hacks.

[Daksh Sachdev](https://github.com/Daksh909-design) — Team Leader; Niyati Jain, Parth, Tashi Saxena and Ritesh Kumar — Team Members.

[Repository](https://github.com/Daksh909-design/PartsRoute---Every-Part-One-Complete-Cost.) · [Public sample](https://daksh909-design.github.io/PartsRoute---Every-Part-One-Complete-Cost./). No hosted live-server or presentation URL is available yet.

Official integration references: [TinyFish Fetch](https://docs.tinyfish.ai/fetch-api/reference), [TinyFish async Agent](https://docs.tinyfish.ai/api-reference/automation/start-automation-asynchronously), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
