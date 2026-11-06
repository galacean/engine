/**
 * Defers the final Engine/Scene teardown until every tracked asynchronous
 * operation has settled. Cancellation is still owned by the caller; this
 * barrier only prevents GPU cleanup from racing a pending continuation.
 */
export class GrasslandsAsyncTeardownBarrier {
  private _pendingCount = 0;
  private _finalizeRequested = false;
  private _finalized = false;
  private readonly _finalizedPromise: Promise<void>;
  private readonly _resolveFinalized: () => void;
  private readonly _rejectFinalized: (error: unknown) => void;

  constructor(private readonly _finalize: () => void) {
    let resolveFinalized!: () => void;
    let rejectFinalized!: (error: unknown) => void;
    this._finalizedPromise = new Promise<void>((resolve, reject) => {
      resolveFinalized = resolve;
      rejectFinalized = reject;
    });
    this._resolveFinalized = resolveFinalized;
    this._rejectFinalized = rejectFinalized;
  }

  get pendingCount(): number {
    return this._pendingCount;
  }

  get finalized(): boolean {
    return this._finalized;
  }

  track<T>(operation: Promise<T>): Promise<T> {
    if (this._finalizeRequested) {
      throw new Error("Grasslands teardown cannot track new work after finalization was requested.");
    }
    this._pendingCount++;
    return operation.finally(() => {
      this._pendingCount--;
      this._finalizeIfSettled();
    });
  }

  requestFinalize(): void {
    this._finalizeRequested = true;
    this._finalizeIfSettled();
  }

  whenFinalized(): Promise<void> {
    return this._finalizedPromise;
  }

  private _finalizeIfSettled(): void {
    if (!this._finalizeRequested || this._finalized || this._pendingCount !== 0) return;
    this._finalized = true;
    try {
      this._finalize();
      this._resolveFinalized();
    } catch (error) {
      this._rejectFinalized(error);
    }
  }
}
