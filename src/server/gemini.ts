import { z } from "zod";
import { EVIDENCE_INSTRUCTIONS, StructuredAIProvider, type Usage } from "./ai";
import { ProviderAccessError, providerFingerprint } from "./provider-error";

const Interaction = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  status: z.string(),
  steps: z
    .array(
      z
        .object({
          type: z.string(),
          content: z
            .array(
              z
                .object({ type: z.string(), text: z.string().optional() })
                .passthrough(),
            )
            .optional(),
        })
        .passthrough(),
    )
    .optional(),
  usage: z
    .object({
      total_input_tokens: z.number().optional(),
      total_output_tokens: z.number().optional(),
    })
    .passthrough()
    .optional(),
});
export class GeminiProvider extends StructuredAIProvider {
  readonly provider = "gemini" as const;
  private queue: Promise<unknown> = Promise.resolve();
  private nextRequest = 0;
  private accessFailure: ProviderAccessError | null = null;
  constructor(
    private recordUsage: (usage: Usage) => Promise<void>,
    private apiKey = process.env.GEMINI_API_KEY,
    private transport: typeof fetch = fetch,
  ) {
    super();
    if (!apiKey)
      throw new Error("GEMINI_API_KEY is required for Gemini extraction.");
  }
  protected structured<T extends z.ZodType>(
    schema: T,
    _name: string,
    instructions: string,
    data: unknown,
  ): Promise<z.infer<T>> {
    const operation = this.queue.then(async () => {
      if (this.accessFailure) throw this.accessFailure;
      const interval = Math.min(
        60000,
        Math.max(
          0,
          Number(process.env.GEMINI_REQUEST_INTERVAL_MS ?? 12000) || 0,
        ),
      );
      const delay = this.nextRequest - Date.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      this.nextRequest = Date.now() + interval;
      const { $schema: _dialect, ...shape } = z.toJSONSchema(schema);
      const response = await this.transport(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(60000),
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey!,
          },
          body: JSON.stringify({
            model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
            store: false,
            system_instruction: `${EVIDENCE_INSTRUCTIONS} ${instructions}`,
            input: JSON.stringify(data),
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: shape,
            },
            generation_config: { max_output_tokens: 6000 },
          }),
        },
      );
      if (!response.ok) {
        if ([400, 401, 403, 404].includes(response.status)) {
          const error = await response.json().catch(() => null);
          const reason = String(error?.error?.message || "");
          const denied = /project has been denied access/i.test(reason);
          const leaked = /reported as leaked/i.test(reason);
          const invalid =
            /API_KEY_INVALID|API key not valid|invalid API key/i.test(
              reason + " " + JSON.stringify(error?.error?.details || []),
            );
          if (response.status !== 400 || invalid || leaked) {
            this.accessFailure = new ProviderAccessError(
              "gemini",
              denied
                ? "project_denied"
                : leaked
                  ? "key_leaked"
                  : invalid
                    ? "key_invalid"
                    : `http_${response.status}`,
              denied
                ? "Google denied generation access to this Gemini project. Check the project in Google AI Studio or contact Google support. Enabling paid billing is not required by PartsRoute; do not enable it just to retry."
                : leaked
                  ? "Google rejected this Gemini key as leaked. Replace GEMINI_API_KEY privately and restart the worker."
                  : invalid || response.status === 401
                    ? "Google rejected the Gemini API key. Check GEMINI_API_KEY privately and restart the worker."
                    : response.status === 404
                      ? "The selected Gemini model or API endpoint is unavailable. Check GEMINI_MODEL and account access."
                      : "Google refused generation access. Check the project's API permissions and regional availability in Google AI Studio.",
            );
            await this.recordFailure(
              response.status,
              this.accessFailure.message,
            );
            throw this.accessFailure;
          }
        }
        const detail =
          response.status === 429
            ? "Gemini quota reached. Wait and retry the saved quote; no paid fallback was started."
            : `Gemini returned HTTP ${response.status}. Check the key, account and model access.`;
        await this.recordFailure(response.status, detail);
        throw new Error(detail);
      }
      const result = Interaction.parse(await response.json());
      await this.recordUsage({
        provider: "gemini",
        model: result.model || process.env.GEMINI_MODEL || "gemini-3.8-flash",
        requestId: result.id ?? null,
        inputTokens: result.usage?.total_input_tokens ?? null,
        outputTokens: result.usage?.total_output_tokens ?? null,
        raw: {
          usage: result.usage ?? null,
          state: "responded",
          fingerprint: providerFingerprint(
            "gemini",
            process.env.GEMINI_MODEL || "gemini-3.8-flash",
            this.apiKey!,
          ),
        },
      });
      if (result.status !== "completed")
        throw new Error(
          "Gemini returned an incomplete or refused extraction. Missing facts remain unknown.",
        );
      const text = result.steps
        ?.filter((step) => step.type === "model_output")
        .flatMap((step) => step.content || [])
        .filter((content) => content.type === "text")
        .map((content) => content.text || "")
        .join("");
      if (!text) throw new Error("Gemini returned no structured extraction.");
      return schema.parse(JSON.parse(text));
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  private async recordFailure(httpStatus: number, detail: string) {
    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    await this.recordUsage({
      provider: "gemini",
      model,
      requestId: null,
      inputTokens: null,
      outputTokens: null,
      raw: {
        state: "blocked",
        httpStatus,
        detail,
        fingerprint: providerFingerprint("gemini", model, this.apiKey!),
      },
    });
  }
}
