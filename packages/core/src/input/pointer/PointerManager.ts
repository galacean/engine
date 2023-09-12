import { Ray, Vector2 } from "@galacean/engine-math";
import { Canvas } from "../../Canvas";
import { DisorderedArray } from "../../DisorderedArray";
import { Engine } from "../../Engine";
import { Entity } from "../../Entity";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { HitResult } from "../../physics";
import { PointerPhase } from "../enums/PointerPhase";
import { PointerButton, _pointerBin2DecMap, _pointerDec2BinMap } from "../enums/PointerButton";
import { IInput } from "../interface/IInput";
import { Pointer } from "./Pointer";

/**
 * Pointer Manager.
 * @internal
 */
export class PointerManager implements IInput {
  private static _tempRay: Ray = new Ray();
  private static _tempPoint: Vector2 = new Vector2();
  private static _tempHitResult: HitResult = new HitResult();
  /** @internal */
  _pointers: Pointer[] = [];
  /** @internal */
  _multiPointerEnabled: boolean = true;
  /** @internal */
  _buttons: PointerButton = PointerButton.None;
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
  private _nativeEvents: PointerEvent[] = [];
  private _pointerPool: Pointer[];
  private _hadListener: boolean = false;

  /**
   * Create a PointerManager.
   * @param engine - The current engine instance
   * @param htmlCanvas - HTMLCanvasElement
   */
  constructor(engine: Engine) {
    // @ts-ignore
    const htmlCanvas = engine._canvas._webCanvas;
    this._engine = engine;
    this._canvas = engine.canvas;
    this._htmlCanvas = htmlCanvas;
    this._onPointerEvent = this._onPointerEvent.bind(this);
    this._updatePointerWithPhysics = this._updatePointerWithPhysics.bind(this);
    this._updatePointerWithoutPhysics = this._updatePointerWithoutPhysics.bind(this);
    this._onFocus();
    // If there are no compatibility issues, navigator.maxTouchPoints should be used here
    this._pointerPool = new Array<Pointer>(11);
  }

  /**
   * @internal
   */
  _update(): void {
    const { _pointers: pointers, _nativeEvents: nativeEvents, _htmlCanvas: htmlCanvas } = this;
    const { clientWidth, clientHeight } = htmlCanvas;
    const { width, height } = this._canvas;
    const rect = htmlCanvas.getBoundingClientRect();
    // Clean up the pointer released in the previous frame
    let lastIndex = pointers.length - 1;
    if (lastIndex >= 0) {
      for (let i = lastIndex; i >= 0; i--) {
        if (pointers[i].phase === PointerPhase.Leave) {
          pointers.splice(i, 1);
        }
      }
    }

    // Generate the pointer received for this frame
    lastIndex = nativeEvents.length - 1;
    if (lastIndex >= 0) {
      for (let i = 0; i <= lastIndex; i++) {
        const evt = nativeEvents[i];
        const { pointerId } = evt;
        let pointer = this._getPointerByID(pointerId);
        if (pointer) {
          pointer._events.push(evt);
        } else {
          const lastCount = pointers.length;
          if (lastCount === 0 || this._multiPointerEnabled) {
            const { _pointerPool: pointerPool } = this;
            // Get Pointer smallest index
            let i = 0;
            for (; i < lastCount; i++) {
              if (pointers[i].id > i) {
                break;
              }
            }
            pointer = pointerPool[i] ||= new Pointer(i);
            pointer._uniqueID = pointerId;
            pointer._events.push(evt);
            pointer.position.set(
              ((evt.clientX - rect.left) / clientWidth) * width,
              ((evt.clientY - rect.top) / clientHeight) * height
            );
            pointers.splice(i, 0, pointer);
          }
        }
      }
      nativeEvents.length = 0;
    }

    // Pointer handles its own events
    this._upList.length = this._downList.length = 0;
    this._buttons = PointerButton.None;
    lastIndex = pointers.length - 1;
    if (lastIndex >= 0) {
      const frameCount = this._engine.time.frameCount;
      const updatePointer = this._engine.physicsManager._initialized
        ? this._updatePointerWithPhysics
        : this._updatePointerWithoutPhysics;
      for (let i = lastIndex; i >= 0; i--) {
        const pointer = pointers[i];
        pointer._upList.length = pointer._downList.length = 0;
        updatePointer(frameCount, pointer, rect, clientWidth, clientHeight, width, height);
        this._buttons |= pointer.pressedButtons;
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
      htmlCanvas.addEventListener("pointerleave", onPointerEvent);
      htmlCanvas.addEventListener("pointermove", onPointerEvent);
      htmlCanvas.addEventListener("pointercancel", onPointerEvent);
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
      htmlCanvas.removeEventListener("pointerleave", onPointerEvent);
      htmlCanvas.removeEventListener("pointermove", onPointerEvent);
      htmlCanvas.removeEventListener("pointercancel", onPointerEvent);
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
      htmlCanvas.removeEventListener("pointerleave", onPointerEvent);
      htmlCanvas.removeEventListener("pointermove", onPointerEvent);
      htmlCanvas.removeEventListener("pointercancel", onPointerEvent);
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
    evt.type === "pointerdown" && this._htmlCanvas.focus();
    this._nativeEvents.push(evt);
  }

  private _getPointerByID(pointerId: number): Pointer {
    const { _pointers: pointers } = this;
    for (let i = pointers.length - 1; i >= 0; i--) {
      if (pointers[i]._uniqueID === pointerId) {
        return pointers[i];
      }
    }
    return null;
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
    rect: DOMRect,
    clientW: number,
    clientH: number,
    canvasW: number,
    canvasH: number
  ): void {
    const { _events: events, position } = pointer;
    const length = events.length;
    if (length > 0) {
      const { _upList, _upMap, _downList, _downMap } = this;
      const latestEvent = events[length - 1];
      const normalizedX = (latestEvent.clientX - rect.left) / clientW;
      const normalizedY = (latestEvent.clientY - rect.top) / clientH;
      const currX = normalizedX * canvasW;
      const currY = normalizedY * canvasH;
      pointer.deltaPosition.set(currX - position.x, currY - position.y);
      position.set(currX, currY);
      pointer._firePointerDrag();
      const rayCastEntity = this._pointerRayCast(normalizedX, normalizedY);
      pointer._firePointerExitAndEnter(rayCastEntity);
      for (let i = 0; i < length; i++) {
        const event = events[i];
        const { button } = event;
        pointer.button = _pointerDec2BinMap[button] || PointerButton.None;
        pointer.pressedButtons = event.buttons;
        switch (event.type) {
          case "pointerdown":
            _downList.add(button);
            _downMap[button] = frameCount;
            pointer._downList.add(button);
            pointer._downMap[button] = frameCount;
            pointer.phase = PointerPhase.Down;
            pointer._firePointerDown(rayCastEntity);
            break;
          case "pointerup":
            _upList.add(button);
            _upMap[button] = frameCount;
            pointer._upList.add(button);
            pointer._upMap[button] = frameCount;
            pointer.phase = PointerPhase.Up;
            pointer._firePointerUpAndClick(rayCastEntity);
            break;
          case "pointermove":
            pointer.phase = PointerPhase.Move;
            break;
          case "pointerleave":
          case "pointercancel":
            pointer.phase = PointerPhase.Leave;
            pointer._firePointerExitAndEnter(null);
          default:
            break;
        }
      }
      pointer._events.length = 0;
    } else {
      pointer.deltaPosition.set(0, 0);
      pointer.phase = PointerPhase.Stationary;
      pointer._firePointerDrag();
      pointer._firePointerExitAndEnter(this._pointerRayCast(position.x / canvasW, position.y / canvasH));
    }
  }

  private _updatePointerWithoutPhysics(
    frameCount: number,
    pointer: Pointer,
    rect: DOMRect,
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
      const currX = ((latestEvent.clientX - rect.left) / clientW) * canvasW;
      const currY = ((latestEvent.clientY - rect.top) / clientH) * canvasH;
      pointer.deltaPosition.set(currX - position.x, currY - position.y);
      position.set(currX, currY);
      pointer.button = _pointerDec2BinMap[latestEvent.button] || PointerButton.None;
      pointer.pressedButtons = latestEvent.buttons;
      const { _upList, _upMap, _downList, _downMap } = this;
      for (let i = 0; i < length; i++) {
        const { button } = events[i];
        switch (events[i].type) {
          case "pointerdown":
            _downList.add(button);
            _downMap[button] = frameCount;
            pointer._downList.add(button);
            pointer._downMap[button] = frameCount;
            pointer.phase = PointerPhase.Down;
            break;
          case "pointerup":
            _upList.add(button);
            _upMap[button] = frameCount;
            pointer._upList.add(button);
            pointer._upMap[button] = frameCount;
            pointer.phase = PointerPhase.Up;
            break;
          case "pointermove":
            pointer.phase = PointerPhase.Move;
            break;
          case "pointerleave":
          case "pointercancel":
            pointer.phase = PointerPhase.Leave;
          default:
            break;
        }
      }
      pointer._events.length = 0;
    } else {
      pointer.deltaPosition.set(0, 0);
      pointer.phase = PointerPhase.Stationary;
    }
  }
}
