import { Vector2 } from "@oasis-engine/math";
import { Entity } from "../../Entity";
import { PointerButton } from "../enums/PointerButton";
import { PointerPhase } from "../enums/PointerPhase";

/**
 * Pointer.
 */
export class Pointer {
  /**
   * Unique id.
   * @remark Start from 0.
   */
  readonly id: number;
  /** @internal */
  _events: PointerEvent[] = [];

  /** The phase of pointer. */
  phase: PointerPhase = PointerPhase.Leave;
  /** The button of pointer. */
  button: PointerButton;
  /** The buttons of pointer. */
  buttons: number;
  /** The position of the pointer in screen space pixel coordinates. */
  position: Vector2 = new Vector2();
  /** The change of the pointer. */
  movingDelta: Vector2 = new Vector2();
  // @todo: 这里用 frameCount 还是 event 自带的 timestamp ?
  // 必要性：开发者可能需要判断 pointer 产生的先后顺序来决定用最早的 or 最近的 pointer
  // timestamp 的好处是毫秒级，绝对可以判断出 pointer 的时序，但是可能有兼容性问题
  // frameCount 的含义是代表它在哪一帧生成，好处是引擎原生无需引入时间戳概念，且无兼容问题
  // 但是同一帧生成的 pointer 无法区分先后顺序
  /** The frameCount the pointer was generated */
  frameCount: number = -1;

  private _currentPressedEntity: Entity;
  private _currentEnteredEntity: Entity;

  /** @internal */
  _firePointerExitAndEnter(rayCastEntity: Entity): void {
    if (this._currentEnteredEntity !== rayCastEntity) {
      if (this._currentEnteredEntity) {
        const scripts = this._currentEnteredEntity._scripts;
        for (let i = scripts.length - 1; i >= 0; i--) {
          const script = scripts.get(i);
          script._waitHandlingInValid || script.onPointerExit(this);
        }
      }
      if (rayCastEntity) {
        const scripts = rayCastEntity._scripts;
        for (let i = scripts.length - 1; i >= 0; i--) {
          const script = scripts.get(i);
          script._waitHandlingInValid || script.onPointerEnter(this);
        }
      }
      this._currentEnteredEntity = rayCastEntity;
    }
  }

  /** @internal */
  _firePointerDown(rayCastEntity: Entity): void {
    if (rayCastEntity) {
      const scripts = rayCastEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        const script = scripts.get(i);
        script._waitHandlingInValid || script.onPointerDown(this);
      }
    }
    this._currentPressedEntity = rayCastEntity;
  }

  /** @internal */
  _firePointerDrag(): void {
    if (this._currentPressedEntity) {
      const scripts = this._currentPressedEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        const script = scripts.get(i);
        script._waitHandlingInValid || script.onPointerDrag(this);
      }
    }
  }

  /** @internal */
  _firePointerUpAndClick(rayCastEntity: Entity): void {
    const { _currentPressedEntity: pressedEntity } = this;
    if (pressedEntity) {
      const sameTarget = pressedEntity === rayCastEntity;
      const scripts = pressedEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        const script = scripts.get(i);
        if (!script._waitHandlingInValid) {
          sameTarget && script.onPointerClick(this);
          script.onPointerUp(this);
        }
      }
      this._currentPressedEntity = null;
    }
  }

  /**
   * @internal
   */
  constructor(id: number) {
    this.id = id;
  }
}
