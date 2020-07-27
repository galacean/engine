/**
 *
 */
export abstract class OasisObject {
  private static _instanceIdCounter = 0;
  readonly instanceId: number = ++OasisObject._instanceIdCounter;
}
