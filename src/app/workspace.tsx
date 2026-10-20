"use client";
import { useEffect, useRef, useState } from "react";
import { catalogue, retailers, sampleParts } from "../domain/catalogue";
import type { PartRequest, Plan, QuoteResult } from "../domain/schema";
import { CircuitScene, Icon } from "./ui-icons";

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
  function loadSample() {
    if (busy) return;
    setParts(structuredClone(sampleParts));
    setSpecs(
      Object.fromEntries(
        sampleParts.map((p) => [
          p.id,
          p.requiredSpecs.map((s) => `${s.key}=${s.value}`).join("\n"),
        ]),
      ),
    );
    setPincode("560001");
    setResult(null);
    setJob(null);
    setEvidence(null);
    setError("");
    setView("compare");
    pendingKey.current = null;
  }
  const recommended = result?.plans.find((p) => p.id === result.recommendedId),
    shown = recommended || result?.plans[0];
  const runnerUp = result?.plans.find(
    (p) => p.verified && p.id !== recommended?.id && p.totalPaise !== null,
  );
  const savings =
    recommended?.totalPaise !== null &&
    recommended?.totalPaise !== undefined &&
    runnerUp?.totalPaise !== null &&
    runnerUp?.totalPaise !== undefined
      ? runnerUp.totalPaise - recommended.totalPaise
      : 0;
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
    <div className="app-frame">
      <aside className="nav-rail" aria-label="Primary navigation">
        <a className="rail-logo" href="/" aria-label="PartsRoute home">
          <Icon name="route" />
        </a>
        <span className="rail-divider" />
        <button
          className={
            view === "compare" ? "rail-button selected" : "rail-button"
          }
          onClick={() => setView("compare")}
          aria-label="Compare parts"
          title="Compare parts"
        >
          <Icon name="grid" />
        </button>
        <button
          className={
            view === "evidence" ? "rail-button selected" : "rail-button"
          }
          onClick={() => void inspect()}
          aria-label="Integration evidence"
          title="Integration evidence"
        >
          <Icon name="evidence" />
        </button>
        <a
          className="rail-button rail-github"
          href="https://github.com/Daksh909-design/PartsRoute---Every-Part-One-Complete-Cost."
          target="_blank"
          rel="noreferrer"
          aria-label="PartsRoute on GitHub"
          title="GitHub repository"
        >
          <Icon name="github" />
        </a>
        <span className="rail-initials" title="Team REsynced">
          R
        </span>
      </aside>
      <div className="shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="PartsRoute home">
            Parts
            <span>
              Route<span className="brand-dot">.</span>
            </span>
          </a>
          <span className="topnote">
            <span>/</span> Sourcing workspace
          </span>
          <div className="topbar-right">
            <span className="track">
              <i /> AI/ML TRACK
            </span>
            <div className="team-chip">
              <span className="team-avatar">R</span>
              <div>
                <strong>Team REsynced</strong>
                <small>NSUT · Kritical Hacks</small>
              </div>
            </div>
          </div>
        </header>
        <main>
          <section className="intro">
            <div className="intro-copy">
              <span className="eyebrow hero-eyebrow">
                <span className="status-dot" /> LESS GUESSWORK. BETTER BUILDS.
              </span>
              <h1>
                Every part.
                <br />
                <span>
                  One <em>smarter</em> route.
                </span>
              </h1>
              <p>
                Your next build starts with a better basket. Compare component
                prices, shipping and tax together — with the evidence to back it
                up.
              </p>
              <div className="hero-benefits">
                <span>
                  <Icon name="check" />
                  Exact part matching
                </span>
                <span>
                  <Icon name="check" />
                  Complete basket costs
                </span>
                <span>
                  <Icon name="check" />
                  Source-backed results
                </span>
              </div>
            </div>
            <div className="intro-note">
              <div className="circuit-heading">
                <span>
                  <i /> THE PARTSROUTE ENGINE
                </span>
                <span>01—03</span>
              </div>
              <CircuitScene />
              <div className="circuit-footer">
                <span>
                  <Icon name="evidence" /> Every detail, connected.
                </span>
                <span className="tinyfish-tag">Powered by TinyFish</span>
              </div>
            </div>
          </section>
          <div className="workflow-strip" aria-label="Comparison workflow">
            <div className="workflow-step current">
              <span className="step-icon">
                <Icon name="chip" />
              </span>
              <div>
                <strong>
                  01 <span>Your components</span>
                </strong>
                <small>Models, quantities & requirements</small>
              </div>
            </div>
            <span className="step-connector">
              <Icon name="arrow" />
            </span>
            <div className={`workflow-step ${busy ? "current" : ""}`}>
              <span className="step-icon">
                <Icon name="layers" />
              </span>
              <div>
                <strong>
                  02 <span>Compare the whole basket</span>
                </strong>
                <small>Prices, packs, taxes & shipping</small>
              </div>
            </div>
            <span className="step-connector">
              <Icon name="arrow" />
            </span>
            <div className={`workflow-step ${result ? "current" : ""}`}>
              <span className="step-icon">
                <Icon name="evidence" />
              </span>
              <div>
                <strong>
                  03 <span>Choose with confidence</span>
                </strong>
                <small>Inspect results & source evidence</small>
              </div>
            </div>
          </div>
          <nav className="tabs" aria-label="Workspace">
            <button
              className={view === "compare" ? "active" : ""}
              onClick={() => setView("compare")}
            >
              <Icon name="grid" /> <span>Compare a parts list</span>
            </button>
            <button
              className={view === "evidence" ? "active" : ""}
              onClick={() => void inspect()}
            >
              <Icon name="evidence" /> <span>Integration & evidence</span>
            </button>
            <span className="workspace-currency">
              <span className="india-flag" /> India <span>·</span> INR ₹
            </span>
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
                    <span className="eyebrow">BILL OF MATERIALS</span>
                    <h2>
                      Your parts list<span>.</span>
                    </h2>
                  </div>
                  <button
                    className="sample-button"
                    type="button"
                    onClick={loadSample}
                    disabled={busy}
                  >
                    <Icon name="reset" /> Load sample
                  </button>
                </div>
                <div className="list-caption">
                  <span>
                    <Icon name="chip" />
                    {parts.length} components
                  </span>
                  <span>Exact models first</span>
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
                        <Icon name="layers" /> Saved-data demo
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
                        <Icon name="bolt" /> Live TinyFish
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
                          Live collection may take several minutes. Only
                          verified basket totals can become a recommendation.
                        </>
                      )}
                    </div>
                    <div className="parts-list">
                      {parts.map((part, index) => (
                        <article className="part-row" key={part.id}>
                          <div className="part-number">
                            <Icon
                              name={
                                part.catalogueId === "breadboard400"
                                  ? "grid"
                                  : "chip"
                              }
                            />
                            <span>{String(index + 1).padStart(2, "0")}</span>
                          </div>
                          <div className="part-main">
                            <label
                              className="part-label"
                              htmlFor={`name-${part.id}`}
                            >
                              COMPONENT {String(index + 1).padStart(2, "0")}
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
                      Start with this sensor prototype. Expand a component to
                      require a specific connector, pin count or voltage.
                    </p>
                    <div className="delivery">
                      <label htmlFor="pincode">Delivery pincode</label>
                      <div>
                        <span>
                          <Icon name="pin" />
                        </span>
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
                          This protects paid API calls. Provider API keys stay
                          on the server.
                        </small>
                      </div>
                    )}
                    <button type="submit" className="primary">
                      {busy
                        ? "Checking your options…"
                        : mode === "demo"
                          ? "Calculate sample baskets"
                          : "Compare live baskets"}
                      <Icon name="arrow" />
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
                  <Icon name="evidence" />
                  <p>
                    No purchases or payments. Open retailer links to review a
                    plan yourself.
                  </p>
                </div>
                <details className="coverage-panel">
                  <summary>
                    <span>
                      <Icon name="layers" /> Retailer coverage
                    </span>
                    <span>
                      2 adapters <Icon name="plus" />
                    </span>
                  </summary>
                  <div className="coverage-retailers">
                    <span>
                      Robu <small>Provisional</small>
                    </span>
                    <span>
                      Robocraze <small>Provisional</small>
                    </span>
                    <span>
                      Evelta <small>Research only</small>
                    </span>
                    <span>
                      Amazon / Flipkart <small>Planned</small>
                    </span>
                  </div>
                  <p>
                    We start small so every product and shipping cost can be
                    checked. Marketplace listings also need verified sellers,
                    variants and basket delivery charges. More stores follow
                    once their evidence is reliable.
                  </p>
                </details>
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
                        You can refresh and resume the saved quote using your
                        team token.
                      </p>
                    </div>
                  </div>
                )}
                {!result && !busy ? (
                  <div className="empty card">
                    <div className="empty-topline">
                      <span className="eyebrow">YOUR PURCHASING PLAN</span>
                      <span>
                        <i /> READY TO COMPARE
                      </span>
                    </div>
                    <div className="basket-graphic" aria-hidden>
                      <span>
                        <Icon name="chip" />
                      </span>
                      <i />
                      <span>
                        <Icon name="layers" />
                      </span>
                      <i />
                      <span className="graphic-basket">
                        <Icon name="basket" />
                      </span>
                      <div className="graphic-check">
                        <Icon name="check" />
                      </div>
                    </div>
                    <span className="eyebrow empty-eyebrow">
                      THE STICKER PRICE ISN’T THE WHOLE STORY
                    </span>
                    <h2>
                      Small parts.
                      <br />
                      <span>Big picture.</span>
                    </h2>
                    <p>
                      A cheaper sensor can mean a more expensive order. See how
                      the whole basket adds up before you buy.
                    </p>
                    <div className="cost-preview">
                      <div>
                        <span>
                          <Icon name="chip" /> Item prices
                        </span>
                        <span>Matched to your requirements</span>
                      </div>
                      <div>
                        <span>
                          <Icon name="layers" /> Packs & quantities
                        </span>
                        <span>Rounded up correctly</span>
                      </div>
                      <div>
                        <span>
                          <Icon name="receipt" /> Shipping & tax
                        </span>
                        <span>Counted once, per basket</span>
                      </div>
                    </div>
                    <div className="empty-points">
                      <Icon name="info" />
                      <p>
                        Try the sample on the left. You’ll get calculated
                        comparisons using clearly labelled synthetic data.
                      </p>
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
                      {savings > 0 && (
                        <div className="plan-insight">
                          <span>
                            <Icon name="bolt" />
                          </span>
                          <p>
                            <strong>
                              {money(savings)} less than the next complete{" "}
                              {result.mode === "demo" ? "sample" : "verified"}{" "}
                              plan.
                            </strong>{" "}
                            That’s why we compare baskets, not just price tags.
                          </p>
                        </div>
                      )}
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
                          offer for every line. Review the product details
                          below.
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
                results, run identifiers and actual usage. The saved-data demo
                is a separate arithmetic example.
              </p>
              {result?.mode === "demo" ? (
                <div className="notice demo">
                  This result used synthetic fixtures. No TinyFish run exists
                  for it. Actual live feasibility captures are included in the
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
                          No browser run has started. Product or pricing gaps
                          can prevent basket verification.
                        </p>
                      )}
                      <h3>Original observations</h3>
                      {evidence.observations.map((o) => (
                        <details key={o.id}>
                          <summary>
                            {o.method} · {when(o.retrieved_at)}
                          </summary>
                          <a
                            href={o.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
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
          <p>Every part. One complete cost.</p>
          <span>
            Made by <strong>Team REsynced</strong> · NSUT
          </span>
        </footer>
      </div>
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
    <article className={`plan card ${recommended ? "recommended" : ""}`}>
      <div className="plan-top">
        <span className="badge good">
          <Icon name="check" />
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
        <span className="total-icon">
          <Icon name="basket" />
        </span>
      </div>
      <div className="cost-breakdown">
        <div>
          <span>
            <Icon name="chip" />
            Item prices as listed
          </span>
          <strong>{money(plan.itemsPaise)}</strong>
        </div>
        <div>
          <span>
            <Icon name="receipt" />
            Additional item tax
          </span>
          <strong>{money(plan.addedTaxPaise)}</strong>
        </div>
        <div>
          <span>
            <Icon name="layers" />
            Shipping, including any added shipping tax
          </span>
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
            <h4>
              <span className={`store-mark ${b.retailer}`}>R</span>
              {retailers[b.retailer].name}
            </h4>
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
                  {l.offer.title.replace(/^\[Synthetic\]\s*/, "")}{" "}
                  <Icon name="northeast" />
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
