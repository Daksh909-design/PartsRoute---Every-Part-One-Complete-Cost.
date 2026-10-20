// Bound independent provider requests without serialising the entire quote.
export class TaskPool {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error("Invalid concurrency limit");
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      if (this.active < this.limit) {
        this.active++;
        resolve();
      } else this.waiting.push(resolve);
    });
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
