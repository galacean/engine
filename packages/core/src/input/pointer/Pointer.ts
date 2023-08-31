import { Vector2 } from "@galacean/engine-math";
import { DisorderedArray } from "../../DisorderedArray";
import { Entity } from "../../Entity";
import { PointerButton } from "../enums/PointerButton";
import { PointerPhase } from "../enums/PointerPhase";

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

  private _currentPressedEntity: Entity;
  private _currentEnteredEntity: Entity;

  /**
   * @internal
   */
  _firePointerExitAndEnter(rayCastEntity: Entity): void {
    if (this._currentEnteredEntity !== rayCastEntity) {
      if (this._currentEnteredEntity) {
        const scripts = this._currentEnteredEntity._scripts;
        scripts.startLoop();
        for (let i = 0; i < scripts.length; i++) {
          scripts.get(i)?.onPointerExit(this);
        }
        scripts.endLoop();
      }
      if (rayCastEntity) {
        const scripts = rayCastEntity._scripts;
        scripts.startLoop();
        for (let i = 0; i < scripts.length; i++) {
          scripts.get(i)?.onPointerEnter(this);
        }
        scripts.endLoop();
      }
      this._currentEnteredEntity = rayCastEntity;
    }
  }

  /**
   * @internal
   */
  _firePointerDown(rayCastEntity: Entity): void {
    if (rayCastEntity) {
      const scripts = rayCastEntity._scripts;
      scripts.startLoop();
      for (let i = 0; i < scripts.length; i++) {
        scripts.get(i)?.onPointerDown(this);
      }
      scripts.endLoop();
    }
    this._currentPressedEntity = rayCastEntity;
  }

  /**
   * @internal
   */
  _firePointerDrag(): void {
    if (this._currentPressedEntity) {
      const scripts = this._currentPressedEntity._scripts;
      scripts.startLoop();
      for (let i = 0; i < scripts.length; i++) {
        scripts.get(i)?.onPointerDrag(this);
      }
      scripts.endLoop();
    }
  }

  /**
   * @internal
   */
  _firePointerUpAndClick(rayCastEntity: Entity): void {
    const { _currentPressedEntity: pressedEntity } = this;
    if (pressedEntity) {
      const sameTarget = pressedEntity === rayCastEntity;
      const scripts = pressedEntity._scripts;
      scripts.startLoop();
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts.get(i);
        if (script) {
          sameTarget && script.onPointerClick(this);
          script.onPointerUp(this);
        }
      }
      scripts.endLoop();
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
