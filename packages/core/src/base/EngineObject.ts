import { ignoreClone } from "../clone/CloneManager";
import { Engine } from "../Engine";

/**
 * EngineObject.
 */
export abstract class EngineObject {
  private static _instanceIdCounter = 0;

  /** Engine unique id. */
  @ignoreClone
  readonly instanceId = ++EngineObject._instanceIdCounter;

  @ignoreClone
  protected _engine: Engine;
  protected _destroyed = false;

  /** @internal */
  _pendingDestroy = false;

  /**
   * Get the engine which the object belongs.
   */
  get engine(): Engine {
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

  constructor(engine: Engine) {
    this._engine = engine;
  }

  /**
   * Destroy self.
   */
  destroy(): void {
    if (this._destroyed) return;
    if (this._engine._frameInProcess) {
      this._pendingDestroy = true;
      this._engine._pendingDestroyObjects.push(this);
      return;
    }
    this._onDestroy();
    this._destroyed = true;
  }

  protected _onDestroy(): void {
    const { resourceManager } = this._engine;
    resourceManager._deleteAsset(this);
    resourceManager._deleteContentRestorer(this);
  }
}
