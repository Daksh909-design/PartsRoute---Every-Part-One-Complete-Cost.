# Keys and avoiding charges

Gemini is the default AI provider. OpenAI is optional and usage is paid separately from ChatGPT. Changing a model name does not prove your project is on a free billing tier.

## Check Gemini first

1. Open [Google AI Studio projects](https://aistudio.google.com/projects), signed in to the account that owns the key.
2. Find that key's project and inspect **Billing Tier**. Use a **Free** project with no linked billing account. Do not choose **Set up billing**, add funds or enable auto-reload for a zero-budget demo.
3. A paid project is charged at paid prices even for a model also offered on the free tier. Use a separate free project instead. Do not unlink billing from a shared project without checking its other services.
4. Create a key for the free project at [API keys](https://aistudio.google.com/api-keys). The application cannot discover your billing tier from the key or a successful model response.

Google lists `gemini-3.8-flash` input/output as free on its free tier, subject to quota and eligibility. Quota exhaustion stops requests; this application does not switch to a paid provider. Request spacing limits bursts but does not guarantee quota availability or a spending cap on a paid project.

## Enter keys privately

Open `.env.local` in the repository root. If it does not exist, copy `.env.example` first. Keep the existing database and team-token lines; set these values:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=REPLACE_WITH_YOUR_NEW_PRIVATE_KEY
GEMINI_MODEL=gemini-3.8-flash
TINYFISH_API_KEY=REPLACE_WITH_YOUR_NEW_PRIVATE_KEY
```

Leave `OPENAI_API_KEY` blank. Save the file, then restart the web process and worker. Do not paste provider keys into the website, chat, screenshots or GitHub. `.env.local` is ignored by Git. If a key has already been shared, revoke it and create a replacement before proceeding.

The **team access token** is the separate `APP_ACCESS_TOKEN` value. It only unlocks protected PartsRoute endpoints; it does not provide model credits, database access or a running worker.

## Other costs

TinyFish has its own account credits and limits. Check those in the TinyFish dashboard before live collection. A free Gemini project does not make TinyFish or hosting free. GitHub Pages serves the sample only; the prepared Render web/worker/database deployment uses paid services and has not been provisioned.

Sources: [Google billing and project tiers](https://ai.google.dev/gemini-api/docs/billing), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenAI pricing](https://developers.openai.com/api/docs/pricing).
