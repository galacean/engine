import { Ray, Vector2 } from "@galacean/engine-math";
import { Entity } from "../../../Entity";
import { Scene } from "../../../Scene";
import { HitResult } from "../../../physics";
import { Pointer } from "../Pointer";
import { PointerEventData } from "../PointerEventData";

export abstract class PointerEventEmitter {
  protected static _tempRay: Ray = new Ray();
  protected static _tempPoint: Vector2 = new Vector2();
  protected static _tempHitResult: HitResult = new HitResult();

  /**
   * @internal
   */
  abstract _processRaycast(scenes: readonly Scene[], pointer: Pointer): void;

  /**
   * @internal
   */
  abstract _processDrag(pointer: Pointer): void;

  /**
   * @internal
   */
  abstract _processDown(pointer: Pointer): void;

  /**
   * @internal
   */
  abstract _processUp(pointer: Pointer): void;

  /**
   * @internal
   */
  abstract _processLeave(pointer: Pointer): void;

  /**
   * @internal
   */
  _createEventData(pointer: Pointer, target: Entity, currentTarget: Entity = null): PointerEventData {
    const data = new PointerEventData();
    data.pointer = pointer;
    // data.position.copyFrom(pointer.position);
    data.target = target;
    data.currentTarget = currentTarget;
    return data;
  }

  /**
   * @internal
   */
  abstract _dispose(): void;
}
