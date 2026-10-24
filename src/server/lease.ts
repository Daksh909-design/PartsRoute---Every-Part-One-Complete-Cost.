export class LeaseLost extends Error {
  constructor() {
    super(
      "This worker no longer owns the quote. A replacement worker will continue saved work.",
    );
    this.name = "LeaseLost";
  }
}

export type JobLease = {
  id: string;
  owner: string;
  attempt: number;
  signal: AbortSignal;
};
