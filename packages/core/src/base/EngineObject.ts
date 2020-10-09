/**
 * 引擎对象。
 */
export abstract class EngineObject {
  private static _instanceIdCounter: number = 0;

  readonly instanceId: number = ++EngineObject._instanceIdCounter;
}
