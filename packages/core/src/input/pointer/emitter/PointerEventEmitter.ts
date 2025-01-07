import { Ray } from "@galacean/engine-math";
import { Entity } from "../../../Entity";
import { Scene } from "../../../Scene";
import { Script } from "../../../Script";
import { ClearableObjectPool } from "../../../utils/ClearableObjectPool";
import { Pointer } from "../Pointer";
import { PointerEventData } from "../PointerEventData";
import { IHitResult } from "./IHitResult";

export abstract class PointerEventEmitter {
  protected static _tempRay: Ray = new Ray();

  protected _hitResult: IHitResult;
  protected _pool: ClearableObjectPool<PointerEventData>;

  constructor(pool: ClearableObjectPool<PointerEventData>) {
    this._pool = pool;
    this._init();
  }

  abstract processRaycast(scenes: readonly Scene[], pointer: Pointer): void;

  abstract processDrag(pointer: Pointer): void;

  abstract processDown(pointer: Pointer): void;

  abstract processUp(pointer: Pointer): void;

  abstract processLeave(pointer: Pointer): void;

  abstract dispose(): void;

  protected abstract _init(): void;

  protected _createEventData(pointer: Pointer): PointerEventData {
    const data = this._pool.get();
    data.pointer = pointer;
    data.worldPosition.copyFrom(this._hitResult.point);
    return data;
  }

  protected _fireDown(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerDown?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  protected _fireUp(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerUp?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  protected _fireClick(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerClick?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  protected _fireEnter(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerEnter?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  protected _fireExit(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerExit?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  protected _fireBeginDrag(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerBeginDrag?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  protected _fireDrag(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerDrag?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  protected _fireEndDrag(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerEndDrag?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  protected _fireDrop(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerDrop?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }
}
