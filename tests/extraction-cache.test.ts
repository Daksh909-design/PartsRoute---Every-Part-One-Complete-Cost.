import { beforeEach, expect, it, vi } from "vitest";
import { cachedAI } from "../src/server/extraction-cache";
const query = vi.hoisted(() => vi.fn());
vi.mock("../src/server/db", () => ({ db: () => ({ query }) }));
const policy = {
  summary: "Synthetic fixture policy",
  excerpt: "Fixture only",
  thresholdInr: null,
  basis: "unknown" as const,
  comparison: "gte" as const,
  belowChargeInr: null,
  aboveChargeInr: null,
  taxStatus: "unknown" as const,
  taxRateBps: null,
  applicableToPincode: null,
};
function provider() {
  return {
    provider: "gemini" as const,
    product: vi.fn(),
    policy: vi.fn().mockResolvedValue(policy),
    explain: vi.fn(),
  };
}
beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (sql: string) =>
    sql.startsWith("SELECT")
      ? { rowCount: 1, rows: [{ extraction: policy }] }
      : { rowCount: 1, rows: [] },
  );
});
it("fresh extraction makes a model call even when identical content is already cached", async () => {
  const ai = provider();
  await cachedAI(ai, true).policy("Fixture page", "560001");
  expect(ai.policy).toHaveBeenCalledOnce();
  expect(query.mock.calls.some(([sql]) => sql.startsWith("SELECT"))).toBe(
    false,
  );
});
it("retains content-cache reuse for non-refresh internal consumers", async () => {
  const ai = provider();
  expect(await cachedAI(ai).policy("Fixture page", "560001")).toEqual(policy);
  expect(ai.policy).not.toHaveBeenCalled();
});
