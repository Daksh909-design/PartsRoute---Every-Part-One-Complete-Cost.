# Card-free full application hosting

The default `render.yaml` uses one free Render web service for both the existing
Next.js app and its collection worker. A persistent external PostgreSQL database
stores quotes, jobs, searches and source evidence. Supabase's Free plan is the
intended database provider. This deployment does not use the presenter's laptop.

Both provider accounts must be connected before resources can be provisioned.
Keep Render on a Free instance and Supabase on its Free plan. Do not use
`render.paid.yaml`, which is the optional separate-service paid configuration.

Supply the existing TinyFish, Gemini and team access values through Render's
runtime environment variables. Never put these values in the Blueprint, Git
repository, build arguments or browser bundle. Configure `DATABASE_URL` with the
Supabase **session pooler** URI with `?sslmode=verify-full`. This supports the
persistent server's IPv4 connections. Set `NODE_EXTRA_CA_CERTS` to
`certs/supabase-prod-ca-2021.crt`, as the Blueprint does, so Node verifies
Supabase's certificate authority and the pooler's hostname. `RENDER_EXTERNAL_URL` is used by the
existing origin checks for the app's generated domain.

The public CA certificate comes from the [official Supabase dashboard
configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json):
`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`.
It contains no credentials. Keep database passwords and API keys in host secrets.

`node scripts/start-hosted.mjs` applies migrations before starting either
service, starts the web process on Render's `PORT`, and starts the unchanged
collection worker. If either process exits, it stops the other and exits with
an error so the host can restart the complete app. Termination signals stop both
processes; after ten seconds remaining children are forcibly stopped. Existing
database leases and retained provider run IDs support recovery after a restart.

The app shares Render's free CPU and memory allocation. It must be qualified on
the actual host with fresh searches, live quote collection, saved quote recovery
and evidence access before the deployment is considered working. No synthetic
prices or changed verification rules are introduced for this hosting option.

## Free-plan limits

Render's free service sleeps after 15 minutes without inbound traffic. A later
visitor wakes it, typically taking about a minute. A job interrupted by host
sleep or restart remains recoverable through the existing database queue. The
worker does not remain running while the host is asleep. No artificial traffic
is generated to bypass the host's inactivity policy.

Render also imposes monthly service, bandwidth and build allowances. Supabase's
Free plan includes a 500 MB database, and projects with low activity can pause
after seven days. A paused database must be restored through Supabase. This is a
free demo deployment, not a guarantee of continuous production availability.

## Published deployment and verification

The application is published at [partsroute.onrender.com](https://partsroute.onrender.com)
on Render Free in Singapore, using the PartsRoute Supabase Free project in Mumbai.
API keys and the database password are configured only in the host environment.
The existing private team token authorizes live mode. Deployment is manual from
the repository's `main` branch; pushing documentation does not restart a demo.

On 24 October 2026, hosted checks confirmed database and worker readiness,
all nine HTTP smoke checks, protected live endpoints and browser-origin checks.
A fresh `sensor` search returned ten selectable real Robocraze products in
1.44 seconds. A four-line quote to pincode 110034 matched all four selected
variants, produced one comparison plan, and finished in 28.09 seconds. Its ten
original observations and saved result were retrieved again through the hosted
API. Shipping verification timed out, so the quote correctly remained partial;
this is not evidence of a verified delivered total or a ten-second result.

The startup change passed the existing 145-test suite. An isolated local
qualification ran migrations against the test database, confirmed web/worker
readiness, killed only the test worker, and verified that the supervisor stopped
the test web process and exited with code 1. The deployed runtime commit
`eeb2c77` also passed GitHub's Validate workflow. The hosted quote check exercised
both web and worker within the free instance, but does not establish capacity
for concurrent public traffic.

Sources: [Render free limits](https://render.com/docs/free),
[Supabase pricing](https://supabase.com/pricing),
[Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
