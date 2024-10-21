import { Vector2 } from "@galacean/engine-math";
import { DisorderedArray } from "../../DisorderedArray";
import { ClearableObjectPool } from "../../utils/ClearableObjectPool";
import { PointerButton } from "../enums/PointerButton";
import { PointerPhase } from "../enums/PointerPhase";
import { PointerEventData } from "./PointerEventData";
import { PointerEventEmitter } from "./emitter/PointerEventEmitter";

/**
 * Pointer.
 */
export class Pointer {
  /**
   * Unique id.
   * @remarks Start from 0.
   */
  readonly id: number;
  /** The phase of pointer. */
  phase: PointerPhase = PointerPhase.Leave;
  /** The button that triggers the pointer event. */
  button: PointerButton;
  /** The currently pressed buttons for this pointer. */
  pressedButtons: PointerButton;
  /** The position of the pointer in screen space pixel coordinates. */
  position: Vector2 = new Vector2();
  /** The change of the pointer. */
  deltaPosition: Vector2 = new Vector2();
  /** @internal */
  _events: PointerEvent[] = [];
  /** @internal */
  _uniqueID: number;
  /** @internal */
  _upMap: number[] = [];
  /** @internal */
  _downMap: number[] = [];
  /** @internal */
  _upList: DisorderedArray<PointerButton> = new DisorderedArray();
  /** @internal */
  _downList: DisorderedArray<PointerButton> = new DisorderedArray();
  /** @internal */
  _frameEvents: PointerEventType = PointerEventType.None;
  /** @internal */
  _emitters: PointerEventEmitter[] = [];

  /**
   * @internal
   */
  constructor(id: number) {
    this.id = id;
  }

  /**
   * @internal
   */
  _addEmitters<T extends new (pool: ClearableObjectPool<PointerEventData>) => PointerEventEmitter>(
    type: T,
    pool: ClearableObjectPool<PointerEventData>
  ) {
    this._emitters.push(new type(pool));
  }

  /**
   * @internal
   */
  _resetOnFrameBegin(): void {
    this._frameEvents = PointerEventType.None;
    this._events.length = this._upList.length = this._downList.length = 0;
  }

  /**
   * @internal
   */
  _dispose(): void {
    const emitters = this._emitters;
    for (let i = 0, n = emitters.length; i < n; i++) {
      emitters[i]._dispose();
    }
    this._events.length = this._upList.length = this._downList.length = 0;
  }
}

export enum EmitterType {
  Physics = 1,
  UI = 2
}

export enum PointerEventType {
  None = 0x0,
  Down = 0x1,
  Up = 0x2,
  Leave = 0x4,
  Move = 0x8,
  Cancel = 0x10
}
