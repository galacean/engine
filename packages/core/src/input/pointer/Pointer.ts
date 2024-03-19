import { Vector2 } from "@galacean/engine-math";
import { DisorderedArray } from "../../DisorderedArray";
import { Entity } from "../../Entity";
import { Script } from "../../Script";
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
      this._currentPressedEntity = null;
      if (this._currentEnteredEntity) {
        this._currentEnteredEntity._scripts.forEach(
          (element: Script) => {
            element.onPointerExit(this);
          },
          (element: Script, index: number) => {
            element._entityScriptsIndex = index;
          }
        );
      }
      if (rayCastEntity) {
        rayCastEntity._scripts.forEach(
          (element: Script) => {
            element.onPointerEnter(this);
          },
          (element: Script, index: number) => {
            element._entityScriptsIndex = index;
          }
        );
      }
      this._currentEnteredEntity = rayCastEntity;
    }
  }

  /**
   * @internal
   */
  _firePointerDown(rayCastEntity: Entity): void {
    if (rayCastEntity) {
      rayCastEntity._scripts.forEach(
        (element: Script) => {
          element.onPointerDown(this);
        },
        (element: Script, index: number) => {
          element._entityScriptsIndex = index;
        }
      );
    }
    this._currentPressedEntity = rayCastEntity;
  }

  /**
   * @internal
   */
  _firePointerDrag(): void {
    if (this._currentPressedEntity) {
      this._currentPressedEntity._scripts.forEach(
        (element: Script) => {
          element.onPointerDrag(this);
        },
        (element: Script, index: number) => {
          element._entityScriptsIndex = index;
        }
      );
    }
  }

  /**
   * @internal
   */
  _firePointerUpAndClick(rayCastEntity: Entity): void {
    if (rayCastEntity) {
      const sameTarget = this._currentPressedEntity === rayCastEntity;
      rayCastEntity._scripts.forEach(
        (element: Script) => {
          element.onPointerUp(this);
          sameTarget && element.onPointerClick(this);
        },
        (element: Script, index: number) => {
          element._entityScriptsIndex = index;
        }
      );
    }
    this._currentPressedEntity = null;
  }

  /**
   * @internal
   */
  constructor(id: number) {
    this.id = id;
  }
}
