import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
beforeEach(() => vi.stubEnv("AI_PROVIDER", "openai"));
const query = vi.hoisted(() => vi.fn());
vi.mock("../src/server/db", () => ({ db: () => ({ query }) }));
import { readiness } from "../src/server/readiness";
import { allowedOrigin } from "../src/server/origins";
afterEach(() => {
  vi.unstubAllEnvs();
  query.mockReset();
});
describe("live service readiness", () => {
  it("blocks repeated live quotes after a recent generation denial even while the worker runs", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "fixture-key");
    vi.stubEnv("TINYFISH_API_KEY", "fixture-key");
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    query.mockResolvedValue({
      rows: [
        {
          migrated: true,
          worker: true,
          provider_check: {
            state: "blocked",
            httpStatus: 403,
            detail: "Google denied generation access to this Gemini project.",
          },
        },
      ],
    });
    const status = await readiness();
    expect(status.ready).toBe(false);
    expect(status.checks[1].detail).toContain("five minutes");
    expect(JSON.stringify(status)).not.toContain("fixture-key");
  });
  it("does not call an absent database or pretend missing keys are configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TINYFISH_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const status = await readiness();
    expect(status.ready).toBe(false);
    expect(status.checks.every((check) => !check.ok)).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
  it("does not accept configured keys as proof of a running worker", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    vi.stubEnv("TINYFISH_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    query.mockResolvedValue({ rows: [{ migrated: true, worker: false }] });
    const status = await readiness();
    expect(status.ready).toBe(false);
    expect(status.checks.find((check) => check.name === "Worker")?.ok).toBe(
      false,
    );
  });
  it("reports a ready database and worker without claiming provider calls were verified", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    vi.stubEnv("TINYFISH_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    query.mockResolvedValue({ rows: [{ migrated: true, worker: true }] });
    const status = await readiness();
    expect(status.ready).toBe(true);
    expect(status.checks[0].detail).toContain("when collecting");
    expect(JSON.stringify(status)).not.toContain("test-key");
  });
  it("turns missing migrations or connection failures into actionable readiness failures", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    query.mockRejectedValue(new Error("secret connection details"));
    const status = await readiness();
    expect(status.ready).toBe(false);
    expect(status.checks[2].detail).toContain("migrations");
    expect(JSON.stringify(status)).not.toContain("secret connection details");
  });
});
describe("cross-origin Pages backend boundary", () => {
  it("accepts the actual same-origin HTTP authority when Next uses an internal hostname", () => {
    expect(
      allowedOrigin(
        "http://127.0.0.1:3000",
        "http://localhost:3000/api/quotes",
        "127.0.0.1:3000",
      ),
    ).toBe(true);
    expect(
      allowedOrigin(
        "http://unrelated.invalid",
        "http://localhost:3000/api/quotes",
        "127.0.0.1:3000",
      ),
    ).toBe(false);
  });
  it("accepts Render's declared public origin without trusting arbitrary forwarded headers", () => {
    vi.stubEnv(
      "RENDER_EXTERNAL_URL",
      "https://partsroute-example.onrender.com",
    );
    expect(
      allowedOrigin(
        "https://partsroute-example.onrender.com",
        "http://localhost:10000/api/quotes",
      ),
    ).toBe(true);
    expect(
      allowedOrigin(
        "https://wrong.onrender.com",
        "http://localhost:10000/api/quotes",
      ),
    ).toBe(false);
  });
  it("allows the configured Pages origin while rejecting lookalikes and unrelated sites", () => {
    vi.stubEnv("APP_ALLOWED_ORIGINS", "https://daksh909-design.github.io");
    vi.stubEnv("APP_ORIGIN", "https://parts.example");
    expect(
      allowedOrigin(
        "https://daksh909-design.github.io",
        "https://parts.example/api/quotes",
      ),
    ).toBe(true);
    expect(
      allowedOrigin(
        "https://daksh909-design.github.io.evil.test",
        "https://parts.example/api/quotes",
      ),
    ).toBe(false);
    expect(
      allowedOrigin("https://evil.test", "https://parts.example/api/quotes"),
    ).toBe(false);
    expect(
      allowedOrigin(
        "https://parts.example",
        "https://parts.example/api/quotes",
      ),
    ).toBe(true);
    expect(allowedOrigin(null, "https://parts.example/api/quotes")).toBe(true);
  });
});
