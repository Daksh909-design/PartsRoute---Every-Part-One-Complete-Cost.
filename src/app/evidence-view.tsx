import { repository, when } from "./api-client";

export type EvidenceData = {
  observations: {
    id: string;
    source_url: string;
    method: string;
    run_id: string | null;
    retrieved_at: string;
    original: unknown;
    normalized: unknown;
  }[];
  operations: {
    operation_key: string;
    status: string;
    run_id: string | null;
  }[];
  usage: {
    provider: string;
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
  }[];
};
export default function EvidenceView({
  data,
  jobId,
  busy,
  reload,
}: {
  data: EvidenceData | null;
  jobId: string | null;
  busy: boolean;
  reload: () => void;
}) {
  return (
    <section className="panel evidence-panel">
      <div className="section-heading">
        <div>
          <span className="overline">INTEGRATION RECORD</span>
          <h2>Collection evidence</h2>
        </div>
        {jobId && (
          <button className="secondary" onClick={reload} disabled={busy}>
            {busy ? "Loading…" : "Reload evidence"}
          </button>
        )}
      </div>
      <p>
        Live quotes retain the original TinyFish responses, normalized
        observations, browser run IDs and reported model usage.
      </p>
      {!jobId ? (
        <div className="empty-panel">
          <h3>No live quote selected</h3>
          <p>
            Sample calculations use synthetic data and have no TinyFish run.
            Start a live quote on the server deployment to inspect its evidence
            here.
          </p>
          <a
            href={`${repository}/tree/main/docs/evidence`}
            target="_blank"
            rel="noreferrer"
          >
            Read saved feasibility observations ↗
          </a>
          <p className="source-note">
            These earlier captures are research records, not a live run of this
            site.
          </p>
        </div>
      ) : (
        <p className="source-note">
          Quote <code>{jobId}</code>
        </p>
      )}
      {data && (
        <>
          <h3>TinyFish browser runs</h3>
          {!data.operations.length && (
            <p className="muted">
              No basket check has started. Missing product or price details can
              prevent verification.
            </p>
          )}
          {data.operations.map((operation) => (
            <div className="run-row" key={operation.operation_key}>
              <span>{operation.status}</span>
              {operation.run_id ? (
                <a
                  href={`https://agent.tinyfish.ai/runs/${encodeURIComponent(operation.run_id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {operation.run_id} ↗
                </a>
              ) : (
                <span>
                  Submission uncertain. Recover the existing run before
                  retrying.
                </span>
              )}
            </div>
          ))}
          <h3>Original observations</h3>
          {data.observations.map((observation) => (
            <details key={observation.id}>
              <summary>
                {observation.method} · {when(observation.retrieved_at)}
              </summary>
              <div className="match-details">
                <a
                  href={observation.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source ↗
                </a>
                <h4>Original response</h4>
                <pre>{JSON.stringify(observation.original, null, 2)}</pre>
                <h4>Normalized observation</h4>
                <pre>{JSON.stringify(observation.normalized, null, 2)}</pre>
              </div>
            </details>
          ))}
          <h3>Reported usage</h3>
          <p className="source-note">
            Unreported usage remains unknown. Token counts are not a monetary
            cost estimate.
          </p>
          <div className="table-scroll">
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
                {data.usage.map((usage, index) => (
                  <tr key={index}>
                    <td>{usage.provider}</td>
                    <td>{usage.model}</td>
                    <td>{usage.input_tokens ?? "Unknown"}</td>
                    <td>{usage.output_tokens ?? "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
