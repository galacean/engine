import { ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";

/**
 * EngineObject.
 * @typeParam TEngine - Owner type; use `null` for objects that do not belong to an engine.
 */
export class EngineObject<TEngine extends Engine | null = Engine> {
  private static _instanceIdCounter = 0;

  @ignoreClone
  readonly instanceId = ++EngineObject._instanceIdCounter;
  /** @internal */
  @ignoreClone
  _engine: TEngine;
  /** @internal */
  _pendingDestroy = false;

  protected _destroyed = false;

  /**
   * Get the engine which the object belongs.
   */
  get engine(): TEngine {
    return this._engine;
  }

  /**
   * Whether this object is pending destruction.
   * @remarks `destroy()` has been called but the actual destruction is deferred until end of frame,
   * during this period all properties are still accessible.
   */
  get pendingDestroy(): boolean {
    return this._pendingDestroy;
  }

  /**
   * Whether it has been destroyed.
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  constructor(engine: TEngine) {
    this._engine = engine;
  }

  /**
   * Destroy self.
   */
  destroy(): void {
    if (this._destroyed) return;

    const engine = this._engine;
    if (engine?._frameInProcess && !engine._processingPendingDestroys) {
      if (!this._pendingDestroy) {
        this._pendingDestroy = true;
        engine._pendingDestroyObjects.push(this);
      }
    } else {
      this._pendingDestroy = false;
      this._destroyed = true;
      this._onDestroy();
    }
  }

  protected _onDestroy(): void {
    const engine = this._engine;
    if (engine) {
      const { resourceManager } = engine;
      resourceManager._deleteAsset(this);
      resourceManager._deleteContentRestorer(this);
    }
  }
}
