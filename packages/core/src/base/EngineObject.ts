/**
 *
 */
export abstract class EngineObject {
  private static _instanceIdCounter = 0;
  readonly instanceId: number = ++EngineObject._instanceIdCounter;
}
