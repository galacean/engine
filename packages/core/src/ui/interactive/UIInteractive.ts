import { Entity, EntityModifyFlags } from "../../Entity";
import { Script } from "../../Script";
import { ignoreClone } from "../../clone/CloneManager";
import { PointerButton, PointerEventData } from "../../input";
import { UICanvas } from "../UICanvas";
import { GroupModifyFlags, UIGroup } from "../UIGroup";
import { UIUtils } from "../UIUtils";
import { IGroupElement } from "../interface/IGroupElement";
import { InteractiveStatus } from "./InteractiveStatus";
import { Transition } from "./transition/Transition";

export class UIInteractive extends Script implements IGroupElement {
  /** @internal */
  @ignoreClone
  _rootCanvas: UICanvas;
  /** @internal */
  @ignoreClone
  _indexInCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _parents: Entity[] = [];
  /** @internal */
  @ignoreClone
  _group: UIGroup;
  /** @internal */
  @ignoreClone
  _indexInGroup: number = -1;

  protected _interactive: boolean = true;
  protected _runtimeInteractive: boolean = false;
  protected _status: InteractiveStatus = InteractiveStatus.Normal;
  protected _transitions: Transition[] = [];

  private _isPointerDown: boolean = false;
  private _isPointerInside: boolean = false;

  get interactive() {
    return this._interactive;
  }

  set interactive(value: boolean) {
    if (this._interactive !== value) {
      this._interactive = value;
      const runtimeInteractive = value && this._group?._getGlobalInteractive();
      if (this._runtimeInteractive !== runtimeInteractive) {
        this._runtimeInteractive = runtimeInteractive;
        this._updateStatus(true);
      }
    }
  }

  getTransition<T extends Transition>(type: new () => T): T | null {
    const transitions = this._transitions;
    for (let i = 0, n = transitions.length; i < n; i++) {
      const transition = transitions[i];
      if (transition instanceof type) {
        return transition;
      }
    }
    return null;
  }

  addTransition<T extends new () => Transition>(type: T): InstanceType<T> {
    const transition = new type() as InstanceType<T>;
    this._transitions.push(transition);
    return transition;
  }

  removeTransition<T extends Transition>(type: new () => T): void {
    const transitions = this._transitions;
    for (let i = transitions.length - 1; i >= 0; i--) {
      const transition = transitions[i];
      if (transition instanceof type) {
        transitions.splice(i, 1);
      }
    }
  }

  override onUpdate(deltaTime: number): void {
    this._interactive && this._transitions.forEach((transition) => transition._onUpdate(deltaTime));
  }

  override onPointerDown(event: PointerEventData): void {
    if (event.pointer.button === PointerButton.Primary) {
      this._isPointerDown = true;
      this._updateStatus(false);
    }
  }

  override onPointerUp(event: PointerEventData): void {
    if (event.pointer.button === PointerButton.Primary) {
      this._isPointerDown = false;
      this._updateStatus(false);
    }
  }

  override onPointerEnter(event: PointerEventData): void {
    this._isPointerInside = true;
    this._updateStatus(false);
  }

  override onPointerExit(): void {
    this._isPointerInside = false;
    this._updateStatus(false);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    super._onEnableInScene();
    UIUtils.registerElementToGroup(this, UIUtils.getGroupInParents(this._entity));
    UIUtils.registerEntityListener(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    super._onDisableInScene();
    UIUtils.registerElementToGroup(this, null);
    UIUtils.unRegisterEntityListener(this);
  }

  /**
   * @internal
   */
  @ignoreClone
  _onEntityModify(flag: EntityModifyFlags): void {
    switch (flag) {
      case EntityModifyFlags.UICanvasEnableInScene:
      case EntityModifyFlags.Parent:
        UIUtils.registerElementToCanvas(this, UIUtils.getRootCanvasInParent(this._entity));
        UIUtils.registerEntityListener(this);
      case EntityModifyFlags.UIGroupEnableInScene:
        UIUtils.registerElementToGroup(this, UIUtils.getGroupInParents(this._entity));
        break;
      default:
        break;
    }
  }

  /**
   * @internal
   */
  _onGroupModify(flag: GroupModifyFlags): void {
    if (flag & GroupModifyFlags.Interactive) {
      const runtimeInteractive = this._interactive && this._group._getGlobalInteractive();
      if (this._runtimeInteractive !== runtimeInteractive) {
        this._runtimeInteractive = runtimeInteractive;
        this._updateStatus(true);
      }
    }
  }

  private _updateStatus(instant: boolean): void {
    const state = this._getInteractiveStatus();
    if (this._status !== state) {
      this._status = state;
      const transitions = this._transitions;
      for (let i = 0, n = transitions.length; i < n; i++) {
        transitions[i]._setStatus(state, instant);
      }
    }
  }

  private _getInteractiveStatus(): InteractiveStatus {
    if (!this._runtimeInteractive) {
      return InteractiveStatus.Disable;
    }
    if (this._isPointerDown) {
      return InteractiveStatus.Pressed;
    }
    if (this._isPointerInside) {
      return InteractiveStatus.Hover;
    }
    return InteractiveStatus.Normal;
  }
}
