import { afterEach, describe, expect, it, vi } from "vitest";
import { authorize, requestJson } from "../src/server/access";
afterEach(() => vi.unstubAllEnvs());
describe("live API access boundary", () => {
  const token = "private-test-token-at-least-24-characters";
  it("fails closed without configured credentials", () => {
    vi.stubEnv("APP_ACCESS_TOKEN", "");
    expect(() => authorize(new Request("http://localhost/api/quotes"))).toThrow(
      "configured",
    );
  });
  it("rejects missing or incorrect team tokens", () => {
    vi.stubEnv("APP_ACCESS_TOKEN", token);
    expect(() =>
      authorize(
        new Request("http://localhost/api/quotes", {
          headers: { Authorization: "Bearer wrong" },
        }),
      ),
    ).toThrow("access token");
  });
  it("accepts the exact token and rejects a foreign browser origin", () => {
    vi.stubEnv("APP_ACCESS_TOKEN", token);
    vi.stubEnv("APP_ORIGIN", "https://parts.example");
    expect(
      authorize(
        new Request("https://parts.example/api/quotes", {
          headers: {
            Authorization: `Bearer ${token}`,
            Origin: "https://parts.example",
          },
        }),
      ),
    ).toHaveLength(64);
    expect(() =>
      authorize(
        new Request("https://parts.example/api/quotes", {
          headers: {
            Authorization: `Bearer ${token}`,
            Origin: "https://other.example",
          },
        }),
      ),
    ).toThrow("origin");
  });
  it("rejects oversized inputs before parsing", async () => {
    await expect(
      requestJson(
        new Request("http://localhost/api/demo", {
          method: "POST",
          body: "a".repeat(131073),
        }),
      ),
    ).rejects.toThrow("too large");
  });
});
