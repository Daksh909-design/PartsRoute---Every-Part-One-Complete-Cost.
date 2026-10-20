export type CollectionClock = {
  startedAt: number;
  elapsedMs: number;
  finished: boolean;
};

// Only an explicit saved comparison may use old observations. Keep the primary
// action's endpoint and freshness flag together so they cannot diverge.
export function liveRequest(fresh = true) {
  return { path: fresh ? "/api/quotes" : "/api/comparisons", refresh: fresh };
}
