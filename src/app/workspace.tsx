"use client";
import { useEffect, useRef, useState } from "react";
import { catalogue, sampleParts } from "../domain/catalogue";
import {
  QuoteInput,
  type PartRequest,
  type QuoteResult,
} from "../domain/schema";
import {
  apiBase,
  homePath,
  liveAvailable,
  repository,
  requestApi,
  staticSite,
} from "./api-client";
import QuoteResults from "./quote-results";
import EvidenceView, { type EvidenceData } from "./evidence-view";
import { Icon } from "./ui-icons";
import { demoQuote } from "../domain/demo";

type Job = {
  id: string;
  status: string;
  phase: string;
  result: QuoteResult | null;
  errors: string[];
};
type Status = {
  ready: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
};
const savedKey = `partsroute-job:${apiBase || "same-origin"}`;
const storage = {
  read() {
    try {
      return localStorage.getItem(savedKey) || "";
    } catch {
      return "";
    }
  },
  write(id: string) {
    try {
      localStorage.setItem(savedKey, id);
    } catch {
      /* Private browsing can block storage. */
    }
  },
};

export default function Workspace() {
  const [parts, setParts] = useState<PartRequest[]>(() =>
    structuredClone(sampleParts),
  );
  const [pincode, setPincode] = useState("560001");
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [view, setView] = useState<"compare" | "evidence">("compare");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(() =>
    demoQuote({
      parts: structuredClone(sampleParts),
      pincode: "560001",
      mode: "demo",
      refresh: false,
    }),
  );
  const [job, setJob] = useState<Job | null>(null);
  const [savedId, setSavedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const pollingStarted = useRef(0);
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    if (liveAvailable) setSavedId(storage.read());
    return () => {
      generation.current++;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  function cancelPolling() {
    generation.current++;
    pollingStarted.current = Date.now();
    if (timer.current) clearTimeout(timer.current);
  }
  function patch(id: string, change: Partial<PartRequest>) {
    setParts((current) =>
      current.map((part) =>
        part.id === id ? { ...part, confirmedOfferIds: [], ...change } : part,
      ),
    );
    requestId.current = null;
  }
  function switchMode(next: "demo" | "live") {
    cancelPolling();
    setMode(next);
    const sample = QuoteInput.safeParse({
      parts,
      pincode,
      mode: "demo",
      refresh: false,
    });
    setResult(
      next === "demo" && sample.success ? demoQuote(sample.data) : null,
    );
    setJob(null);
    setEvidence(null);
    setError("");
    setBusy(false);
    setPhase("");
    requestId.current = null;
  }
  function reset() {
    cancelPolling();
    setParts(structuredClone(sampleParts));
    setPincode("560001");
    setResult(
      mode === "demo"
        ? demoQuote({
            parts: structuredClone(sampleParts),
            pincode: "560001",
            mode: "demo",
            refresh: false,
          })
        : null,
    );
    setJob(null);
    setEvidence(null);
    setError("");
    setPhase("");
    setBusy(false);
    requestId.current = null;
  }
  async function checkConnection() {
    setChecking(true);
    setError("");
    setStatus(null);
    try {
      const current = (await requestApi(
        "/api/integration/status",
        token,
      )) as Status;
      setStatus(current);
      return current.ready;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Cannot check the server.",
      );
      return false;
    } finally {
      setChecking(false);
    }
  }
  async function poll(id: string, version: number) {
    if (Date.now() - pollingStarted.current > 15 * 60 * 1000) {
      setBusy(false);
      setError(
        "This quote is taking longer than expected. The server keeps the saved work; use Resume to check it again without starting a new quote.",
      );
      return;
    }
    try {
      const current = (await requestApi(`/api/quotes/${id}`, token)) as Job;
      if (version !== generation.current) return;
      setJob(current);
      setPhase(current.phase);
      if (current.result) setResult(current.result);
      if (["queued", "processing"].includes(current.status)) {
        setBusy(true);
        timer.current = setTimeout(() => void poll(id, version), 2500);
      } else {
        setBusy(false);
        requestId.current = null;
        if (current.status === "failed")
          setError(
            current.errors?.[0] ||
              "The quote stopped before completion. Review the collection evidence or retry the saved work.",
          );
      }
    } catch (caught) {
      if (version !== generation.current) return;
      setBusy(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Cannot read the quote. Resume it after reconnecting.",
      );
    }
  }
  async function submit(refresh = false) {
    setError("");
    setEvidence(null);
    const parsed = QuoteInput.safeParse({ parts, pincode, mode, refresh });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message || "Check your parts and pincode.",
      );
      return;
    }
    if (mode === "live" && !(await checkConnection())) return;
    cancelPolling();
    const version = generation.current;
    setBusy(true);
    setPhase(
      mode === "demo"
        ? "Calculating sample combinations…"
        : "Submitting the parts list…",
    );
    try {
      if (mode === "demo") {
        const sample = staticSite
          ? (await import("../domain/demo")).demoQuote(parsed.data)
          : ((await requestApi("/api/demo", "", {
              method: "POST",
              body: JSON.stringify(parsed.data),
            })) as QuoteResult);
        if (version !== generation.current) return;
        setResult(sample);
        setJob(null);
        setBusy(false);
        setPhase("");
      } else {
        if (refresh) requestId.current = null;
        requestId.current ??= crypto.randomUUID();
        const created = await requestApi("/api/quotes", token, {
          method: "POST",
          headers: { "Idempotency-Key": requestId.current },
          body: JSON.stringify(parsed.data),
        });
        if (version !== generation.current) return;
        setResult(null);
        setSavedId(created.id);
        storage.write(created.id);
        await poll(created.id, version);
      }
    } catch (caught) {
      if (version !== generation.current) return;
      setBusy(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "The comparison could not finish.",
      );
    }
  }
  async function resume() {
    if (!savedId || !(await checkConnection())) return;
    cancelPolling();
    setBusy(true);
    await poll(savedId, generation.current);
  }
  async function retry() {
    if (!job) return;
    setError("");
    try {
      await requestApi(`/api/quotes/${job.id}`, token, { method: "POST" });
      cancelPolling();
      setBusy(true);
      await poll(job.id, generation.current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Retry failed.");
    }
  }
  async function inspect() {
    setView("evidence");
    if (!job) return;
    setEvidenceBusy(true);
    try {
      setEvidence(await requestApi(`/api/quotes/${job.id}/evidence`, token));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Cannot load evidence.",
      );
    } finally {
      setEvidenceBusy(false);
    }
  }
  const stale = Boolean(
    result &&
    (mode !== result.mode ||
      pincode !== result.input.pincode ||
      JSON.stringify(parts) !== JSON.stringify(result.input.parts)),
  );

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href={homePath}>
          <span className="brand-symbol">
            <Icon name="route" />
          </span>
          PartsRoute
        </a>
        <nav aria-label="Workspace">
          <button
            className={view === "compare" ? "active" : ""}
            onClick={() => setView("compare")}
          >
            Comparison
          </button>
          <button
            className={view === "evidence" ? "active" : ""}
            onClick={() => void inspect()}
          >
            Evidence
          </button>
          <a href={repository} target="_blank" rel="noreferrer">
            GitHub <Icon name="northeast" />
          </a>
        </nav>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <span className="overline">ELECTRONICS PROCUREMENT</span>
            <h1>Compare the whole basket.</h1>
            <p>
              Every part. One complete cost. Compare matched components, pack
              quantities, shipping and tax before you buy.
            </p>
          </div>
          <span className="project-label">
            Team REsynced <span>NSUT · Kritical Hacks</span>
          </span>
        </div>
        <div className="workspace-toolbar">
          <div className="segmented" aria-label="Comparison mode">
            <button
              aria-pressed={mode === "demo"}
              className={mode === "demo" ? "selected" : ""}
              disabled={busy}
              onClick={() => switchMode("demo")}
            >
              Sample calculation
            </button>
            <button
              aria-pressed={mode === "live"}
              className={mode === "live" ? "selected" : ""}
              disabled={busy}
              onClick={() => switchMode("live")}
            >
              Live quote{" "}
              {!liveAvailable && <span className="small-tag">Setup</span>}
            </button>
          </div>
          <span className="toolbar-note">
            INR · India · No purchases or payments
          </span>
        </div>
        {mode === "demo" && (
          <div className="demo-banner">
            <Icon name="info" />
            <span>
              <strong>Sample data.</strong> Prices and shipping are invented to
              demonstrate the calculator. No live collection runs in this mode.
            </span>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {view === "evidence" ? (
          <EvidenceView
            data={evidence}
            jobId={job?.id || null}
            busy={evidenceBusy}
            reload={() => void inspect()}
          />
        ) : (
          <>
            {mode === "live" && (
              <section className="panel connection-panel">
                <div className="section-heading">
                  <div>
                    <span className="overline">LIVE CONNECTION</span>
                    <h2>
                      {!liveAvailable
                        ? "Connect a server to collect live offers"
                        : "Check the live service"}
                    </h2>
                  </div>
                  <span
                    className={`connection-state ${status?.ready ? "ready" : ""}`}
                  >
                    {status?.ready
                      ? "Worker ready"
                      : !liveAvailable
                        ? "Server not connected"
                        : status
                          ? "Needs attention"
                          : "Not checked"}
                  </span>
                </div>
                {!liveAvailable ? (
                  <>
                    <p>
                      This GitHub Pages site hosts the sample calculator. Live
                      quotes need the server application, a database and a
                      worker. TinyFish and AI provider keys belong on that
                      server.
                    </p>
                    <a
                      className="setup-link"
                      href={`${repository}/blob/main/docs/LIVE-SETUP.md`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open live deployment guide ↗
                    </a>
                  </>
                ) : (
                  <>
                    <p>
                      Product collection uses TinyFish; extraction uses your
                      configured AI provider. Check the database and worker
                      before starting a quote.
                    </p>
                    <div className="connection-controls">
                      <label htmlFor="team-token">
                        Team access token
                        <input
                          id="team-token"
                          type="password"
                          autoComplete="off"
                          value={token}
                          onChange={(event) => {
                            setToken(event.target.value);
                            setStatus(null);
                          }}
                          placeholder="Enter the server’s team token"
                        />
                      </label>
                      <button
                        type="button"
                        className="secondary"
                        disabled={checking || busy || !token}
                        onClick={() => void checkConnection()}
                      >
                        {checking ? "Checking…" : "Check connection"}
                      </button>
                    </div>
                    <p className="source-note">
                      The token stays in this tab. API keys are never entered
                      here.
                    </p>
                    <details className="token-help">
                      <summary>Where do I find the team token?</summary>
                      <p>
                        Local server: copy the value of APP_ACCESS_TOKEN from
                        your private .env.local file. Hosted server: find
                        APP_ACCESS_TOKEN in the web service’s Environment
                        settings. This is your PartsRoute access password,
                        separate from the AI provider and TinyFish keys.
                      </p>
                    </details>
                    {status && (
                      <ul className="status-checks">
                        {status.checks.map((check) => (
                          <li key={check.name}>
                            <span
                              className={check.ok ? "check-ok" : "check-fail"}
                            >
                              {check.ok ? "✓" : "!"}
                            </span>
                            <div>
                              <strong>{check.name}</strong>
                              <span>{check.detail}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {savedId && !busy && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => void resume()}
                      >
                        Resume the last live quote ↗
                      </button>
                    )}
                  </>
                )}
              </section>
            )}
            <div className="workspace-grid">
              <section className="panel parts-panel">
                <div className="section-heading">
                  <div>
                    <span className="overline">01 / REQUIREMENTS</span>
                    <h2>Your parts list</h2>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={reset}
                    disabled={busy}
                  >
                    Reset sample
                  </button>
                </div>
                <div className="bom-summary" aria-label="Parts list summary">
                  <span>
                    <strong>{parts.length}</strong> component lines
                  </span>
                  <span>
                    <strong>
                      {parts.reduce((sum, part) => sum + part.quantity, 0)}
                    </strong>{" "}
                    units needed
                  </span>
                  <span>
                    Deliver to <strong>{pincode || "—"}</strong>
                  </span>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  <fieldset disabled={busy || checking}>
                    <div className="part-table-heading">
                      <span>Component & required attributes</span>
                      <span>Qty</span>
                    </div>
                    {parts.map((part, index) => (
                      <article className="part-row" key={part.id}>
                        <div className="part-index">
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="part-main">
                          <label
                            className="sr-only"
                            htmlFor={`component-${part.id}`}
                          >
                            Component {index + 1}
                          </label>
                          <select
                            id={`component-${part.id}`}
                            value={part.catalogueId}
                            onChange={(event) => {
                              const entry = catalogue.find(
                                (item) => item.id === event.target.value,
                              )!;
                              patch(part.id, {
                                catalogueId: entry.id,
                                name: entry.name,
                                model: entry.model,
                                requiredSpecs: entry.specs.map((spec) => ({
                                  ...spec,
                                })),
                              });
                            }}
                          >
                            {catalogue.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name}
                              </option>
                            ))}
                          </select>
                          <div className="attribute-summary">
                            {part.requiredSpecs.map((spec, key) => (
                              <span key={key}>
                                {spec.key.replaceAll("_", " ")}: {spec.value}
                              </span>
                            ))}
                          </div>
                          <details className="attributes-editor">
                            <summary>Edit matching requirements</summary>
                            <div className="attribute-fields">
                              <label htmlFor={`model-${part.id}`}>
                                Exact model
                                <input
                                  id={`model-${part.id}`}
                                  value={part.model}
                                  onChange={(event) =>
                                    patch(part.id, {
                                      model: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              {part.requiredSpecs.map((spec, specIndex) => (
                                <div className="attribute-pair" key={specIndex}>
                                  <label>
                                    <span className="sr-only">
                                      Attribute name for component {index + 1},
                                      attribute {specIndex + 1}
                                    </span>
                                    <input
                                      value={spec.key}
                                      placeholder="Attribute"
                                      onChange={(event) =>
                                        patch(part.id, {
                                          requiredSpecs: part.requiredSpecs.map(
                                            (item, i) =>
                                              i === specIndex
                                                ? {
                                                    ...item,
                                                    key: event.target.value,
                                                  }
                                                : item,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    <span className="sr-only">
                                      Required value for component {index + 1},
                                      attribute {specIndex + 1}
                                    </span>
                                    <input
                                      value={spec.value}
                                      placeholder="Required value"
                                      onChange={(event) =>
                                        patch(part.id, {
                                          requiredSpecs: part.requiredSpecs.map(
                                            (item, i) =>
                                              i === specIndex
                                                ? {
                                                    ...item,
                                                    value: event.target.value,
                                                  }
                                                : item,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    aria-label={`Remove attribute ${specIndex + 1} for component ${index + 1}`}
                                    className="remove-attribute"
                                    onClick={() =>
                                      patch(part.id, {
                                        requiredSpecs:
                                          part.requiredSpecs.filter(
                                            (_, i) => i !== specIndex,
                                          ),
                                      })
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              {part.requiredSpecs.length < 8 && (
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() =>
                                    patch(part.id, {
                                      requiredSpecs: [
                                        ...part.requiredSpecs,
                                        { key: "", value: "" },
                                      ],
                                    })
                                  }
                                >
                                  + Add attribute
                                </button>
                              )}
                              <label className="checkbox">
                                <input
                                  type="checkbox"
                                  checked={part.equivalentAcceptable}
                                  onChange={(event) =>
                                    patch(part.id, {
                                      equivalentAcceptable:
                                        event.target.checked,
                                    })
                                  }
                                />
                                Allow a different model after I confirm it
                              </label>
                              <p className="source-note">
                                Required specifications must still match. A
                                confidence score cannot override a conflict.
                              </p>
                            </div>
                          </details>
                        </div>
                        <label className="quantity">
                          <span className="sr-only">
                            Quantity for component {index + 1}
                          </span>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            required
                            value={
                              Number.isNaN(part.quantity) ? "" : part.quantity
                            }
                            onChange={(event) =>
                              patch(part.id, {
                                quantity: event.target.valueAsNumber,
                              })
                            }
                          />
                        </label>
                      </article>
                    ))}
                    <div className="delivery-row">
                      <label htmlFor="pincode">
                        Delivery pincode
                        <input
                          id="pincode"
                          inputMode="numeric"
                          pattern="[1-9][0-9]{5}"
                          maxLength={6}
                          required
                          value={pincode}
                          onChange={(event) => {
                            setPincode(event.target.value);
                            requestId.current = null;
                          }}
                        />
                      </label>
                      <p>One destination for every retailer basket.</p>
                    </div>
                    <button
                      className="primary"
                      type="submit"
                      disabled={
                        mode === "live" && (!liveAvailable || !status?.ready)
                      }
                    >
                      {busy
                        ? "Checking options…"
                        : mode === "demo"
                          ? "Calculate sample baskets"
                          : status?.ready
                            ? "Collect & compare live offers"
                            : "Complete live setup first"}
                      <Icon name="arrow" />
                    </button>
                    {mode === "live" && !status?.ready && (
                      <p className="notice warning setup-blocker">
                        {error ||
                          (status
                            ? `Not ready: ${status.checks
                                .filter((check) => !check.ok)
                                .map((check) => check.name)
                                .join(
                                  ", ",
                                )}. Complete these checks in Live connection above.`
                            : "Live collection has not started. Enter the team token and use Check connection above. API keys, a database and the worker must be ready first.")}
                      </p>
                    )}
                  </fieldset>
                </form>
                <details className="coverage">
                  <summary>Retailer coverage & limits</summary>
                  <p>
                    <strong>Robu · Robocraze</strong> — adapters implemented;
                    complete live baskets remain unqualified. Product mismatches
                    and shipping gaps are shown rather than filled in.
                  </p>
                  <p>
                    Evelta is research only. Amazon and Flipkart are planned;
                    seller and variant verification are still needed.
                  </p>
                  <a
                    href={`${repository}/blob/main/docs/FEASIBILITY.md`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read retailer feasibility notes ↗
                  </a>
                </details>
              </section>
              <section
                className="panel results-panel"
                aria-live="polite"
                aria-busy={busy}
              >
                {busy && (
                  <div className="progress" role="status">
                    <span className="activity" />
                    <div>
                      <strong>{phase || "Checking the saved quote…"}</strong>
                      <p>
                        {mode === "live"
                          ? "The worker saves observations as it goes. Refreshing this page does not start another browser run."
                          : "Calculating complete assignments from the synthetic fixture."}
                      </p>
                    </div>
                  </div>
                )}
                {result ? (
                  <QuoteResults
                    result={result}
                    stale={stale}
                    inspect={() => void inspect()}
                    confirm={(partId, offerId) => {
                      const part = parts.find((item) => item.id === partId)!;
                      patch(partId, {
                        confirmedOfferIds: [
                          ...new Set([...part.confirmedOfferIds, offerId]),
                        ],
                      });
                    }}
                  />
                ) : (
                  !busy && (
                    <div className="empty-results">
                      <span className="overline">02 / PURCHASING PLAN</span>
                      <h2>
                        {mode === "live"
                          ? job?.status === "failed"
                            ? "Collection needs attention."
                            : "Live offers have not been collected yet."
                          : "A lower item price can cost more at checkout."}
                      </h2>
                      <p>
                        {mode === "live"
                          ? job?.status === "failed"
                            ? "Review the error above. Any pages already collected remain saved with this quote; open Evidence to inspect them before retrying."
                            : "The team token unlocks access only. The server must also have TinyFish and AI provider keys, a migrated database and an active worker before it can collect offers."
                          : "Calculate this three-part prototype to compare complete baskets, including shipping once per retailer."}
                      </p>
                      <div className="empty-breakdown">
                        <div>
                          <span>Items</span>
                          <span>Exact specifications and pack sizes</span>
                        </div>
                        <div>
                          <span>Tax</span>
                          <span>Only amounts not already included</span>
                        </div>
                        <div>
                          <span>Shipping</span>
                          <span>One charge per retailer basket</span>
                        </div>
                      </div>
                      <p className="source-note">
                        {mode === "live"
                          ? "Once the connection checks pass, start collection. Unknown shipping or product mismatches will remain visible rather than becoming a fabricated total."
                          : "The sample is a worked arithmetic example. Live recommendations require source evidence and verified shipping."}
                      </p>
                    </div>
                  )
                )}
                {mode === "live" &&
                  !busy &&
                  job &&
                  ["partial", "failed"].includes(job.status) && (
                    <div className="result-actions">
                      <button
                        className="secondary"
                        onClick={() => void retry()}
                      >
                        Retry saved work
                      </button>
                      <button
                        className="text-button"
                        onClick={() => void submit(true)}
                      >
                        Refresh observations ↗
                      </button>
                    </div>
                  )}
              </section>
            </div>
          </>
        )}
      </main>
      <footer>
        <span>PartsRoute · Every part. One complete cost.</span>
        <span>Built by Team REsynced · NSUT</span>
      </footer>
    </div>
  );
}
