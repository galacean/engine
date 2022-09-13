import { Ray, Vector2 } from "@oasis-engine/math";
import { Canvas } from "../../Canvas";
import { DisorderedArray } from "../../DisorderedArray";
import { Engine } from "../../Engine";
import { Entity } from "../../Entity";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { HitResult } from "../../physics";
import { PointerPhase } from "../enums/PointerPhase";
import { PointerButton } from "../enums/PointerButton";
import { IInput } from "../interface/IInput";
import { Pointer } from "./Pointer";

/**
 * Pointer Manager.
 * @internal
 */
export class PointerManager implements IInput {
  /** Refer to the W3C standards.(https://www.w3.org/TR/uievents/#dom-mouseevent-buttons) */
  public static Buttons = [0x1, 0x4, 0x2, 0x8, 0x10, 0x20, 0x40, 0x80, 0x100, 0x200, 0x400];

  private static _tempRay: Ray = new Ray();
  private static _tempPoint: Vector2 = new Vector2();
  private static _tempHitResult: HitResult = new HitResult();
  /** @internal */
  _pointers: Pointer[] = [];
  /** @internal */
  _multiPointerEnabled: boolean = true;
  /** @internal */
  _buttons: number = 0x0;
  /** @internal */
  _upMap: number[] = [];
  /** @internal */
  _downMap: number[] = [];
  /** @internal */
  _upList: DisorderedArray<PointerButton> = new DisorderedArray();
  /** @internal */
  _downList: DisorderedArray<PointerButton> = new DisorderedArray();

  private _engine: Engine;
  private _canvas: Canvas;
  private _htmlCanvas: HTMLCanvasElement;
  private _nativeEvents = [];
  private _pointerPool: Pointer[];
  private _hadListener: boolean = false;
  private _pointerIDMap = [];

  /**
   * Create a PointerManager.
   * @param engine - The current engine instance
   * @param htmlCanvas - HTMLCanvasElement
   */
  constructor(engine: Engine, htmlCanvas: HTMLCanvasElement) {
    this._engine = engine;
    this._canvas = engine.canvas;
    this._htmlCanvas = htmlCanvas;
    htmlCanvas.oncontextmenu = (event: UIEvent) => {
      return false;
    };
    this._onPointerEvent = this._onPointerEvent.bind(this);
    this._updatePointerWithPhysics = this._updatePointerWithPhysics.bind(this);
    this._updatePointerWithoutPhysics = this._updatePointerWithoutPhysics.bind(this);
    this._onFocus();
    // If there are no compatibility issues, navigator.maxTouchPoints should be used here.
    this._pointerPool = new Array<Pointer>(11);
  }

  /**
   * @internal
   */
  _update(frameCount: number): void {
    const { _pointers: pointers, _nativeEvents: nativeEvents } = this;
    /** Clean up the pointer released in the previous frame. */
    let length = pointers.length;
    if (length > 0) {
      for (let i = length - 1; i >= 0; i--) {
        if (i !== length - 1) {
          pointers[i] = pointers[length - 1];
          --length;
        }
      }
      pointers.length = length;
    }

    /** Generate the pointer received for this frame. */
    length = nativeEvents.length;
    if (length > 0) {
      this._buttons = nativeEvents[length - 1].buttons;
      for (let i = 0; i < length; i++) {
        const evt = nativeEvents[i];
        this._getPointer(evt.pointerId, frameCount)?._events.push(evt);
      }
      nativeEvents.length = 0;
    }

    /** Pointer handles its own events. */
    length = pointers.length;
    if (length > 0) {
      const updatePointer = this._engine.physicsManager._initialized
        ? this._updatePointerWithPhysics
        : this._updatePointerWithoutPhysics;
      const { clientWidth, clientHeight } = this._htmlCanvas;
      const { width, height } = this._canvas;
      for (let i = length - 1; i >= 0; i--) {
        updatePointer(frameCount, pointers[i], clientWidth, clientHeight, width, height);
      }
    }
  }

  /**
   * @internal
   */
  _onFocus(): void {
    if (!this._hadListener) {
      const { _htmlCanvas: htmlCanvas, _onPointerEvent: onPointerEvent } = this;
      htmlCanvas.addEventListener("pointerdown", onPointerEvent);
      htmlCanvas.addEventListener("pointerup", onPointerEvent);
      htmlCanvas.addEventListener("pointerout", onPointerEvent);
      htmlCanvas.addEventListener("pointermove", onPointerEvent);
      this._hadListener = true;
    }
  }

  /**
   * @internal
   */
  _onBlur(): void {
    if (this._hadListener) {
      const { _htmlCanvas: htmlCanvas, _onPointerEvent: onPointerEvent } = this;
      htmlCanvas.removeEventListener("pointerdown", onPointerEvent);
      htmlCanvas.removeEventListener("pointerup", onPointerEvent);
      htmlCanvas.removeEventListener("pointerout", onPointerEvent);
      htmlCanvas.removeEventListener("pointermove", onPointerEvent);
      this._hadListener = false;
      this._downList.length = 0;
      this._upList.length = 0;
      const { _pointers: pointers } = this;
      for (let i = pointers.length - 1; i >= 0; i--) {
        pointers[i].phase = PointerPhase.Leave;
      }
      pointers.length = 0;
    }
  }

  /**
   * @internal
   */
  _destroy(): void {
    // @ts-ignore
    if (this._hadListener) {
      const { _htmlCanvas: htmlCanvas, _onPointerEvent: onPointerEvent } = this;
      htmlCanvas.removeEventListener("pointerdown", onPointerEvent);
      htmlCanvas.removeEventListener("pointerup", onPointerEvent);
      htmlCanvas.removeEventListener("pointerout", onPointerEvent);
      htmlCanvas.removeEventListener("pointermove", onPointerEvent);
      this._hadListener = false;
    }
    this._pointerPool.length = 0;
    this._pointers.length = 0;
    this._downList.length = 0;
    this._upList.length = 0;
    this._htmlCanvas = null;
    this._engine = null;
  }

  private _onPointerEvent(evt: PointerEvent) {
    evt.cancelable && evt.preventDefault();
    this._nativeEvents.push(evt);
  }

  private _getPointer(pointerId: number, frameCount: number): Pointer {
    const { _pointers: pointers } = this;
    const index = this._pointerIDMap.indexOf(pointerId);
    if (index >= 0) {
      return pointers[index];
    } else {
      const lastCount = pointers.length;
      if (lastCount === 0 || this._multiPointerEnabled) {
        const { _pointerPool: pointerPool } = this;
        // Get Pointer smallest index.
        let i = 0;
        for (; i < lastCount; i++) {
          if (pointers[i].id > i) {
            break;
          }
        }
        let pointer = pointerPool[i];
        if (!pointer) {
          pointer = pointerPool[i] = new Pointer(pointerId);
        }
        this._pointerIDMap[i] = pointerId;
        pointers.splice(i, 0, pointer);
        pointer.frameCount = frameCount;
        return pointer;
      } else {
        return null;
      }
    }
  }

  private _pointerRayCast(normalizedX: number, normalizedY: number): Entity {
    const { _tempPoint: point, _tempRay: ray, _tempHitResult: hitResult } = PointerManager;
    const { _activeCameras: cameras } = this._engine.sceneManager.activeScene;
    for (let i = cameras.length - 1; i >= 0; i--) {
      const camera = cameras[i];
      if (!camera.enabled || camera.renderTarget) {
        continue;
      }
      const { x: vpX, y: vpY, z: vpW, w: vpH } = camera.viewport;
      if (normalizedX >= vpX && normalizedY >= vpY && normalizedX - vpX <= vpW && normalizedY - vpY <= vpH) {
        point.set((normalizedX - vpX) / vpW, (normalizedY - vpY) / vpH);
        if (
          this._engine.physicsManager.raycast(
            camera.viewportPointToRay(point, ray),
            Number.MAX_VALUE,
            camera.cullingMask,
            hitResult
          )
        ) {
          return hitResult.entity;
        } else if (camera.clearFlags & CameraClearFlags.Color) {
          return null;
        }
      }
    }
  }

  private _updatePointerWithPhysics(
    frameCount: number,
    pointer: Pointer,
    clientW: number,
    clientH: number,
    canvasW: number,
    canvasH: number
  ): void {
    const { _events: events } = pointer;
    const length = events.length;
    const { position } = pointer;
    if (length > 0) {
      const { _upList, _upMap, _downList, _downMap } = this;
      const latestEvent = events[length - 1];
      const normalizedX = latestEvent.offsetX / clientW;
      const normalizedY = latestEvent.offsetY / clientH;
      const currX = normalizedX * canvasW;
      const currY = normalizedY * canvasH;
      if (pointer.phase === PointerPhase.Leave) {
        pointer.movingDelta.set(0, 0);
      } else {
        pointer.movingDelta.set(currX - position.x, currY - position.y);
      }
      position.set(currX, currY);
      const rayCastEntity = this._pointerRayCast(normalizedX, normalizedY);
      pointer._firePointerExitAndEnter(rayCastEntity);
      // Merge move events.
      let hadMoved = false;
      for (let i = 0; i < length; i++) {
        const event = events[i];
        const pointerButton: PointerButton = (pointer.button = event.button | PointerButton.Primary);
        pointer.buttons = event.buttons;
        switch (event.type) {
          case "pointerdown":
            _downList.add(pointerButton);
            _downMap[pointerButton] = frameCount;
            pointer.phase = PointerPhase.Down;
            pointer._firePointerDown(rayCastEntity);
            break;
          case "pointerup":
            _upList.add(pointerButton);
            _upMap[pointerButton] = frameCount;
            pointer.phase = PointerPhase.Up;
            pointer._firePointerUpAndClick(rayCastEntity);
            break;
          case "pointermove":
            pointer.phase = PointerPhase.Move;
            if (hadMoved) {
              hadMoved = true;
              pointer._firePointerDrag();
            }
            break;
          case "pointerout":
            pointer.phase = PointerPhase.Leave;
            pointer._firePointerExitAndEnter(null);
          default:
            break;
        }
      }
      pointer._events.length = 0;
    } else {
      pointer.movingDelta.set(0, 0);
      pointer.phase = PointerPhase.Stationary;
      const rayCastEntity = this._pointerRayCast(position.x / canvasW, position.y / canvasH);
      pointer._firePointerExitAndEnter(rayCastEntity);
    }
  }

  private _updatePointerWithoutPhysics(
    frameCount: number,
    pointer: Pointer,
    clientW: number,
    clientH: number,
    canvasW: number,
    canvasH: number
  ): void {
    const { _events: events } = pointer;
    const length = events.length;
    if (length > 0) {
      const { position } = pointer;
      const latestEvent = events[length - 1];
      const currX = (latestEvent.offsetX / clientW) * canvasW;
      const currY = (latestEvent.offsetY / clientH) * canvasH;
      if (pointer.phase === PointerPhase.Leave) {
        pointer.movingDelta.set(0, 0);
      } else {
        pointer.movingDelta.set(currX - position.x, currY - position.y);
      }
      position.set(currX, currY);
      pointer.button = latestEvent.button;
      pointer.buttons = latestEvent.buttons;
      const { _upList, _upMap, _downList, _downMap } = this;
      for (let i = 0; i < length; i++) {
        const event = events[i];
        switch (event.type) {
          case "pointerdown":
            _downList.add(event.button);
            _downMap[event.button] = frameCount;
            pointer.phase = PointerPhase.Down;
            break;
          case "pointerup":
            _upList.add(event.button);
            _upMap[event.button] = frameCount;
            pointer.phase = PointerPhase.Up;
            break;
          case "pointermove":
            pointer.phase = PointerPhase.Move;
            break;
          case "pointerout":
            pointer.phase = PointerPhase.Leave;
          default:
            break;
        }
      }
      pointer._events.length = 0;
    } else {
      pointer.movingDelta.set(0, 0);
      pointer.phase = PointerPhase.Stationary;
    }
  }
}
