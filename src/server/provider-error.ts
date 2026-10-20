// Only controlled, actionable text crosses into quote errors. Never forward raw
// provider bodies: they may contain credentials, page content or request data.
import { createHash } from "node:crypto";
export function providerFingerprint(
  provider: string,
  model: string,
  key: string,
) {
  return createHash("sha256")
    .update([provider, model, key].join("\0"))
    .digest("hex");
}
export class ProviderAccessError extends Error {
  constructor(
    public provider: "gemini" | "tinyfish",
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderAccessError";
  }
}
export class RunRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunRejectedError";
  }
}
