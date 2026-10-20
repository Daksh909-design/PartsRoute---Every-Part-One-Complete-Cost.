# Validation actually performed

Development date: **20 October 2026**. This file distinguishes observed checks from setup still required.

## Latest debugging revision

- **49 tests passed across six files**, using `node node_modules/vitest/vitest.mjs run --configLoader native`. This includes Gemini mocked HTTP schemas, usage recording, incomplete/invalid output rejection and quota failure without a paid fallback. The JavaScript Vitest config and native loader avoid Windows config bundling subprocess restrictions.
- TypeScript checking passed after the Gemini integration and readiness/interface changes. Prettier ran on edited sources and documentation.
- Before adding Gemini, the workbench/readiness revision passed a production build, static export and nine HTTP checks (the original six plus approved-origin CORS preflight, foreign-origin rejection and authenticated readiness). Browser interaction checked recalculation from two to three HC-SR04 units, stale-result notice, reset and evidence navigation.
- Fresh TinyFish connector Fetch succeeded for the Robocraze HC-SR04 product and shipping policy. Fresh connector Agent run `0719d7ea-f349-4c37-8e5d-82783e1b5558` established the checked DHT11 is a bare four-pin sensor, not the requested breakout board. Original captures are saved as `debug-fetch-2026-10-20.json` and `debug-agent-2026-10-20.json`. Neither check establishes a complete pincode basket or direct-key application execution.
- Subsequent builds under the current restricted Windows runtime failed with `spawn EPERM`. The newest Gemini revision has **not** passed a production/static build and has not been redeployed to Pages. Earlier successful builds below are historical, not a pass for this revision.
- PostgreSQL 17.11 binaries were initialized locally, but startup failed under the runtime's interprocess-signalling restrictions. No SQL migration/integration pass is claimed. `test:postgres` supplies separate real-database checks for a dedicated `_test` database; they have not run successfully. The optional local helper needs machine-specific ignored configuration and execution in the user's own Windows terminal.
- No calls were made with API keys shared in chat. Such keys must be revoked/replaced privately. Gemini account tier was checked only through the owner's report of **Set up billing** in AI Studio; no authenticated billing dashboard inspection or live extraction was performed.

The following sections preserve earlier validation and release history.

## Executed successfully

- Pinned dependency installation, lockfile generation and the explicitly allowlisted esbuild postinstall. A repository formatting pass used pinned Prettier.
- **35 Vitest tests across four files**: arithmetic/matching, TinyFish mocked HTTP contracts and basket validation, access boundaries, and a full pipeline/resumption test with mocked providers and persistence. The resumption test also exposed and led to a fix for punctuation after a quoted numeric quantity.
- TypeScript checking with `tsc --noEmit`.
- Production compilation using `next build --webpack`.
- Six HTTP smoke checks against a running production server: homepage, health, calculated eight-plan synthetic result with ₹295 best total, invalid pincode rejection, live-to-demo fallback refusal, and refusal of an unauthenticated/unconfigured live request.
- Browser check of the saved-data submission and result: three eligible lines, eight sample plans, ₹255 listed items + ₹40 shipping = ₹295. Screenshot in `sample-preview.png` records the narrow viewport, with synthetic labelling visible.
- Live **TinyFish connector** Fetch calls and one Agent run, preserved in `docs/evidence`; see `FEASIBILITY.md` for exact limitations.

## Interface refresh validation

The refreshed interface passed the same 35 tests, TypeScript checking, production build and six HTTP smoke checks. Browser checks at a narrow viewport confirmed sample calculation (₹295), the calculated ₹25 difference from the next complete sample plan, the sample reset button, retailer coverage disclosure and integration/evidence navigation. `redesign-home.png` and `redesign-result.png` record the refreshed interface. Desktop-width visual QA remains outstanding.

GitHub Actions is supplied as an optional template in `ci-workflow.yml.example`, rather than an enabled workflow. The initial push was refused because the signed-in OAuth grant does not include workflow permission; application publication does not require broadening that grant.

Windows process sandboxing initially blocked Vite's Windows path detection and dependency postinstall. The tests/build were rerun with normal Windows process access and succeeded. Earlier dependency-download timeouts and the first failing pipeline test are not counted as passes.

## GitHub Pages deployment check

On 20 October 2026, `pnpm build:pages` completed successfully. The shared calculator extraction passed all 35 tests and TypeScript checking. GitHub reported the `gh-pages` release `be7cde9996071fc5fe5d00172bafaf73fd592126` as built. The public [Pages demo](https://daksh909-design.github.io/PartsRoute---Every-Part-One-Complete-Cost./) loaded in the browser, showed live mode disabled and calculated eight sample plans with a ₹295 best sample total. This was a deployment smoke check; a comprehensive code, documentation and UI review has not been performed. Pages does not validate the live provider or worker path.

## Not executed or not qualified

- No real Gemini or OpenAI extraction call, API account/model-access evaluation, accuracy/latency evaluation or paid usage measurement. Shared keys were not used; replacement private credentials are required.
- No direct-key application TinyFish API call: no app API key available. Connector live evidence is a separate validation surface.
- No PostgreSQL migration/worker integration test, concurrent-worker lease or process-crash test against PostgreSQL: no PostgreSQL/Docker service was available. In-memory persistence tests do not validate SQL.
- No verified complete three-line live landed basket and no human review. Retailer qualification remains open.
- No desktop-width visual QA, Docker image execution, live server deployment or custom CI workflow execution. The Pages deployment check above is limited to the static saved-data demo.

Run `pnpm test`, `pnpm typecheck`, `pnpm build`, then `pnpm test:http` with `pnpm start` running. After configuring PostgreSQL/keys, run `pnpm db:migrate`, `pnpm validate:live 560001` with the regular worker stopped, and complete the human checklist in `FEASIBILITY.md`.
