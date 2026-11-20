export type SeedWorldSaveStatus = "pending" | "saving" | "saved" | "save-error";

// editor dev/2.0, EditorAsset.ts: saveMain/saveMeta use 1500ms trailing debounce.
export const SEED_WORLD_SAVE_DEBOUNCE_MS = 1_500;
export const SEED_WORLD_SAVE_MAX_WAIT_MS = 10_000;

/** Coalesces edits before capture and keeps at most one write in flight. */
export class SeedWorldSaveScheduler<T> {
  private _revision = 0;
  private _savedRevision = 0;
  private _firstDirtyAt: number | undefined;
  private _lastDirtyAt = 0;
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _scheduledDueAt = 0;
  private _flight: Promise<void> | undefined;
  private _disposed = false;
  private _flushRequested = false;
  private _deferredCapture = false;
  private readonly _onTimer = (): void => {
    this._handleTimer();
  };

  constructor(
    private readonly _options: {
      capture: () => T;
      save: (snapshot: T) => Promise<void>;
      onStatus: (status: SeedWorldSaveStatus) => void;
      onError?: (error: unknown) => void;
      debounceMs?: number;
      maxWaitMs?: number;
      /** Must only allow capture of a fully published, consistent state. */
      canCapture?: () => boolean;
    }
  ) {}

  /** Does not capture a snapshot or wait for storage. */
  markDirty(): void {
    if (this._disposed) return;
    const now = Date.now();
    if (this._revision !== this._savedRevision && !this._canCapture() && this._dueAt(now) <= now) {
      this._deferredCapture = true;
    }
    this._revision++;
    this._lastDirtyAt = now;
    this._firstDirtyAt ??= now;
    this._options.onStatus("pending");
    this._schedule(now);
  }

  /** Explicit retry/manual flush; edits arriving during this write remain dirty. */
  async flush(): Promise<void> {
    if (this._disposed) return;
    this._clearTimer();
    if (this._flight) {
      this._flushRequested = true;
      await this._flight;
      if (!this._disposed && this._revision !== this._savedRevision) await this.flush();
      return;
    }
    if (this._revision === this._savedRevision) return;
    if (!this._canCapture()) {
      this._deferredCapture = true;
      return;
    }
    this._deferredCapture = false;
    const revision = this._revision;
    this._firstDirtyAt = undefined;
    this._options.onStatus("saving");
    let succeeded = false;
    // Capture in the same synchronous turn as the guard, before another edit can start.
    this._flight = new Promise<T>((resolve) => resolve(this._options.capture()))
      .then(async (snapshot) => {
        await this._options.save(snapshot);
        this._savedRevision = revision;
        succeeded = true;
      })
      .catch((error) => {
        if (!this._disposed) this._options.onError?.(error);
      });
    await this._flight;
    this._flight = undefined;
    if (this._disposed) return;
    const newerEdit = this._revision !== revision;
    this._options.onStatus(newerEdit ? "pending" : succeeded ? "saved" : "save-error");
    if (this._flushRequested) {
      this._flushRequested = false;
      if (newerEdit) await this.flush();
    } else if (newerEdit) {
      this._schedule(Date.now());
    }
  }

  dispose(): void {
    this._disposed = true;
    this._clearTimer();
  }

  /** Called after commit/rollback/generation; keeps the original deadline, without polling. */
  notifyCaptureReady(): void {
    if (this._disposed || !this._canCapture() || this._revision === this._savedRevision) return;
    if (this._deferredCapture) void this.flush();
    else this._schedule(Date.now());
  }

  private _canCapture(): boolean {
    return this._options.canCapture?.() ?? true;
  }

  private _dueAt(now: number): number {
    return Math.min(
      this._lastDirtyAt + (this._options.debounceMs ?? SEED_WORLD_SAVE_DEBOUNCE_MS),
      (this._firstDirtyAt ?? now) + (this._options.maxWaitMs ?? SEED_WORLD_SAVE_MAX_WAIT_MS)
    );
  }

  private _schedule(now: number): void {
    if (this._flight || this._disposed || (this._deferredCapture && !this._canCapture())) {
      this._clearTimer();
      return;
    }
    const due = this._deferredCapture ? now : this._dueAt(now);
    // Keep the existing earlier timer instead of clearing/re-allocating closures and timers every frame.
    if (this._timer !== undefined && due >= this._scheduledDueAt) return;
    this._clearTimer();
    this._scheduledDueAt = due;
    this._timer = setTimeout(this._onTimer, Math.max(0, due - now));
  }

  private _handleTimer(): void {
    this._timer = undefined;
    this._scheduledDueAt = 0;
    if (this._disposed || this._flight || this._revision === this._savedRevision) return;
    if (this._deferredCapture && !this._canCapture()) return;
    const now = Date.now();
    const due = this._deferredCapture ? now : this._dueAt(now);
    if (now < due) {
      this._scheduledDueAt = due;
      this._timer = setTimeout(this._onTimer, due - now);
      return;
    }
    void this.flush();
  }

  private _clearTimer(): void {
    if (this._timer !== undefined) clearTimeout(this._timer);
    this._timer = undefined;
    this._scheduledDueAt = 0;
  }
}
