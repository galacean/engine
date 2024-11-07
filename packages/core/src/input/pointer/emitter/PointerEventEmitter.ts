import { Ray } from "@galacean/engine-math";
import { Entity } from "../../../Entity";
import { Scene } from "../../../Scene";
import { HitResult } from "../../../physics";
import { ClearableObjectPool } from "../../../utils/ClearableObjectPool";
import { Pointer } from "../Pointer";
import { PointerEventData } from "../PointerEventData";

export abstract class PointerEventEmitter {
  protected static _tempRay: Ray = new Ray();

  protected _pool: ClearableObjectPool<PointerEventData>;
  protected _hitResult: HitResult = new HitResult();

  constructor(pool: ClearableObjectPool<PointerEventData>) {
    this._pool = pool;
  }

  abstract processRaycast(scenes: readonly Scene[], pointer: Pointer): void;

  abstract processDrag(pointer: Pointer): void;

  abstract processDown(pointer: Pointer): void;

  abstract processUp(pointer: Pointer): void;

  abstract processLeave(pointer: Pointer): void;

  abstract dispose(): void;

  protected _createEventData(pointer: Pointer, target: Entity = null, currentTarget: Entity = null): PointerEventData {
    const data = this._pool.get();
    data.pointer = pointer;
    data.position.copyFrom(this._hitResult.point);
    data.target = target;
    data.currentTarget = currentTarget;
    return data;
  }
}
