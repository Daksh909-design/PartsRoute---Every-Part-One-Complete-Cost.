# Validation actually performed

Checked on **20 October 2026**. Partial observations and fast responses do not establish a complete live purchasing recommendation.

## Checks that passed

- **77 Vitest tests in ten files**, using labelled synthetic fixtures and mocked HTTP. Includes pack rounding, minimums, breaks, tax, shipping consolidation and boundaries, stock, mismatches, partial failures, provider contracts, cached comparisons, expiry, obsolete normalization rejection, schema grounding, circuit behavior and job recovery.
- TypeScript checking and the full Next.js production build, with type checking enabled. This Windows coding host needs PARTSROUTE_BUILD_THREADS=1 and pinned TypeScript 6.0.3 because forked child processes are restricted.
- **Ten real PostgreSQL checks** in the separate partsroute_test database: repeated migrations through 005, duplicate enqueue, exclusive claiming, lease recovery, stale-owner refusal, original immutability, normalized/result persistence, heartbeat and exact source-timestamp preservation. The timestamp check covers a microsecond precision bug caught during browser validation.
- **Nine HTTP smoke checks** against the final production server: homepage, health, calculated sample, input validation, refusal of live-to-fixture fallback, authorization, approved-origin preflight, unrelated-origin rejection and protected readiness.
- Two ten-request local cached-comparison benchmarks. The final batch took **10.79–301.95 ms**, median **17.92 ms**. PostgreSQL counts confirmed **zero new jobs and zero provider-usage records** during that final batch. A cached browser result also displayed 0.15 seconds. This is a real comparison over existing retailer evidence, with zero purchase-ready lines; it is not merely a queue acknowledgement or a complete landed quote.
- The separate Pages React/domain bundle built with pinned esbuild, with server imports and private environment files excluded from its dependency graph.

## Real API checks and limits

- Direct TinyFish Fetch retrieved products and policy content from both Robu and Robocraze. Some later attempts timed out; Robu's policy still returned a placeholder and its checked breadboard was out of stock. HTTP 200 is not treated as per-URL success.
- A replacement Gemini key successfully generated structured JSON. Real gemini-3.5-flash-lite extraction then recovered Robocraze HC-SR04 at ₹75 and DHT11 module at ₹59, and Robu HC-SR04 at ₹79 and DHT11 module at ₹59, with verbatim excerpts and actual token usage stored. New evidence is in extraction-recheck-2026-10-20.json.
- Actual extraction calls ranged from about 3 to 17 seconds, and further calls timed out. The last saved-page recheck took 89.8 seconds overall. The earlier project-denied 403 remains historical evidence, not the current diagnosis. A successful generation test does not guarantee sustained provider availability or free-tier eligibility.
- HC-SR04 total pin count, ordering constraints and complete basket shipping were not established sufficiently. Incorrect signal-name extraction is rejected; unknown fields stay unknown. No complete live plan resulted.
- Earlier TinyFish Agent run **52d7ca78-5076-4dbd-a08b-760a3d67c08c** reported a ₹248 three-line cart but did not verify pincode serviceability/shipping and marked its basket as mismatching. Shipping correctly stayed unknown. No new Agent run was started during the latest recheck because product requirements did not qualify a candidate basket. The new order-control schema remains unqualified live.

## Browser checks

The updated desktop layout and a narrow mobile layout were visually inspected. Mobile document width equalled viewport width (375 CSS pixels), with no horizontal overflow. Quantity three recalculated the sample from ₹295 to ₹370; reset restored ₹295. Cached comparison showed the four grounded prices and protected originals/usage in Evidence. No browser errors were reported. Proof: workbench-current-desktop.png and workbench-current-mobile.png.

## Deployment boundary

The full web application, PostgreSQL and worker run on localhost. The public GitHub Pages build is a clearly labelled synthetic calculator and server-setup interface. A public live backend has not been provisioned; the owner confirmed there is no hosting account. Pages cannot run the worker or PostgreSQL. No paid hosting or billing was enabled.

The final Pages release is verified separately after publishing. Historical public-release records remain in Git history; main and gh-pages serve different build targets from the same source release.

## Still open

- Reliable extraction of every required attribute and ordering constraint, complete pincode shipping, two qualified retailers and one independently checked landed total.
- Human review, user research, a demo recording and model accuracy evaluation.
- A newly collected, fully verified basket within seven seconds. The cached response target does not satisfy that stricter interpretation; discuss it with the mentor.
- Public live hosting, Docker execution and process-kill recovery beyond SQL lease tests.

Run pnpm test, pnpm typecheck, pnpm build, pnpm test:http and pnpm benchmark:http. The benchmark is read-only and requires a usable cache. Real provider checks are opt-in and may consume quota. See [performance](PERFORMANCE.md), [feasibility](FEASIBILITY.md) and [deployment](DEPLOYMENT.md).

## Final public release check

GitHub Pages reported commit **35d16916dbed288cd26896231c29d77cb3c06e7f** built successfully. The deployed HTML, hashed JavaScript and CSS returned HTTP 200. The actual public calculator changed quantity three to ₹370 and reset to ₹295, with no browser errors. Screenshot: [published release](pages-current-release.png). Source implementation: **9c24a4790858c916e7aeb2bb6afb27477b9ca77b**. The public release remains the static sample, with no live backend connected.

## Temporary backend connection and strict budget check

A Cloudflare Quick Tunnel exposed the existing backend temporarily. Public health returned 200, allowed-origin preflight 204, protected readiness 200 with database/worker ready, and unauthenticated readiness 401. This is a real server path, not a static fixture; it remains dependent on the team computer and has no hosting uptime guarantee. The separate fresh-quote seven-second benchmark **failed**: the new refreshed job was still processing at the deadline. See [preview details](PUBLIC-PREVIEW.md) and the two new evidence captures. This supersedes the earlier statement that Pages had no connected backend, once the new frontend release is published.

## Connected frontend verification

Pages release **9ee6f65206ce3033536a6e9438e92915a1141199** loaded the connected frontend successfully. In the actual public browser, team-token authentication reached the database and worker, and a cached comparison returned real retailer observations in 1.06 seconds. This was not a new collection and is not a strict-budget pass. All nine HTTP smoke checks also passed through the public tunnel. The refreshed budget-test quote later finished partial, with no complete verified plan. Proof: [connected frontend](public-backend-connected.png). The preview remains dependent on the team computer staying online.

