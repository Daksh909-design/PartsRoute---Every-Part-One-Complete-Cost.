"use client";
import { useEffect, useRef, useState } from "react";
import type { ComponentSearchResult, SearchProduct } from "../domain/search";
import { retailers } from "../domain/catalogue";
import { money, requestApi, when } from "./api-client";

export default function ComponentSearch({
  token,
  disabled,
  add,
}: {
  token: string;
  disabled: boolean;
  add: (product: SearchProduct, variantId?: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [retailer, setRetailer] = useState("");
  const [result, setResult] = useState<ComponentSearchResult | null>(null);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setResult(null);
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [token]);
  async function search() {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const value: ComponentSearchResult = await requestApi(
        "/api/components/search",
        token,
        {
          method: "POST",
          body: JSON.stringify({ query, ...(retailer ? { retailer } : {}) }),
        },
        20000,
      );
      if (current === generation.current) {
        setResult(value);
        setVariants({});
      }
    } catch (error) {
      if (current === generation.current)
        setError(
          error instanceof Error ? error.message : "Search failed. Try again.",
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="component-search" aria-label="Live component search">
      <h3>Find any component</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <fieldset
          disabled={disabled || busy || !token}
          className="search-controls"
        >
          <label>
            Component search
            <input
              type="search"
              minLength={2}
              maxLength={160}
              required
              value={query}
              placeholder="e.g. ESP32, Arduino Uno, 10k resistor"
              onChange={(event) => {
                setQuery(event.target.value);
                setResult(null);
              }}
            />
          </label>
          <label>
            Retailer
            <select
              value={retailer}
              onChange={(event) => {
                setRetailer(event.target.value);
                setResult(null);
              }}
            >
              <option value="">Both retailers</option>
              <option value="robocraze">Robocraze</option>
              <option value="robu">Robu</option>
            </select>
          </label>
          <button className="secondary" type="submit">
            {busy ? "Searching retailers…" : "Search retailers"}
          </button>
        </fieldset>
      </form>
      {!token && (
        <p className="source-note">Enter your team token to search.</p>
      )}
      {busy && <p role="status">Searching…</p>}
      {error && (
        <p className="notice warning" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div>
          <p className="source-note">
            “{result.query}” · {result.products.length} results ·{" "}
            {when(result.observedAt)}
          </p>
          {result.products.length === 0 && (
            <p role="status">
              No results. Try another part number or retailer.
            </p>
          )}
          <div className="search-results">
            {result.products.map((product) => {
              const selected =
                product.variants.find(
                  (variant) => String(variant.id) === variants[product.id],
                ) ??
                (product.variants.length === 1
                  ? product.variants[0]
                  : undefined);
              const available = selected?.available ?? product.available;
              const needsVariant =
                product.retailer === "robocraze" && !selected;
              return (
                <article className="search-product" key={product.id}>
                  <div>
                    <span className="eyebrow">
                      {retailers[product.retailer].name}
                    </span>
                    <h4>
                      <a href={product.url} target="_blank" rel="noreferrer">
                        {product.title} ↗
                      </a>
                    </h4>
                    <p>
                      {selected
                        ? money(selected.pricePaise)
                        : product.pricePaise === null
                          ? "Price checked after selection"
                          : `From ${money(product.pricePaise)}`}{" "}
                      ·{" "}
                      {available === true
                        ? "Listed in stock"
                        : available === false
                          ? "Out of stock"
                          : "Stock unconfirmed"}
                    </p>
                    {product.variants.length > 1 && (
                      <label>
                        Choose product variant
                        <select
                          aria-label={`Variant for ${product.title}`}
                          value={variants[product.id] ?? ""}
                          onChange={(event) =>
                            setVariants((current) => ({
                              ...current,
                              [product.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select a variant</option>
                          {product.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.title} · {money(variant.pricePaise)}
                              {variant.available ? "" : " · out of stock"}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {selected?.sku && <small>SKU: {selected.sku}</small>}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={disabled || needsVariant || available === false}
                    onClick={() => add(product, selected?.id)}
                  >
                    {needsVariant
                      ? "Select variant first"
                      : "Add to parts list"}
                  </button>
                </article>
              );
            })}
          </div>
          {result.errors.length > 0 && (
            <div className="notice warning" role="status">
              {result.errors.map((message, index) => (
                <p key={index}>{message}</p>
              ))}
            </div>
          )}
          <details>
            <summary>Sources</summary>
            {result.sources.map((source) => (
              <p key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {retailers[source.retailer].name} search ↗
                </a>
              </p>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}
