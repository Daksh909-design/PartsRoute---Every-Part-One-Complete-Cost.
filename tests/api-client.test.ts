import { afterEach, expect, it, vi } from "vitest";
import { repository, requestApi } from "../src/app/api-client";

afterEach(() => vi.unstubAllGlobals());

it("distinguishes an unreachable server from a request timeout", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );
  await expect(
    requestApi("/api/integration/status", "fixture-token"),
  ).rejects.toThrow("Cannot reach the live service");
});

it("suggests resumption when an actual timeout occurs", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
  );
  await expect(
    requestApi("/api/quotes/fixture", "fixture-token"),
  ).rejects.toThrow("Use Resume");
});

it("rejects an HTML error page instead of parsing it as a quote", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("<h1>Unavailable</h1>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      ),
  );
  await expect(
    requestApi("/api/quotes/fixture", "fixture-token"),
  ).rejects.toThrow("web page instead of an API response");
});

it("keeps the terminal dot inside shared repository URLs", () => {
  const url = new URL(repository);
  expect(url.pathname).toBe(
    "/Daksh909-design/PartsRoute---Every-Part-One-Complete-Cost./",
  );
  expect(new URL("blob/main/README.md", repository).pathname).toContain(
    "Cost./blob/main/",
  );
});
