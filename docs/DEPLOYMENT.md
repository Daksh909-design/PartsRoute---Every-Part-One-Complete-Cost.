# Deploying web and worker

PartsRoute requires **two long-running Node services and one persistent PostgreSQL database** for live mode. Deploy the web service and worker from the same commit. Do not run the worker inside a request handler or on short-lived serverless functions.

The full app is live at [partsroute.onrender.com](https://partsroute.onrender.com). For the card-free demo, use [CARD-FREE-HOSTING.md](CARD-FREE-HOSTING.md) and the default `render.yaml`. It shares one free instance between web and worker and uses Supabase PostgreSQL. `render.paid.yaml` is the optional separate-service paid configuration. [LIVE-SETUP.md](LIVE-SETUP.md) covers local Compose.

## GitHub Pages: interactive saved-data demo

GitHub Pages hosts static files only. This deployment supports editable quantities, required specifications, validation and deterministic sample basket comparisons in the browser. It uses the same synthetic fixtures and calculator as the server demo. Without a configured backend, Live quote shows a server setup screen. A Pages build can call a separate server through `NEXT_PUBLIC_API_BASE_URL`; exact allowed origins and the private team token are required. Collection, private evidence, jobs and the worker always run on the server, never in Pages.

Run `pnpm build:pages`. The separate Pages target bundles the shared React workspace, domain calculator and synthetic fixture with pinned esbuild. It writes `.pages-build/` without altering the Next.js server build. A dependency-manifest check rejects server modules, API routes and environment files. It never reads private environment files. This is a client-side sample build, not the Next.js server. The generated directory and base path are recorded in `artifacts/pages-build.json`. `PAGES_BASE_PATH` defaults to `/PartsRoute---Every-Part-One-Complete-Cost.` and can be overridden for another repository.

Publish the generated directory, including `.nojekyll`, to the root of the `gh-pages` branch. Configure the repository's Pages source as `gh-pages` at `/`. Keep source development on `main`; updating `main` alone does not rebuild this deployment. Rebuild and push the generated output for each release. No custom Actions workflow or additional workflow OAuth permission is needed for branch publishing.

For live quotes, use the server deployment below. Never embed API keys in a Pages build.

## Container deployment

The included Dockerfile has `web` and `worker` targets. Build them separately:

```sh
docker build --target web -t partsroute-web .
docker build --target worker -t partsroute-worker .
```

Use managed PostgreSQL or the included local Compose database. Before starting services, run the migration once using the worker image and your protected runtime environment:

```sh
docker run --rm --env-file .env.local partsroute-worker pnpm db:migrate
docker run -d --name partsroute-web --env-file .env.local -p 3000:3000 partsroute-web
docker run -d --name partsroute-worker --env-file .env.local partsroute-worker
```

For a host database, use a hostname reachable from the container, not container-local `localhost`. In production inject environment variables through the host's secret manager rather than committing/copying `.env.local`. Require HTTPS, set `APP_ORIGIN` to the exact origin, use PostgreSQL TLS and put a private team-access layer ahead of the app. The shared app token is an MVP team control, not per-user authentication.

For a non-container host:

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
# Web service start command
pnpm start
# Separate worker service start command
pnpm worker
```

Migrations run transactionally under an advisory lock. Back up the database before migration. No destructive down migration is supplied. Do not expose PostgreSQL port 5432 publicly. Docker images and hosted environments have not been validated unless listed as executed in `VALIDATION.md`.

## Health and operations

`GET /api/health` checks web liveness and presence of required configuration; it does not test API account access, database readiness or worker health. Observe worker logs and quote queue age separately. Query `quotes` for stale leases/queued jobs, and `provider_operations` for uncertain submissions. Provider keys are never logged. Review raw evidence under access control, and set a retention/cleanup policy before extended use.

Fetch/GET retries are bounded; Agent creation is not retried because submission can be ambiguous. Restarting the worker reclaims expired jobs, reuses original saved observations and polls known run IDs. UI retries reuse the job and its operations. A deliberate refresh creates a new quote and may incur new API calls.

If Agent submission succeeded but the response/run-ID write was lost:

1. Find the matching run in your TinyFish dashboard using time, retailer, goal, pincode, SKUs and quantities.
2. Inspect the protected evidence endpoint for the exact `operation_key` and confirm the basket.
3. Stop the worker briefly and attach that existing ID:

```sh
pnpm recover:run QUOTE_UUID OPERATION_KEY TINYFISH_RUN_ID
```

The command refuses to overwrite known IDs and performs a basic goal/pincode check. **The operator must verify the exact basket manually.** It queues a terminal partial/failed quote after recovery. Resume the worker; no replacement browser run is started. An operation without a recoverable ID stays unverified; there is no unsafe “retry creating anyway” command.

## Qualification before public release

Run the real provider checks, manually review extraction, verify PostgreSQL migrations/concurrent claims/restart recovery, run tests/typecheck/build and browser-check desktop/mobile UI. Set API spending limits in the provider dashboards. A per-quote three-basket cap and six-quotes/hour shared quota are not a substitute for account-level budgets.

The public Pages demo is separate from a live server deployment. See the README for the verified deployment link; a live server deployment still needs configuration and qualification.

## Latency and preparation

Run migrations 004 and 005 before deploying this revision, then deploy web and worker from the same commit. The primary Collect & compare fresh offers action always uses `/api/quotes` and bypasses both page and model caches. View saved observations uses the separate read-only `/api/comparisons` route. `pnpm benchmark:http` measures only that cache path; do not present it, synthetic data or a job acknowledgement as a completed seven-second live basket. `pnpm benchmark:live-budget --follow` measures a new job and retains a failed deadline even if the job finishes later. [PERFORMANCE.md](PERFORMANCE.md) records the failed strict result.

## Account-free live preview

The public interface was connected to the existing local backend through a temporary Cloudflare Quick Tunnel. This does not provision Render or permanent hosting. It depends on the team computer and all local services staying online. See [PUBLIC-PREVIEW.md](PUBLIC-PREVIEW.md) for lifecycle, authentication, recovery and the strict seven-second test result.

Latest collector: apply migration 006 before restarting web and worker. GEMINI_CONCURRENCY defaults to eight (1–8 supported). See [COLLECTOR-UPDATE.md](COLLECTOR-UPDATE.md) for the narrow product extractor, thirty-second target, active-request recovery and conditional item estimates.

`QUOTE_COLLECTION_BUDGET_MS` defaults to 26000 and is bounded to 1000–26000 ms. Fetch, AI, browser checks and explanation share the remaining window. Expiry returns partial results with unknown facts; it is not a guarantee of verified shipping or a thirty-second delivered quote. Remote Agent runs may continue after an HTTP abort and must be recovered by saved run ID. `pnpm benchmark:live-budget --local-submit --follow` is an explicit operator validation requiring private database access; it queues through the bounded `live-validation-cli` actor, uses the normal worker and polls public HTTP. Its report distinguishes this from public API submission. Do not expose this command or database access as a browser quota bypass.
