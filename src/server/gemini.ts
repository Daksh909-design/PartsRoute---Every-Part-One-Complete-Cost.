import { z } from "zod";
import { EVIDENCE_INSTRUCTIONS, StructuredAIProvider, type Usage } from "./ai";
import { ProviderAccessError, providerFingerprint } from "./provider-error";
import { TaskPool } from "./concurrency";
import {
  CollectionDeadline,
  requestSignal,
  waitWithinDeadline,
} from "./deadline";

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
  private queue = new TaskPool(
    Math.min(8, Math.max(1, Number(process.env.GEMINI_CONCURRENCY) || 8)),
  );
  private nextRequest = 0;
  private accessFailure: ProviderAccessError | null = null;
  private serviceFailure: Error | null = null;
  constructor(
    private recordUsage: (usage: Usage) => Promise<void>,
    private apiKey = process.env.GEMINI_API_KEY,
    private transport: typeof fetch = fetch,
    private deadline = Infinity,
    private signal?: AbortSignal,
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
    return this.queue.run(async () => {
      this.signal?.throwIfAborted();
      if (this.accessFailure) throw this.accessFailure;
      if (this.serviceFailure) throw this.serviceFailure;
      const interval = Math.min(
        60000,
        Math.max(0, Number(process.env.GEMINI_REQUEST_INTERVAL_MS ?? 0) || 0),
      );
      const scheduled = Math.max(Date.now(), this.nextRequest);
      this.nextRequest = scheduled + interval;
      const delay = scheduled - Date.now();
      if (delay > 0)
        await waitWithinDeadline(delay, this.deadline, this.signal);
      if (this.accessFailure) throw this.accessFailure;
      if (this.serviceFailure) throw this.serviceFailure;
      const { $schema: _dialect, ...shape } = z.toJSONSchema(schema);
      let response: Response;
      const started = Date.now();
      const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
      for (let attempt = 0; ; attempt++) {
        try {
          response = await this.transport(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            {
              method: "POST",
              redirect: "error",
              signal: requestSignal(
                this.deadline,
                Math.min(
                  30000,
                  Math.max(
                    2000,
                    Number(process.env.GEMINI_TIMEOUT_MS) || 30000,
                  ),
                ),
                this.signal,
              ),
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": this.apiKey!,
              },
              body: JSON.stringify({
                model,
                store: false,
                system_instruction: `${EVIDENCE_INSTRUCTIONS} ${instructions}`,
                input: JSON.stringify(data),
                response_format: {
                  type: "text",
                  mime_type: "application/json",
                  schema: shape,
                },
                generation_config: {
                  max_output_tokens: 4500,
                  thinking_level: /flash-lite/.test(model) ? "minimal" : "low",
                },
              }),
            },
          );
        } catch (error) {
          this.signal?.throwIfAborted();
          // Expired queued work never started a provider request. An in-flight
          // abort has unknown remote usage and is recorded separately.
          if (error instanceof CollectionDeadline) throw error;
          const expired = Date.now() >= this.deadline;
          this.serviceFailure = expired
            ? new CollectionDeadline()
            : new Error(
                "Product extraction timed out or could not reach Google. Collected pages remain saved; try refreshing later.",
              );
          await this.recordFailure(
            0,
            this.serviceFailure.message,
            expired ? "budget_exhausted" : undefined,
          );
          throw this.serviceFailure;
        }
        if ([502, 503, 504].includes(response.status) && attempt === 0) {
          await this.recordFailure(
            response.status,
            "Google is temporarily unavailable; retrying once.",
          );
          await response.body?.cancel();
          await waitWithinDeadline(400, this.deadline, this.signal);
          continue;
        }
        break;
      }
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
            : response.status >= 500
              ? "Google's extraction service is temporarily unavailable. Your API key was not rejected. Collected pages remain saved."
              : `Gemini returned HTTP ${response.status}. Check the request configuration.`;
        await this.recordFailure(response.status, detail);
        if (response.status >= 500) this.serviceFailure = new Error(detail);
        throw new Error(detail);
      }
      const result = Interaction.parse(await response.json());
      await this.recordUsage({
        provider: "gemini",
        model: result.model || model,
        requestId: result.id ?? null,
        inputTokens: result.usage?.total_input_tokens ?? null,
        outputTokens: result.usage?.total_output_tokens ?? null,
        raw: {
          usage: result.usage ?? null,
          state: "responded",
          latencyMs: Date.now() - started,
          operation: _name,
          fingerprint: providerFingerprint("gemini", model, this.apiKey!),
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
  }
  private async recordFailure(
    httpStatus: number,
    detail: string,
    state?: string,
  ) {
    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    await this.recordUsage({
      provider: "gemini",
      model,
      requestId: null,
      inputTokens: null,
      outputTokens: null,
      raw: {
        state:
          state ??
          ([400, 401, 403, 404].includes(httpStatus)
            ? "blocked"
            : httpStatus === 429
              ? "quota"
              : "unavailable"),
        httpStatus,
        detail,
        fingerprint: providerFingerprint("gemini", model, this.apiKey!),
      },
    });
  }
}
