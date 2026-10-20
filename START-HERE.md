# Team setup checklist

1. For a prepared local installation run `pnpm local:start` and open `http://localhost:3000`; it is already running during the debugging handoff. Open the [public sample](https://daksh909-design.github.io/PartsRoute---Every-Part-One-Complete-Cost./). This demonstrates the calculator, not live TinyFish execution.
2. Read [keys and costs](docs/KEYS-AND-COSTS.md), then follow [LIVE-SETUP.md](docs/LIVE-SETUP.md) for local web, worker and PostgreSQL. Hosted `render.yaml` uses paid services; do not provision it for a zero-budget demo. Enter the TinyFish/Gemini API keys privately.
3. Open the actual server URL, choose **Retailer observations**, enter the generated team token and check the connection. All readiness checks must pass. Run `pnpm doctor --providers` from the configured stack for account/model checks.
4. The DHT11 catalogue URL has been corrected. Qualify the remaining required fields and both retailers. Run `pnpm validate:live 560001` with the regular worker stopped, inspect original observations and manually compare sources.
5. Obtain shipping for the exact complete basket and manually calculate the landed total. Unknown shipping remains unknown; the sample fixture does not satisfy this step.
6. Run tests, typecheck, production build and HTTP checks. Review [REVIEW.md](docs/REVIEW.md) and [VALIDATION.md](docs/VALIDATION.md) before recording the pitch.

Direct-key TinyFish Fetch/Agent, the local server/worker and real SQL checks have run. A replacement Gemini key restored generation and real structured extraction has run. Complete live shipping, reliable extraction of all required fields, human review and public live hosting remain open. The remaining account/credential steps cannot be completed by publishing static files to GitHub Pages.

The repository belongs to **Daksh909-design**. Its name ends in a dot; the Git URL is `https://github.com/Daksh909-design/PartsRoute---Every-Part-One-Complete-Cost..git`. Preserve existing history and never force-push over team changes.

Use **Compare latest observations** for a fast read-only result. Use **Refresh from retailers** to collect new evidence; it can take longer than seven seconds. Review [the timing measurements](docs/PERFORMANCE.md) before the pitch.

The updated Pages interface uses an account-free **temporary public backend** while this computer and its local services stay online. The same team token protects it. See [PUBLIC-PREVIEW.md](docs/PUBLIC-PREVIEW.md). The strict fresh seven-second test failed; do not submit the project as meeting that requirement.
