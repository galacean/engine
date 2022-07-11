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
  _movingDelta: Vector2 = new Vector2();
  /** @internal */
  _multiPointerEnabled: boolean = true;
  /** @internal */
  _buttons: number = 0x0;
  /** @internal */
  _upMap: number[] = [];
  /** @internal */
  _downMap: number[] = [];
  /** @internal */
  _downList: DisorderedArray<PointerButton> = new DisorderedArray();
  /** @internal */
  _upList: DisorderedArray<PointerButton> = new DisorderedArray();
  /** @internal */
  _currentPosition: Vector2 = new Vector2();

  private _currentPressedEntity: Entity;
  private _currentEnteredEntity: Entity;

  private _engine: Engine;
  private _canvas: Canvas;
  private _htmlCanvas: HTMLCanvasElement;
  private _nativeEvents: PointerEvent[] = [];
  private _pointerPool: Pointer[];
  private _keyEventList: number[] = [];
  private _keyEventCount: number = 0;
  private _needOverallPointers: boolean = false;
  private _hadListener: boolean = false;
  private _lastPositionFrameCount: number = 0;

  /**
   * Create a PointerManager.
   * @param engine - The current engine instance
   * @param htmlCanvas - HTMLCanvasElement
   */
  constructor(engine: Engine, htmlCanvas: HTMLCanvasElement) {
    this._engine = engine;
    this._canvas = engine.canvas;
    this._htmlCanvas = htmlCanvas;
    htmlCanvas.style.touchAction = "none";
    htmlCanvas.oncontextmenu = (event: UIEvent) => {
      return false;
    };
    const onPointerEvent = (this._onPointerEvent = this._onPointerEvent.bind(this));
    htmlCanvas.addEventListener("pointerdown", onPointerEvent);
    htmlCanvas.addEventListener("pointerup", onPointerEvent);
    htmlCanvas.addEventListener("pointerout", onPointerEvent);
    htmlCanvas.addEventListener("pointermove", onPointerEvent);
    this._hadListener = true;
    // If there are no compatibility issues, navigator.maxTouchPoints should be used here.
    this._pointerPool = new Array<Pointer>(11);
  }

  /**
   * @internal
   */
  _update(frameCount: number): void {
    this._needOverallPointers && this._overallPointers();
    this._downList.length = 0;
    this._upList.length = 0;
    this._movingDelta.set(0, 0);
    this._nativeEvents.length > 0 && this._handlePointerEvent(this._nativeEvents, frameCount);
    if (this._engine.physicsManager._initialized) {
      const rayCastEntity = this._pointerRayCast();
      const { _keyEventCount: keyEventCount } = this;
      if (keyEventCount > 0) {
        const { _keyEventList: keyEventList } = this;
        for (let i = 0; i < keyEventCount; i++) {
          switch (keyEventList[i]) {
            case PointerKeyEvent.Down:
              this._firePointerDown(rayCastEntity);
              break;
            case PointerKeyEvent.Up:
              this._firePointerUpAndClick(rayCastEntity);
              break;
          }
        }
        this._firePointerExitAndEnter(rayCastEntity);
        keyEventList[keyEventCount - 1] === PointerKeyEvent.Leave && (this._currentPressedEntity = null);
        this._keyEventCount = 0;
      } else {
        this._firePointerDrag();
        this._firePointerExitAndEnter(rayCastEntity);
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
      this._nativeEvents.length = 0;
      this._pointerPool.length = 0;
      this._currentEnteredEntity = null;
      this._currentPressedEntity = null;
      this._downList.length = 0;
      this._upList.length = 0;
      this._hadListener = false;
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
    this._nativeEvents.length = 0;
    this._pointerPool.length = 0;
    this._pointers.length = 0;
    this._currentPosition = null;
    this._currentEnteredEntity = null;
    this._currentPressedEntity = null;
    this._engine = null;
    this._canvas = null;
  }

  private _onPointerEvent(evt: PointerEvent) {
    this._nativeEvents.push(evt);
  }

  private _overallPointers(): void {
    const { _pointers: pointers } = this;
    let deleteCount = 0;
    const totalCount = pointers.length;
    for (let i = 0; i < totalCount; i++) {
      if (pointers[i].phase === PointerPhase.Leave) {
        deleteCount++;
      } else {
        if (deleteCount > 0) {
          pointers[i - deleteCount] = pointers[i];
        }
      }
    }
    pointers.length = totalCount - deleteCount;
    this._needOverallPointers = false;
  }

  private _getIndexByPointerID(pointerId: number): number {
    const { _pointers: pointers } = this;
    for (let i = pointers.length - 1; i >= 0; i--) {
      if (pointers[i]._uniqueID === pointerId) {
        return i;
      }
    }
    return -1;
  }

  private _addPointer(pointerId: number, x: number, y: number, phase: PointerPhase): void {
    const { _pointers: pointers } = this;
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
        pointer = pointerPool[i] = new Pointer(i);
      }
      pointer._uniqueID = pointerId;
      pointer.position.set(x, y);
      pointer.phase = phase;
      pointers.splice(i, 0, pointer);
    }
  }

  private _removePointer(pointerIndex: number): void {
    const leavePointer = this._pointers[pointerIndex];
    leavePointer.phase = PointerPhase.Leave;
  }

  private _updatePointer(pointerIndex: number, x: number, y: number, phase: PointerPhase): void {
    const updatedPointer = this._pointers[pointerIndex];
    updatedPointer.position.set(x, y);
    updatedPointer.phase = phase;
  }

  private _handlePointerEvent(nativeEvents: PointerEvent[], frameCount: number): void {
    const {
      _pointers: pointers,
      _keyEventList: keyEventList,
      _upMap: upMap,
      _downMap: downMap,
      _upList: upList,
      _downList: downList
    } = this;
    let activePointerCount = pointers.length;
    const pixelRatioW = this._canvas.width / this._htmlCanvas.clientWidth;
    const pixelRatioH = this._canvas.height / this._htmlCanvas.clientHeight;
    const nativeEventsLen = nativeEvents.length;
    for (let i = 0; i < nativeEventsLen; i++) {
      const evt = nativeEvents[i];
      const pointerButton: PointerButton = evt.button | PointerButton.Primary;
      const pointerIndex = this._getIndexByPointerID(evt.pointerId);
      switch (evt.type) {
        case "pointerdown":
          if (pointerIndex === -1) {
            this._addPointer(evt.pointerId, evt.offsetX * pixelRatioW, evt.offsetY * pixelRatioH, PointerPhase.Down);
            activePointerCount++;
          } else {
            this._updatePointer(pointerIndex, evt.offsetX * pixelRatioW, evt.offsetY * pixelRatioH, PointerPhase.Down);
          }
          activePointerCount === 1 && (keyEventList[this._keyEventCount++] = PointerKeyEvent.Down);
          downList.add(pointerButton);
          downMap[pointerButton] = frameCount;
          break;
        case "pointerup":
          if (pointerIndex >= 0) {
            this._updatePointer(pointerIndex, evt.offsetX * pixelRatioW, evt.offsetY * pixelRatioH, PointerPhase.Up);
            activePointerCount === 1 && (keyEventList[this._keyEventCount++] = PointerKeyEvent.Up);
          }
          upList.add(pointerButton);
          upMap[pointerButton] = frameCount;
          break;
        case "pointermove":
          if (pointerIndex === -1) {
            this._addPointer(evt.pointerId, evt.offsetX * pixelRatioW, evt.offsetY * pixelRatioH, PointerPhase.Move);
            activePointerCount++;
          } else {
            this._updatePointer(pointerIndex, evt.offsetX * pixelRatioW, evt.offsetY * pixelRatioH, PointerPhase.Move);
          }
          break;
        case "pointerout":
          if (pointerIndex >= 0) {
            this._removePointer(pointerIndex);
            --activePointerCount === 0 && (keyEventList[this._keyEventCount++] = PointerKeyEvent.Leave);
            this._needOverallPointers = true;
          }
          break;
      }
    }
    this._buttons = nativeEvents[nativeEventsLen - 1].buttons;
    const pointerCount = pointers.length;
    if (pointerCount > 0) {
      const { _currentPosition: currentPosition } = this;
      const { x: lastX, y: lastY } = currentPosition;
      if (activePointerCount === 0) {
        // Get the pointer coordinates when leaving, and use it to correctly dispatch the click event.
        const lastNativeEvent = nativeEvents[nativeEventsLen - 1];
        currentPosition.set(lastNativeEvent.offsetX * pixelRatioW, lastNativeEvent.offsetY * pixelRatioH);
      } else {
        currentPosition.set(0, 0);
        for (let i = 0; i < pointerCount; i++) {
          currentPosition.add(pointers[i].position);
        }
        currentPosition.scale(1 / pointerCount);
      }
      // Update pointer moving delta.
      if (this._lastPositionFrameCount === frameCount - 1) {
        this._movingDelta.set(currentPosition.x - lastX, currentPosition.y - lastY);
      }
      this._lastPositionFrameCount = frameCount;
    }
    nativeEvents.length = 0;
  }

  private _pointerRayCast(): Entity {
    if (this._pointers.length > 0) {
      const { _tempPoint: point, _tempRay: ray, _tempHitResult: hitResult } = PointerManager;
      const { _activeCameras: cameras } = this._engine.sceneManager.activeScene;
      const x = this._currentPosition.x / this._canvas.width;
      const y = this._currentPosition.y / this._canvas.height;
      for (let i = cameras.length - 1; i >= 0; i--) {
        const camera = cameras[i];
        if (!camera.enabled || camera.renderTarget) {
          continue;
        }
        const { x: vpX, y: vpY, z: vpW, w: vpH } = camera.viewport;
        if (x >= vpX && y >= vpY && x - vpX <= vpW && y - vpY <= vpH) {
          point.set((x - vpX) / vpW, (y - vpY) / vpH);
          // TODO: Only check which colliders have listened to the input.
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
    return null;
  }

  private _firePointerDrag(): void {
    if (this._currentPressedEntity) {
      const scripts = this._currentPressedEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        const script = scripts.get(i);
        script._waitHandlingInValid || script.onPointerDrag();
      }
    }
  }

  private _firePointerExitAndEnter(rayCastEntity: Entity): void {
    if (this._currentEnteredEntity !== rayCastEntity) {
      if (this._currentEnteredEntity) {
        const scripts = this._currentEnteredEntity._scripts;
        for (let i = scripts.length - 1; i >= 0; i--) {
          const script = scripts.get(i);
          script._waitHandlingInValid || script.onPointerExit();
        }
      }
      if (rayCastEntity) {
        const scripts = rayCastEntity._scripts;
        for (let i = scripts.length - 1; i >= 0; i--) {
          const script = scripts.get(i);
          script._waitHandlingInValid || script.onPointerEnter();
        }
      }
      this._currentEnteredEntity = rayCastEntity;
    }
  }

  private _firePointerDown(rayCastEntity: Entity): void {
    if (rayCastEntity) {
      const scripts = rayCastEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        const script = scripts.get(i);
        script._waitHandlingInValid || script.onPointerDown();
      }
    }
    this._currentPressedEntity = rayCastEntity;
  }

  private _firePointerUpAndClick(rayCastEntity: Entity): void {
    const { _currentPressedEntity: pressedEntity } = this;
    if (pressedEntity) {
      const sameTarget = pressedEntity === rayCastEntity;
      const scripts = pressedEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        const script = scripts.get(i);
        if (!script._waitHandlingInValid) {
          sameTarget && script.onPointerClick();
          script.onPointerUp();
        }
      }
      this._currentPressedEntity = null;
    }
  }
}

/**
 * @internal
 */
enum PointerKeyEvent {
  Down,
  Up,
  Leave
}
