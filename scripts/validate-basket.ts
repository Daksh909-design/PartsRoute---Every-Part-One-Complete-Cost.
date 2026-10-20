// Deliberate direct-key research probe, using saved real Fetch observations.
// It is not an optimized quote: published ordering minima remain unqualified.
import { readFile, writeFile } from "node:fs/promises";
import { TinyFishClient } from "../src/server/tinyfish";
import { validateBasket } from "../src/server/shipping";
import { basketKey } from "../src/domain/optimizer";
import type { Basket, LineCost, Offer } from "../src/domain/schema";
const path = "artifacts/live-validation/basket-probe.json";
const tiny = new TinyFishClient();
if (process.argv.includes("--start")) {
  try {
    const old = JSON.parse(await readFile(path, "utf8"));
    if (old.runId)
      throw new Error(
        "A saved probe run already exists. Poll it; a duplicate was not started.",
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const captured = JSON.parse(
    await readFile("artifacts/live-validation/robocraze-original.json", "utf8"),
  );
  const candidates = JSON.parse(
    await readFile("artifacts/live-validation/dht11-candidates.json", "utf8"),
  );
  const sources = [
    captured.response.results[0],
    candidates.response.results.find((page: { url: string }) =>
      page.url.endsWith("/dht11-humidity-temperature-sensor-module"),
    ),
    captured.response.results[2],
  ];
  const rows = [
    {
      id: "hcsr04",
      model: "HC-SR04",
      sku: "TIFSS0171",
      title: "HC-SR04 Ultrasonic Distance Sensor Module",
      price: 7500,
      quantity: 2,
      excerpt: "1 x HC-SR04 Ultrasonic Distance Sensor Module",
    },
    {
      id: "dht11",
      model: "DHT11",
      sku: "TIFSS0029",
      title: "DHT11 Humidity and Temperature Sensor Module",
      price: 5900,
      quantity: 1,
      excerpt: "1 x DHT11 Humidity and Temperature Sensor Module",
    },
    {
      id: "breadboard400",
      model: "breadboard400",
      sku: "TIFEC0055",
      title: "400 Tie Points Solderless Breadboard",
      price: 3900,
      quantity: 1,
      excerpt: "400",
    },
  ];
  const lines: LineCost[] = rows.map((row, index) => {
    const source = sources[index];
    if (
      !source?.text.includes(row.sku) ||
      !source.text.includes(row.excerpt) ||
      !source.text.includes(`Rs ${row.price / 100}/-`)
    )
      throw new Error(
        "Saved evidence differs from this research basket. Inspect fresh source before updating the probe; no run started.",
      );
    const offer: Offer = {
      id: `robocraze:${row.id}`,
      partId: row.id,
      retailer: "robocraze",
      sku: row.sku,
      title: row.title,
      url: source.final_url,
      model: row.model,
      specs: [],
      unitsPerPack: 1,
      minPacks: null,
      multiplePacks: null,
      priceBreaks: [{ minPacks: 1, packPricePaise: row.price }],
      currency: "INR",
      taxStatus: "included",
      taxRateBps: null,
      stock: "unknown",
      availablePacks: null,
      match: "insufficient_information",
      reasons: [
        "Research probe only. Order controls and full product match are not qualified by this template.",
      ],
      evidence: [
        {
          id: `research-${row.id}`,
          sourceUrl: source.final_url,
          retrievedAt: captured.retrievedAt,
          excerpt: row.excerpt,
          method: "tinyfish-fetch",
          runId: null,
          observationId: `research-${row.id}`,
        },
      ],
    };
    return {
      offer,
      requiredUnits: row.quantity,
      packs: row.quantity,
      purchasedUnits: row.quantity,
      itemsPaise: row.price * row.quantity,
      addedTaxPaise: 0,
      beforeTaxPaise: null,
      payablePaise: row.price * row.quantity,
    };
  });
  const pincode = "560001",
    key = basketKey("robocraze", pincode, lines),
    itemsPaise = lines.reduce((sum, line) => sum + line.itemsPaise, 0);
  const basket: Basket = {
    retailer: "robocraze",
    key,
    lines,
    itemsPaise,
    addedTaxPaise: 0,
    payableItemsPaise: itemsPaise,
    totalPaise: null,
    shipping: {
      id: "pending-probe",
      retailer: "robocraze",
      basketKey: key,
      items: lines.map((line) => ({
        offerId: line.offer.id,
        sku: line.offer.sku,
        packs: line.packs,
      })),
      pincode,
      method: "Pending guest-cart probe",
      chargePaise: null,
      taxStatus: "unknown",
      taxRateBps: null,
      serviceable: null,
      status: "unknown",
      conditions: "Not yet inspected",
      observedAt: new Date().toISOString(),
      evidence: [],
    },
  };
  // Persist intent first. If submission is ambiguous, inspect the provider
  // dashboard rather than deleting this record and starting another run.
  await writeFile(
    path,
    JSON.stringify({ state: "initiating", basket, pincode }, null, 2),
  );
  const started = await tiny.startBasket(basket, pincode);
  await writeFile(
    path,
    JSON.stringify(
      {
        state: "running",
        runId: started.run_id,
        basket,
        pincode,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    `TinyFish Agent started once: ${started.run_id}. Poll this saved run; no order or payment is permitted.`,
  );
} else {
  const state = JSON.parse(await readFile(path, "utf8"));
  if (!state.runId)
    throw new Error(
      "No confirmed run ID. Reconcile the initiating request with TinyFish before retrying.",
    );
  const run = await tiny.getRun(state.runId);
  const observedAt = new Date().toISOString();
  let normalized = null;
  if (run.status === "COMPLETED" && run.result) {
    normalized = validateBasket(run.result, state.basket, state.pincode, {
      id: "direct-agent-probe",
      sourceUrl: "https://robocraze.com/cart",
      retrievedAt: observedAt,
      excerpt: "",
      method: "tinyfish-agent",
      runId: state.runId,
      observationId: "direct-agent-probe",
    });
  }
  await writeFile(
    path,
    JSON.stringify(
      { ...state, state: run.status, run, normalized, observedAt },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      runId: state.runId,
      status: run.status,
      shippingStatus: normalized?.status ?? null,
      chargePaise: normalized?.chargePaise ?? null,
      conditions: normalized?.conditions ?? null,
    }),
  );
}
