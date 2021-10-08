import { Ray, Vector2 } from "@oasis-engine/math";
import { Canvas } from "../../Canvas";
import { Engine } from "../../Engine";
import { Entity } from "../../Entity";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { HitResult } from "../../physics";
import { PointerPhase } from "../enums/PointerPhase";
import { Pointer } from "./Pointer";

/**
 * Pointer Manager.
 * @internal
 */
export class PointerManager {
  private static _tempRay: Ray = new Ray();
  private static _tempPoint: Vector2 = new Vector2();
  private static _tempHitResult: HitResult = new HitResult();

  /** @internal */
  _pointers: Pointer[] = [];
  /** @internal */
  _multiPointerEnabled: boolean = true;
  /** @internal */
  _enablePhysics: boolean = false;

  private _engine: Engine;
  private _canvas: Canvas;
  private _nativeEvents: PointerEvent[] = [];
  private _pointerPool: Pointer[];
  private _keyEventList: number[] = [];
  private _keyEventCount: number = 0;
  private _needOverallPointers: boolean = false;
  private _currentPosition: Vector2 = new Vector2();
  private _currentPressedEntity: Entity;
  private _currentEnteredEntity: Entity;

  /**
   * Create a PointerManager.
   * @param engine - The current engine instance
   */
  constructor(engine: Engine) {
    this._engine = engine;
    this._canvas = engine.canvas;
    // @ts-ignore
    const htmlCanvas = this._canvas._webCanvas as HTMLCanvasElement;
    htmlCanvas.style.touchAction = "none";
    // prettier-ignore
    htmlCanvas.onpointerdown = htmlCanvas.onpointerup = htmlCanvas.onpointerout = htmlCanvas.onpointermove = (evt:PointerEvent)=>{
      this._nativeEvents.push(evt);
    };
    // MaxTouchCount + MouseCount(1)
    this._pointerPool = new Array<Pointer>(navigator.maxTouchPoints + 1);
    this._enablePhysics = engine.physicsManager ? true : false;
  }

  /**
   * @internal
   */
  _update(): void {
    this._needOverallPointers && this._overallPointers();
    this._nativeEvents.length > 0 && this._handlePointerEvent(this._nativeEvents);
    if (this._enablePhysics) {
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
  _destroy(): void {
    // @ts-ignore
    const htmlCanvas = this._canvas._webCanvas as HTMLCanvasElement;
    htmlCanvas.onpointerdown = htmlCanvas.onpointerup = htmlCanvas.onpointerout = htmlCanvas.onpointermove = null;
    this._nativeEvents.length = 0;
    this._pointerPool.length = 0;
    this._pointers.length = 0;
    this._currentPosition = null;
    this._currentEnteredEntity = null;
    this._currentPressedEntity = null;
    this._engine = null;
    this._canvas = null;
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

  public _addPointer(pointerId: number, x: number, y: number, phase: PointerPhase): void {
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
      pointer._needUpdate = true;
      pointer.position.setValue(x, y);
      pointer.phase = phase;
      pointers.splice(i, 0, pointer);
    }
  }

  private _removePointer(pointerIndex: number): void {
    this._pointers[pointerIndex].phase = PointerPhase.Leave;
  }

  private _updatePointer(pointerIndex: number, x: number, y: number, phase: PointerPhase): void {
    const updatedPointer = this._pointers[pointerIndex];
    updatedPointer.position.setValue(x, y);
    updatedPointer._needUpdate = true;
    updatedPointer.phase = phase;
  }

  private _handlePointerEvent(nativeEvents: PointerEvent[]): void {
    const { _pointers: pointers, _keyEventList: keyEventList } = this;
    let activePointerCount = pointers.length;
    const nativeEventsLen = nativeEvents.length;
    for (let i = 0; i < nativeEventsLen; i++) {
      const evt = nativeEvents[i];
      let pointerIndex = this._getIndexByPointerID(evt.pointerId);
      switch (evt.type) {
        case "pointerdown":
          if (pointerIndex === -1) {
            this._addPointer(evt.pointerId, evt.offsetX, evt.offsetY, PointerPhase.Down);
            activePointerCount++;
          } else {
            this._updatePointer(pointerIndex, evt.offsetX, evt.offsetY, PointerPhase.Down);
          }
          activePointerCount === 1 && (keyEventList[this._keyEventCount++] = PointerKeyEvent.Down);
          break;
        case "pointerup":
          if (pointerIndex >= 0) {
            this._updatePointer(pointerIndex, evt.offsetX, evt.offsetY, PointerPhase.Up);
            activePointerCount === 1 && (keyEventList[this._keyEventCount++] = PointerKeyEvent.Up);
          }
          break;
        case "pointermove":
          if (pointerIndex === -1) {
            this._addPointer(evt.pointerId, evt.offsetX, evt.offsetY, PointerPhase.Move);
            activePointerCount++;
          } else {
            this._updatePointer(pointerIndex, evt.offsetX, evt.offsetY, PointerPhase.Move);
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
    const pointerCount = pointers.length;
    if (pointerCount > 0) {
      const { _canvas: canvas, _currentPosition: currentPosition } = this;
      // @ts-ignore
      const pixelRatioWidth = canvas.width / (canvas._webCanvas as HTMLCanvasElement).clientWidth;
      // @ts-ignore
      const pixelRatioHeight = canvas.height / (canvas._webCanvas as HTMLCanvasElement).clientHeight;
      if (activePointerCount === 0) {
        const lastNativeEvent = nativeEvents[nativeEventsLen - 1];
        currentPosition.setValue(lastNativeEvent.offsetX * pixelRatioWidth, lastNativeEvent.offsetY * pixelRatioHeight);
      } else {
        currentPosition.setValue(0, 0);
        for (let i = 0; i < pointerCount; i++) {
          const pointer = pointers[i];
          const { position } = pointer;
          if (pointer._needUpdate) {
            position.setValue(position.x * pixelRatioWidth, position.y * pixelRatioHeight);
            pointer._needUpdate = false;
          }
          currentPosition.add(position);
        }
        currentPosition.scale(1 / pointerCount);
      }
    }
    nativeEvents.length = 0;
  }

  private _pointerRayCast(): Entity {
    if (this._pointers.length > 0) {
      let x = this._currentPosition.x / this._canvas.width;
      let y = this._currentPosition.y / this._canvas.height;
      const cameras = this._engine.sceneManager.activeScene._activeCameras;
      const { _tempPoint, _tempRay, _tempHitResult } = PointerManager;
      for (let i = cameras.length - 1; i >= 0; i--) {
        const camera = cameras[i];
        if (!camera.enabled || camera.renderTarget) {
          continue;
        }
        const { x: vpX, y: vpY, z: vpW, w: vpH } = camera.viewport;
        if (x >= vpX && y >= vpY && x - vpX <= vpW && y - vpY <= vpH) {
          PointerManager._tempPoint.setValue((x - vpX) / vpW, (y - vpY) / vpH);
          // TODO: Only check which colliders have listened to the input.
          if (this._engine.physicsManager.raycast(camera.viewportPointToRay(_tempPoint, _tempRay), _tempHitResult)) {
            return PointerManager._tempHitResult.entity;
          } else if (camera.clearFlags === CameraClearFlags.DepthColor) {
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
        scripts.get(i).onPointerDrag();
      }
    }
  }

  private _firePointerExitAndEnter(rayCastEntity: Entity): void {
    if (this._currentEnteredEntity !== rayCastEntity) {
      if (this._currentEnteredEntity) {
        const scripts = this._currentEnteredEntity._scripts;
        for (let i = scripts.length - 1; i >= 0; i--) {
          scripts.get(i).onPointerExit();
        }
      }
      if (rayCastEntity) {
        const scripts = rayCastEntity._scripts;
        for (let i = scripts.length - 1; i >= 0; i--) {
          scripts.get(i).onPointerEnter();
        }
      }
      this._currentEnteredEntity = rayCastEntity;
    }
  }

  private _firePointerDown(rayCastEntity: Entity): void {
    if (rayCastEntity) {
      const scripts = rayCastEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        scripts.get(i).onPointerDown();
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
        sameTarget && script.onPointerClick();
        script.onPointerUp();
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
