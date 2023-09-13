import { Ray, Vector2 } from "@galacean/engine-math";
import { Canvas } from "../../Canvas";
import { DisorderedArray } from "../../DisorderedArray";
import { Engine } from "../../Engine";
import { Entity } from "../../Entity";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { HitResult } from "../../physics";
import { PointerButton, _pointerDec2BinMap } from "../enums/PointerButton";
import { PointerPhase } from "../enums/PointerPhase";
import { IInput } from "../interface/IInput";
import { Pointer } from "./Pointer";
import { Scene } from "../../Scene";

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
    this._onFocus();
    // If there are no compatibility issues, navigator.maxTouchPoints should be used here
    this._pointerPool = new Array<Pointer>(11);
  }

  /**
   * @internal
   */
  _update(): void {
    const { _pointers: pointers, _nativeEvents: nativeEvents, _htmlCanvas: htmlCanvas } = this;
    const { width, height } = this._canvas;
    const { clientWidth, clientHeight } = htmlCanvas;
    const { left, top } = htmlCanvas.getBoundingClientRect();
    const widthDPR = width / clientWidth;
    const heightDPR = height / clientHeight;

    // Clean up the pointer released in the previous frame
    for (let i = pointers.length - 1; i >= 0; i--) {
      if (pointers[i].phase === PointerPhase.Leave) {
        pointers.splice(i, 1);
      }
    }

    // Generate the pointer received for this frame
    for (let i = 0, n = nativeEvents.length; i < n; i++) {
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
          pointer.position.set((evt.clientX - left) * widthDPR, (evt.clientY - top) * heightDPR);
          pointers.splice(i, 0, pointer);
        }
      }
    }
    nativeEvents.length = 0;

    // Pointer handles its own events
    this._upList.length = this._downList.length = 0;
    this._buttons = PointerButton.None;
    const frameCount = this._engine.time.frameCount;
    for (let i = 0, n = pointers.length; i < n; i++) {
      const pointer = pointers[i];
      pointer._upList.length = pointer._downList.length = 0;
      this._updatePointerInfo(frameCount, pointer, left, top, widthDPR, heightDPR);
      this._buttons |= pointer.pressedButtons;
    }
  }

  /**
   * @internal
   */
  _firePointerScript(scenes: readonly Scene[]) {
    const { _pointers: pointers, _canvas: canvas } = this;
    for (let i = 0, n = pointers.length; i < n; i++) {
      const pointer = pointers[i];
      const { _events: events, position } = pointer;
      pointer._firePointerDrag();
      const rayCastEntity = this._pointerRayCast(scenes, position.x / canvas.width, position.y / canvas.height);
      pointer._firePointerExitAndEnter(rayCastEntity);
      const length = events.length;
      if (length > 0) {
        for (let i = 0; i < length; i++) {
          switch (events[i].type) {
            case "pointerdown":
              pointer.phase = PointerPhase.Down;
              pointer._firePointerDown(rayCastEntity);
              break;
            case "pointerup":
              pointer.phase = PointerPhase.Up;
              pointer._firePointerUpAndClick(rayCastEntity);
              break;
            case "pointerleave":
            case "pointercancel":
              pointer.phase = PointerPhase.Leave;
              pointer._firePointerExitAndEnter(null);
            default:
              break;
          }
        }
        events.length = 0;
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
      this._pointers.length = 0;
      this._downList.length = 0;
      this._upList.length = 0;
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
    this._pointerPool = null;
    this._pointers.length = 0;
    this._pointers = null;
    this._downList.length = 0;
    this._downList = null;
    this._upList.length = 0;
    this._upList = null;
    this._nativeEvents.length = 0;
    this._nativeEvents = null;
    this._upMap.length = 0;
    this._upMap = null;
    this._downMap.length = 0;
    this._downMap = null;
    this._htmlCanvas = null;
    this._canvas = null;
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

  private _updatePointerInfo(
    frameCount: number,
    pointer: Pointer,
    left: number,
    top: number,
    widthPixelRatio: number,
    heightPixelRatio: number
  ) {
    const { _events: events, position } = pointer;
    const length = events.length;
    if (length > 0) {
      const { _upList, _upMap, _downList, _downMap } = this;
      const latestEvent = events[length - 1];
      const currX = (latestEvent.clientX - left) * widthPixelRatio;
      const currY = (latestEvent.clientY - top) * heightPixelRatio;
      pointer.deltaPosition.set(currX - position.x, currY - position.y);
      position.set(currX, currY);
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
      this._engine._physicsInitialized || (events.length = 0);
    } else {
      pointer.deltaPosition.set(0, 0);
      pointer.phase = PointerPhase.Stationary;
    }
  }

  private _pointerRayCast(scenes: readonly Scene[], normalizedX: number, normalizedY: number): Entity {
    const { _tempPoint: point, _tempRay: ray, _tempHitResult: hitResult } = PointerManager;
    for (let i = scenes.length - 1; i >= 0; i--) {
      const scene = scenes[i];
      if (scene.destroyed) {
        continue;
      }
      const { _activeCameras: cameras } = scene;
      for (let j = 0; j < cameras.length; j++) {
        const camera = cameras[i];
        if (!camera.enabled || camera.renderTarget) {
          continue;
        }
        const { x: vpX, y: vpY, z: vpW, w: vpH } = camera.viewport;
        if (normalizedX >= vpX && normalizedY >= vpY && normalizedX - vpX <= vpW && normalizedY - vpY <= vpH) {
          point.set((normalizedX - vpX) / vpW, (normalizedY - vpY) / vpH);
          if (
            scene.physics.raycast(
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
    return null;
  }
}
