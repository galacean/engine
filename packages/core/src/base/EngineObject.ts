import { ignoreClone } from "../clone/CloneManager";
import { Engine } from "../Engine";
// TODO: 三维对象的抽象基类，三维对象实例化有一个唯一的示例ID，每一个示例对象都包括一个Engine的上下文
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

  /**
   * Get the engine which the object belongs.
   */
  get engine(): Engine {
    return this._engine;
  }

  constructor(engine: Engine) {
    this._engine = engine;
  }
}
