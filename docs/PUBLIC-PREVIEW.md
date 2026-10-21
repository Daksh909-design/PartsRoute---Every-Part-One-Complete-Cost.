# Temporary public live server

The existing Next.js server, Node worker and PostgreSQL database can be reached through a Cloudflare Quick Tunnel. This is a live server connection, separate from the synthetic calculator and cached comparisons.

Verified on **21 October 2026**: [current temporary backend](https://economy-ant-enhance-cycles.trycloudflare.com/api/health). Pages release `8a2f416e78e7e6fd6db75a0c442675ca4d5719db` is configured for this origin. This replaces the stopped previous tunnel; the lifetime limitations below still apply.

**This is a temporary preview, not permanent hosting.** The team computer, database, web server, worker and tunnel process must all remain running and online. Stopping the tunnel invalidates its hostname. A new tunnel normally gets a different hostname and requires rebuilding Pages with the new public backend origin. No Render account, billing setup or paid hosting was created.

The Pages interface displays a temporary-server notice when configured with a trycloudflare.com backend. Provider keys remain server-side. All live API routes still require the team token, and the backend permits the exact Pages origin through CORS. The database stays bound to loopback; its port is not exposed through this HTTP tunnel.

## Reproduce

1. Install `cloudflared` from [Cloudflare's official downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/). The debugging session used official Windows release 2026.10.2, verified against the SHA-256 digest published in its GitHub release metadata.
2. Start the local stack and confirm the protected integration status reports a migrated database and recent worker heartbeat.
3. Run `pnpm preview:public`. Optionally set `CLOUDFLARED_PATH` to the installed executable. The helper reuses a healthy known preview or starts one with hidden child windows on Windows. It writes the observed URL to ignored `artifacts/public-preview.json`. A URL is labelled ready only after its public health response identifies PartsRoute. If startup remains unverified, test it before publishing.
4. Build Pages with `NEXT_PUBLIC_API_BASE_URL` set to that HTTPS origin. Publish that generated build to gh-pages. Never put provider keys or the team token in this public variable.
5. Test public health, unauthenticated rejection, Pages-origin preflight and protected readiness. Then check the connection in the actual deployed browser interface using the team token.

The tunnel is not registered as an automatic startup service. A full computer restart needs the services restarted and the current public hostname checked again. Use proper managed hosting with an owner account for a durable submission URL.

## Strict seven-second requirement

`pnpm benchmark:live-budget` deliberately starts a new, refreshed live job and counts **only a complete verified plan** as success. Cached results, partial offers, errors and queue acknowledgements cannot pass. It consumes provider quota and retains the job for inspection rather than creating automatic retries.

The executed check on 20 October 2026 **failed**: at approximately seven seconds the new quote was still processing. Connecting the server does not resolve retailer, model or cart latency, or missing shipping/specification evidence. The project must not be described as meeting the mentor's strict limit.

Cloudflare documents that Quick Tunnels require no account, have no uptime guarantee and stop working with their process: [official Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
