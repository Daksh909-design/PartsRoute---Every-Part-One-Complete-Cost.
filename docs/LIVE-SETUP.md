# Run PartsRoute live

GitHub Pages serves the sample calculator. It cannot run API routes, PostgreSQL or the background worker. The complete application needs three services: the Next.js web server, the Node worker and PostgreSQL. Both web and worker must use the same database and provider keys.

## Hosted server: prepared Render deployment

`render.yaml` defines the web service, worker, private PostgreSQL connection and migration commands. It uses always-on paid compute; **review and approve Render's current estimate before creating resources**. Committing the file does not create a server or a hosting subscription. No paid service has been provisioned during development.

1. Sign in to [Render](https://dashboard.render.com/), choose **New → Blueprint**, and select the PartsRoute GitHub repository. Review `render.yaml` and the displayed service charges.
2. Enter `TINYFISH_API_KEY` and `GEMINI_API_KEY` in Render's private secret fields. They are copied to the worker through service references. Do not put them in GitHub source, a public environment variable or the website form.
3. Approve the services in the dashboard. Web pre-deploy and worker startup run the migrations under the existing advisory lock. The worker reports a heartbeat after its schema is accessible.
4. Open the web service URL supplied by Render. Copy its generated `APP_ACCESS_TOKEN` from Render's environment settings privately, open **Live quote**, enter that token and choose **Check connection**.
5. All four readiness checks must pass. This confirms configuration, database access and a recent worker heartbeat; it does not prove provider account/model access. Start a quote and inspect its original observations and run IDs.
6. Use the **server's URL** for the live hackathon demo. The Pages URL remains a separate sample unless connected as described below.

Hosting account sign-in, secret entry and approval of any charges require the project owner. This repository does not contain credentials or a fabricated server URL. Render configuration has been prepared from its documentation, but has not been provisioned or tested on Render.

## Connect the existing GitHub Pages frontend

This is optional: the server already serves the same UI. For the Pages site to call it, set `NEXT_PUBLIC_API_BASE_URL` to the actual HTTPS web-service origin **at Pages build time**, then rebuild and publish:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = 'https://YOUR-ACTUAL-SERVER-HOST'
pnpm build:pages
```

That variable is a public URL, never an API key. The Pages build refuses origins containing credentials, query strings or paths. The backend must set `APP_ALLOWED_ORIGINS=https://daksh909-design.github.io` (origin only, without the repository path). CORS preflight allows Authorization, Content-Type and Idempotency-Key; the team token is still required for protected endpoints. Do not use a wildcard origin.

Re-publish the export directory recorded in `artifacts/pages-build.json` to `gh-pages`. Rebuilding the server does not update the Pages release automatically.

## Local server with Docker

Install Node 22.12+, the pinned pnpm version and Docker Desktop. Copy `.env.example` to `.env.local`, fill both provider keys, and set a random `APP_ACCESS_TOKEN` of at least 24 characters. An ignored local setup file may already exist; keep its generated token and enter the keys there privately.

```sh
pnpm install --frozen-lockfile
docker compose -f compose.yaml -f compose.live.yaml up --build -d
docker compose -f compose.yaml -f compose.live.yaml logs -f worker
```

The override starts the database, applies migrations, then starts web and worker. Container database URLs use `db`, not `localhost`. The web port is bound to `127.0.0.1:3000`. If another local preview occupies that port, stop it first. Docker execution is not yet verified on the development machine because Docker is unavailable there.

For a prepared local installation, `pnpm local:start` runs migrations, builds Next.js and starts web/worker in one terminal. It does not provision paid hosting and refuses to duplicate an already-running PartsRoute web service. On Windows its build uses the supported TypeScript 6 compiler API/thread path. Individual processes can also be started with an existing PostgreSQL service:

```sh
pnpm db:migrate
pnpm dev
# Separate terminal, from the same directory
pnpm worker
```

For the developer machine where a portable PostgreSQL runtime has already been prepared, `pnpm local:db start` reads ignored `artifacts/local-db.json`, starts that runtime and fills only the template database URL in `.env.local`. Run it in your own Windows terminal if the coding runtime blocks PostgreSQL process signalling. This helper is optional, machine-specific and does not replace the reproducible Docker setup.

## Diagnose before collecting

```sh
pnpm doctor
pnpm doctor --providers
```

The first command checks local configuration, database schema and worker heartbeat. `--providers` additionally performs one live TinyFish product Fetch and asks the selected AI model for a small schema-validated response. It can consume provider quota. Neither check substitutes for structured extraction and a complete basket test. Failed checks exit nonzero and do not print secrets.

The default is `AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.5-flash-lite`. Google lists free input/output for this model on its free tier, subject to account eligibility and quotas. Keep your project on the free tier if you want to avoid paid model usage. Quota failures require waiting/retrying; there is no automatic paid fallback. The original key returned a project-denied HTTP 403. A replacement key subsequently generated successfully, and Flash-Lite extracted real product records; service timeouts still occur. Do not enable paid billing merely to retry. Optional paid OpenAI requires explicitly setting `AI_PROVIDER=openai` and its key/model. TinyFish is the separate mandatory collection service; its credits and server hosting are separate costs.

## Acceptance before submission

- Run one three-line live request, inspect the actual source excerpts and TinyFish run IDs, and manually review model, connector, stock, pack, price and tax against the retailer pages.
- Obtain pincode-specific shipping for the exact basket. If a full address is required, keep shipping unknown rather than inventing one.
- Confirm a complete landed total against a manual calculation. An unknown total or a sample fixture does not meet this milestone.
- Resolve the DHT11 breakout-versus-bare-sensor mismatch and qualify two retailers. See `FEASIBILITY.md`.

The complete live milestone remains open until those checks actually succeed.
