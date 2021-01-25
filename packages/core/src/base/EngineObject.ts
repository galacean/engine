import { ignoreClone } from "../clone/CloneManager";
import { Engine } from "../Engine";

/**
 * EngineObject.
 */
export abstract class EngineObject {
  private static _instanceIdCounter: number = 0;

  /** Engine unique id. */
  @ignoreClone
  readonly instanceId: number = ++EngineObject._instanceIdCounter;

  /** Engine to which the object belongs. */
  @ignoreClone
  protected _engine: Engine;

  constructor(engine: Engine) {
    this._engine = engine;
  }
}
