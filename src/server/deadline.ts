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
  signal?: AbortSignal,
): AbortSignal {
  signal?.throwIfAborted();
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new CollectionDeadline();
  const timeout = AbortSignal.timeout(
    Math.max(1, Math.ceil(Math.min(timeoutMs, remaining))),
  );
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function waitWithinDeadline(
  ms: number,
  deadline: number,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  if (Date.now() + ms >= deadline) throw new CollectionDeadline();
  await new Promise<void>((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }, ms);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}
