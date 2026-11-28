/** Cleanup registration exposed while the page boot transaction is in progress. */
export interface SeedWorldBootTransactionScope {
  /**
   * Registers one acquired resource for reverse-order rollback.
   * @param release Exact-once cleanup for the acquired resource.
   * @returns Nothing.
   */
  defer(release: () => void | Promise<void>): void;
}

/**
 * Runs one page-boot transaction and rolls back every acquired resource when initialization fails.
 * @param initialize Boot initializer which registers ownership as resources are acquired.
 * @returns The fully initialized boot value after ownership is committed.
 * @throws The initialization error, or an AggregateError when rollback also fails.
 */
export async function runSeedWorldBootTransaction<T>(
  initialize: (scope: SeedWorldBootTransactionScope) => Promise<T>
): Promise<T> {
  const releases: Array<() => void | Promise<void>> = [];
  let settled = false;
  try {
    const value = await initialize({
      defer(release): void {
        if (settled) throw new Error("Seed World boot transaction is already settled");
        releases.push(release);
      }
    });
    settled = true;
    releases.length = 0;
    return value;
  } catch (error) {
    settled = true;
    const rollbackErrors: unknown[] = [];
    for (let index = releases.length - 1; index >= 0; index--) {
      try {
        await releases[index]();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Seed World boot and rollback both failed", {
        cause: error
      });
    }
    throw error;
  }
}

/** Single-flight owner for the page's one persistent Engine boot. */
export class SeedWorldBootCoordinator<T> {
  private _value: T | undefined;
  private _bootPromise: Promise<T> | undefined;

  /**
   * Returns the completed boot or joins the one initialization already in flight.
   * A rejected initialization is forgotten so a later request can retry.
   * @param initialize Complete transactional boot initializer.
   * @returns The shared initialized boot value.
   * @throws The initialization or rollback error from the shared boot attempt.
   */
  ensure(initialize: () => Promise<T>): Promise<T> {
    if (this._value !== undefined) return Promise.resolve(this._value);
    if (this._bootPromise) return this._bootPromise;
    const bootPromise = Promise.resolve().then(initialize);
    this._bootPromise = bootPromise;
    void bootPromise.then(
      (value) => {
        if (this._bootPromise !== bootPromise) return;
        this._value = value;
        this._bootPromise = undefined;
      },
      () => {
        if (this._bootPromise === bootPromise) this._bootPromise = undefined;
      }
    );
    return bootPromise;
  }
}

/** One immutable generation token used to reject stale async world candidates. */
export interface SeedWorldGenerationRequest {
  /** Monotonic page-local generation identity. */
  readonly id: number;
}

/** Coordinates atomic active-world replacement and exact-once retirement. */
export class SeedWorldGenerationCoordinator<T> {
  private _generation = 0;
  private _active: T | undefined;

  /**
   * @param destroy Releases one candidate or retired active world exactly once.
   */
  constructor(private readonly _destroy: (value: T) => void | Promise<void>) {}

  /**
   * Begins a new generation, invalidating every older request even when its Seed is unchanged.
   * @returns A token identifying the newest generation.
   */
  begin(): SeedWorldGenerationRequest {
    return Object.freeze({ id: ++this._generation });
  }

  /**
   * Tests whether an async generation still owns publication rights.
   * @param request Generation token returned by `begin`.
   * @returns Whether the request is still current.
   */
  isCurrent(request: SeedWorldGenerationRequest): boolean {
    return request.id === this._generation;
  }

  /**
   * Publishes the newest candidate and retires the previous world, or destroys a stale candidate.
   * @param request Generation token returned by `begin`.
   * @param next Fully constructed candidate world.
   * @param publish Synchronous page-state publication performed before the previous world is retired.
   * @returns Whether `next` became active.
   * @throws When page-state publication or runtime destruction fails.
   */
  async publish(request: SeedWorldGenerationRequest, next: T, publish: (next: T) => void): Promise<boolean> {
    if (!this.isCurrent(request)) {
      await this._destroy(next);
      return false;
    }
    const previous = this._active;
    this._active = next;
    try {
      publish(next);
    } catch (error) {
      this._active = previous;
      try {
        await this._destroy(next);
      } catch (destroyError) {
        throw new AggregateError([error, destroyError], "Seed World publication and candidate rollback both failed", {
          cause: error
        });
      }
      throw error;
    }
    if (previous) await this._destroy(previous);
    return true;
  }
}
