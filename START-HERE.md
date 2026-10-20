# Team setup checklist

1. Open the [public sample](https://daksh909-design.github.io/PartsRoute---Every-Part-One-Complete-Cost./). This demonstrates the calculator, not live TinyFish execution.
2. Read [keys and costs](docs/KEYS-AND-COSTS.md), then follow [LIVE-SETUP.md](docs/LIVE-SETUP.md) for local web, worker and PostgreSQL. Hosted `render.yaml` uses paid services; do not provision it for a zero-budget demo. Enter the TinyFish/Gemini API keys privately.
3. Open the actual server URL, choose **Live quote**, enter the generated team token and check the connection. All readiness checks must pass. Run `pnpm doctor --providers` from the configured stack for account/model checks.
4. Resolve the DHT11 breakout-versus-bare-sensor mismatch and qualify both retailers. Run `pnpm validate:live 560001` with the regular worker stopped, inspect original observations and manually compare sources.
5. Obtain shipping for the exact complete basket and manually calculate the landed total. Unknown shipping remains unknown; the sample fixture does not satisfy this step.
6. Run tests, typecheck, production build and HTTP checks. Review [REVIEW.md](docs/REVIEW.md) and [VALIDATION.md](docs/VALIDATION.md) before recording the pitch.

No complete live basket, real AI extraction, human review or hosted live server is claimed. The remaining account/credential steps cannot be completed by publishing static files to GitHub Pages.

The repository belongs to **Daksh909-design**. Its name ends in a dot; the Git URL is `https://github.com/Daksh909-design/PartsRoute---Every-Part-One-Complete-Cost..git`. Preserve existing history and never force-push over team changes.
