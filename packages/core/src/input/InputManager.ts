import { Ray, Vector2 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { HitResult } from "../HitResult";
import { Script } from "../Script";
import { Input } from "./Input";
import { Pointer } from "./Pointer";

/**
 * Input Manager.
 */
export class InputManager {
  private static _tempRay: Ray = new Ray();
  private static _tempPoint: Vector2 = new Vector2();
  private static _tempHitResult: HitResult = new HitResult();

  private _engine: Engine;
  private _canvas: HTMLCanvasElement;

  private _multiTouchEnabled: boolean = false;
  /** Current simulated input. */
  private _input: Input = new Input();
  private _eventList: PointerEvent[] = [];
  private _activePointerCount: number = 0;
  private _pointerList: Pointer[] = [];
  private _pointers: Pointer[] = [];
  private _pointerIdToIndexMap: Record<number, number> = {};

  /**
   *	Get pointers.
   *  @remarks The returned list should be considered deep-read-only.
   * 	@return Pointers
   */
  get pointers(): Readonly<Pointer[]> {
    return this._pointers;
  }

  /**
   *	Get input.
   *  @remarks The returned list should be considered deep-read-only.
   * 	@return Input
   */
  get input(): Readonly<Input> {
    return this._input;
  }

  /**
   *  Whether to handle multi-touch.
   */
  get multiTouchEnabled(): boolean {
    return this._multiTouchEnabled;
  }

  set multiTouchEnabled(enabled: boolean) {
    this._multiTouchEnabled = enabled;
  }

  /**
   * Constructor an InputManager.
   * @param engine - The current engine instance
   */
  constructor(engine: Engine) {
    this._engine = engine;
    // @ts-ignore
    const canvas = (this._canvas = engine.canvas._webCanvas);
    canvas.addEventListener("pointerdown", this._pushEventList);
    canvas.addEventListener("pointerup", this._pushEventList);
    canvas.addEventListener("pointermove", this._pushEventList);
    canvas.addEventListener("pointercancel", this._pushEventList);
    canvas.addEventListener("pointerout", this._pushEventList);
  }

  /**
   * Called when the engine is destroyed.
   */
  destroy(): void {
    const { _canvas: canvas } = this;
    canvas.removeEventListener("pointerdown", this._pushEventList);
    canvas.removeEventListener("pointerup", this._pushEventList);
    canvas.removeEventListener("pointermove", this._pushEventList);
    canvas.removeEventListener("pointercancel", this._pushEventList);
    canvas.removeEventListener("pointerout", this._pushEventList);
    this._eventList.length = 0;
    this._pointerList.length = 0;
    this._pointers.length = 0;
    this._input = null;
    this._pointerIdToIndexMap = null;
  }

  /**
   * Update pointer event, will be executed every frame.
   * @internal
   */
  _update(): void {
    /** Simulate a combined pointer. */
    const { _eventList } = this;
    const eventLen = _eventList.length;
    /** Expressed in binary. */
    let evtTypeList = 1;
    if (eventLen > 0) {
      for (let l = 0; l < eventLen; l++) {
        const evt = _eventList[l];
        switch (evt.type) {
          case "pointerdown":
            this._changePointer(PointerOperationType.Update, evt.pointerId, evt.pageX, evt.pageY);
            /** this._activePointerCount === 1 && (evtTypeList = (evtTypeList << 1) | PointerEventType.Down); */
            this._activePointerCount === 1 && (evtTypeList <<= 1);
            break;
          case "pointerup":
            this._activePointerCount === 1 && (evtTypeList = (evtTypeList << 1) | PointerEventType.Up);
            break;
          case "pointermove":
            this._changePointer(PointerOperationType.Update, evt.pointerId, evt.pageX, evt.pageY);
            break;
          case "pointercancel":
          case "pointerout":
            this._changePointer(PointerOperationType.Remove, evt.pointerId);
            break;
          default:
            break;
        }
      }
      /** Reset event list. */
      _eventList.length = 0;
    }

    /** Sync _pointers and _pointerList. */
    const { _pointers: pointers, _pointerList: pointerList, _input: input, _activePointerCount } = this;
    pointers.length = _activePointerCount;
    if (evtTypeList <= 1 && _activePointerCount === 0) {
      return;
    } else {
      for (let i = 0; i < _activePointerCount; i++) {
        pointers[i] = pointerList[i];
      }
    }

    /** Check whether pressed events are triggered. */
    let prePressedEntity = input.pressedEntity;
    if (prePressedEntity) {
      const preScripts = prePressedEntity._scripts._elements;
      for (let i = preScripts.length - 1; i >= 0; i--) {
        preScripts[i].onPointerDrag();
      }
    }
    /** Get the entity hit by the ray. */
    const curEntity = this._pointerRaycast(input.x, input.y);
    const preEnteredEntity = input.enteredEntity;
    /** 80% of operations are on curEntity, so we cache his scripts. */
    let curEntityScripts: Script[];
    let curEntityScriptsLen = 0;
    if (curEntity) {
      curEntityScripts = curEntity._scripts._elements;
      curEntityScriptsLen = curEntityScripts.length;
    }
    /** Check whether enter and exit events are triggered. */
    if (preEnteredEntity != curEntity) {
      if (curEntity) {
        for (let i = 0; i < curEntityScriptsLen; i++) {
          curEntityScripts[i].onPointerEnter();
        }
      }
      if (preEnteredEntity) {
        const scripts = preEnteredEntity._scripts;
        const scriptsArr = scripts._elements;
        for (let i = scripts.length - 1; i >= 0; i--) {
          scriptsArr[i].onPointerExit();
        }
      }
      input.enteredEntity = curEntity;
    }
    /** Check whether down up and click events are triggered. */
    while (evtTypeList > 1) {
      switch (evtTypeList % 2) {
        case PointerEventType.Down:
          if (curEntity) {
            for (let j = 0; j < curEntityScriptsLen; j++) {
              curEntityScripts[j].onPointerDown();
            }
          }
          prePressedEntity = curEntity;
          break;
        case PointerEventType.Up:
          if (prePressedEntity) {
            if (prePressedEntity == curEntity) {
              for (let j = 0; j < curEntityScriptsLen; j++) {
                const script = curEntityScripts[j];
                script.onPointerUp();
                script.onPointerClick();
              }
            } else {
              const preScripts = prePressedEntity._scripts._elements;
              for (let j = preScripts.length - 1; j >= 0; j--) {
                preScripts[j].onPointerUp();
              }
            }
          }
          prePressedEntity = null;
          break;
      }
      evtTypeList >>= 1;
    }
    input.pressedEntity = prePressedEntity;
  }

  /**
   * Get the Entity to which the ray is cast.
   * @param x - The X coordinate of the pointer on the screen, specified in normalized
   * @param y - The Y coordinate of the pointer on the screen, specified in normalized
   * @returns The Entity to which the ray is cast
   */
  private _pointerRaycast(x: number, y: number): Entity {
    const { _engine: engine, _canvas: canvas } = this;
    /** Convert screen coordinates to viewport coordinates. */
    x = (x - canvas.offsetLeft) / canvas.clientWidth;
    y = (y - canvas.offsetTop) / canvas.clientHeight;
    const cameras = engine.sceneManager.activeScene._activeCameras;
    for (let i = cameras.length - 1; i >= 0; i--) {
      const camera = cameras[i];
      if (!camera.enabled || camera.renderTarget) {
        continue;
      }
      const { x: vpX, y: vpY, z: vpW, w: vpH } = camera.viewport;
      if (x >= vpX && y >= vpY && x - vpX <= vpW && y - vpY <= vpH) {
        const { _tempHitResult, _tempPoint } = InputManager;
        _tempPoint.setValue((x - vpX) / vpW, (y - vpY) / vpH);
        // TODO: Only check which colliders have listened to the input.
        return engine.physicsManager.raycast(
          camera.viewportPointToRay(_tempPoint, InputManager._tempRay),
          _tempHitResult
        )
          ? _tempHitResult.collider.entity
          : null;
      }
    }
    return null;
  }

  /**
   * Update pointers info.
   * @param type - Pointer change type
   * @param pointerId - Pointer ID
   * @param x - The x coordinate of Pointer
   * @param y - The y coordinate of Pointer
   */
  private _changePointer(type: PointerOperationType, pointerId: number, x?: number, y?: number): void {
    const {
      _pointerIdToIndexMap: _pointerIdToIndex,
      _pointerList: pointerList,
      _activePointerCount: lastCount,
      _input: input
    } = this;
    let idx = _pointerIdToIndex[pointerId];
    switch (type) {
      case PointerOperationType.Remove:
        if (idx === undefined) {
          return;
        } else {
          const nowCount = (this._activePointerCount = lastCount - 1);
          if (nowCount != 0) {
            const removedTouch = pointerList[idx];
            if (idx !== lastCount) {
              pointerList[idx] = pointerList[lastCount];
              pointerList[lastCount] = removedTouch;
            }
            input.x = (input.x * lastCount - removedTouch.position.x) / nowCount;
            input.y = (input.y * lastCount - removedTouch.position.y) / nowCount;
          }
          delete _pointerIdToIndex[pointerId];
        }
        break;
      case PointerOperationType.Update:
        if (idx === undefined) {
          if (lastCount > 0 && !this._multiTouchEnabled) {
            return;
          }
          let touch: Pointer;
          if (!pointerList[lastCount]) {
            touch = pointerList[lastCount] = new Pointer(pointerId, x, y, lastCount);
          } else {
            touch = pointerList[lastCount];
            touch.position.setValue(x, y);
            touch._indexInList = lastCount;
          }
          _pointerIdToIndex[pointerId] = lastCount;
          const nowCount = (this._activePointerCount = lastCount + 1);
          input.x = (input.x * lastCount + x) / nowCount;
          input.y = (input.y * lastCount + y) / nowCount;
        } else {
          const { position } = pointerList[idx];
          input.x += (x - position.x) / lastCount;
          input.y += (y - position.y) / lastCount;
          position.setValue(x, y);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Push pointerEvent into an ordered queue.
   * @param type - Pointer event type
   */
  private _pushEventList = (event: PointerEvent): void => {
    this._eventList.push(event);
  };
}

/** @internal */
enum PointerEventType {
  Down,
  Up
}

/** @internal */
enum PointerOperationType {
  Update,
  Remove
}
