import { expect, it, vi } from "vitest";
import { datasheetSpecs, productDatasheet } from "../src/server/datasheet";

// Synthetic technical excerpt. Counts are intentionally different from the
// catalogue to prove that extraction reads the document, not the requested BOM.
const text =
  'HC-SR04 User Guide\nOperating Voltage 12VDC\n6 X 0.1" Pitch Right Angle Header PinsBoard Connections';
it("reads explicit physical header and supply specifications", () => {
  expect(datasheetSpecs(text, "HC-SR04")).toEqual([
    {
      key: "pins",
      value: "6",
      excerpt: '6 X 0.1" Pitch Right Angle Header PinsBoard Connections',
    },
    { key: "voltage", value: "12VDC", excerpt: "Operating Voltage 12VDC" },
  ]);
});
it("rejects a different model and ambiguous or signal-only counts", () => {
  expect(
    datasheetSpecs(text.replace("HC-SR04", "HC-SR04P"), "HC-SR04"),
  ).toEqual([]);
  expect(
    datasheetSpecs(
      "HC-SR04\nTwo main pins\n4. Module Pin Assignments",
      "HC-SR04",
    ),
  ).toEqual([]);
  expect(
    datasheetSpecs(text + '\n4 X 0.1" Pitch Header Pins', "HC-SR04").some(
      (spec) => spec.key === "pins",
    ),
  ).toBe(false);
});
it("does not follow an off-retailer PDF or a redirect", async () => {
  const transport = vi.fn<typeof fetch>(
    async () =>
      new Response('<a href="https://evil.test/spec.pdf">Datasheet</a>'),
  );
  await expect(
    productDatasheet(
      "https://robocraze.com/products/test",
      "robocraze",
      "HC-SR04",
      Infinity,
      undefined,
      transport,
    ),
  ).rejects.toThrow("Unsupported retailer");
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][1]?.redirect).toBe("error");
});
