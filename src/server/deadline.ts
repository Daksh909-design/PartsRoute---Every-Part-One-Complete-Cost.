export class CollectionDeadline extends Error {
  constructor() {
    super(
      "This check did not finish in the collection window. Saved facts are retained; unfinished details remain unverified.",
    );
    this.name = "CollectionDeadline";
  }
}
export function collectionWindowMs() {
  return Math.min(
    26000,
    Math.max(1000, Number(process.env.QUOTE_COLLECTION_BUDGET_MS) || 26000),
  );
}
export function requestSignal(
  deadline: number,
  timeoutMs: number,
): AbortSignal {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new CollectionDeadline();
  return AbortSignal.timeout(
    Math.max(1, Math.ceil(Math.min(timeoutMs, remaining))),
  );
}
