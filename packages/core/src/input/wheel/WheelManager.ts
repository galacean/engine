import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { IInput } from "../interface/IInput";

/**
 * Wheel Manager.
 * @internal
 */
export class WheelManager implements IInput {
  /** @internal */
  _delta: Vector3 = new Vector3();

  // @internal
  _target: EventTarget;
  private _nativeEvents: WheelEvent[] = [];

  /**
   * @internal
   */
  constructor(engine: Engine, target: EventTarget) {
    this._onWheelEvent = this._onWheelEvent.bind(this);
    this._target = target;
    this._addEventListener();
  }

  /**
   * @internal
   */
  _update(): void {
    const { _delta: delta } = this;
    delta.set(0, 0, 0);
    const { _nativeEvents: nativeEvents } = this;
    if (nativeEvents.length > 0) {
      for (let i = nativeEvents.length - 1; i >= 0; i--) {
        const evt = nativeEvents[i];
        delta.x += evt.deltaX;
        delta.y += evt.deltaY;
        delta.z += evt.deltaZ;
      }
      nativeEvents.length = 0;
    }
  }

  /**
   * @internal
   */
  _addEventListener(): void {
    this._target.addEventListener("wheel", this._onWheelEvent);
  }

  /**
   * @internal
   */
  _removeEventListener(): void {
    this._target.removeEventListener("wheel", this._onWheelEvent);
    this._nativeEvents.length = 0;
    this._delta.set(0, 0, 0);
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._removeEventListener();
    this._nativeEvents = null;
    this._delta = null;
  }

  private _onWheelEvent(evt: WheelEvent): void {
    this._nativeEvents.push(evt);
  }
}
