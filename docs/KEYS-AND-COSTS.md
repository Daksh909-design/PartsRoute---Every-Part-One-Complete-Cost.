# Provider keys and costs

PartsRoute uses TinyFish for collection and one selected AI provider for extraction. TinyFish credits, model usage and hosting are separate costs.

Copy `.env.example` to the ignored `.env.local` file. Fill `TINYFISH_API_KEY`, select `AI_PROVIDER`, and configure that provider's key and model. Restart web and worker after changing settings. On a hosted service, use its private environment settings instead.

The browser asks for `APP_ACCESS_TOKEN`, the separate PartsRoute team token. It does not accept provider API keys.

Check the account's billing tier, available model, quotas and spending controls in the provider dashboard before running live checks. A successful request does not establish that usage is free. Request spacing and application rate limits are not account spending caps. The application does not automatically switch to a paid provider after a failure.

Sample mode needs no keys. The provider validation scripts and live quotes consume real API quota. The Render blueprint specifies paid resources; check the provider's estimate before using it to create additional services. The existing hosted app's billing plan has not been inspected.

[Google billing](https://ai.google.dev/gemini-api/docs/billing) · [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) · [TinyFish](https://docs.tinyfish.ai/) · [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
