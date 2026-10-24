import { readiness } from "../src/server/readiness";
import { db } from "../src/server/db";
import { TinyFishClient } from "../src/server/tinyfish";
import { aiConfig, createAIProvider } from "../src/server/ai-provider";
const ai = aiConfig();
const status = await readiness();
for (const check of status.checks)
  console.log(`${check.ok ? "OK" : "MISSING"} ${check.name}: ${check.detail}`);
let passed = status.ready;
if (process.argv.includes("--providers")) {
  if (process.env.TINYFISH_API_KEY) {
    try {
      const result = await new TinyFishClient().fetchPages(
        ["https://robocraze.com/products/hc-sr-04-ultrasonic-sensor"],
        "robocraze",
        true,
      );
      if (result.errors.length || !result.results[0]?.text)
        throw new Error("No usable product content.");
      console.log(
        "OK TinyFish Fetch: live product content returned. Basket shipping is not verified by this check.",
      );
    } catch {
      console.log(
        "FAILED TinyFish Fetch: check account access, credits and retailer availability.",
      );
      passed = false;
    }
  }
  if (process.env[ai.keyName]) {
    try {
      const fact = "This is a provider connectivity check only.";
      await createAIProvider(async () => {}).explain([fact]);
      console.log(
        `OK ${ai.name}: configured model returned a schema-validated response. Product extraction accuracy is not checked here.`,
      );
    } catch {
      console.log(
        `FAILED ${ai.name}: check ${ai.keyName}, model access and account quota.`,
      );
      passed = false;
    }
  }
}
if (process.env.DATABASE_URL) await db().end();
if (!passed) process.exitCode = 1;
