# Validation actually performed

Development date: **20 October 2026**. This file distinguishes observed checks from setup still required.

## Executed successfully

- Pinned dependency installation, lockfile generation and the explicitly allowlisted esbuild postinstall. A repository formatting pass used pinned Prettier.
- **35 Vitest tests across four files**: arithmetic/matching, TinyFish mocked HTTP contracts and basket validation, access boundaries, and a full pipeline/resumption test with mocked providers and persistence. The resumption test also exposed and led to a fix for punctuation after a quoted numeric quantity.
- TypeScript checking with `tsc --noEmit`.
- Production compilation using `next build --webpack`.
- Six HTTP smoke checks against a running production server: homepage, health, calculated eight-plan synthetic result with ₹295 best total, invalid pincode rejection, live-to-demo fallback refusal, and refusal of an unauthenticated/unconfigured live request.
- Browser check of the saved-data submission and result: three eligible lines, eight sample plans, ₹255 listed items + ₹40 shipping = ₹295. Screenshot in `sample-preview.png` records the narrow viewport, with synthetic labelling visible.
- Live **TinyFish connector** Fetch calls and one Agent run, preserved in `docs/evidence`; see `FEASIBILITY.md` for exact limitations.

Windows process sandboxing initially blocked Vite's Windows path detection and dependency postinstall. The tests/build were rerun with normal Windows process access and succeeded. Earlier dependency-download timeouts and the first failing pipeline test are not counted as passes.

## Not executed or not qualified

- No real OpenAI extraction call, API account/model-access evaluation, accuracy/latency evaluation or paid usage measurement: no API key available.
- No direct-key application TinyFish API call: no app API key available. Connector live evidence is a separate validation surface.
- No PostgreSQL migration/worker integration test, concurrent-worker lease or process-crash test against PostgreSQL: no PostgreSQL/Docker service was available. In-memory persistence tests do not validate SQL.
- No verified complete three-line live landed basket and no human review. Retailer qualification remains open.
- No desktop-width visual QA, Docker image execution, remote deployment, GitHub Actions execution or public hosting validation.

Run `pnpm test`, `pnpm typecheck`, `pnpm build`, then `pnpm test:http` with `pnpm start` running. After configuring PostgreSQL/keys, run `pnpm db:migrate`, `pnpm validate:live 560001` with the regular worker stopped, and complete the human checklist in `FEASIBILITY.md`.
