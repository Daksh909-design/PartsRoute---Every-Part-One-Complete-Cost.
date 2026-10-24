# Full application hosting

The full app needs a Node web/API service, a continuously running Node worker and PostgreSQL. Static hosting alone cannot preserve live collection, saved jobs, recovery and evidence. No reduced Sites version was published. A private, unpublished Site record was created before the hosting requirement changed; it has no deployed app or uploaded secrets.

The user subsequently chose to record the full app on localhost and push the finished source to `Omegaman-cell/PartsRoute`. Cloud deployment is deferred. Follow [local demo setup](LOCAL-DEMO.md); the following hosting plan is retained for later use.

## Railway deployment plan

Railway supports all three existing services. The account connection succeeded, but project creation returned **"Deploys have been paused temporarily"** on 22 October 2026. No project or services were created. Check platform availability and the account's actual trial balance/spending controls before retrying; no paid plan, billing upgrade or paid overage is authorized. The [trial](https://docs.railway.com/pricing/free-trial) provides limited credits and may restrict outbound access for unverified accounts. This must be checked against TinyFish and Gemini before calling the deployment ready.

Use the final source package, including uncommitted changes, rather than the old GitHub main branch.

1. Create a project with a PostgreSQL service and two application services using the same source.
2. Build both application services using the included Dockerfile. The default final stage contains the production web build and worker dependencies. Explicit Compose targets remain available.
3. Set the web start command to `pnpm start --hostname 0.0.0.0`; Next uses the platform's `PORT` environment variable. Run `pnpm db:migrate` as its pre-deploy command.
4. Set the worker start command to `pnpm worker`, with migrations as its pre-deploy command. Migrations are transactionally serialized and repeatable. Do not assign the worker a public domain.
5. Reference the same private PostgreSQL `DATABASE_URL` in web and worker. Keep the database off the public network. Set `TINYFISH_API_KEY`, `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash-lite` and the collection settings from `.env.example` in both application services. Store values as platform secrets, never source files or build arguments.
6. Set the web `APP_ACCESS_TOKEN` from the authorized team configuration. For this team's testing, set `LIVE_QUOTES_PER_HOUR=0`. Keep the three-active-job cap. Do not put this token into the browser bundle.
7. Generate a public HTTPS domain for web only. Set `APP_ORIGIN` to that exact origin. Leave `NEXT_PUBLIC_API_BASE_URL` empty so the frontend calls its own API. Use `/api/health` for the web health check. Disable idle sleeping for the worker if the selected plan exposes such a setting.
8. Verify home, sample arithmetic, unauthenticated API rejection, authenticated database/worker readiness, then one real fresh collection through the hosted endpoint. Check that saved evidence and resume work after restarting the worker. Do not claim retailer tax verification when the retained source only supplies an estimate.

Docker and Railway builds have not been exercised locally because Docker and Railway account access were unavailable. Local production builds, actual PostgreSQL and web/worker execution have passed. A deployment is not complete until the provider returns a successful deployment and the hosted checks above pass.

## Alternatives investigated

- [Northflank Sandbox](https://northflank.com/pricing) offers two always-on services and one database, which matches the current architecture. Deployment needs account/API access. Confirm the actual account is on Sandbox and use only its included resources; do not select a paid compute plan. Use the `web` and `worker` Dockerfile targets, one private PostgreSQL addon, and the same configuration and verification steps above. The public HTTPS origin belongs only on the web service. Retain the worker as a private continuously running service. The connected GitHub account has read-only access to the original repository, so deployment must use the delivered updated source through an authorized repository or the provider's source-upload workflow, rather than the old main branch.
- [Render free hosting](https://render.com/docs/free) does not include a separate background worker. Free PostgreSQL expires after 30 days. The existing `render.yaml` is an always-on paid topology; do not apply it without spending authorization.
- A temporary [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) can expose the complete local app while this computer and its services stay running. This is a temporary demo link, not an independently hosted deployment. No tunnel was created as a substitute for the requested full hosted app.
- The ChatGPT Sites runtime cannot directly run this repository's local PostgreSQL process and separate long-running worker. Migrating persistence and job processing to its runtime would be additional implementation, not deployment of this existing backend.
