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
  temporaryBackend,
} from "./api-client";
import QuoteResults from "./quote-results";
import LiveConnection, { type IntegrationStatus } from "./live-connection";
import EvidenceView, { type EvidenceData } from "./evidence-view";
import { Icon } from "./ui-icons";
import { demoQuote } from "../domain/demo";
import { liveRequest, type CollectionClock } from "../domain/live-request";

type Job = {
  id: string;
  input: QuoteInput;
  created_at: string;
  updated_at: string;
  status: string;
  phase: string;
  result: QuoteResult | null;
  errors: string[];
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
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
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
  const [responseMs, setResponseMs] = useState<number | null>(null);
  const [collectionClock, setCollectionClock] =
    useState<CollectionClock | null>(null);
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const pollingStarted = useRef(0);
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    if (liveAvailable) {
      const reference =
        new URLSearchParams(window.location.search).get("quote") || "";
      if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(reference)) {
        setSavedId(reference);
        setMode("live");
        setResult(null);
      } else setSavedId(storage.read());
    }
    return () => {
      generation.current++;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!collectionClock || collectionClock.finished) return;
    const interval = setInterval(() => {
      setCollectionClock((current) =>
        current && !current.finished
          ? { ...current, elapsedMs: Date.now() - current.startedAt }
          : current,
      );
    }, 100);
    return () => clearInterval(interval);
  }, [collectionClock?.startedAt, collectionClock?.finished]);
  function stopClock() {
    setCollectionClock((current) =>
      current
        ? {
            ...current,
            elapsedMs: Date.now() - current.startedAt,
            finished: true,
          }
        : null,
    );
  }
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
    setResponseMs(null);
    setCollectionClock(null);
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
    setResponseMs(null);
    setCollectionClock(null);
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
      )) as IntegrationStatus;
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
  async function poll(id: string, version: number, restore = false) {
    if (Date.now() - pollingStarted.current > 15 * 60 * 1000) {
      setBusy(false);
      stopClock();
      setError(
        "This quote is taking longer than expected. The server keeps the saved work; use Resume to check it again without starting a new quote.",
      );
      return;
    }
    try {
      const current = (await requestApi(`/api/quotes/${id}`, token)) as Job;
      if (version !== generation.current) return;
      if (restore && current.input) {
        setParts(current.input.parts);
        setPincode(current.input.pincode);
        const startedAt = Date.parse(current.created_at);
        const running = ["queued", "processing"].includes(current.status);
        setCollectionClock({
          startedAt,
          elapsedMs:
            (running ? Date.now() : Date.parse(current.updated_at)) - startedAt,
          finished: !running,
          recovered: true,
        });
      }
      setJob(current);
      if (!restore && current.created_at) {
        setCollectionClock((clock) => {
          const originalStart = Date.parse(current.created_at);
          return clock && originalStart < clock.startedAt - 1000
            ? {
                ...clock,
                startedAt: originalStart,
                elapsedMs: Date.now() - originalStart,
                recovered: true,
              }
            : clock;
        });
      }
      setPhase(current.phase);
      if (current.result) setResult(current.result);
      if (["queued", "processing"].includes(current.status)) {
        setBusy(true);
        timer.current = setTimeout(() => void poll(id, version), 250);
      } else {
        setBusy(false);
        if (!restore) stopClock();
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
      stopClock();
      setError(
        caught instanceof Error
          ? caught.message
          : "Cannot read the quote. Resume it after reconnecting.",
      );
    }
  }
  async function submit(fresh = true) {
    setError("");
    setEvidence(null);
    const action = liveRequest(fresh);
    const parsed = QuoteInput.safeParse({
      parts,
      pincode,
      mode,
      refresh: action.refresh,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message || "Check your parts and pincode.",
      );
      return;
    }
    if (mode === "live" && !token) {
      setError(
        "Enter your team access token to compare retailer observations.",
      );
      return;
    }
    cancelPolling();
    const version = generation.current;
    setBusy(true);
    setResponseMs(null);
    setResult(null);
    setJob(null);
    setCollectionClock(
      mode === "live" && fresh
        ? { startedAt: Date.now(), elapsedMs: 0, finished: false }
        : null,
    );
    const submittedAt = performance.now();
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
        requestId.current ??= crypto.randomUUID();
        const created = await requestApi(action.path, token, {
          method: "POST",
          headers: { "Idempotency-Key": requestId.current },
          body: JSON.stringify(parsed.data),
        });
        if (version !== generation.current) return;
        if (!fresh) setResponseMs(Math.round(performance.now() - submittedAt));
        if (created.result) {
          setResult(created.result);
          setJob(null);
          setBusy(false);
          setPhase("");
          requestId.current = null;
          return;
        }
        setSavedId(created.id);
        storage.write(created.id);
        await poll(created.id, version);
      }
    } catch (caught) {
      if (version !== generation.current) return;
      setBusy(false);
      stopClock();
      setError(
        caught instanceof Error
          ? caught.message
          : "The comparison could not finish.",
      );
    }
  }
  async function resume() {
    if (!savedId || !token) return;
    cancelPolling();
    setBusy(true);
    setError("");
    setResponseMs(null);
    await poll(savedId, generation.current, true);
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
    if (!job && !result?.dataStatus) return;
    setEvidenceBusy(true);
    try {
      setEvidence(
        job
          ? await requestApi(`/api/quotes/${job.id}/evidence`, token)
          : await requestApi("/api/observations", token, {
              method: "POST",
              body: JSON.stringify(
                [
                  ...new Set(
                    [
                      ...result!.offers.flatMap((o) => o.evidence),
                      ...result!.shipping.flatMap((s) => s.evidence),
                    ].map((e) => e.observationId),
                  ),
                ].slice(0, 20),
              ),
            }),
      );
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
            <span className="eyebrow">PARTS WORKBENCH</span>
            <h1>Compare the full cost of your parts list.</h1>
            <p>
              Compare component orders from Robu and Robocraze, including pack
              sizes, tax and delivery to your pincode.
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
              {!liveAvailable && <span className="small-tag">Hosted</span>}
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
              <strong>Calculator example.</strong> Edit the quantities to see
              how shipping changes the best basket. Prices here are synthetic.
            </span>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {mode === "live" && temporaryBackend && (
          <div className="demo-banner" role="status">
            <Icon name="info" />
            <span>
              <strong>Temporary live server.</strong> The team computer must
              stay online. Collection time depends on retailer availability.
            </span>
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
              <LiveConnection
                token={token}
                status={status}
                checking={checking}
                busy={busy}
                savedId={savedId}
                onTokenChange={(value) => {
                  setToken(value);
                  setStatus(null);
                }}
                onCheck={() => void checkConnection()}
                onResume={() => void resume()}
              />
            )}
            <div className="workspace-grid">
              <section className="panel parts-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">BILL OF MATERIALS</span>
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
                      disabled={mode === "live" && (!liveAvailable || !token)}
                    >
                      {busy
                        ? "Checking options…"
                        : mode === "demo"
                          ? "Calculate sample baskets"
                          : token
                            ? "Collect & compare fresh offers"
                            : "Enter team token to compare"}
                      <Icon name="arrow" />
                    </button>
                    {mode === "live" && liveAvailable && (
                      <div className="refresh-row">
                        <button
                          type="button"
                          className="text-button"
                          disabled={!token}
                          onClick={() => void submit(false)}
                        >
                          View saved observations ↗
                        </button>
                        <span>
                          Previously collected data; no new retailer checks.
                        </span>
                      </div>
                    )}
                    {mode === "live" && !token && (
                      <p className="notice warning setup-blocker">
                        {error ||
                          (status
                            ? `Not ready: ${status.checks
                                .filter((check) => !check.ok)
                                .map((check) => check.name)
                                .join(
                                  ", ",
                                )}. Complete these checks in Live connection above.`
                            : "Enter your team token in Live connection above.")}
                      </p>
                    )}
                  </fieldset>
                </form>
                <details className="coverage">
                  <summary>Supported retailers</summary>
                  <p>
                    <strong>Robu · Robocraze.</strong> Collection is limited to
                    the curated products in this list. Missing specifications
                    and shipping charges are marked as unknown.
                  </p>
                  <p>
                    A complete live purchase recommendation still requires
                    verified products and shipping for your pincode.
                  </p>
                  <a
                    href={`${repository}blob/main/docs/FEASIBILITY.md`}
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
                          ? "Fresh collection is running in the background. Saved results appear as they arrive. Resume retrieves this same job."
                          : "Calculating complete assignments from the synthetic fixture."}
                      </p>
                    </div>
                  </div>
                )}
                {mode === "live" && responseMs !== null && (
                  <p className="response-note" role="status">
                    Saved comparison · {(responseMs / 1000).toFixed(2)} s · No
                    new API calls
                  </p>
                )}
                {mode === "live" && collectionClock && (
                  <>
                    <p className="response-note">
                      {collectionClock.recovered
                        ? collectionClock.finished
                          ? "Saved quote duration"
                          : "Resumed collection"
                        : "Fresh collection"}{" "}
                      · {(collectionClock.elapsedMs / 1000).toFixed(1)} s
                      {job && (
                        <>
                          {" "}
                          ·{" "}
                          <button
                            className="text-button"
                            onClick={() => void inspect()}
                          >
                            Inspect this run ↗
                          </button>
                        </>
                      )}
                      {collectionClock.finished &&
                        (job?.status === "complete" && result?.recommendedId
                          ? " · Verified plan returned"
                          : " · No complete verified plan returned")}
                    </p>
                  </>
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
                      <span className="eyebrow">02 / PURCHASING PLAN</span>
                      <h2>
                        {mode === "live"
                          ? job?.status === "failed"
                            ? "Collection needs attention."
                            : "Collect fresh retailer prices."
                          : "A lower item price can cost more at checkout."}
                      </h2>
                      <p>
                        {mode === "live"
                          ? job?.status === "failed"
                            ? "Review the error above. Any pages already collected remain saved with this quote; open Evidence to inspect them before retrying."
                            : "The main button starts new TinyFish requests and new AI extraction. Saved observations are available through a separate link and are never counted as a fresh quote."
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
                          ? "A delivered total is recommended only after product requirements and exact-basket shipping have been checked."
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
