import { Vector2 } from "@galacean/engine-math";
import { DisorderedArray } from "../../DisorderedArray";
import { Entity } from "../../Entity";
import { Script } from "../../Script";
import { HitResult } from "../../physics";
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
  hitResult: HitResult = new HitResult();
  /** @internal */
  _events: PointerEvent[] = [];
  /** @internal */
  _eventsMap: number = PointerEventType.None;
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

  private _pressedEntity: Entity;
  private _enteredEntity: Entity;
  private _draggedEntity: Entity;

  /**
   * If this pointer is hold down, return the entity hit when pointer down.
   */
  get pressedEntity(): Entity | null {
    return this._pressedEntity;
  }

  /**
   * Returns the entity where the pointer is currently entered.
   */
  get enteredEntity(): Entity | null {
    return this._enteredEntity;
  }

  /**
   * Returns the entity currently dragged by the pointer.
   */
  get draggedEntity(): Entity | null {
    return this._draggedEntity;
  }

  /**
   * @internal
   */
  constructor(id: number) {
    this.id = id;
  }

  /**
   * @internal
   */
  _firePointerExitAndEnter(rayCastEntity: Entity): void {
    if (this._enteredEntity !== rayCastEntity) {
      if (this._enteredEntity) {
        this._enteredEntity._scripts.forEach(
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
      this._enteredEntity = rayCastEntity;
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
    this._pressedEntity = this._draggedEntity = rayCastEntity;
  }

  /**
   * @internal
   */
  _firePointerUpAndClick(rayCastEntity: Entity): void {
    if (rayCastEntity) {
      const sameTarget = this._pressedEntity === rayCastEntity;
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
    this._pressedEntity = null;
  }

  /**
   * @internal
   */
  _firePointerStartDrag(rayCastEntity: Entity): void {
    this._draggedEntity = rayCastEntity;
    if (rayCastEntity) {
      rayCastEntity._scripts.forEach(
        (element: Script) => {
          element.onPointerStartDrag(this);
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
  _firePointerDrag(): void {
    if (this._draggedEntity) {
      this._draggedEntity._scripts.forEach(
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
  _firePointerEndDrag(receivingEntity: Entity): void {
    const { _draggedEntity: draggedEntity } = this;
    if (draggedEntity) {
      draggedEntity._scripts.forEach(
        (element: Script) => {
          element.onPointerEndDrag(this);
          !!receivingEntity && element.onPointerDrop(this);
        },
        (element: Script, index: number) => {
          element._entityScriptsIndex = index;
        }
      );
      this._draggedEntity = null;
    }
  }

  /**
   * @internal
   */
  _dispose(): void {
    const { hitResult } = this;
    this._enteredEntity = this._pressedEntity = this._draggedEntity = hitResult.entity = hitResult.shape = null;
  }
}

export enum PointerEventType {
  None = 0x0,
  Down = 0x1,
  Up = 0x2,
  Leave = 0x4,
  Move = 0x8,
  Cancel = 0x10
}
