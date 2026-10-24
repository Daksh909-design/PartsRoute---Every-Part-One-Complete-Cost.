# Run locally

The full application uses a Next.js web/API process, a separate Node worker and PostgreSQL. GitHub Pages can serve the sample UI, but cannot run the worker or database. No paid hosting is required for the local demo.

## Existing prepared workspace

From the project directory:

```sh
pnpm local:start
```

This starts the local PostgreSQL runtime described by ignored `artifacts/local-db.json`, applies migrations, builds and starts web/worker. Open http://127.0.0.1:3000. Keep the launcher terminal open; Ctrl+C shuts down its web/worker children. The database can be stopped separately with `pnpm local:db stop`.

If PartsRoute is already serving on port 3000, the launcher reports that and avoids starting duplicates. Confirm worker readiness using the app's **Check connection** control.

## Fresh installation

Install Node 22.12+ and the pinned pnpm version, then:

```sh
pnpm install --frozen-lockfile
pnpm local:setup
```

The setup creates `.env.local` from `.env.example` and generates an `APP_ACCESS_TOKEN` when needed. Add TinyFish and Gemini keys in that private file. Do not put provider keys in the browser or source control.

Choose one database option:

1. Existing PostgreSQL: set `DATABASE_URL` to the application database. For real database tests, set a separate `TEST_DATABASE_URL` whose database name ends in `_test`.
2. Installed PostgreSQL binaries: run `pnpm local:setup --postgres-bin "C:/path/to/PostgreSQL/bin"`. The helper initializes a private local cluster with a random password and an available loopback port, and configures app/test database URLs. Keep the generated `artifacts` directory private. It never downloads a database runtime or prints passwords.
3. Docker: use the Compose option below.

Run `pnpm local:start`. In **Live quote**, copy the `APP_ACCESS_TOKEN` value from `.env.local` into the team-token field, then choose **Check connection**. Readiness confirms configuration, schema and worker presence; provider connectivity is checked during an actual collection.

## Individual processes

```sh
pnpm db:migrate
pnpm build
pnpm start --hostname 127.0.0.1 --port 3000
# Separate terminal, same project and .env.local:
pnpm worker
```

For UI development, use `pnpm dev` instead of the build/start pair. Web and worker must share `DATABASE_URL` and the same provider configuration. Restart the worker after server-source changes. Stop the production web process before rebuilding its `.next` directory on Windows.

## Docker option

```sh
docker compose -f compose.yaml -f compose.live.yaml up --build -d
docker compose -f compose.yaml -f compose.live.yaml logs -f worker
```

Configure `.env.local` first. The local override binds the web port to loopback; the database hostname inside Compose is `db`. Docker execution has not been validated on this machine because Docker is unavailable. The direct local PostgreSQL/web/worker stack has been exercised.

## Diagnose and test

```sh
pnpm doctor
pnpm doctor --providers
pnpm test
pnpm typecheck
pnpm test:postgres
pnpm test:http
pnpm benchmark:live-budget --follow
```

`doctor --providers` and the live benchmark consume real provider quota. Other unit/HTTP checks use synthetic fixtures and do not prove live retailer availability. The database test refuses an application database: use the dedicated test URL.

A 26-second worker window preserves partial results when a provider is slow. The original complete-quote ten-second goal is now a deferred optimization rather than a local release blocker. Estimates and saved observations remain clearly labelled. See [performance](PERFORMANCE.md).

`LIVE_QUOTES_PER_HOUR` defaults to 6 new jobs per team token per rolling hour. Set it to `0` for unlimited hourly local testing, then restart the web server. This prepared machine uses `0`. At most three jobs may be active at once. Real provider account quotas still apply; disabling an application quota does not add provider credits.

## Recovery

Open `/?quote=<saved UUID>`, enter the team token and choose **Resume the last live quote**. This reads the saved job. Retry continues the same saved job and reuses known browser run IDs. Never create a replacement Agent run when submission is uncertain; use the protected evidence and `pnpm recover:run <quote UUID> <operation key> <existing run ID>` after checking its identity.

If a retailer requires names, a street address, login or checkout submission, the collector stops with unverified shipping. It never invents personal data or places an order. If a source blocks automation, the app reports the missing source rather than bypassing the block.

## Optional hosting later

The default `render.yaml` prepares a free shared web/worker instance with an external database; see [card-free hosting](CARD-FREE-HOSTING.md) for its limits. `render.paid.yaml` is the optional paid separate-service setup. Neither has been provisioned yet. GitHub Pages builds with `pnpm build:pages` are separate static exports. A public backend origin is optional and must be configured at Pages build time; provider keys remain server-only. Historical temporary tunnel addresses are not a current deployment.
