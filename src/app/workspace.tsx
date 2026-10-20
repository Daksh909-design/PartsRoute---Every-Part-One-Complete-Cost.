"use client";
import { useEffect, useRef, useState } from "react";
import { catalogue, retailers, sampleParts } from "../domain/catalogue";
import type { PartRequest, Plan, QuoteResult } from "../domain/schema";

const money = (amount: number | null) =>
  amount === null
    ? "Unknown"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
      }).format(amount / 100);
const when = (date: string) =>
  new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
type Job = {
  id: string;
  status: string;
  phase: string;
  result: QuoteResult | null;
  errors: string[];
};
type EvidenceResponse = {
  observations: Array<{
    id: string;
    source_url: string;
    method: string;
    run_id: string | null;
    retrieved_at: string;
    original: unknown;
    normalized: unknown;
  }>;
  operations: Array<{
    operation_key: string;
    status: string;
    run_id: string | null;
  }>;
  usage: Array<{
    provider: string;
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
  }>;
};
export default function Workspace() {
  const [parts, setParts] = useState<PartRequest[]>(
    structuredClone(sampleParts),
  );
  const [specs, setSpecs] = useState<Record<string, string>>(
    Object.fromEntries(
      sampleParts.map((p) => [
        p.id,
        p.requiredSpecs.map((s) => `${s.key}=${s.value}`).join("\n"),
      ]),
    ),
  );
  const [pincode, setPincode] = useState("560001"),
    [mode, setMode] = useState<"demo" | "live">("demo"),
    [token, setToken] = useState("");
  const [view, setView] = useState<"compare" | "evidence">("compare"),
    [result, setResult] = useState<QuoteResult | null>(null),
    [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [phase, setPhase] = useState(""),
    [savedId, setSavedId] = useState("");
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null),
    [evidenceBusy, setEvidenceBusy] = useState(false);
  const polling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKey = useRef<string | null>(null);
  useEffect(() => {
    setSavedId(localStorage.getItem("partsroute-job") || "");
    return () => {
      if (polling.current) clearTimeout(polling.current);
    };
  }, []);
  async function call(url: string, init: RequestInit = {}) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "The request could not be completed.");
    return body;
  }
  async function poll(id: string) {
    try {
      const current = (await call(`/api/quotes/${id}`)) as Job;
      setJob(current);
      setPhase(current.phase);
      if (current.result) setResult(current.result);
      if (["queued", "processing"].includes(current.status)) {
        setBusy(true);
        polling.current = setTimeout(() => void poll(id), 2500);
      } else {
        setBusy(false);
        pendingKey.current = null;
        if (current.status === "failed")
          setError(
            "This quote could not finish. Retry the saved work or inspect the integration evidence.",
          );
      }
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Could not read this quote.");
    }
  }
  async function submit(refresh = false) {
    setError("");
    setEvidence(null);
    setBusy(true);
    setPhase(
      mode === "demo"
        ? "Calculating the saved sample…"
        : "Submitting your parts list…",
    );
    try {
      const parsed = parts.map((p) => ({
        ...p,
        requiredSpecs: (specs[p.id] || "")
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const divider = line.indexOf("=");
            if (divider < 1 || !line.slice(divider + 1).trim())
              throw new Error(
                "Write each required attribute as name=value, one per line.",
              );
            return {
              key: line.slice(0, divider).trim(),
              value: line.slice(divider + 1).trim(),
            };
          }),
      }));
      const input = { parts: parsed, pincode, mode, refresh };
      if (mode === "demo") {
        const demo = await call("/api/demo", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setResult(demo);
        setJob(null);
        setBusy(false);
        setPhase("Saved sample calculated");
      } else {
        pendingKey.current ??= crypto.randomUUID();
        const response = await call("/api/quotes", {
          method: "POST",
          headers: { "Idempotency-Key": pendingKey.current },
          body: JSON.stringify(input),
        });
        setResult(null);
        setSavedId(response.id);
        localStorage.setItem("partsroute-job", response.id);
        await poll(response.id);
      }
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Please try again.");
    }
  }
  async function retry() {
    if (!job) return;
    setError("");
    try {
      await call(`/api/quotes/${job.id}`, { method: "POST" });
      await poll(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed.");
    }
  }
  async function inspect() {
    setView("evidence");
    if (!job || result?.mode === "demo") return;
    setEvidenceBusy(true);
    try {
      setEvidence(await call(`/api/quotes/${job.id}/evidence`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load evidence.");
    } finally {
      setEvidenceBusy(false);
    }
  }
  function patch(id: string, change: Partial<PartRequest>) {
    setParts((current) =>
      current.map((p) => (p.id === id ? { ...p, ...change } : p)),
    );
    pendingKey.current = null;
  }
  const recommended = result?.plans.find((p) => p.id === result.recommendedId),
    shown = recommended || result?.plans[0];
  const changed = Boolean(
    result &&
    (pincode !== result.input.pincode ||
      mode !== result.mode ||
      parts.some((p) => {
        const before = result.input.parts.find((b) => b.id === p.id);
        return (
          !before ||
          p.quantity !== before.quantity ||
          p.model !== before.model ||
          p.catalogueId !== before.catalogueId ||
          p.equivalentAcceptable !== before.equivalentAcceptable ||
          JSON.stringify(p.confirmedOfferIds) !==
            JSON.stringify(before.confirmedOfferIds) ||
          (specs[p.id] || "").trim() !==
            before.requiredSpecs.map((s) => `${s.key}=${s.value}`).join("\n")
        );
      })),
  );
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="PartsRoute home">
          <span className="brandmark">↗</span>Parts<span>Route</span>
        </a>
        <span className="topnote">The complete cost of your next build.</span>
        <span className="track">
          <i /> KRITICAL HACKS · AI/ML
        </span>
      </header>
      <main>
        <section className="intro">
          <div>
            <span className="eyebrow">ELECTRONICS PROCUREMENT, CONNECTED</span>
            <h1>
              Good parts.
              <br />
              <span>Smarter baskets.</span>
            </h1>
            <p>
              The lowest sticker price is only the beginning. Compare your whole
              parts list, with shipping, pack quantities and tax accounted for.
            </p>
          </div>
          <div className="intro-note">
            <span className="route-dot" />
            <div>
              <strong>Evidence at every step</strong>
              <p>
                Exact specifications. Visible unknowns.
                <br />A plan you can inspect before you buy.
              </p>
              <span className="retailer-pill">Robu</span>
              <span className="retailer-pill">Robocraze</span>
            </div>
          </div>
        </section>
        <nav className="tabs" aria-label="Workspace">
          <button
            className={view === "compare" ? "active" : ""}
            onClick={() => setView("compare")}
          >
            01 <span>Compare a parts list</span>
          </button>
          <button
            className={view === "evidence" ? "active" : ""}
            onClick={() => void inspect()}
          >
            02 <span>Integration & evidence</span>
          </button>
          <span>Prices in INR · India</span>
        </nav>
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        {view === "compare" ? (
          <div className="workspace">
            <section className="editor card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">YOUR BUILD</span>
                  <h2>Start with the parts.</h2>
                </div>
                <span className="count">{parts.length} lines</span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <fieldset disabled={busy}>
                  <div className="mode-switch">
                    <label className={mode === "demo" ? "selected" : ""}>
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === "demo"}
                        onChange={() => {
                          setMode("demo");
                          setResult(null);
                        }}
                      />
                      Saved-data demo
                    </label>
                    <label className={mode === "live" ? "selected" : ""}>
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === "live"}
                        onChange={() => {
                          setMode("live");
                          setResult(null);
                        }}
                      />
                      Live TinyFish
                    </label>
                  </div>
                  <div
                    className={`notice ${mode === "demo" ? "demo" : "live"}`}
                  >
                    {mode === "demo" ? (
                      <>
                        Synthetic prices and shipping for a reproducible
                        example. No live API calls.
                      </>
                    ) : (
                      <>
                        Live collection may take several minutes. Only verified
                        basket totals can become a recommendation.
                      </>
                    )}
                  </div>
                  <div className="parts-list">
                    {parts.map((part, index) => (
                      <article className="part-row" key={part.id}>
                        <div className="part-number">
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="part-main">
                          <label
                            className="part-label"
                            htmlFor={`name-${part.id}`}
                          >
                            Component
                          </label>
                          <select
                            id={`name-${part.id}`}
                            value={part.catalogueId}
                            onChange={(e) => {
                              const entry = catalogue.find(
                                (c) => c.id === e.target.value,
                              )!;
                              patch(part.id, {
                                catalogueId: entry.id,
                                name: entry.name,
                                model: entry.model,
                                requiredSpecs: entry.specs.map((s) => ({
                                  ...s,
                                })),
                              });
                              setSpecs((s) => ({
                                ...s,
                                [part.id]: entry.specs
                                  .map((s) => `${s.key}=${s.value}`)
                                  .join("\n"),
                              }));
                            }}
                          >
                            {catalogue.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <details>
                            <summary>Model & required attributes</summary>
                            <label htmlFor={`model-${part.id}`}>
                              Exact model
                            </label>
                            <input
                              id={`model-${part.id}`}
                              value={part.model}
                              onChange={(e) =>
                                patch(part.id, { model: e.target.value })
                              }
                              required
                              maxLength={80}
                            />
                            <label htmlFor={`spec-${part.id}`}>
                              Required attributes · one name=value per line
                            </label>
                            <textarea
                              id={`spec-${part.id}`}
                              rows={2}
                              value={specs[part.id]}
                              maxLength={1200}
                              onChange={(e) => {
                                setSpecs((s) => ({
                                  ...s,
                                  [part.id]: e.target.value,
                                }));
                                pendingKey.current = null;
                              }}
                            />
                            <label className="checkbox">
                              <input
                                type="checkbox"
                                checked={part.equivalentAcceptable}
                                onChange={(e) =>
                                  patch(part.id, {
                                    equivalentAcceptable: e.target.checked,
                                  })
                                }
                              />
                              Show equivalents for my confirmation
                            </label>
                          </details>
                        </div>
                        <div className="quantity">
                          <label htmlFor={`qty-${part.id}`}>QTY</label>
                          <input
                            id={`qty-${part.id}`}
                            type="number"
                            min={1}
                            max={100}
                            required
                            value={part.quantity}
                            onChange={(e) =>
                              patch(part.id, {
                                quantity: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                  <p className="catalogue-note">
                    Three curated components for this MVP. Add required pins,
                    connector or voltage to make the match stricter.
                  </p>
                  <div className="delivery">
                    <label htmlFor="pincode">Delivery pincode</label>
                    <div>
                      <span aria-hidden>⌖</span>
                      <input
                        id="pincode"
                        value={pincode}
                        required
                        pattern="[1-9][0-9]{5}"
                        maxLength={6}
                        inputMode="numeric"
                        onChange={(e) => {
                          setPincode(e.target.value);
                          pendingKey.current = null;
                        }}
                      />
                      <span>INDIA</span>
                    </div>
                  </div>
                  {mode === "live" && (
                    <div className="access">
                      <label htmlFor="token">Team access token</label>
                      <input
                        id="token"
                        type="password"
                        autoComplete="off"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Provided by your team’s app administrator"
                        required
                      />
                      <small>
                        This protects paid API calls. Provider API keys stay on
                        the server.
                      </small>
                    </div>
                  )}
                  <button type="submit" className="primary">
                    {busy
                      ? "Checking your options…"
                      : mode === "demo"
                        ? "Calculate sample baskets"
                        : "Compare live baskets"}
                    <span>↗</span>
                  </button>
                </fieldset>
              </form>
              {mode === "live" && savedId && !busy && (
                <button
                  className="text-button"
                  onClick={() => void poll(savedId)}
                >
                  Resume saved quote
                </button>
              )}
              <div className="editor-foot">
                <span>◈</span>
                <p>
                  No purchases or payments. Open retailer links to review a plan
                  yourself.
                </p>
              </div>
            </section>
            <section className="results" aria-live="polite" aria-busy={busy}>
              {changed && (
                <div className="notice">
                  Your parts list or delivery details have changed. These
                  results belong to the previous request; run a new comparison
                  to update them.
                </div>
              )}
              {busy && (
                <div className="progress card">
                  <span className="spinner" />
                  <div>
                    <strong>{phase}</strong>
                    <p>
                      You can refresh and resume the saved quote using your team
                      token.
                    </p>
                  </div>
                </div>
              )}
              {!result && !busy ? (
                <div className="empty card">
                  <div className="basket-graphic" aria-hidden>
                    <span>01</span>
                    <i />
                    <span>02</span>
                    <i />
                    <span>03</span>
                    <b>↘</b>
                    <em>₹</em>
                  </div>
                  <span className="eyebrow">THE WHOLE BASKET MATTERS</span>
                  <h2>
                    A better route
                    <br />
                    from parts to project.
                  </h2>
                  <p>
                    Run the sample to see how consolidating a basket can beat
                    buying every item at its lowest price.
                  </p>
                  <div className="empty-points">
                    <span>01 · Match specifications</span>
                    <span>02 · Compare complete costs</span>
                    <span>03 · Inspect the evidence</span>
                  </div>
                </div>
              ) : (
                result && (
                  <>
                    <div className="result-summary">
                      <span className="eyebrow">
                        {result.mode === "demo"
                          ? "SYNTHETIC SAVED-DATA EXAMPLE"
                          : "CHECKED PURCHASING OPTIONS"}
                      </span>
                      <h2>
                        {recommended
                          ? result.mode === "demo"
                            ? "A complete sample plan."
                            : "Your best verified plan."
                          : "Some details are still missing."}
                      </h2>
                      <p>{result.explanation}</p>
                    </div>
                    <div className="stats">
                      <div>
                        <span>Eligible lines</span>
                        <strong>
                          {result.coverage.covered}
                          <small> / {result.coverage.requested}</small>
                        </strong>
                      </div>
                      <div>
                        <span>Plans compared</span>
                        <strong>{result.plans.length}</strong>
                      </div>
                      <div>
                        <span>
                          {result.mode === "demo"
                            ? "Complete samples"
                            : "Verified plans"}
                        </span>
                        <strong>
                          {result.plans.filter((p) => p.verified).length}
                        </strong>
                      </div>
                    </div>
                    {shown && (
                      <PlanCard
                        plan={shown}
                        mode={result.mode}
                        recommended={Boolean(recommended)}
                      />
                    )}
                    {!shown && (
                      <div className="notice">
                        A complete plan needs an eligible, in-stock, priced
                        offer for every line. Review the product details below.
                      </div>
                    )}
                    {result.plans.length > 1 && (
                      <section className="alternatives card">
                        <div className="section-head">
                          <h3>Other checked combinations</h3>
                          <span>{result.plans.length - 1} alternatives</span>
                        </div>
                        {result.plans
                          .filter((p) => p.id !== shown?.id)
                          .map((p) => (
                            <details key={p.id}>
                              <summary>
                                <span>
                                  {p.baskets
                                    .map((b) => retailers[b.retailer].name)
                                    .join(" + ")}
                                </span>
                                <span>
                                  {p.verified
                                    ? result.mode === "demo"
                                      ? "Complete sample"
                                      : "Verified"
                                    : p.totalPaise === null
                                      ? "Incomplete"
                                      : "Estimated"}
                                </span>
                                <strong>{money(p.totalPaise)}</strong>
                              </summary>
                              <p>
                                Items {money(p.itemsPaise)} · Shipping{" "}
                                {money(p.shippingPaise)} · Additional item tax{" "}
                                {money(p.addedTaxPaise)}
                              </p>
                              {p.unresolved.map((u, i) => (
                                <p key={i}>{u}</p>
                              ))}
                              {p.baskets.map((b) => (
                                <p key={b.key}>
                                  {retailers[b.retailer].name}:{" "}
                                  {b.lines
                                    .map(
                                      (l) =>
                                        `${l.packs} pack(s) of ${l.offer.title}`,
                                    )
                                    .join(", ")}
                                </p>
                              ))}
                            </details>
                          ))}
                      </section>
                    )}
                    <section className="offer-details card">
                      <h3>Product matches & evidence</h3>
                      {result.offers.map((o) => (
                        <details key={o.id}>
                          <summary>
                            <span>
                              <strong>{retailers[o.retailer].name}</strong> ·{" "}
                              {o.title}
                            </span>
                            <span
                              className={`badge ${o.match === "exact" ? "good" : "attention"}`}
                            >
                              {o.match.replaceAll("_", " ")}
                            </span>
                          </summary>
                          <p>
                            Stock: {o.stock.replaceAll("_", " ")} ·{" "}
                            {o.unitsPerPack ?? "Unknown"} units per pack ·
                            minimum {o.minPacks ?? "unknown"} packs
                          </p>
                          {o.reasons.map((r, i) => (
                            <p key={i}>{r}</p>
                          ))}
                          <p>
                            {o.specs
                              .map((s) => `${s.key}: ${s.value}`)
                              .join(" · ") || "No supported specifications."}
                          </p>
                          <a href={o.url} target="_blank" rel="noreferrer">
                            Open source product ↗
                          </a>
                          {o.evidence.map((e) => (
                            <div className="source" key={e.id}>
                              <span>
                                {e.method === "synthetic-fixture"
                                  ? "Synthetic fixture"
                                  : `Observed ${when(e.retrievedAt)}`}
                              </span>
                              <blockquote>{e.excerpt}</blockquote>
                            </div>
                          ))}
                          {o.match === "needs_confirmation" && (
                            <button
                              className="text-button"
                              onClick={() => {
                                const part = parts.find(
                                  (p) => p.id === o.partId,
                                );
                                if (part) {
                                  patch(part.id, {
                                    confirmedOfferIds: [
                                      ...new Set([
                                        ...part.confirmedOfferIds,
                                        o.id,
                                      ]),
                                    ],
                                  });
                                  setPhase(
                                    "Equivalent selected. Run another comparison to apply your confirmation.",
                                  );
                                }
                              }}
                            >
                              Confirm this equivalent for the next quote
                            </button>
                          )}
                        </details>
                      ))}
                      {result.errors.length > 0 && (
                        <details className="issues">
                          <summary>
                            {result.errors.length} collection or processing
                            issue(s)
                          </summary>
                          <p>
                            Some product pages or shipping checks could not be
                            completed. See the integration view for the
                            collected responses and processing details.
                          </p>
                        </details>
                      )}
                    </section>
                    <div className="result-actions">
                      {result.mode === "live" && (
                        <>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => {
                              pendingKey.current = null;
                              void submit(true);
                            }}
                          >
                            Refresh live observations
                          </button>
                          {job &&
                            ["partial", "failed"].includes(job.status) && (
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => void retry()}
                              >
                                Retry saved work
                              </button>
                            )}
                        </>
                      )}
                      <button
                        className="text-button"
                        onClick={() => void inspect()}
                      >
                        Inspect integration evidence ↗
                      </button>
                    </div>
                    <p className="freshness">
                      {result.mode === "demo"
                        ? "Synthetic fixture dated 1 January 2026. Not a live integration demonstration."
                        : `Quote assembled ${when(result.generatedAt)}. Each source has its own observation time. Results cover only checked options.`}
                    </p>
                  </>
                )
              )}
              {job?.status === "failed" && !result && (
                <button className="secondary" onClick={() => void retry()}>
                  Retry saved work
                </button>
              )}
            </section>
          </div>
        ) : (
          <section className="evidence-view card">
            <span className="eyebrow">JUDGE’S INTEGRATION VIEW</span>
            <h2>Follow the evidence.</h2>
            <p>
              Live quotes retain original TinyFish responses, extraction
              results, run identifiers and actual usage. The saved-data demo is
              a separate arithmetic example.
            </p>
            {result?.mode === "demo" ? (
              <div className="notice demo">
                This result used synthetic fixtures. No TinyFish run exists for
                it. Actual live feasibility captures are included in the
                repository under docs/evidence.
              </div>
            ) : !job ? (
              <div className="notice">
                Create or resume a live quote to inspect its original
                observations here.
              </div>
            ) : (
              <>
                <p>
                  Quote <code>{job.id}</code>
                </p>
                {job.errors.length > 0 && (
                  <details>
                    <summary>Collection and processing details</summary>
                    {job.errors.map((message, index) => (
                      <pre key={index}>{message}</pre>
                    ))}
                  </details>
                )}
                <button
                  className="secondary"
                  onClick={() => void inspect()}
                  disabled={evidenceBusy}
                >
                  {evidenceBusy ? "Loading…" : "Reload evidence"}
                </button>
                {evidence && (
                  <>
                    <h3>Provider runs</h3>
                    {evidence.operations.length ? (
                      evidence.operations.map((o) => (
                        <div className="evidence-run" key={o.operation_key}>
                          <span>{o.status}</span>
                          <code>
                            {o.run_id ||
                              "Submission uncertain; recover existing run before retrying."}
                          </code>
                          {o.run_id && (
                            <a
                              href={`https://agent.tinyfish.ai/runs/${encodeURIComponent(o.run_id)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open TinyFish run ↗
                            </a>
                          )}
                        </div>
                      ))
                    ) : (
                      <p>
                        No browser run has started. Product or pricing gaps can
                        prevent basket verification.
                      </p>
                    )}
                    <h3>Original observations</h3>
                    {evidence.observations.map((o) => (
                      <details key={o.id}>
                        <summary>
                          {o.method} · {when(o.retrieved_at)}
                        </summary>
                        <a href={o.source_url} target="_blank" rel="noreferrer">
                          {o.source_url}
                        </a>
                        <h4>Original provider response</h4>
                        <pre>{JSON.stringify(o.original, null, 2)}</pre>
                        <h4>Normalised observation</h4>
                        <pre>{JSON.stringify(o.normalized, null, 2)}</pre>
                      </details>
                    ))}
                    <h3>Recorded usage</h3>
                    <p>
                      Unknown usage stays unknown. Monetary API cost is not
                      inferred from token or step counts.
                    </p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Provider</th>
                            <th>Model</th>
                            <th>Input tokens</th>
                            <th>Output tokens</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evidence.usage.map((u, i) => (
                            <tr key={i}>
                              <td>{u.provider}</td>
                              <td>{u.model}</td>
                              <td>{u.input_tokens ?? "Not reported"}</td>
                              <td>{u.output_tokens ?? "Not reported"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}
      </main>
      <footer>
        <span>
          PartsRoute <i>↗</i>
        </span>
        <p>Build with better information.</p>
        <span>Evidence first. Every basket.</span>
      </footer>
    </div>
  );
}
function PlanCard({
  plan,
  mode,
  recommended,
}: {
  plan: Plan;
  mode: "live" | "demo";
  recommended: boolean;
}) {
  return (
    <article className="plan card">
      <div className="plan-top">
        <span className="badge good">
          {mode === "demo"
            ? "SYNTHETIC SAMPLE"
            : recommended
              ? "BEST VERIFIED AMONG CHECKED OPTIONS"
              : "INCOMPLETE PLAN"}
        </span>
        <span>
          {plan.baskets.length} retailer{plan.baskets.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="plan-total">
        <div>
          <span>
            {plan.totalPaise === null
              ? "Landed total not verified"
              : "Complete basket total"}
          </span>
          <h3>{money(plan.totalPaise)}</h3>
        </div>
        <span className="total-icon">↗</span>
      </div>
      <div className="cost-breakdown">
        <div>
          <span>Item prices as listed</span>
          <strong>{money(plan.itemsPaise)}</strong>
        </div>
        <div>
          <span>Additional item tax</span>
          <strong>{money(plan.addedTaxPaise)}</strong>
        </div>
        <div>
          <span>Shipping, including any added shipping tax</span>
          <strong>{money(plan.shippingPaise)}</strong>
        </div>
      </div>
      {plan.totalPaise === null && (
        <p className="notice">
          Known item subtotal: {money(plan.knownSubtotalPaise)}. A missing cost
          is not zero.
        </p>
      )}
      {plan.baskets.map((b) => (
        <section className="retailer-basket" key={b.key}>
          <div className="basket-head">
            <h4>{retailers[b.retailer].name}</h4>
            <span>
              {mode === "demo"
                ? "Synthetic shipping"
                : b.shipping.status === "verified"
                  ? "Shipping verified"
                  : "Shipping unverified"}
            </span>
          </div>
          {b.lines.map((l) => (
            <div className="basket-line" key={l.offer.id}>
              <div>
                <a href={l.offer.url} target="_blank" rel="noreferrer">
                  {l.offer.title} ↗
                </a>
                <small>
                  {l.packs} pack(s) × {l.offer.unitsPerPack} units · need{" "}
                  {l.requiredUnits}, receive {l.purchasedUnits}
                </small>
              </div>
              <strong>{money(l.payablePaise)}</strong>
            </div>
          ))}
          <p className="shipping-note">{b.shipping.conditions}</p>
        </section>
      ))}
      {plan.unresolved.length > 0 && (
        <div className="unresolved">
          {plan.unresolved.map((u, i) => (
            <p key={i}>{u}</p>
          ))}
        </div>
      )}
    </article>
  );
}
