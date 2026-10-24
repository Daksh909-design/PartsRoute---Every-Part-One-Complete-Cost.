import { describe, expect, it, vi } from "vitest";
import { sampleParts } from "../src/domain/catalogue";
import { demoQuote } from "../src/server/demo";
import {
  StorefrontClient,
  StoreProduct,
  storefrontOrders,
  storefrontShipping,
} from "../src/server/storefront";

// Synthetic commerce contract fixtures, never retailer observations or prices.
const quote = demoQuote({
  parts: sampleParts,
  pincode: "560001",
  mode: "demo",
  refresh: false,
});
const basket = quote.plans
  .flatMap((plan) => plan.baskets)
  .find((basket) => basket.retailer === "robocraze")!;
const source = {
  ...basket.lines[0].offer.evidence[0],
  method: "storefront-api" as const,
};
const products = new Map(
  basket.lines.map(({ offer }, index) => [
    offer.id,
    {
      title: offer.title,
      handle: new URL(offer.url).pathname.split("/")[2],
      variants: [
        {
          id: index + 101,
          sku: offer.sku!,
          price: offer.priceBreaks[0].packPricePaise,
          available: true,
          quantity_rule: { min: 1, max: null, increment: 1 },
        },
      ],
    },
  ]),
);
const cart = {
  currency: "INR",
  total_price: basket.payableItemsPaise,
  token: "private-anonymous-token-do-not-persist",
  items: basket.lines.map((line) => ({
    variant_id: products.get(line.offer.id)!.variants[0].id,
    sku: line.offer.sku,
    quantity: line.packs,
    final_line_price: line.payablePaise,
  })),
};
const empty = { currency: "INR", total_price: 0, items: [] };
const rates = {
  shipping_rates: [{ name: "Test standard", price: "51.00", currency: "INR" }],
};
function transportFor(
  options: {
    nonempty?: boolean;
    changedPrice?: boolean;
    wrongPincode?: boolean;
  } = {},
) {
  let cartReads = 0;
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    let body: unknown;
    if (url.hostname === "api.postalpincode.in")
      body = [
        {
          PostOffice: [
            {
              State: "Test State",
              Country: "India",
              Pincode: options.wrongPincode ? "110001" : "560001",
            },
          ],
        },
      ];
    else if (url.pathname === "/cart/add.js") body = { items: [] };
    else if (url.pathname === "/cart/shipping_rates.json") body = rates;
    else if (url.pathname === "/cart.js") {
      const prior = ++cartReads;
      body =
        prior === 1
          ? options.nonempty
            ? cart
            : empty
          : {
              ...cart,
              total_price:
                Number(cart.total_price) + (options.changedPrice ? 1 : 0),
            };
    } else throw new Error(`Unexpected synthetic request: ${url.pathname}`);
    return new Response(JSON.stringify(body), {
      headers: { "Set-Cookie": "cart=fresh-session; Path=/; Secure" },
    });
  });
}

describe("documented storefront API with synthetic responses", () => {
  it("matches an isolated exact cart and retains only a tax-unknown shipping estimate", async () => {
    const transport = transportFor();
    const result = await new StorefrontClient(
      Infinity,
      undefined,
      transport,
    ).shipping(basket, "560001", products);
    expect(JSON.stringify(result)).not.toContain(cart.token);
    const shipping = storefrontShipping(basket, result, source);
    expect(shipping).toMatchObject({
      status: "estimated",
      chargePaise: 5100,
      taxStatus: "unknown",
      serviceable: true,
    });
    expect(transport.mock.calls[0][1]?.headers ?? {}).not.toHaveProperty(
      "Cookie",
    );
    const firstStoreRequest = transport.mock.calls.find(([url]) =>
      String(url).includes("robocraze.com"),
    )!;
    expect(firstStoreRequest[1]?.headers).toMatchObject({ Cookie: "" });
    const rateRequest = transport.mock.calls.find(([url]) =>
      String(url).includes("shipping_rates"),
    )!;
    expect(
      new URL(String(rateRequest[0])).searchParams.get(
        "shipping_address[province]",
      ),
    ).toBe("Test State");
    expect(
      transport.mock.calls.every(([url]) => !String(url).includes("checkout")),
    ).toBe(true);
  });
  it("leaves a nonempty guest cart unchanged", async () => {
    const transport = transportFor({ nonempty: true });
    await expect(
      new StorefrontClient(Infinity, undefined, transport).shipping(
        basket,
        "560001",
        products,
      ),
    ).rejects.toThrow("left unchanged");
    expect(
      transport.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });
  it("rejects changed cart totals and does not request shipping rates", async () => {
    const transport = transportFor({ changedPrice: true });
    await expect(
      new StorefrontClient(Infinity, undefined, transport).shipping(
        basket,
        "560001",
        products,
      ),
    ).rejects.toThrow("composition changed");
    expect(
      transport.mock.calls.some(([url]) =>
        String(url).includes("shipping_rates"),
      ),
    ).toBe(false);
  });
  it("rejects a directory response for a different destination", async () => {
    const transport = transportFor({ wrongPincode: true });
    await expect(
      new StorefrontClient(Infinity, undefined, transport).shipping(
        basket,
        "560001",
        products,
      ),
    ).rejects.toThrow("state could not be verified");
  });
  it("does not guess ordering rules for a different SKU or price", () => {
    const offer = {
      ...basket.lines[0].offer,
      minPacks: null,
      multiplePacks: null,
    };
    const product = products.get(offer.id)!;
    expect(storefrontOrders(offer, product, source)).toMatchObject({
      minPacks: 1,
      multiplePacks: 1,
    });
    const changed = {
      ...product,
      variants: [{ ...product.variants[0], sku: "OTHER" }],
    };
    expect(storefrontOrders(offer, changed, source)).toMatchObject({
      minPacks: null,
      orderingConflict: true,
    });
    const offset = {
      ...product,
      variants: [
        {
          ...product.variants[0],
          quantity_rule: { min: 3, max: null, increment: 2 },
        },
      ],
    };
    expect(storefrontOrders(offer, offset, source).multiplePacks).toBeNull();
  });
  it("rejects lookalike hosts before transport and validates product identity despite JavaScript MIME", async () => {
    const product = [...products.values()][0];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify(product), {
            headers: { "Content-Type": "text/javascript" },
          }),
      );
    const client = new StorefrontClient(Infinity, undefined, fetcher);
    await expect(
      client.product("https://robocraze.com.evil.test/products/test"),
    ).rejects.toThrow("Unsupported retailer");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      client.product(`https://robocraze.com/products/${product.handle}`),
    ).resolves.toEqual(StoreProduct.parse(product));
    await expect(
      client.product("https://robocraze.com/products/a-different-product"),
    ).rejects.toThrow("identity changed");
  });
});
