export interface RuntimeProjectPersistenceOptions {
  /** Quiet period before saving. Continuous edits are bounded by maxWaitMs. */
  debounceMs?: number;
  /** Maximum delay before starting a save, unless another save is still in flight. */
  maxWaitMs?: number;
}

export interface RuntimeProjectPersistenceStatus {
  readonly commitSeq: number;
  readonly savedSeq: number;
  readonly state: "saved" | "pending" | "saving" | "failed" | "disposed";
  readonly error?: unknown;
}

/** Schedules checkpoints of the owner's current state, without retaining queued packages.
 * The save callback must synchronously capture its input before its first await.
 * At most one save is in flight. Later commits coalesce in the owner's current state.
 * Failures pause automatic saves until an explicit flush retries them.
 */
export class RuntimeProjectPersistence {
  private commitSeq = 0;
  private savedSeq = 0;
  private firstDirtyAt: number | undefined;
  private lastDirtyAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active: Promise<void> | undefined;
  private failure: { error: unknown } | undefined;
  private disposed = false;
  private notificationPending = false;
  private readonly listeners = new Set<(status: RuntimeProjectPersistenceStatus) => void>();
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;

  constructor(
    private readonly save: () => Promise<void>,
    options: RuntimeProjectPersistenceOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? 250;
    this.maxWaitMs = options.maxWaitMs ?? 2000;
    if (
      !Number.isFinite(this.debounceMs) ||
      !Number.isFinite(this.maxWaitMs) ||
      this.debounceMs < 0 ||
      this.maxWaitMs < this.debounceMs ||
      this.maxWaitMs > 0x7fffffff
    ) {
      throw new Error("Invalid project persistence timing");
    }
  }

  get status(): RuntimeProjectPersistenceStatus {
    return {
      commitSeq: this.commitSeq,
      savedSeq: this.savedSeq,
      state: this.disposed
        ? "disposed"
        : this.active
          ? "saving"
          : this.failure
            ? "failed"
            : this.savedSeq === this.commitSeq
              ? "saved"
              : "pending",
      ...(this.failure ? { error: this.failure.error } : {})
    };
  }

  subscribe(listener: (status: RuntimeProjectPersistenceStatus) => void): () => void {
    if (this.disposed) throw new Error("Project persistence disposed");
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  committed(): number {
    if (this.disposed) throw new Error("Project persistence disposed");
    this.commitSeq++;
    this.lastDirtyAt = performance.now();
    this.firstDirtyAt ??= this.lastDirtyAt;
    this.schedule();
    this.notify();
    return this.commitSeq;
  }

  /** Wait for this already-published revision, not for an indefinitely moving idle point.
   * A failed attempt rejects all callers waiting on it. Calling flush again retries
   * the latest state; it never re-executes the commands that produced that state.
   */
  async flush(target = this.commitSeq): Promise<void> {
    if (!Number.isSafeInteger(target) || target < 0 || target > this.commitSeq)
      throw new Error("Unknown project commit sequence");
    if (this.disposed) throw new Error("Project persistence disposed");
    while (this.savedSeq < target) {
      await (this.active ?? this.start());
      if (this.disposed) throw new Error("Project persistence disposed");
    }
  }

  /** Discards pending autosave work. Hosts must await flush before a controlled close. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  private schedule(): void {
    this.clearTimer();
    if (this.disposed || this.active || this.failure || this.firstDirtyAt === undefined) return;
    const due = Math.min(this.lastDirtyAt + this.debounceMs, this.firstDirtyAt + this.maxWaitMs);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        // Failure remains observable through status/subscribe and explicit flush.
        void this.start().catch(() => {});
      },
      Math.max(0, due - performance.now())
    );
  }

  private start(): Promise<void> {
    this.clearTimer();
    this.failure = undefined;
    const task = Promise.resolve()
      .then(async () => {
        if (this.disposed) throw new Error("Project persistence disposed");
        const target = this.commitSeq;
        this.firstDirtyAt = undefined;
        await this.save();
        this.savedSeq = target;
      })
      .catch((error) => {
        this.failure = { error };
        throw error;
      })
      .finally(() => {
        this.active = undefined;
        this.schedule();
        if (!this.disposed) this.notify();
      });
    this.active = task;
    this.notify();
    return task;
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private notify(): void {
    if (!this.listeners.size || this.notificationPending || this.disposed) return;
    this.notificationPending = true;
    // Observers run after the owner's atomic publication, and reentrant changes
    // produce a later notification rather than delivering states out of order.
    queueMicrotask(() => {
      this.notificationPending = false;
      if (this.disposed) return;
      const status = this.status;
      for (const listener of [...this.listeners]) {
        try {
          listener(status);
        } catch (error) {
          console.error("Project persistence observer failed", error);
        }
      }
    });
  }
}
