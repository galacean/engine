import { Ray, Vector2 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { HitResult } from "../HitResult";
import { PhysicsManager } from "../PhysicsManager";
import { SceneManager } from "../SceneManager";
import { Script } from "../Script";
import { Input } from "./Input";
import { Pointer } from "./Pointer";

export enum EnumPointerEventType {
  PointDown = 0,
  PointUp = 1,
  PointMove = 2
}

export enum EnumPointerChangeType {
  Update = 0,
  Remove = 1
}

/**
 * Input Manager.
 */
export class InputManager {
  /** Canvas to listen for input. */
  private _canvas: HTMLCanvasElement | OffscreenCanvas;
  /** SceneManager. */
  private _sceneMgr: SceneManager;
  /** PhysicsManager. */
  private _physicsMgr: PhysicsManager;

  /** Current simulated input. */
  private _input: Input = new Input();
  /** The number of events received in the current frame monitor. */
  private _eventLen: number = 0;
  /** Event list. */
  private _eventList: EnumPointerEventType[] = [];
  /** The number of pointers currently active. */
  private _actPointerCount: number = 0;
  /** Pointer list. */
  private _pointerList: Pointer[] = [];
  /** 'PointerId' to 'index' mapping. */
  private _pointerIdToIndex: Record<number, number> = {};

  /** Temporary variables. */
  private _tempRay: Ray = new Ray();
  private _tempPoint: Vector2 = new Vector2();
  private _tempHitResult: HitResult = new HitResult();

  /** Whether to support multi-touch. */
  private _multiTouchEnabled: boolean = false;
  /** Number of scripts registered to listen. */
  private _regScriptCount: number = 0;
  /** Is it currently listening. */
  private _hadListener: boolean = false;

  /**
   * Whether to support multi-touch.
   */
  get multiTouchEnabled(): boolean {
    return this._multiTouchEnabled;
  }

  set multiTouchEnabled(enabled: boolean) {
    this._multiTouchEnabled = enabled;
  }

  /**
   * Add the script that listens the input.
   */
  on() {
    if (this._regScriptCount++ == 0) {
      this._updateListener();
    }
  }

  /**
   * Remove the script that listens for input.
   */
  off() {
    if (this._regScriptCount-- == 0) {
      this._updateListener();
    }
  }

  /**
   *	Get touch pointer.
   * 	@param	idx - Index of touch pointer
   * 	@return Touch pointer
   *  @remarks The returned Pointer should be considered deep-read-only.
   */
  getTouch(idx: number): Pointer {
    if (idx < this._actPointerCount) {
      return this._pointerList[idx];
    } else {
      return null;
    }
  }

  /**
   *	Get input.
   * 	@return Input
   *  @remarks The returned Input should be considered deep-read-only.
   */
  getInput(): Input {
    return this._input;
  }

  /**
   * Update pointer event, will be executed every frame.
   * @internal
   */
  _update() {
    const { _eventLen } = this;
    if (_eventLen > 0 || this._actPointerCount > 0) {
      const { _eventList, _input } = this;
      let prePressedEntity = _input.pressedEntity;
      if (prePressedEntity) {
        /** Pointer Drag. */
        const preScripts = prePressedEntity._scripts._elements;
        for (let i = preScripts.length - 1; i >= 0; i--) {
          preScripts[i].onPointerDrag();
        }
      }
      /** Get the entity hit by the ray. */
      /** @ts-ignore */
      const { offsetLeft = 0, offsetTop = 0, clientWidth, clientHeight } = this._canvas;
      const curEntity = this._pointerRayCast(
        (_input.pageX - offsetLeft) / clientWidth,
        (_input.pageY - offsetTop) / clientHeight
      );
      const preEnteredEntity = _input.enteredEntity;
      /** 80% of operations are on curEntity, so we cache his scripts. */
      let curEntityScripts: Script[];
      let curEntityScriptsLen = 0;
      if (curEntity) {
        curEntityScripts = curEntity._scripts._elements;
        curEntityScriptsLen = curEntityScripts.length;
      }
      // Cache curEntity's Scripts.
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
        _input.enteredEntity = curEntity;
      }
      for (let i = 0; i < _eventLen; i++) {
        switch (_eventList[i]) {
          case EnumPointerEventType.PointDown:
            if (curEntity) {
              for (let j = 0; j < curEntityScriptsLen; j++) {
                curEntityScripts[j].onPointerDown();
              }
            }
            prePressedEntity = curEntity;
            break;
          case EnumPointerEventType.PointUp:
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
          default:
            break;
        }
      }
      _input.pressedEntity = prePressedEntity;
      this._eventLen = 0;
    }
  }

  /**
   * Constructor an InputManager.
   * @param engine - The current engine instance
   */
  constructor(engine: Engine) {
    // @ts-ignore
    this._canvas = engine.canvas._webCanvas;
    this._sceneMgr = engine.sceneManager;
    this._physicsMgr = engine.physicsManager;
  }

  /**
   * Get the Entity to which the ray is cast.
   * @param posX - The X coordinate of the pointer on the screen, specified in normalized
   * @param posY - The Y coordinate of the pointer on the screen, specified in normalized
   * @returns The Entity to which the ray is cast
   */
  private _pointerRayCast(posX: number, posY: number): Entity {
    const cameras = this._sceneMgr.activeScene._activeCameras;
    for (let i = cameras.length - 1; i >= 0; i--) {
      const camera = cameras[i];
      if (!camera.enabled) {
        continue;
      }
      const { x: vpX, y: vpY, z: vpW, w: vpH } = camera.viewport;
      if (posX >= vpX && posY >= vpY && posX - vpX <= vpW && posY - vpY <= vpH) {
        const { _tempHitResult, _tempPoint } = this;
        _tempPoint.setValue((posX - vpX) / vpW, (posY - vpY) / vpH);
        // TODO: Only check which colliders have listened to the input.
        if (this._physicsMgr.raycast(camera.viewportPointToRay(_tempPoint, this._tempRay), _tempHitResult)) {
          return _tempHitResult.collider.entity;
        }
      }
    }
    return null;
  }

  /**
   * Update pointers info.
   * @param type - Pointer change type
   * @param pointerId - Pointer ID
   * @param pageX - The pageX of Pointer
   * @param pageY - The pageY of Pointer
   */
  private _changePointer(type: EnumPointerChangeType, pointerId: number, pageX: number, pageY: number) {
    const { _pointerIdToIndex, _pointerList, _actPointerCount: lastCount, _input } = this;
    let idx = _pointerIdToIndex[pointerId];
    switch (type) {
      case EnumPointerChangeType.Remove:
        if (idx === undefined) {
          return;
        } else {
          const nowCount = (this._actPointerCount = lastCount - 1);
          if (nowCount != 0) {
            const removedTouch = _pointerList[idx];
            if (idx !== lastCount) {
              _pointerList[idx] = _pointerList[lastCount];
              _pointerList[lastCount] = removedTouch;
            }
            _input.pageX = (_input.pageX * lastCount - removedTouch.pageX) / nowCount;
            _input.pageY = (_input.pageY * lastCount - removedTouch.pageY) / nowCount;
          }
          delete _pointerIdToIndex[pointerId];
        }
        break;
      case EnumPointerChangeType.Update:
        if (idx === undefined) {
          if (lastCount > 0 && !this._multiTouchEnabled) {
            return;
          }
          let touch: Pointer;
          if (!_pointerList[lastCount]) {
            touch = _pointerList[lastCount] = new Pointer(pointerId, pageX, pageY, lastCount);
          } else {
            touch = _pointerList[lastCount];
            touch.pageX = pageX;
            touch.pageY = pageY;
            touch.indexInList = lastCount;
          }
          _pointerIdToIndex[pointerId] = lastCount;
          const nowCount = (this._actPointerCount = lastCount + 1);
          _input.pageX = (_input.pageX * lastCount + pageX) / nowCount;
          _input.pageY = (_input.pageY * lastCount + pageY) / nowCount;
        } else {
          const touch = _pointerList[idx];
          _input.pageX += (pageX - touch.pageX) / lastCount;
          _input.pageY += (pageY - touch.pageY) / lastCount;
          touch.pageX = pageX;
          touch.pageY = pageY;
        }
        break;
      default:
        break;
    }
  }

  /**
   * Push event types into an ordered queue.
   * @param type - Pointer event type
   */
  private _pushEventList(type: EnumPointerEventType) {
    const { _eventList } = this;
    if (_eventList.length == this._eventLen) {
      _eventList.push(type);
    } else {
      _eventList[this._eventLen] = type;
    }
    ++this._eventLen;
  }

  /**
   * On pointer down.
   * @param evt - Pointer Event
   */
  private _onPointerDown = (evt: PointerEvent) => {
    this._changePointer(EnumPointerChangeType.Update, evt.pointerId, evt.pageX, evt.pageY);
    if (this._actPointerCount == 1) {
      this._pushEventList(EnumPointerEventType.PointDown);
    }
  };

  /**
   * On pointer up.
   */
  private _onPointerUp = () => {
    if (this._actPointerCount == 1) {
      this._pushEventList(EnumPointerEventType.PointUp);
    }
  };

  /**
   * On pointer move.
   * @param evt - Pointer Event
   */
  private _onPointerMove = (evt: PointerEvent) => {
    this._changePointer(EnumPointerChangeType.Update, evt.pointerId, evt.pageX, evt.pageY);
  };

  /**
   * On pointer cancel or out.
   * @param evt - Pointer Event
   */
  private _onPointerCancelOrOut = (evt: PointerEvent) => {
    this._changePointer(EnumPointerChangeType.Remove, evt.pointerId, evt.pageX, evt.pageY);
  };

  /**
   * Update the current listening status.
   */
  private _updateListener() {
    const { _regScriptCount, _hadListener, _canvas: canvas } = this;
    if (_regScriptCount > 0 && !_hadListener) {
      canvas.addEventListener("pointerdown", this._onPointerDown);
      canvas.addEventListener("pointerup", this._onPointerUp);
      canvas.addEventListener("pointermove", this._onPointerMove);
      canvas.addEventListener("pointercancel", this._onPointerCancelOrOut);
      canvas.addEventListener("pointerout", this._onPointerCancelOrOut);
      this._hadListener = true;
    } else if (_regScriptCount <= 0 && _hadListener) {
      canvas.removeEventListener("pointerdown", this._onPointerDown);
      canvas.removeEventListener("pointerup", this._onPointerUp);
      canvas.removeEventListener("pointermove", this._onPointerMove);
      canvas.removeEventListener("pointercancel", this._onPointerCancelOrOut);
      canvas.removeEventListener("pointerout", this._onPointerCancelOrOut);
      this._eventLen = 0;
      this._actPointerCount = 0;
      this._hadListener = false;
    }
  }
}
