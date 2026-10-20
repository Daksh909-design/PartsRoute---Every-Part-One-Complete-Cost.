# What you need to do next

1. Open this folder in your editor and install Node 22.12+ and pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, then `pnpm dev`. Try the saved-data demo at localhost:3000 first.
2. Get a **TinyFish API key** with Agent credits and an **OpenAI API project key** with access to `gpt-6-luna` or another explicitly configured Structured Outputs-capable model. Store them only in `.env.local`.
3. Start PostgreSQL using `docker compose up -d db`. Copy `.env.example` to `.env.local`, fill the keys and generate a team token of at least 24 characters. Run `pnpm db:migrate`.
4. Run `pnpm worker` alongside `pnpm dev`. Select live mode and enter the team token. Keep the component requirements exact; the current DHT11 listing mismatch must be resolved rather than ignored.
5. Qualify the retailers **before polishing the pitch**. Run `pnpm validate:live 560001` with the worker stopped. Inspect actual originals and run IDs, manually compare a product/pack/price/tax sample, and obtain a complete shipping estimate for a three-line basket. Record unknowns. Robu's blocking/policy gaps and Robocraze's shipping estimator require attention; Evelta is a researched fallback, not an enabled integration.
6. Run `pnpm test`, `pnpm typecheck`, `pnpm build`. Follow `docs/DEPLOYMENT.md` for a shared database plus separate web/worker services.
7. Publish the local repository when you are ready. These commands require your GitHub authentication and your own repository URL:

```sh
# From this repository; replace YOUR_GITHUB_NAME.
gh auth login
gh repo create partsroute --private --source=. --remote=origin --push
# Or create an empty repo on GitHub, then:
git remote add origin https://github.com/YOUR_GITHUB_NAME/partsroute.git
git push -u origin main
```

Use one publishing method. No GitHub repository has been created for you.

For the hackathon demo: show live collection, original TinyFish evidence, the run ID, a correctly matched complete basket and its verified landed total. Use the synthetic demonstration separately to explain the optimizer. Do not call a shipping-unknown subtotal a complete quote.
