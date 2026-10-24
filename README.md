# PartsRoute

**Every part. One complete cost.**

[Open the app](https://partsroute.onrender.com)

Compare electronics orders across Robu and Robocraze. Search components, choose variants and quantities, then compare item prices, tax and delivery by pincode.

## Demo

1. Try **Sample calculation** to explore basket comparisons.
2. Switch to **Live quote** and enter your team token.
3. Search components, add them to your list and compare prices.
4. Open **Evidence** to inspect retailer sources or reload a saved quote.

Sample prices are example data. Live results show estimates and pending delivery checks where applicable. The free host may take about a minute to wake after inactivity.

## Run locally

Requires Node 22.12+, pnpm and PostgreSQL.

```sh
pnpm install --frozen-lockfile
pnpm local:setup
```

Set `DATABASE_URL`, `TINYFISH_API_KEY`, `GEMINI_API_KEY` and `APP_ACCESS_TOKEN` in `.env.local`, then run:

```sh
pnpm local:start
```

Open http://127.0.0.1:3000.

## Stack

Next.js, React, TypeScript, PostgreSQL, TinyFish and Gemini. The backend queues collection jobs for a worker and stores quotes and retailer evidence.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
```

[Local setup](docs/LIVE-SETUP.md) · [Hosting](docs/CARD-FREE-HOSTING.md) · [Demo walkthrough](docs/DEMO-GUIDE.md)

Built by **Team REsynced**, NSUT, for Kritical Hacks.
