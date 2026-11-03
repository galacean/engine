/** Storage transport failures may be retried; invalid definitions/saves must never be overwritten. */
export class FarmingInitializationError extends Error {
  constructor(
    readonly code: "STORAGE_FAILURE" | "INVALID_SNAPSHOT" | "CANCELLED",
    cause: unknown
  ) {
    super(`${code}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "FarmingInitializationError";
  }
  get retryable(): boolean {
    return this.code === "STORAGE_FAILURE";
  }
}
