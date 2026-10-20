import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sampleParts } from "../src/domain/catalogue";
const cache = vi.hoisted(() => vi.fn());
vi.mock("../src/server/snapshot", () => ({ cachedComparison: cache }));
import { POST } from "../src/app/api/comparisons/route";
const token = "synthetic-test-token-at-least-24-chars";
const input = {
  parts: sampleParts,
  pincode: "560001",
  mode: "live",
  refresh: false,
};
function request(body = input, authorised = true) {
  return new Request("http://localhost:3000/api/comparisons", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorised ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("APP_ACCESS_TOKEN", token);
  cache.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it("returns a labelled cache result without invoking a provider or worker", async () => {
  // Deliberately synthetic API contract value, not a live observation.
  cache.mockResolvedValue({
    mode: "live",
    dataStatus: { kind: "cached", oldestObservedAt: "2026-01-01T00:00:00Z" },
  });
  const response = await POST(request());
  const value = await response.json();
  expect(response.status).toBe(200);
  expect(value.id).toBeNull();
  expect(value.status).toBe("cached");
  expect(value.result.dataStatus.kind).toBe("cached");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("returns a cache miss without creating an expensive background job", async () => {
  cache.mockResolvedValue(null);
  const response = await POST(request());
  expect(response.status).toBe(404);
  expect((await response.json()).error).toContain("Refresh from retailers");
  expect(cache).toHaveBeenCalledOnce();
});
it("requires authorisation before reading observations", async () => {
  expect((await POST(request(input, false))).status).toBe(401);
  expect(cache).not.toHaveBeenCalled();
});
it("does not permit a refresh through the read-only comparison endpoint", async () => {
  expect((await POST(request({ ...input, refresh: true }))).status).toBe(400);
  expect(cache).not.toHaveBeenCalled();
});
