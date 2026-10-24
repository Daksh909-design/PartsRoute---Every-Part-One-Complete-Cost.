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
  temporaryBackend,
} from "./api-client";
import QuoteResults from "./quote-results";
import EvidenceView, { type EvidenceData } from "./evidence-view";
import { Icon } from "./ui-icons";
import { demoQuote } from "../domain/demo";
import { liveRequest, type CollectionClock } from "../domain/live-request";
import ComponentSearch from "./component-search";
import type { SearchProduct } from "../domain/search";

type Job = {
  id: string;
  input: QuoteInput;
  created_at: string;
  updated_at: string;
  status: string;
  phase: string;
  result: QuoteResult | null;
  errors: string[];
  attempts?: number;
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
  const liveDraft = useRef<{ parts: PartRequest[]; pincode: string } | null>(
    null,
  );
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
  function addPart() {
    const entry = catalogue.find(
      (item) => !parts.some((part) => part.catalogueId === item.id),
    );
    if (!entry) return;
    setParts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        catalogueId: entry.id,
        name: entry.name,
        model: entry.model,
        quantity: 1,
        requiredSpecs: entry.specs.map((spec) => ({ ...spec })),
        equivalentAcceptable: false,
        confirmedOfferIds: [],
      },
    ]);
    requestId.current = null;
  }
  function addSearchProduct(product: SearchProduct, variantId?: number) {
    const variant = product.variants.find((item) => item.id === variantId);
    setParts((current) => {
      const existing = current.find((part) =>
        part.sources?.some(
          (source) =>
            source.retailer === product.retailer &&
            source.url === product.url &&
            source.variantId === variantId,
        ),
      );
      if (existing)
        return current.map((part) =>
          part.id === existing.id
            ? { ...part, quantity: Math.min(100, part.quantity + 1) }
            : part,
        );
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          catalogueId: `search:${product.id}:${variantId ?? "product"}`,
          name: `${product.title}${variant && variant.title !== "Default Title" ? ` — ${variant.title}` : ""}`.slice(
            0,
            240,
          ),
          model: "",
          quantity: 1,
          quantityUnit: "packs",
          sources: [
            {
              retailer: product.retailer,
              url: product.url,
              ...(variantId ? { variantId } : {}),
            },
          ],
          requiredSpecs: [],
          equivalentAcceptable: false,
          confirmedOfferIds: [],
        },
      ];
    });
    requestId.current = null;
  }
  function switchMode(next: "demo" | "live") {
    if (next === mode) return;
    cancelPolling();
    setMode(next);
    if (next === "demo") {
      liveDraft.current = { parts: structuredClone(parts), pincode };
      setParts(structuredClone(sampleParts));
      setPincode("560001");
      setResult(
        demoQuote({
          parts: structuredClone(sampleParts),
          pincode: "560001",
          mode: "demo",
          refresh: false,
        }),
      );
    } else {
      setParts(liveDraft.current?.parts ?? []);
      setPincode(liveDraft.current?.pincode ?? pincode);
      setResult(null);
    }
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
        const sample = demoQuote(parsed.data);
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
    cancelPolling();
    const version = generation.current;
    setBusy(true);
    setError("");
    try {
      await requestApi(`/api/quotes/${job.id}`, token, { method: "POST" });
      if (version !== generation.current) return;
      await poll(job.id, version);
    } catch (caught) {
      if (version !== generation.current) return;
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "Retry failed.");
    }
  }
  async function inspect() {
    setView("evidence");
    if (!job && !result?.dataStatus) return;
    setEvidenceBusy(true);
    const version = generation.current;
    try {
      const loaded = job
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
          });
      if (version === generation.current) setEvidence(loaded);
    } catch (caught) {
      if (version !== generation.current) return;
      setError(
        caught instanceof Error ? caught.message : "Cannot load evidence.",
      );
    } finally {
      if (version === generation.current) setEvidenceBusy(false);
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
            <h1>Plan your next build.</h1>
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
              {!liveAvailable && <span className="small-tag">Setup</span>}
            </button>
          </div>
          <span className="toolbar-note">INR · India</span>
        </div>
        {mode === "demo" && (
          <div className="demo-banner">
            <Icon name="info" />
            <span>
              <strong>Sample data.</strong> Change quantities to compare
              baskets.
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
              <strong>Temporary server.</strong> Keep the host computer online.
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
              <section className="panel connection-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">LIVE CONNECTION</span>
                    <h2>
                      {!liveAvailable
                        ? "Connect a server to collect live offers"
                        : "Team access"}
                    </h2>
                  </div>
                  <span
                    className={`connection-state ${status?.ready ? "ready" : ""}`}
                  >
                    {status?.ready
                      ? "Connected"
                      : !liveAvailable
                        ? "Server not connected"
                        : status
                          ? "Needs attention"
                          : "Not checked"}
                  </span>
                </div>
                {!liveAvailable ? (
                  <>
                    <p>Connect a backend to enable live quotes.</p>
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
                    {apiBase && (
                      <p className="source-note">
                        Connected server:{" "}
                        <a
                          href={`${apiBase}/api/health`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {new URL(apiBase).hostname} ↗
                        </a>
                      </p>
                    )}
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
                          placeholder="Team token"
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
                    <details className="token-help">
                      <summary>Where do I find the team token?</summary>
                      <p>Ask your team for the access token.</p>
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
                              {!check.ok && <span>{check.detail}</span>}
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
                    <span className="eyebrow">BILL OF MATERIALS</span>
                    <h2>Your parts list</h2>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={reset}
                    disabled={busy}
                  >
                    {mode === "demo" ? "Reset sample" : "Load sample parts"}
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
                    total requested
                  </span>
                  <span>
                    Deliver to <strong>{pincode || "—"}</strong>
                  </span>
                </div>
                {mode === "live" && liveAvailable && (
                  <ComponentSearch
                    token={token}
                    disabled={busy || checking}
                    add={addSearchProduct}
                  />
                )}
                {mode === "demo" && (
                  <p className="source-note">
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => switchMode("live")}
                    >
                      Search components in Live quote ↗
                    </button>
                  </p>
                )}
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
                          {part.sources?.length ? (
                            <div>
                              <h3>{part.name}</h3>
                              {part.sources.map((source) => (
                                <a
                                  key={source.url}
                                  href={source.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Selected retailer product ↗
                                </a>
                              ))}
                            </div>
                          ) : (
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
                                <option
                                  key={entry.id}
                                  value={entry.id}
                                  disabled={parts.some(
                                    (other) =>
                                      other.id !== part.id &&
                                      other.catalogueId === entry.id,
                                  )}
                                >
                                  {entry.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <div className="attribute-summary">
                            {part.requiredSpecs.map((spec, key) => (
                              <span key={key}>
                                {spec.key.replaceAll("_", " ")}: {spec.value}
                              </span>
                            ))}
                          </div>
                          {(mode === "live" || parts.length > 1) && (
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => {
                                setParts((current) =>
                                  current.filter((item) => item.id !== part.id),
                                );
                                requestId.current = null;
                              }}
                            >
                              Remove component
                            </button>
                          )}
                          <details className="attributes-editor">
                            <summary>Edit matching requirements</summary>
                            <div className="attribute-fields">
                              <label htmlFor={`model-${part.id}`}>
                                Exact model{" "}
                                {part.sources?.length
                                  ? "(optional; leave blank to use selected listing)"
                                  : ""}
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
                              {part.sources?.length ? (
                                <label>
                                  Quantity means
                                  <select
                                    value={part.quantityUnit ?? "units"}
                                    onChange={(event) =>
                                      patch(part.id, {
                                        quantityUnit: event.target.value as
                                          "units" | "packs",
                                      })
                                    }
                                  >
                                    <option value="packs">
                                      Retailer packs, as listed
                                    </option>
                                    <option value="units">
                                      Individual units
                                    </option>
                                  </select>
                                </label>
                              ) : null}
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
                            </div>
                          </details>
                        </div>
                        <label className="quantity">
                          {part.sources?.length ? (
                            <small>
                              {part.quantityUnit === "packs"
                                ? "Packs"
                                : "Units"}
                            </small>
                          ) : null}
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
                    {mode === "demo" &&
                      catalogue.some(
                        (entry) =>
                          !parts.some((part) => part.catalogueId === entry.id),
                      ) && (
                        <button
                          className="secondary"
                          type="button"
                          onClick={addPart}
                        >
                          Add component
                        </button>
                      )}
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
                      <p>{mode === "demo" ? "Sample delivery rates" : ""}</p>
                    </div>
                    <button
                      className="primary"
                      type="submit"
                      disabled={
                        mode === "live" &&
                        (!liveAvailable || !token || !parts.length)
                      }
                    >
                      {busy
                        ? "Checking options…"
                        : mode === "demo"
                          ? "Calculate sample baskets"
                          : token
                            ? "Compare live prices"
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
                          ? "Results appear as they arrive."
                          : "Comparing baskets…"}
                      </p>
                    </div>
                  </div>
                )}
                {mode === "live" && responseMs !== null && (
                  <p className="response-note" role="status">
                    Saved comparison · {(responseMs / 1000).toFixed(2)} s
                  </p>
                )}
                {mode === "live" && collectionClock && (
                  <>
                    <p className="response-note" aria-live="off">
                      {collectionClock.recovered
                        ? collectionClock.finished
                          ? (job?.attempts ?? 1) > 1
                            ? "Total elapsed time"
                            : "Saved quote duration"
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
                          : " · Partial result")}
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
                            ? "Check the error above or retry this quote."
                            : "Add components and compare prices for your pincode."
                          : "Add components to compare basket costs."}
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
                        disabled={(job.attempts ?? 0) >= 3}
                      >
                        {(job.attempts ?? 0) >= 3
                          ? "Retry limit reached"
                          : "Retry saved work"}
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
