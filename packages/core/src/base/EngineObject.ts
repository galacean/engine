import { ignoreClone } from "../clone/CloneManager";

/**
 * 引擎对象。
 */
export abstract class EngineObject {
  private static _instanceIdCounter: number = 0;

  @ignoreClone
  readonly instanceId: number = ++EngineObject._instanceIdCounter;
}
