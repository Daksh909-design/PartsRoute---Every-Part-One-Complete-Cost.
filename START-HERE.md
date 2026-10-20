# What you need to do next

1. Open this folder in your editor and install Node 22.12+ and pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, then `pnpm dev`. Try the saved-data demo at localhost:3000 first.
2. Get a **TinyFish API key** with Agent credits and an **OpenAI API project key** with access to `gpt-6-luna` or another explicitly configured Structured Outputs-capable model. Store them only in `.env.local`.
3. Start PostgreSQL using `docker compose up -d db`. Copy `.env.example` to `.env.local`, fill the keys and generate a team token of at least 24 characters. Run `pnpm db:migrate`.
4. Run `pnpm worker` alongside `pnpm dev`. Select live mode and enter the team token. Keep the component requirements exact; the current DHT11 listing mismatch must be resolved rather than ignored.
5. Qualify the retailers **before polishing the pitch**. Run `pnpm validate:live 560001` with the worker stopped. Inspect actual originals and run IDs, manually compare a product/pack/price/tax sample, and obtain a complete shipping estimate for a three-line basket. Record unknowns. Robu's blocking/policy gaps and Robocraze's shipping estimator require attention; Evelta is a researched fallback, not an enabled integration.
6. Run `pnpm test`, `pnpm typecheck`, `pnpm build`. Follow `docs/DEPLOYMENT.md` for a shared database plus separate web/worker services.
7. Publish the repository publicly under **Daksh909-design**. These commands require GitHub CLI and authentication to that account:

```sh
# From this repository. Confirm that gh auth status shows Daksh909-design.
gh auth login
gh auth status
gh repo create Daksh909-design/partsroute --public --source=. --remote=origin --push
```

The requested owner is Daksh909-design; do not publish under a different signed-in account. No GitHub repository has been created yet. If the name already exists, inspect it before continuing; do not overwrite an existing project.

For the hackathon demo: show live collection, original TinyFish evidence, the run ID, a correctly matched complete basket and its verified landed total. Use the synthetic demonstration separately to explain the optimizer. Do not call a shipping-unknown subtotal a complete quote.
