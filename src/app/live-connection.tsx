import { apiBase, liveAvailable, repository } from "./api-client";

export type IntegrationStatus = {
  ready: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
};

type Props = {
  token: string;
  status: IntegrationStatus | null;
  checking: boolean;
  busy: boolean;
  savedId: string;
  onTokenChange: (token: string) => void;
  onCheck: () => void;
  onResume: () => void;
};

export default function LiveConnection({
  token,
  status,
  checking,
  busy,
  savedId,
  onTokenChange,
  onCheck,
  onResume,
}: Props) {
  return (
    <section className="panel connection-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LIVE CONNECTION</span>
          <h2>
            {!liveAvailable
              ? "Connect a server to collect live offers"
              : "Check the live service"}
          </h2>
        </div>
        <span className={`connection-state ${status?.ready ? "ready" : ""}`}>
          {status?.ready
            ? "Service ready"
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
            This GitHub Pages site hosts the sample calculator. Live quotes need
            the server application, a database and a worker. TinyFish and AI
            provider keys belong on that server.
          </p>
          <a
            className="setup-link"
            href={`${repository}blob/main/docs/LIVE-SETUP.md`}
            target="_blank"
            rel="noreferrer"
          >
            Open live deployment guide ↗
          </a>
        </>
      ) : (
        <>
          <p>
            Collect new product pages and request new AI extraction. The timer
            measures the full quote, including verification.
          </p>
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
                onChange={(event) => onTokenChange(event.target.value)}
                placeholder="Enter the server’s team token"
              />
            </label>
            <button
              type="button"
              className="secondary"
              disabled={checking || busy || !token}
              onClick={onCheck}
            >
              {checking ? "Checking…" : "Check connection"}
            </button>
          </div>
          <p className="source-note">
            The token stays in this tab. API keys are never entered here.
          </p>
          <details className="token-help">
            <summary>Where do I find the team token?</summary>
            <p>
              Local server: copy the value of APP_ACCESS_TOKEN from your private
              .env.local file. Hosted server: find APP_ACCESS_TOKEN in the web
              service’s Environment settings. This is your PartsRoute access
              password, separate from the AI provider and TinyFish keys.
            </p>
          </details>
          {status && (
            <ul className="status-checks">
              {status.checks.map((check) => (
                <li key={check.name}>
                  <span className={check.ok ? "check-ok" : "check-fail"}>
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
            <button className="text-button" type="button" onClick={onResume}>
              Resume the last live quote ↗
            </button>
          )}
        </>
      )}
    </section>
  );
}
