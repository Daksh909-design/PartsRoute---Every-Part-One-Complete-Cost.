import type { PartRequest, Retailer, ProductSource } from "./schema";
export const retailers: Record<
  Retailer,
  { name: string; domain: string; policyUrl: string; cartUrl: string }
> = {
  robu: {
    name: "Robu",
    domain: "robu.in",
    policyUrl: "https://robu.in/shipping-and-refund-policy/",
    cartUrl: "https://robu.in/cart/",
  },
  robocraze: {
    name: "Robocraze",
    domain: "robocraze.com",
    policyUrl: "https://robocraze.com/pages/shipping-policy",
    cartUrl: "https://robocraze.com/cart",
  },
};
export const catalogue = [
  {
    id: "hcsr04",
    name: "HC-SR04 ultrasonic sensor",
    model: "HC-SR04",
    specs: [
      { key: "pins", value: "4" },
      { key: "voltage", value: "5 V" },
    ],
    urls: {
      robu: "https://robu.in/product/hc-sr04-ultrasonic-range-finder/",
      robocraze: "https://robocraze.com/products/hc-sr-04-ultrasonic-sensor",
    },
  },
  {
    id: "dht11",
    name: "DHT11 temperature sensor module",
    model: "DHT11",
    specs: [{ key: "form", value: "breakout module" }],
    urls: {
      robu: "https://robu.in/product/dht11-digital-relative-humidity-temperature-sensor-module/",
      robocraze:
        "https://robocraze.com/products/dht11-humidity-temperature-sensor-module",
    },
  },
  {
    id: "breadboard400",
    name: "400-point solderless breadboard",
    model: "breadboard400",
    specs: [{ key: "tie_points", value: "400" }],
    urls: {
      robu: "https://robu.in/product/transparent-400-points-solderless-breadboard/",
      robocraze: "https://robocraze.com/products/half-breadboard",
    },
  },
] as const;
export function partSources(part: PartRequest): ProductSource[] {
  if (part.sources?.length) return part.sources;
  const sample = catalogue.find((entry) => entry.id === part.catalogueId);
  return sample
    ? Object.entries(sample.urls).map(([retailer, url]) => ({
        retailer: retailer as Retailer,
        url,
      }))
    : [];
}
export function sourceFor(part: PartRequest, retailer: Retailer) {
  return partSources(part).find((source) => source.retailer === retailer);
}
export const sampleParts: PartRequest[] = catalogue.map((p, i) => ({
  id: p.id,
  catalogueId: p.id,
  name: p.name,
  model: p.model,
  quantity: i === 0 ? 2 : 1,
  requiredSpecs: p.specs.map((s) => ({ ...s })),
  equivalentAcceptable: false,
  confirmedOfferIds: [],
}));
