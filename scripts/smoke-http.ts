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
