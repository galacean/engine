import { Entity, EntityModifyFlags, PointerEventData, Script, ignoreClone } from "@galacean/engine";
import { UIGroup } from "../..";
import { Utils } from "../../Utils";
import { IGroupAble } from "../../interface/IGroupAble";
import { EntityUIModifyFlags, UICanvas } from "../UICanvas";
import { GroupModifyFlags } from "../UIGroup";
import { UIElementDirtyFlag } from "../UIRenderer";
import { Transition } from "./transition/Transition";

export class UIInteractive extends Script implements IGroupAble {
  /** @internal */
  @ignoreClone
  _rootCanvas: UICanvas;
  /** @internal */
  @ignoreClone
  _indexInRootCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _group: UIGroup;
  /** @internal */
  @ignoreClone
  _indexInGroup: number = -1;
  /** @internal */
  @ignoreClone
  _elementDirty: number = UIElementDirtyFlag.None;
  /** @internal */
  @ignoreClone
  _canvasListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _groupListeningEntities: Entity[] = [];
  /**@internal */
  @ignoreClone
  _onUIUpdateIndex: number = 0;

  protected _interactive: boolean = true;
  protected _runtimeInteractive: boolean = false;
  protected _state: InteractiveState = InteractiveState.Normal;
  protected _transitions: Transition[] = [];

  private _isPointerInside: boolean = false;
  private _isPointerDragging: boolean = false;

  get interactive() {
    return this._interactive;
  }

  set interactive(value: boolean) {
    if (this._interactive !== value) {
      this._interactive = value;
      const runtimeInteractive = value && this._group?.globalInteractive;
      if (this._runtimeInteractive !== runtimeInteractive) {
        this._runtimeInteractive = runtimeInteractive;
        this._updateState(true);
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
    transition._setState(this._state, true);
    return transition;
  }

  removeTransition<T extends Transition>(type: new () => T): void {
    const transitions = this._transitions;
    for (let i = transitions.length - 1; i >= 0; i--) {
      const transition = transitions[i];
      if (transition instanceof type) {
        transitions.splice(i, 1);
        transition._destroy();
      }
    }
  }

  override onUpdate(deltaTime: number): void {
    this._interactive && this._transitions.forEach((transition) => transition._onUpdate(deltaTime));
  }

  override onPointerBeginDrag(event: PointerEventData): void {
    this._isPointerDragging = true;
    this._updateState(false);
  }

  override onPointerEndDrag(event: PointerEventData): void {
    this._isPointerDragging = false;
    this._updateState(false);
  }

  override onPointerEnter(): void {
    this._isPointerInside = true;
    this._updateState(false);
  }

  override onPointerExit(): void {
    this._isPointerInside = false;
    this._updateState(false);
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    // @ts-ignore
    super._onEnableInScene();
    // @ts-ignore
    this.scene._componentsManager.addOnUpdateUIElement(this);
    Utils.setDirtyFlagTrue(this, UIElementDirtyFlag.Canvas | UIElementDirtyFlag.Group);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    // @ts-ignore
    super._onDisableInScene();
    // @ts-ignore
    this.scene._componentsManager.removeOnUpdateUIElement(this);
    Utils.registerElementToCanvas(this, null);
    Utils.unRegisterListener(this._canvasListeningEntities, this._canvasListener);
    Utils.registerElementToGroup(this, null);
    Utils.unRegisterListener(this._groupListeningEntities, this._groupListener);
    this._isPointerInside = this._isPointerDragging = false;
  }

  override onDestroy(): void {
    super.onDestroy();
    const transitions = this._transitions;
    transitions.forEach((transition) => transition._destroy());
    transitions.length = 0;
  }

  /**
   * @internal
   */
  _onUpdate(): void {
    if (Utils.isContainDirtyFlag(this, UIElementDirtyFlag.Canvas)) {
      Utils.registerElementToCanvas(this, Utils.getRootCanvasInParents(this.entity), true);
      Utils.setDirtyFlagFalse(this, UIElementDirtyFlag.Canvas);
    }
    if (Utils.isContainDirtyFlag(this, UIElementDirtyFlag.Group)) {
      if (this._rootCanvas) {
        Utils.registerElementToGroup(this, Utils.getGroupInParents(this.entity), true);
      } else {
        Utils.unRegisterListener(this._groupListeningEntities, this._groupListener);
      }
      Utils.setDirtyFlagFalse(this, UIElementDirtyFlag.Group);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _groupListener(flag: number): void {
    if (Utils.isContainDirtyFlag(this, UIElementDirtyFlag.Group)) return;
    if (flag === EntityModifyFlags.Parent || flag === EntityUIModifyFlags.UIGroupEnableInScene) {
      Utils.registerElementToGroup(this, null);
      Utils.setDirtyFlagTrue(this, UIElementDirtyFlag.Group);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _canvasListener(flag: number): void {
    if (Utils.isContainDirtyFlag(this, UIElementDirtyFlag.Canvas)) return;
    if (flag === EntityModifyFlags.Parent) {
      Utils.registerElementToCanvas(this, null);
      Utils.registerElementToGroup(this, null);
      Utils.setDirtyFlagTrue(this, UIElementDirtyFlag.Canvas | UIElementDirtyFlag.Group);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _onGroupModify(flag: GroupModifyFlags): void {
    if (flag & GroupModifyFlags.Interactive) {
      const runtimeInteractive = this._interactive && (this._group?._getGlobalInteractive() || true);
      if (this._runtimeInteractive !== runtimeInteractive) {
        this._runtimeInteractive = runtimeInteractive;
        this._updateState(true);
      }
    }
  }

  private _updateState(instant: boolean): void {
    const state = this._getInteractiveState();
    if (this._state !== state) {
      this._state = state;
      this._transitions.forEach((transition) => transition._setState(state, instant));
    }
  }

  private _getInteractiveState(): InteractiveState {
    if (!this._runtimeInteractive) {
      return InteractiveState.Disable;
    }
    if (this._isPointerDragging) {
      return InteractiveState.Pressed;
    } else {
      return this._isPointerInside ? InteractiveState.Hover : InteractiveState.Normal;
    }
  }
}

export enum InteractiveState {
  Normal,
  Pressed,
  Hover,
  Disable
}
