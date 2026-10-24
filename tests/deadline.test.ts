import { afterEach, expect, it, vi } from "vitest";
import { collectionWindowMs, requestSignal } from "../src/server/deadline";
import { GeminiProvider } from "../src/server/gemini";
import { TinyFishClient } from "../src/server/tinyfish";
afterEach(() => vi.unstubAllEnvs());
it("rejects a request scheduled beyond the deadline without waiting out its spacing slot", async () => {
  vi.stubEnv("GEMINI_REQUEST_INTERVAL_MS", "60000");
  const transport = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: '{"factIndices":[0]}' }],
            },
          ],
        }),
      ),
    );
  const ai = new GeminiProvider(
    async () => {},
    "fixture",
    transport,
    Date.now() + 1000,
  );
  const first = ai.explain(["Fact"]);
  const started = performance.now();
  await expect(ai.explain(["Fact"])).rejects.toThrow("collection window");
  expect(performance.now() - started).toBeLessThan(500);
  await first;
  expect(transport).toHaveBeenCalledTimes(1);
});
it("keeps the configurable collection window bounded with response headroom", () => {
  vi.stubEnv("QUOTE_COLLECTION_BUDGET_MS", "999999");
  expect(collectionWindowMs()).toBe(26000);
  expect(() => requestSignal(Date.now() - 1, 30000)).toThrow(
    "unfinished details remain unverified",
  );
});
it("does not start expired model work or claim model usage for it", async () => {
  const transport = vi.fn(),
    record = vi.fn();
  const ai = new GeminiProvider(
    record,
    "fixture-key",
    transport,
    Date.now() - 1,
  );
  await expect(ai.explain(["Validated fixture fact"])).rejects.toThrow(
    "collection window",
  );
  expect(transport).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
});
it("aborts an in-flight model request and records unknown remote usage as budget exhaustion", async () => {
  const record = vi.fn().mockResolvedValue(undefined);
  const transport = vi.fn(async (_url, init) => {
    await new Promise((_resolve, reject) =>
      init.signal.addEventListener("abort", () => reject(init.signal.reason), {
        once: true,
      }),
    );
    throw new Error("Unreachable fixture response");
  });
  const ai = new GeminiProvider(
    record,
    "fixture-key",
    transport,
    Date.now() + 30,
  );
  await expect(ai.explain(["Validated fixture fact"])).rejects.toThrow(
    "collection window",
  );
  expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      inputTokens: null,
      outputTokens: null,
      raw: expect.objectContaining({ state: "budget_exhausted" }),
    }),
  );
});
it("does not submit expired Fetch work and bounds remote per-URL timeouts", async () => {
  const transport = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [],
        errors: [{ url: "https://robu.in/", error: "timeout" }],
      }),
    ),
  );
  await expect(
    new TinyFishClient("fixture-key", transport, Date.now() - 1).fetchPages(
      ["https://robu.in/"],
      "robu",
      true,
    ),
  ).rejects.toThrow("collection window");
  expect(transport).not.toHaveBeenCalled();
  await new TinyFishClient(
    "fixture-key",
    transport,
    Date.now() + 10000,
  ).fetchPages(["https://robu.in/"], "robu", true);
  const body = JSON.parse(transport.mock.calls[0][1].body);
  expect(body.ttl).toBe(0);
  expect(body.per_url_timeout_ms).toBeGreaterThan(0);
  expect(body.per_url_timeout_ms).toBeLessThanOrEqual(9000);
});
