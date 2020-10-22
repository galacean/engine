import { Engine } from "../Engine";
import { ignoreClone } from "../clone/CloneManager";

/**
 * 引擎对象。
 */
export abstract class EngineObject {
  private static _instanceIdCounter: number = 0;

  /** 引擎唯一 Id。*/
  @ignoreClone
  readonly instanceId: number = ++EngineObject._instanceIdCounter;

  /** 所属引擎。*/
  protected _engine: Engine;

  constructor(engine: Engine) {
    this._engine = engine;
  }
}
