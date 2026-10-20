import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../src/server/gemini";
import { aiConfig, createAIProvider } from "../src/server/ai-provider";

beforeEach(() => {
  vi.stubEnv("GEMINI_REQUEST_INTERVAL_MS", "0");
  vi.stubEnv("GEMINI_CONCURRENCY", "1");
});
afterEach(() => vi.unstubAllEnvs());
function completed(value: unknown, extra = {}) {
  return new Response(
    JSON.stringify({
      id: "fixture-interaction",
      model: "fixture-model",
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: JSON.stringify(value) }],
        },
      ],
      ...extra,
    }),
    { status: 200 },
  );
}
describe("Gemini adapter contracts (mocked HTTP, no API usage)", () => {
  it("caps an oversized concurrency setting at eight requests", async () => {
    vi.stubEnv("GEMINI_CONCURRENCY", "99");
    const release: (() => void)[] = [];
    const transport = vi.fn(async () => {
      await new Promise<void>((resolve) => release.push(resolve));
      return completed({ factIndices: [0] });
    });
    const provider = new GeminiProvider(async () => {}, "fixture-key", transport);
    const jobs = Array.from({ length: 9 }, () => provider.explain(["fact"]));
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(8));
    release.shift()!();
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(9));
    release.splice(0).forEach((done) => done());
    expect(await Promise.all(jobs)).toHaveLength(9);
  });
  it("runs independent requests concurrently up to the configured limit", async () => {
    vi.stubEnv("GEMINI_CONCURRENCY", "2");
    let active = 0,
      peak = 0;
    const release: (() => void)[] = [];
    const transport = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => release.push(resolve));
      active--;
      return completed({ factIndices: [0] });
    });
    const provider = new GeminiProvider(
      async () => {},
      "fixture-key",
      transport,
    );
    const jobs = [
      provider.explain(["A"]),
      provider.explain(["B"]),
      provider.explain(["C"]),
    ];
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(peak).toBe(2);
    release.shift()!();
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
    release.splice(0).forEach((done) => done());
    expect(await Promise.all(jobs)).toEqual(["A", "B", "C"]);
    expect(peak).toBe(2);
  });
  it("retries a temporary 503 once and records it as an outage, not a key denial", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(completed({ factIndices: [0] }));
    const provider = new GeminiProvider(record, "fixture-key", transport);
    expect(await provider.explain(["Validated fact"])).toBe("Validated fact");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[0][0].raw.state).toBe("unavailable");
  });
  it("bounds an ongoing outage and stops subsequent queued calls", async () => {
    const transport = vi
      .fn()
      .mockImplementation(async () => new Response("busy", { status: 503 }));
    const provider = new GeminiProvider(
      async () => {},
      "fixture-key",
      transport,
    );
    const results = await Promise.allSettled([
      provider.explain(["fact"]),
      provider.explain(["fact"]),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
    expect((results[0] as PromiseRejectedResult).reason.message).toContain(
      "temporarily unavailable",
    );
    expect((results[0] as PromiseRejectedResult).reason.message).not.toContain(
      "Check the key",
    );
  });
  it("records transport timeouts with unknown usage and does not retry every component", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const transport = vi
      .fn()
      .mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    const provider = new GeminiProvider(record, "fixture-key", transport);
    await expect(provider.explain(["fact"])).rejects.toThrow("timed out");
    await expect(provider.explain(["fact"])).rejects.toThrow("timed out");
    expect(transport).toHaveBeenCalledOnce();
    expect(record.mock.calls[0][0].inputTokens).toBeNull();
    expect(record.mock.calls[0][0].raw.state).toBe("unavailable");
  });
  it("stops queued requests after a project denial without exposing the provider's raw response", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message:
              "Your project has been denied access. Please contact support.",
            private: "fixture-private-data",
          },
        }),
        { status: 403 },
      ),
    );
    const provider = new GeminiProvider(
      async () => {},
      "fixture-key",
      transport,
    );
    const settled = await Promise.allSettled([
      provider.explain(["fact"]),
      provider.explain(["fact"]),
    ]);
    expect(settled.every((item) => item.status === "rejected")).toBe(true);
    expect(transport).toHaveBeenCalledOnce();
    const error = (settled[0] as PromiseRejectedResult).reason;
    expect(error.code).toBe("project_denied");
    expect(error.message).toContain("Google denied generation access");
    expect(error.message).not.toContain("fixture-private-data");
  });
  it("does not mislabel an unsupported request schema as an account denial", async () => {
    const provider = new GeminiProvider(
      async () => {},
      "fixture-key",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: "Invalid schema" } }),
            { status: 400 },
          ),
        ),
    );
    await expect(provider.explain(["fact"])).rejects.toThrow("HTTP 400");
  });
  it("defaults to Gemini and never falls back to a configured paid OpenAI key", () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "fixture-only");
    expect(aiConfig().provider).toBe("gemini");
    expect(() => createAIProvider(async () => {})).toThrow("GEMINI_API_KEY");
  });
  it("sends a JSON schema and untrusted source separately; records actual usage", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const transport = vi.fn().mockResolvedValue(
      completed(
        { factIndices: [0, 99, 0] },
        {
          usage: { total_input_tokens: 21, total_output_tokens: 8 },
        },
      ),
    );
    const provider = new GeminiProvider(record, "fixture-key", transport);
    expect(await provider.explain(["Only this validated fact."])).toBe(
      "Only this validated fact.",
    );
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    expect(url).not.toContain("fixture-key");
    expect(init.headers["x-goog-api-key"]).toBe("fixture-key");
    const body = JSON.parse(init.body);
    expect(body.store).toBe(false);
    expect(body.response_format.mime_type).toBe("application/json");
    expect(body.response_format.schema.properties.factIndices.type).toBe(
      "array",
    );
    expect(body.system_instruction).toContain("untrusted DATA");
    expect(JSON.parse(body.input).facts).toEqual(["Only this validated fact."]);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gemini",
        requestId: "fixture-interaction",
        inputTokens: 21,
        outputTokens: 8,
      }),
    );
  });
  it("preserves missing commercial facts as null and absent usage as unknown", async () => {
    const policy = {
      summary: "Not published",
      excerpt: "Contact us",
      thresholdInr: null,
      basis: "unknown",
      comparison: "gte",
      belowChargeInr: null,
      aboveChargeInr: null,
      taxStatus: "unknown",
      taxRateBps: null,
      applicableToPincode: null,
    };
    const record = vi.fn().mockResolvedValue(undefined);
    const provider = new GeminiProvider(
      record,
      "fixture-key",
      vi.fn().mockResolvedValue(completed(policy)),
    );
    expect(await provider.policy("Contact us", "560001")).toEqual(policy);
    expect(record.mock.calls[0][0].inputTokens).toBeNull();
    expect(record.mock.calls[0][0].outputTokens).toBeNull();
  });
  it("rejects invalid values rather than treating schema-constrained output as trustworthy", async () => {
    const provider = new GeminiProvider(
      async () => {},
      "fixture-key",
      vi.fn().mockResolvedValue(completed({ factIndices: [-1] })),
    );
    await expect(provider.explain(["fact"])).rejects.toThrow();
  });
  it("rejects incomplete output and records its published usage", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const provider = new GeminiProvider(
      record,
      "fixture-key",
      vi.fn().mockResolvedValue(completed({}, { status: "incomplete" })),
    );
    await expect(provider.explain(["fact"])).rejects.toThrow("incomplete");
    expect(record).toHaveBeenCalledOnce();
  });
  it("does not retry quota errors and can process the next deliberate request", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response("quota", { status: 429 }))
      .mockResolvedValueOnce(completed({ factIndices: [0] }));
    const provider = new GeminiProvider(
      async () => {},
      "fixture-key",
      transport,
    );
    await expect(provider.explain(["fact"])).rejects.toThrow(
      "no paid fallback",
    );
    expect(transport).toHaveBeenCalledOnce();
    expect(await provider.explain(["fact"])).toBe("fact");
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
