import { Ray, Vector2 } from "@oasis-engine/math";
import { Canvas } from "../../Canvas";
import { Engine } from "../../Engine";
import { Entity } from "../../Entity";
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

  private _engine: Engine;
  private _canvas: Canvas;

  private _events: PointerEvent[] = [];
  private _pointerPool: Pointer[];
  private _keyEventList: number[] = [];
  private _keyEventCount = 0;
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
      this._events.push(evt);
    };
    this._pointerPool = new Array<Pointer>(navigator.maxTouchPoints + 1);
  }

  /**
   * @internal
   */
  _update(): void {
    this._needOverallPointers && this._overallPointers();
    if (this._events.length > 0) {
      this._handlePointerEvent(this._events);
      /** Get the entity hit by the ray. */
      const rayCastEntity = this._pointerRayCast();
      /** Check whether Enter and Exit events are triggered. */
      this._firePointerEnterAndExit(rayCastEntity);
      /** Check whether down, up and click events are triggered. */
      const { _keyEventList: keyEventList, _keyEventCount: keyEventCount } = this;
      if (keyEventCount > 0) {
        for (let i = 0; i < keyEventCount; i++) {
          switch (keyEventList[i]) {
            case PointerEventType.Down:
              this._firePointerDown(rayCastEntity);
              break;
            case PointerEventType.Up:
              this._firePointerUpAndClick(rayCastEntity);
              break;
            case PointerEventType.Leave:
              this._firePointerEnterAndExit(null);
              this._currentPressedEntity = null;
              break;
          }
        }
        this._keyEventCount = 0;
      } else {
        this._firePointerDrag();
      }
    } else {
      this._firePointerDrag();
      const { _pointers: pointers } = this;
      for (let i = pointers.length - 1; i >= 0; i--) {
        const pointer = pointers[i];
        if (pointer.phase !== PointerPhase.Leave) {
          this._firePointerEnterAndExit(this._pointerRayCast());
        }
      }
    }
  }

  /**
   * Called when the engine is destroyed.
   * @internal
   */
  _destroy(): void {
    // @ts-ignore
    const htmlCanvas = this._canvas._webCanvas as HTMLCanvasElement;
    htmlCanvas.onpointerdown = htmlCanvas.onpointerup = htmlCanvas.onpointerout = htmlCanvas.onpointermove = null;
    this._events.length = 0;
    this._pointerPool.length = 0;
    this._pointers.length = 0;
    this._currentPosition = null;
    this._currentEnteredEntity = null;
    this._currentPressedEntity = null;
    this._engine = null;
    this._canvas = null;
  }

  /**
   * Remove those pointers whose status is "End".
   */
  private _overallPointers(): void {
    const { _pointers: _pointers } = this;
    for (let i = _pointers.length - 1; i >= 0; i--) {
      if (_pointers[i].phase === PointerPhase.Leave) {
        _pointers.splice(i, 1);
      }
    }
    this._needOverallPointers = false;
  }

  /**
   * Get the index of the pointer in the pointers.
   * @param pointerId - PointerId of PointerEvent
   * @returns Index of pointer in pointers
   */
  private _getIndexByPointerID(pointerId: number): number {
    const { _pointers: _pointers } = this;
    for (let i = _pointers.length - 1; i >= 0; i--) {
      if (_pointers[i]._uniqueID === pointerId) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Add pointer.
   * @param pointerId The pointerId of the pointer
   * @param pointerType The pointerType of the pointer
   * @param x - OffsetX in PointerEvent
   * @param y - OffsetY in PointerEvent
   * @param phase - The phase of the pointer
   * @param timeStamp - Timestamp when changing phase
   */
  public _addPointer(pointerId: number, x: number, y: number, phase: PointerPhase): void {
    const lastCount = this._pointers.length;
    if (lastCount <= 0 || this._multiPointerEnabled) {
      const { _pointers: pointers, _pointerPool: pointerPool } = this;
      /** Get Pointer smallest index. */
      let i = 0;
      for (; i < lastCount; i++) {
        if (pointers[i].id > i) {
          break;
        }
      }
      if (!pointerPool[i]) {
        pointerPool[i] = new Pointer(i);
      }
      /** Update and add pointer. */
      const pointer = pointerPool[i];
      pointer._uniqueID = pointerId;
      pointer.position.setValue(x, y);
      pointer._needUpdate = true;
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

  private _handlePointerEvent(events: PointerEvent[]): void {
    const { _pointers: pointers, _keyEventList: _effectiveEventList } = this;
    let activePointerCount = pointers.length;
    for (let i = 0, n = events.length; i < n; i++) {
      const evt = events[i];
      let pointerIndex = this._getIndexByPointerID(evt.pointerId);
      switch (evt.type) {
        case "pointerdown":
          if (pointerIndex === -1) {
            this._addPointer(evt.pointerId, evt.offsetX, evt.offsetY, PointerPhase.Down);
            ++activePointerCount;
          } else {
            this._updatePointer(pointerIndex, evt.offsetX, evt.offsetY, PointerPhase.Down);
          }
          activePointerCount === 1 && (_effectiveEventList[this._keyEventCount++] = PointerEventType.Down);
          break;
        case "pointerup":
          if (pointerIndex >= 0) {
            this._updatePointer(pointerIndex, evt.offsetX, evt.offsetY, PointerPhase.Up);
            activePointerCount === 1 && (_effectiveEventList[this._keyEventCount++] = PointerEventType.Up);
          }
          break;
        case "pointermove":
          if (pointerIndex === -1) {
            this._addPointer(evt.pointerId, evt.offsetX, evt.offsetY, PointerPhase.Move);
            ++activePointerCount;
          } else {
            this._updatePointer(pointerIndex, evt.offsetX, evt.offsetY, PointerPhase.Move);
          }
          break;
        case "pointerout":
          if (pointerIndex >= 0) {
            this._removePointer(pointerIndex);
            --activePointerCount === 0 && (_effectiveEventList[this._keyEventCount++] = PointerEventType.Leave);
            this._needOverallPointers = true;
          }
          break;
        default:
          break;
      }
    }
    /** Reset event list. */
    events.length = 0;
    const { _canvas: canvas, _currentPosition: currentPosition } = this;
    const pointerCount = pointers.length;
    currentPosition.setValue(0, 0);
    if (pointerCount > 0) {
      // @ts-ignore
      const pixelRatio = canvas.width / (canvas._webCanvas as HTMLCanvasElement).clientWidth;
      for (let i = 0; i < pointerCount; i++) {
        const pointer = pointers[i];
        const { position } = pointer;
        if (pointer._needUpdate) {
          position.scale(pixelRatio);
          pointer._needUpdate = false;
        }
        currentPosition.add(position);
      }
    }
    currentPosition.scale(1 / pointerCount);
  }

  private _pointerRayCast(): Entity {
    let { x, y } = this._currentPosition;
    /** Convert screen coordinates to viewport coordinates. */
    const cameras = this._engine.sceneManager.activeScene._activeCameras;
    for (let i = cameras.length - 1; i >= 0; i--) {
      const camera = cameras[i];
      if (!camera.enabled || camera.renderTarget) {
        continue;
      }
      const { x: vpX, y: vpY, z: vpW, w: vpH } = camera.viewport;
      if (x >= vpX && y >= vpY && x - vpX <= vpW && y - vpY <= vpH) {
        PointerManager._tempPoint.setValue((x - vpX) / vpW, (y - vpY) / vpH);
        // TODO: Only check which colliders have listened to the input.
        return this._engine.physicsManager.raycast(
          camera.viewportPointToRay(PointerManager._tempPoint, PointerManager._tempRay),
          PointerManager._tempHitResult
        )
          ? PointerManager._tempHitResult.entity
          : null;
      }
    }
    return null;
  }

  private _firePointerDrag(): void {
    /** Check whether pressed events are triggered. */
    if (this._currentPressedEntity) {
      const scripts = this._currentPressedEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        scripts.get(i).onPointerDrag();
      }
    }
  }

  private _firePointerEnterAndExit(curEnteredEntity: Entity): void {
    /** Check whether enter and exit events are triggered. */
    if (this._currentEnteredEntity !== curEnteredEntity) {
      if (curEnteredEntity) {
        const scripts = curEnteredEntity._scripts;
        for (let i = scripts.length - 1; i >= 0; i--) {
          scripts.get(i).onPointerEnter();
        }
      }
      if (this._currentEnteredEntity) {
        const scripts = this._currentEnteredEntity._scripts;
        for (let i = scripts.length - 1; i >= 0; i--) {
          scripts.get(i).onPointerExit();
        }
      }
      this._currentEnteredEntity = curEnteredEntity;
    }
  }

  private _firePointerDown(curEnteredEntity: Entity): void {
    if (curEnteredEntity) {
      const scripts = curEnteredEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        scripts.get(i).onPointerDown();
      }
    }
    this._currentPressedEntity = curEnteredEntity;
  }

  private _firePointerUpAndClick(curEnteredEntity: Entity): void {
    if (curEnteredEntity) {
      const operateOneTarget = this._currentPressedEntity === curEnteredEntity;
      const scripts = curEnteredEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        const script = scripts.get(i);
        operateOneTarget && script.onPointerClick();
        script.onPointerUp();
      }
    }
    this._currentPressedEntity = null;
  }
}

/** @internal */
enum PointerEventType {
  Down,
  Up,
  Move,
  Leave
}
