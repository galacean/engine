/** Opaque identity for one Seed World asynchronous generation. */
export interface SeedWorldGenerationToken {
  /** Monotonic generation number used only for equality checks. */
  readonly epoch: number;
}

/** Invalidates deferred Promise, timer, and animation-frame completions after mode changes. */
export class SeedWorldGenerationEpoch {
  private _epoch = 0;
  private _destroyed = false;

  /**
   * Begins one generation and invalidates every older token.
   * @param invalidatePendingGeneration Synchronous page-owned cancellation run before deferred work can publish.
   * @returns Opaque token for guarding deferred completion.
   * @throws If the lifecycle has been permanently destroyed.
   */
  begin(invalidatePendingGeneration?: () => void): SeedWorldGenerationToken {
    if (this._destroyed) throw new Error("Seed World generation lifecycle has been destroyed.");
    const token = Object.freeze({ epoch: ++this._epoch });
    invalidatePendingGeneration?.();
    return token;
  }

  /**
   * Invalidates every issued token without starting work.
   * @returns Nothing.
   */
  invalidate(): void {
    if (this._destroyed) return;
    this._epoch++;
  }

  /**
   * Tests whether a deferred completion still owns the current generation.
   * @param token Token returned by {@link begin}.
   * @returns Whether `token` is current and the lifecycle is alive.
   */
  isCurrent(token: SeedWorldGenerationToken): boolean {
    return !this._destroyed && token.epoch === this._epoch;
  }

  /**
   * Runs one deferred Promise, timer, or animation-frame completion only while its token is current.
   * @param token Token returned by {@link begin}.
   * @param completion Side effect guarded by the token.
   * @returns Whether the completion ran.
   */
  runIfCurrent(token: SeedWorldGenerationToken, completion: () => void): boolean {
    if (!this.isCurrent(token)) return false;
    completion();
    return true;
  }

  /**
   * Permanently invalidates every token. Repeated calls have no effect.
   * @returns Nothing.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._epoch++;
  }
}
