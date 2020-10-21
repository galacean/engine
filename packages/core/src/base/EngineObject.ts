import { Engine } from "../Engine";
import { ignoreClone } from "../clone/CloneManager";

/**
 * 引擎对象。
 */
export abstract class EngineObject {
  private static _instanceIdCounter: number = 0;

  /** 引擎 */
  protected _engine: Engine;
  /** 名称 */
  name: string | null = null;
  /** 引擎唯一 id */
  @ignoreClone
  readonly instanceId: number = ++EngineObject._instanceIdCounter;

  constructor(engine: Engine) {
    this._engine = engine;
  }
}
