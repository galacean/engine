import { Ray, Vector2 } from "@oasis-engine/math";
import { Canvas } from "../../Canvas";
import { Engine } from "../../Engine";
import { Entity } from "../../Entity";
import { HitResult } from "../../physics";
import { PointerPhase } from "../enums/PointerPhase";
import { PointerType } from "../enums/PointerType";
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

  /** When pressing and there is only one pointer,
   * correct the pointerId to the minimum threshold,
   * so as to prevent _lastMoveHash from becoming too large. */
  private _minPointerThreshold: number = 0;
  private _lastMoveHash: number[] = [];

  private _eventList: PointerEvent[] = [];
  private _pointerPool: Pointer[];
  private _effectiveEventList: number[] = [];
  private _effectiveEventCount = 0;
  private _curFrameHasCancel: boolean = false;
  private _curFramePosition: Vector2 = new Vector2();
  private _curFramePressedEntity: Entity;
  private _curFrameEnteredEntity: Entity;

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
    /** Simultaneous touch contact points are supported by the current device. */
    this._pointerPool = new Array<Pointer>(navigator.maxTouchPoints + 1);
    // prettier-ignore
    htmlCanvas.onpointerdown = htmlCanvas.onpointerup = htmlCanvas.onpointerout = (evt:PointerEvent)=>{
      this._eventList.push(evt);
    };
    htmlCanvas.onpointermove = (evt: PointerEvent) => {
      this._lastMoveHash[evt.pointerId - this._minPointerThreshold] = this._eventList.push(evt) - 1;
    };
  }

  /**
   * Update pointer event, will be executed every frame.
   * @internal
   */
  _update(): void {
    this._curFrameHasCancel && this._adjustPointers();
    /** Check whether Drag events are triggered. */
    this._executeDrag();
    if (this._eventList.length > 0) {
      this._handlePointerEvent(this._eventList);
      /** Get the entity hit by the ray. */
      const curEnteredEntity = this._pointerRaycast();
      /** Check whether Enter and Exit events are triggered. */
      this._executeEnterAndExit(curEnteredEntity);
      /** Check whether down, up and click events are triggered. */
      const { _effectiveEventList, _effectiveEventCount } = this;
      for (let i = 0; i < _effectiveEventCount; i++) {
        switch (_effectiveEventList[i]) {
          case PointerEventType.Down:
            this._executeDown(curEnteredEntity);
            break;
          case PointerEventType.Up:
            this._executeUpAndClick(curEnteredEntity);
            break;
          case PointerEventType.Leave:
            this._executeEnterAndExit(null);
            this._curFramePressedEntity = null;
            break;
        }
      }
      this._effectiveEventCount = 0;
    } else {
      const { _pointers: pointers } = this;
      for (let i = pointers.length - 1; i >= 0; i--) {
        const pointer = pointers[i];
        if (pointer.phase !== PointerPhase.Leave) {
          this._executeEnterAndExit(this._pointerRaycast());
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
    this._eventList.length = 0;
    this._pointerPool.length = 0;
    this._pointers.length = 0;
    this._curFramePosition = null;
    this._curFrameEnteredEntity = null;
    this._curFramePressedEntity = null;
    this._engine = null;
    this._canvas = null;
  }

  /**
   * Remove those pointers whose status is "End".
   */
  private _adjustPointers(): void {
    const { _pointers: _pointers } = this;
    for (let i = _pointers.length - 1; i >= 0; i--) {
      if (_pointers[i].phase === PointerPhase.Leave) {
        _pointers.splice(i, 1);
      }
    }
    this._curFrameHasCancel = false;
  }

  /**
   * Get the index of the pointer in the pointers.
   * @param pointerId - PointerId of PointerEvent
   * @returns Index of pointer in pointers
   */
  private _getIndexByPointerID(pointerId: number): number {
    const { _pointers: _pointers } = this;
    for (let i = _pointers.length - 1; i >= 0; i--) {
      if (_pointers[i].uniqueID === pointerId) {
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
  public _addPointer(
    pointerId: number,
    pointerType: string,
    x: number,
    y: number,
    phase: PointerPhase,
    timeStamp: number
  ): void {
    const lastCount = this._pointers.length;
    if (lastCount <= 0 || this._multiPointerEnabled) {
      const { _pointers: pointers, _pointerPool: pointerPool, _curFramePosition: curFramePosition, _canvas } = this;
      // @ts-ignore
      x *= _canvas.width / (_canvas._webCanvas as HTMLCanvasElement).clientWidth;
      // @ts-ignore
      y *= _canvas.height / (_canvas._webCanvas as HTMLCanvasElement).clientHeight;
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
      const touch = pointerPool[i];
      touch.uniqueID = pointerId;
      touch.pointerType = PointerType[pointerType];
      touch.position.setValue(x, y);
      touch.phase = phase;
      touch.timeStamp = timeStamp;
      pointers.splice(i, 0, touch);
      const nowCount = lastCount + 1;
      curFramePosition.x = (curFramePosition.x * lastCount + x) / nowCount;
      curFramePosition.y = (curFramePosition.y * lastCount + y) / nowCount;
    }
  }

  /**
   * Remove pointer.
   * @param pointerIndex - Index of pointer in pointers
   * @param timeStamp - Timestamp when changing phase
   */
  private _removePointer(pointerIndex: number, timeStamp: number): void {
    const { _pointers: pointers, _curFramePosition: curFramePosition } = this;
    const lastCount = pointers.length;
    const removedPointer = pointers[pointerIndex];
    if (lastCount > 1) {
      const nowCount = lastCount - 1;
      const { position } = removedPointer;
      curFramePosition.x = (curFramePosition.x * lastCount - position.x) / nowCount;
      curFramePosition.y = (curFramePosition.y * lastCount - position.y) / nowCount;
    }
    removedPointer.phase = PointerPhase.Leave;
    removedPointer.timeStamp = timeStamp;
  }

  /**
   * Update pointer.
   * @param pointerIndex - Index of pointer in pointers
   * @param x - OffsetX in PointerEvent
   * @param y - OffsetY in PointerEvent
   * @param phase - The phase of the pointer
   * @param timeStamp - Timestamp when changing phase
   */
  private _updatePointer(pointerIndex: number, x: number, y: number, phase: PointerPhase, timeStamp: number): void {
    const { _pointers: pointers, _canvas: canvas } = this;
    const updatedPointer = pointers[pointerIndex];
    const { position } = updatedPointer;
    // @ts-ignore
    x *= canvas.width / (canvas._webCanvas as HTMLCanvasElement).clientWidth;
    // @ts-ignore
    y *= canvas.height / (canvas._webCanvas as HTMLCanvasElement).clientHeight;
    this._curFramePosition.x += (x - position.x) / pointers.length;
    this._curFramePosition.y += (y - position.y) / pointers.length;
    position.setValue(x, y);
    updatedPointer.phase = phase;
    updatedPointer.timeStamp = timeStamp;
  }

  /**
   * Update pointer data and filter out valid event information.
   * @param eventList - PointerEvent List waiting to be processed
   * @returns Effective event information
   */
  private _handlePointerEvent(eventList: PointerEvent[]): void {
    const { _pointers, _effectiveEventList, _lastMoveHash, _minPointerThreshold } = this;
    const timeStamp = this._engine.time.nowTime;
    let activePointerCount = _pointers.length;
    for (let i = 0, n = eventList.length; i < n; i++) {
      const evt = eventList[i];
      let pointerIndex = this._getIndexByPointerID(evt.pointerId);
      switch (evt.type) {
        case "pointerdown":
          if (pointerIndex < 0) {
            this._addPointer(evt.pointerId, evt.type, evt.offsetX, evt.offsetY, PointerPhase.Down, timeStamp);
            ++activePointerCount;
          } else {
            this._updatePointer(pointerIndex, evt.offsetX, evt.offsetY, PointerPhase.Down, timeStamp);
          }
          if (activePointerCount === 1) {
            _effectiveEventList[this._effectiveEventCount++] = PointerEventType.Down;
            /** Update pointer's threshold. */
            this._minPointerThreshold = evt.pointerId;
          }
          break;
        case "pointerup":
          if (pointerIndex >= 0) {
            this._updatePointer(pointerIndex, evt.offsetX, evt.offsetY, PointerPhase.Up, timeStamp);
            activePointerCount === 1 && (_effectiveEventList[this._effectiveEventCount++] = PointerEventType.Up);
          }
          break;
        case "pointermove":
          if (_lastMoveHash[evt.pointerId - _minPointerThreshold] === i) {
            if (pointerIndex < 0) {
              this._addPointer(evt.pointerId, evt.type, evt.offsetX, evt.offsetY, PointerPhase.Move, timeStamp);
              ++activePointerCount;
            } else {
              this._updatePointer(pointerIndex, evt.offsetX, evt.offsetY, PointerPhase.Move, timeStamp);
            }
            _effectiveEventList[this._effectiveEventCount++] = PointerEventType.Move;
          }
          break;
        case "pointerout":
          if (pointerIndex >= 0) {
            this._removePointer(pointerIndex, timeStamp);
            --activePointerCount === 0 && (_effectiveEventList[this._effectiveEventCount++] = PointerEventType.Leave);
            this._curFrameHasCancel = true;
          }
          break;
        default:
          break;
      }
    }
    /** Reset event list. */
    eventList.length = 0;
  }

  /**
   * Get the Entity to which the ray is cast.
   * @param x - The X coordinate of the pointer on the screen, specified in normalized
   * @param y - The Y coordinate of the pointer on the screen, specified in normalized
   * @returns The Entity to which the ray is cast
   */
  private _pointerRaycast(): Entity {
    let { x, y } = this._curFramePosition;
    /** Convert screen coordinates to viewport coordinates. */
    x /= this._canvas.width;
    y /= this._canvas.height;
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

  /**
   * Execute drag event.
   */
  private _executeDrag(): void {
    /** Check whether pressed events are triggered. */
    if (this._curFramePressedEntity) {
      const scripts = this._curFramePressedEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        scripts.get(i).onPointerDrag();
      }
    }
  }

  /**
   * Execute enter and exit events.
   * @param curEnteredEntity - Which entity the pointer is currently on
   */
  private _executeEnterAndExit(curEnteredEntity: Entity): void {
    /** Check whether enter and exit events are triggered. */
    if (this._curFrameEnteredEntity !== curEnteredEntity) {
      if (curEnteredEntity) {
        const scripts = curEnteredEntity._scripts;
        for (let i = scripts.length - 1; i >= 0; i--) {
          scripts.get(i).onPointerEnter();
        }
      }
      if (this._curFrameEnteredEntity) {
        const scripts = this._curFrameEnteredEntity._scripts;
        for (let i = scripts.length - 1; i >= 0; i--) {
          scripts.get(i).onPointerExit();
        }
      }
      this._curFrameEnteredEntity = curEnteredEntity;
    }
  }

  /**
   * Execute down events.
   * @param curEnteredEntity - Which entity the pointer is currently on
   */
  private _executeDown(curEnteredEntity: Entity): void {
    if (curEnteredEntity) {
      const scripts = curEnteredEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        scripts.get(i).onPointerDown();
      }
    }
    this._curFramePressedEntity = curEnteredEntity;
  }

  /**
   * Execute up and click events.
   * @param curEnteredEntity - Which entity the pointer is currently on
   */
  private _executeUpAndClick(curEnteredEntity: Entity): void {
    if (curEnteredEntity) {
      const operateOneTarget = this._curFramePressedEntity === curEnteredEntity;
      const scripts = curEnteredEntity._scripts;
      for (let i = scripts.length - 1; i >= 0; i--) {
        const script = scripts.get(i);
        operateOneTarget && script.onPointerClick();
        script.onPointerUp();
      }
    }
    this._curFramePressedEntity = null;
  }
}

/** @internal */
enum PointerEventType {
  Down,
  Up,
  Move,
  Leave
}
