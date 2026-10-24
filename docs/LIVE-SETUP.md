# Local setup

The sample calculator needs only Node.js 24 and pnpm 11.25.0. Live collection also needs PostgreSQL 17, TinyFish credentials and a configured AI provider.

## Sample calculator

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`. Open http://localhost:3000. The sample works with blank provider keys.

## Live collection

Set these values in the private `.env.local` file:

- `TINYFISH_API_KEY`
- `AI_PROVIDER=gemini`, `GEMINI_API_KEY` and `GEMINI_MODEL`
- `APP_ACCESS_TOKEN`: a random string of at least 24 characters
- `DATABASE_URL`: the database connection

OpenAI is an explicit alternative through `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL`. There is no automatic provider fallback.

Start the local database supplied in Compose, apply migrations, then start web and worker in separate terminals:

```sh
docker compose up -d db
pnpm db:migrate
pnpm dev
# Second terminal, in the same directory:
pnpm worker
```

The example database URL matches the local Compose database. Both application processes must use the same settings. Never use the example database password on a public server.

Open **Live quote**, enter the team token and select **Check connection**. The token is the `APP_ACCESS_TOKEN` value, not a TinyFish or model API key.

## Full Docker stack

With Docker installed and the private environment file configured:

```sh
docker compose -f compose.yaml -f compose.live.yaml up --build -d
docker compose -f compose.yaml -f compose.live.yaml logs -f worker
```

This starts PostgreSQL, runs migrations, and starts web and worker. It binds the web service to localhost:3000. This Docker path has not been executed on the development machine; see [validation](VALIDATION.md).

## Troubleshooting

| Symptom                              | Check                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Database connection fails            | PostgreSQL is running and `DATABASE_URL` matches its port and credentials             |
| Worker is not ready                  | `pnpm worker` is running, migrations passed, and both processes use the same database |
| Access denied                        | The team token matches `APP_ACCESS_TOKEN` on the server                               |
| Model access or quota error          | The configured model and key are available to the provider account                    |
| Offers appear but no delivered total | Inspect the missing specifications and exact-basket shipping evidence                 |

`pnpm doctor` checks configuration, schema and worker heartbeat. `pnpm doctor --providers` also makes real TinyFish and AI requests and consumes provider quota. Readiness alone does not prove a complete collection works.

[Environment reference](../.env.example) · [Deployment](DEPLOYMENT.md) · [Keys and costs](KEYS-AND-COSTS.md)
