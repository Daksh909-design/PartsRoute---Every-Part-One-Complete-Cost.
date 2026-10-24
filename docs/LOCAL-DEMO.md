# Run the complete app for the demo video

This runs the real frontend, backend, PostgreSQL database and collection worker on the presenter's computer. Cloud hosting is unnecessary for screen recording. Other computers cannot reach this computer's `localhost`; record on the machine running the app.

## First-time setup

Install Node.js 22.12+ and PostgreSQL 17. Install the pinned package manager if it is not already available:

```sh
npm install -g pnpm@11.25.0
git clone https://github.com/Omegaman-cell/PartsRoute.git
cd PartsRoute
pnpm install --frozen-lockfile
```

Alternatively, extract the delivered source ZIP and open a terminal in its `partsroute` folder. The original Daksh repository does not contain these changes unless they are later merged there.

Initialize the application's own local database using your installed PostgreSQL binaries. Example for a default Windows installation:

```sh
pnpm local:setup --postgres-bin "C:/Program Files/PostgreSQL/17/bin"
```

Use the actual directory containing `initdb` and `pg_ctl`; macOS/Linux use their installed PostgreSQL bin directory. The helper creates a separate loopback-only cluster, random password, available port, and private app/test database settings. It does not replace an existing PostgreSQL service. If you already have an application database, run `pnpm local:setup` and configure its URL instead; see [full setup](LIVE-SETUP.md).

Open the generated `.env.local` locally and fill:

```dotenv
TINYFISH_API_KEY=<your privately supplied key>
AI_PROVIDER=gemini
GEMINI_API_KEY=<your privately supplied key>
GEMINI_MODEL=gemini-3.5-flash-lite
LIVE_QUOTES_PER_HOUR=0
```

Keep the generated `DATABASE_URL` and `APP_ACCESS_TOKEN`. The team token authenticates this local app; it is different from either provider key. Keys and database contents are excluded from Git, so the presenter must configure their own local environment. Share keys privately and never record the secret file on screen.

## Start and record

```sh
pnpm local:start
```

The launcher starts the configured database, migrates it, builds production assets, then starts web and worker. Leave the terminal open. Visit [localhost:3000](http://localhost:3000/). If the app is already running, it avoids duplicate services.

1. Start with **Sample calculation**. Explain that the prices are synthetic. Recalculate the default INR 295 example; changing the first quantity from two to three gives INR 370. Pincode changes in this mode do not fetch real shipping.
2. Switch to **Live quote**, enter the generated `APP_ACCESS_TOKEN` and choose **Check connection**. Confirm both database and worker are ready.
3. Search a component such as ESP32 or Arduino Uno. Choose a real retailer listing and variant, then add it. Repeat for more components; live mode has no three-line limit. Quantities default to retailer packs; choose physical units only when the published pack size is known. Collect fresh offers. Show progressive prices, exact product matching, and the timer. The hosted provider calls need internet access and available provider credits even though the app runs locally.
4. Show the **items + shipping estimate** and its tax qualification. Do not describe it as a verified final delivered total when shipping tax is unknown. Retailer blocking/timeouts are shown explicitly.
5. Open **Evidence** to show actual source records, datasheet facts, shipping checks and saved run IDs. Resume/retry a saved quote if needed and identify it as saved work.

For a longer narration, use the [demo walkthrough](DEMO-GUIDE.md). Do a readiness check and one live rehearsal before recording. A saved quote can demonstrate recovery but is not a new live collection.

## Troubleshooting

- **No live backend/worker:** use `pnpm local:start`, rather than a static Pages export or a standalone frontend server.
- **Missing keys:** update `.env.local`, then stop and restart the launcher.
- **Hourly limit:** `LIVE_QUOTES_PER_HOUR=0` disables the app's hourly limit for testing. Provider account quotas and the three-active-job queue cap still apply.
- **Existing app on port 3000:** stop its launcher before rebuilding or restarting. Do not delete `.next` while it is serving requests.
- **Provider blocked/slow:** keep partial facts visible; inspect evidence. Local hosting cannot remove retailer restrictions or establish missing tax facts.
- **Check the installation:** run `pnpm doctor` while web and worker are running. `pnpm doctor --providers` additionally consumes provider quota.

The Windows `START-PARTSROUTE.cmd` delivered alongside the ZIP targets the already prepared computer's workspace. On another computer, use the commands above.
