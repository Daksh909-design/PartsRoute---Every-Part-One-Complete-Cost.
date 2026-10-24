# Deployment

The main application is at [partsroute.onrender.com](https://partsroute.onrender.com/). On 24 October 2026 the web health check passed, and authenticated readiness reported a migrated database and recent worker heartbeat. The hosting configuration and location of the database/worker were not inspected; these checks do not establish provider access or a complete verified basket.

Live PartsRoute requires three services: a Next.js web server, a Node worker and persistent PostgreSQL. Deploy web and worker from the same commit.

## Web and worker

Install dependencies and run database migrations before starting services:

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
```

Start the web service with `pnpm start --hostname 0.0.0.0 --port $PORT` and a separate worker service with `pnpm worker`. Supply the same private environment variables to both. The web service needs a public HTTPS address; the database should be private.

Required settings are listed in [.env.example](../.env.example). Set `APP_ORIGIN` to the web origin. If using Pages as the frontend, add `https://daksh909-design.github.io` to `APP_ALLOWED_ORIGINS`. These are exact origins, without repository paths or wildcards. Keep keys and the team token in the hosting provider's secret settings.

The prepared [Render blueprint](../render.yaml) defines these services, PostgreSQL and migration commands. It uses paid resources. The existing deployment's plan and configuration have not been checked against this blueprint; review the provider's estimate before using it for another deployment.

## Containers

The Dockerfile has separate build targets:

```sh
docker build --target web -t partsroute-web .
docker build --target worker -t partsroute-worker .
```

Run migrations with the worker image before starting web and worker. Use injected runtime settings; never copy a populated environment file into an image. The database hostname must be reachable from the container, rather than container-local `localhost`. For the local full stack, see [setup](LIVE-SETUP.md).

## GitHub Pages

Pages hosts the sample calculator and links to the hosted application for live quotes. It cannot run quote APIs, the worker or PostgreSQL. The current Render configuration rejects API preflights from the Pages origin, so the two frontends remain separate.

```sh
pnpm build:pages
```

The export directory is recorded in `artifacts/pages-build.json`. Publish its contents, including `.nojekyll`, to the root of `gh-pages`. The repository's Pages setting should use that branch at `/`. Updating `main` does not rebuild this export automatically.

To connect Pages to a separately deployed server, set `NEXT_PUBLIC_API_BASE_URL` to its HTTPS origin before building. On PowerShell:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = 'https://YOUR-SERVER-HOST'
pnpm build:pages
```

This variable is public. It must contain only the backend origin, never a key. The build validates the origin and rejects private/server dependencies in the browser bundle. Without an origin, the site shows live setup instructions.

## Operations

- `GET /api/health` checks web liveness and configuration. Authenticated `GET /api/integration/status` also checks schema access and a recent worker heartbeat.
- Migrations use a transaction and advisory lock. Back up the database before upgrading.
- The worker renews job leases and recovers expired work. Known Agent run IDs are polled rather than submitted again.
- A 26-second processing window may return partial results. It does not guarantee verified output or cancel a remote Agent run.
- Review provider quotas, queue age, failed jobs and evidence retention. The shared team token is an MVP access control, not a multi-user account system.

For an Agent run that succeeded remotely before its ID was saved, stop the worker, verify the exact run in TinyFish, then attach it with:

```sh
pnpm recover:run QUOTE_UUID OPERATION_KEY TINYFISH_RUN_ID
```

The command refuses to overwrite a known run ID. Verify the basket, pincode and quantities manually before attaching it, then restart the worker. An ambiguous submission must not be blindly retried.

Before treating a deployment as ready, run the HTTP smoke checks, collect a fresh quote, inspect its evidence and manually verify one complete delivered basket. [Validation](VALIDATION.md) records which checks have actually run.
