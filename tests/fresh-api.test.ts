import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sampleParts } from "../src/domain/catalogue";
import { liveRequest } from "../src/domain/live-request";
const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  readiness: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("../src/server/db", () => ({
  enqueue: mocks.enqueue,
  RequestLimit: class extends Error {},
}));
vi.mock("../src/server/readiness", () => ({ readiness: mocks.readiness }));
vi.mock("../src/server/snapshot", () => ({ cachedComparison: mocks.cache }));
import { POST } from "../src/app/api/quotes/route";
const token = "synthetic-fresh-api-test-token-only";
const input = {
  parts: sampleParts,
  pincode: "560001",
  mode: "live",
  refresh: false,
};
function request(authorised = true, body = input) {
  return new Request("http://localhost:3000/api/quotes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "d237c698-32d3-4836-ad32-20ed77029156",
      ...(authorised ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("APP_ACCESS_TOKEN", token);
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "fixture-model-key");
  vi.stubEnv("TINYFISH_API_KEY", "fixture-fetch-key");
  vi.clearAllMocks();
  mocks.readiness.mockResolvedValue({ ready: true, checks: [] });
  mocks.enqueue.mockResolvedValue("fixture-job-id");
  mocks.cache.mockResolvedValue({ dataStatus: { kind: "cached" } });
});
afterEach(() => vi.unstubAllEnvs());
it("starts fresh collection even when a compatible cached result exists and refresh is false", async () => {
  const response = await POST(request());
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({
    id: "fixture-job-id",
    status: "queued",
  });
  expect(mocks.enqueue.mock.calls[0][0]).toEqual({ ...input, refresh: true });
  expect(mocks.cache).not.toHaveBeenCalled();
});
it("preserves a stable idempotency fingerprint for repeated submissions", async () => {
  await POST(request());
  await POST(request());
  expect(mocks.enqueue.mock.calls[0][1]).toBe(mocks.enqueue.mock.calls[1][1]);
});
it("does not create an expensive quote without authentication", async () => {
  expect((await POST(request(false))).status).toBe(401);
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
it("does not fall back to saved observations when the worker is unavailable", async () => {
  mocks.readiness.mockResolvedValue({
    ready: false,
    checks: [{ ok: false, name: "Worker", detail: "Offline" }],
  });
  expect((await POST(request())).status).toBe(503);
  expect(mocks.enqueue).not.toHaveBeenCalled();
  expect(mocks.cache).not.toHaveBeenCalled();
});
it("makes fresh collection the primary action and cache use explicit", () => {
  expect(liveRequest()).toEqual({ path: "/api/quotes", refresh: true });
  expect(liveRequest(false)).toEqual({
    path: "/api/comparisons",
    refresh: false,
  });
});
