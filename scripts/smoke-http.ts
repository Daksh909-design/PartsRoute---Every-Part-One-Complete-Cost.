import { sampleParts } from "../src/domain/catalogue";
const base = process.env.SMOKE_ORIGIN || "http://localhost:3000";
function check(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}
const home = await fetch(base);
check(home.ok && (await home.text()).includes("PartsRoute"), "homepage serves");
const health = await fetch(`${base}/api/health`).then((r) => r.json());
check(health.status === "ok", "health endpoint");
const input = {
  parts: sampleParts,
  pincode: "560001",
  mode: "demo",
  refresh: false,
};
const response = await fetch(`${base}/api/demo`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});
const quote = await response.json();
check(
  response.ok &&
    quote.mode === "demo" &&
    quote.plans.length === 8 &&
    quote.plans[0].totalPaise === 29500,
  "synthetic HTTP quote returns calculated ₹295 best plan",
);
const invalid = await fetch(`${base}/api/demo`, {
  method: "POST",
  body: JSON.stringify({ ...input, pincode: "000000" }),
});
check(invalid.status === 400, "invalid pincode rejected");
const wrongMode = await fetch(`${base}/api/demo`, {
  method: "POST",
  body: JSON.stringify({ ...input, mode: "live" }),
});
check(
  wrongMode.status === 400,
  "live cannot silently fall back to synthetic data",
);
const protectedRoute = await fetch(`${base}/api/quotes`, {
  method: "POST",
  body: JSON.stringify({ ...input, mode: "live" }),
});
check(
  [401, 503].includes(protectedRoute.status),
  "live endpoint refuses unauthenticated or unconfigured use",
);
const browserOrigin = process.env.SMOKE_ALLOWED_ORIGIN || new URL(base).origin;
const preflight = await fetch(`${base}/api/quotes`, {
  method: "OPTIONS",
  headers: {
    Origin: browserOrigin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers":
      "authorization,content-type,idempotency-key",
  },
});
check(
  preflight.status === 204 &&
    preflight.headers.get("access-control-allow-origin") === browserOrigin,
  "allowed browser origin passes API preflight",
);
const foreign = await fetch(`${base}/api/demo`, {
  method: "POST",
  headers: { Origin: "https://not-partsroute.invalid" },
  body: JSON.stringify(input),
});
check(foreign.status === 403, "unapproved browser origin rejected");
const readiness = await fetch(`${base}/api/integration/status`);
check(
  [401, 503].includes(readiness.status),
  "live readiness requires team authorization",
);
