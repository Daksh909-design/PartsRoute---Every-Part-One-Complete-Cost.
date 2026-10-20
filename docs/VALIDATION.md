# Validation actually performed

Checked on **20 October 2026**. A successful sample or HTTP response does not establish a complete live purchasing recommendation.

## Automated checks that passed

- **60 Vitest tests across eight files** using `node node_modules/vitest/vitest.mjs run --configLoader native`. These use explicitly labelled synthetic fixtures or mocked HTTP. They cover pricing/matching, tax/thresholds, unknown shipping, provider contracts, resumption, account-error handling, readiness, candidate isolation and source-supported quantity controls.
- TypeScript checking with `tsc --noEmit`.
- Full Next.js production build with `PARTSROUTE_BUILD_THREADS=1`. TypeScript 6.0.3 supplies the compiler API for Next's thread path; type checking remains enabled. Default fork-based builds were blocked by this coding environment's `spawn EPERM`, not passed silently.
- **Nine real PostgreSQL checks** against a separate `partsroute_test` database: repeated migrations, idempotent concurrent enqueue, exclusive worker claiming, expired-lease recovery, stale-owner completion refusal, original observation immutability, normalized persistence, calculated result persistence and worker heartbeat detection.
- **Nine HTTP smoke checks** against the production web server: homepage, health, calculated sample, input validation, refusal of live-to-fixture fallback, authorization, approved-origin preflight, unrelated-origin refusal and protected readiness.
- Shared static React/optimizer sample compiled with pinned esbuild through its native CLI and the prepare/finish build path. This is separate from the Next.js server build; the dependency manifest excludes server adapters, API routes and private environment files.

## Browser checks

Desktop (1440 × 1000) and mobile (390 × 844) views were inspected. The sample is calculated on first load and explicitly labelled. Changing HC-SR04 quantity from two to three shows a stale-result notice, then recalculates the best sample total from **₹295 to ₹370**. The item-first comparison changes from **₹345 versus ₹295** to **₹410 versus ₹370**. Reset restores the sample. Desktop proof is in `workbench-desktop.png`.

Authenticated local readiness showed configured providers, migrated PostgreSQL and a current worker heartbeat. A real web/worker quote retained two TinyFish observations and failed with Google's generation-access denial rather than a fabricated offer. Retrying account failures is bounded; a recorded Gemini failure blocks repeat quote creation for five minutes for that same key/model fingerprint. Private keys are not in the browser or repository.

## Direct API observations

- **TinyFish Fetch:** actual application-key calls retrieved all three curated product pages and the policy URL for each configured retailer, with zero per-URL transport errors in that check. Captures: `direct-robu-2026-10-20.json`, `direct-robocraze-2026-10-20.json`.
- Page retrieval does not prove useful content: Robu's policy response still contains `Shipping Policy Page Content`. Its checked breadboard is out of stock. These are not qualified offers/rules.
- Additional TinyFish Fetch calls established a distinct Robocraze DHT11 module listing, SKU **TIFSS0029**, with published PCB/package evidence. The catalogue now uses that URL. Old bare-sensor mismatch captures remain historical evidence.
- **TinyFish Agent:** direct-key run **52d7ca78-5076-4dbd-a08b-760a3d67c08c** completed a three-line guest-cart research probe. It reported the expected quantities and ₹248 item subtotal, but did not establish pincode serviceability or shipping and marked the basket as mismatching. The validator correctly kept shipping and landed total unknown. A sanitized original is saved; browser-session/video links were excluded from the public copy. This probe did not test the subsequently added order-control fields.
- **Gemini:** model metadata returned HTTP 200. Actual generation returned **HTTP 403**, with `Your project has been denied access. Please contact support.` Both Interactions and GenerateContent failed. The opt-in real extraction test therefore **failed**; no live AI extraction pass, accuracy result or successful model usage is claimed. The owner's report of `Set up billing` is not an authenticated billing audit.

## Still open

- Resolve Google project generation permissions without enabling paid billing merely to retry.
- Run the full application extraction and new Agent order-control path with a working AI account; manually verify a source sample.
- Obtain complete pincode-specific shipping, qualify two retailers and confirm one three-line landed total by hand.
- Exercise process-kill recovery beyond the real SQL lease tests, Docker execution and actual hosted web/worker deployment.

The live milestone remains **incomplete**. GitHub Pages publishes a sample, not the live server. No paid hosting has been provisioned.

## Reproduce

Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm test:http` with `pnpm start` running. On a host needing the thread path, set `PARTSROUTE_BUILD_THREADS=1`. For real SQL, provide a dedicated `TEST_DATABASE_URL` ending in `_test` and run `pnpm test:postgres`. `pnpm validate:providers` deliberately calls live providers and may consume quota; it must remain separate from ordinary fixture tests. Follow `FEASIBILITY.md` before treating a basket as verified.
