/** Lifecycle shared by editors and their callers; independent of model/tool protocols. */
export interface EditTransaction {
  /** After operations settle, report pending author changes; reading a draft alone is not a change. */
  hasChanges(): boolean;
  prepare(signal: AbortSignal): Promise<void> | void;
  commit(): Promise<{ transactionId: string; revision?: number }> | { transactionId: string; revision?: number };
  activate?(signal: AbortSignal): Promise<void> | void;
  discard(): Promise<void> | void;
  /** Release preparation resources on every terminal path, including a committed edit
   * whose activation was skipped. Must be idempotent; never undo accepted authoring. */
  complete?(): Promise<void> | void;
}

/** Expected preparation diagnostics that a caller can report without knowing the compiler. */
export class EditPreparationError extends Error {
  constructor(
    readonly code: string,
    readonly phase: "check" | "build",
    message: string
  ) {
    super(message);
    this.name = "EditPreparationError";
  }
}
