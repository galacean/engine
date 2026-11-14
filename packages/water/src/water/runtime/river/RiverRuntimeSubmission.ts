import { RIVER_RESOURCE_SUBMISSION_BUDGET_MS } from "./constants";
import type { RiverRuntimeSubmissionOptions } from "./RiverRuntimeController";

export class RiverRuntimeSubmissionCancelledError extends Error {
  constructor() {
    super("River runtime submission was superseded by a newer request.");
    this.name = "RiverRuntimeSubmissionCancelledError";
  }
}

/** Accounts for preparation, upload, publication and retirement on one timeline. */
export class RiverRuntimeSubmission {
  private readonly now: () => number;
  private readonly yieldToMainThread: () => Promise<void>;
  private readonly budget: number;
  private sliceStart: number;
  private reserve = 0;
  private hasWork = false;
  yieldCount = 0;
  maxSliceMs = 0;

  constructor(
    options: RiverRuntimeSubmissionOptions,
    private readonly cancelled: () => boolean
  ) {
    this.now = options.now ?? (() => performance.now());
    this.yieldToMainThread =
      options.yieldToMainThread ?? (() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    this.budget = options.frameBudgetMs ?? RIVER_RESOURCE_SUBMISSION_BUDGET_MS;
    if (!Number.isFinite(this.budget) || this.budget <= 0) throw new RangeError("River frame budget must be positive.");
    this.sliceStart = this.now();
  }

  check(): void {
    if (this.cancelled()) throw new RiverRuntimeSubmissionCancelledError();
  }

  async run<T>(action: () => T, retirement = false): Promise<T> {
    if (!retirement) this.check();
    let start = this.now();
    const elapsed = start - this.sliceStart;
    if (this.hasWork && elapsed > 0 && elapsed + this.reserve >= this.budget) {
      this.maxSliceMs = Math.max(this.maxSliceMs, elapsed);
      this.yieldCount++;
      await this.yieldToMainThread();
      if (!retirement) this.check();
      this.sliceStart = start = this.now();
    }
    try {
      return action();
    } finally {
      this.hasWork = true;
      const end = this.now();
      this.reserve = Math.max(this.reserve, end - start);
      // An indivisible engine allocation/upload can overrun: report its actual cost, never clamp it.
      this.maxSliceMs = Math.max(this.maxSliceMs, end - this.sliceStart);
    }
  }

  finish(): void {
    this.maxSliceMs = Math.max(this.maxSliceMs, this.now() - this.sliceStart);
  }

  /** Exact comparison in bounded batches; no main-thread hashing or JSON reconstruction. */
  async equal(first: unknown, second: unknown): Promise<boolean> {
    let visited = 0;
    function* compare(a: unknown, b: unknown): Generator<void, boolean> {
      if (++visited % 256 === 0) yield;
      if (Object.is(a, b)) return true;
      if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
      const numeric = (value: object): unknown =>
        "borrowTypedArray" in value && typeof value.borrowTypedArray === "function" ? value.borrowTypedArray() : value;
      const left = numeric(a),
        right = numeric(b);
      if (left !== a || right !== b) return yield* compare(left, right);
      if ((Array.isArray(a) && Array.isArray(b)) || (ArrayBuffer.isView(a) && ArrayBuffer.isView(b))) {
        const av = a as ArrayLike<unknown>,
          bv = b as ArrayLike<unknown>;
        if (av.length !== bv.length) return false;
        for (let index = 0; index < av.length; index++) if (!(yield* compare(av[index], bv[index]))) return false;
        return true;
      }
      const ak = Object.keys(a),
        bk = Object.keys(b);
      if (ak.length !== bk.length) return false;
      const ar = a as Record<string, unknown>,
        br = b as Record<string, unknown>;
      for (const key of ak) if (!Object.hasOwn(br, key) || !(yield* compare(ar[key], br[key]))) return false;
      return true;
    }
    const comparison = compare(first, second);
    while (true) {
      const result = await this.run(() => comparison.next());
      if (result.done) return result.value;
    }
  }
}
