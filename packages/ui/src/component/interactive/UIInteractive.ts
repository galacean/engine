import { Entity, EntityModifyFlags, PointerEventData, Script, ignoreClone } from "@galacean/engine";
import { UIGroup } from "../..";
import { Utils } from "../../Utils";
import { IGroupAble } from "../../interface/IGroupAble";
import { EntityUIModifyFlags, UICanvas } from "../UICanvas";
import { GroupModifyFlags } from "../UIGroup";
import { Transition } from "./transition/Transition";

export class UIInteractive extends Script implements IGroupAble {
  /** @internal */
  @ignoreClone
  _canvas: UICanvas;
  /** @internal */
  @ignoreClone
  _indexInCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _group: UIGroup;
  /** @internal */
  @ignoreClone
  _indexInGroup: number = -1;
  /** @internal */
  @ignoreClone
  _canvasListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _groupListeningEntities: Entity[] = [];
  /**@internal */
  @ignoreClone
  _onUIUpdateIndex: number = 0;
  /**@internal */
  @ignoreClone
  _groupDirtyFlags: number = 0;
  /** @internal */
  @ignoreClone
  _isGroupDirty: boolean = false;
  /** @internal */
  @ignoreClone
  _isCanvasDirty: boolean = false;
  /** @internal */
  @ignoreClone
  _globalInteractive: boolean = false;

  protected _interactive: boolean = true;
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
      const globalInteractive = value && this._group?.globalInteractive;
      if (this._globalInteractive !== globalInteractive) {
        this._globalInteractive = globalInteractive;
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
    Utils._onCanvasChange(this);
    Utils._onGroupChange(this);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    // @ts-ignore
    super._onDisableInScene();
    // @ts-ignore
    this.scene._componentsManager.removeOnUpdateUIElement(this);
    Utils.unRegisterCanvasListener(this);
    Utils.unRegisterGroupListener(this);
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
    if (this._groupDirtyFlags & GroupModifyFlags.GlobalInteractive) {
      const group = Utils._getGroup(this);
      this._globalInteractive = this._interactive && (!group || group.globalInteractive);
      this._groupDirtyFlags &= ~GroupModifyFlags.GlobalInteractive;
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _groupListener(flag: number): void {
    if (this._isGroupDirty) return;
    if (flag === EntityModifyFlags.Parent || flag === EntityUIModifyFlags.UIGroupEnableInScene) {
      Utils._onGroupChange(this);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _canvasListener(flag: number): void {
    if (this._isCanvasDirty) return;
    if (flag === EntityModifyFlags.Parent) {
      Utils._onCanvasChange(this);
      Utils._onGroupChange(this);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _onGroupModify(flags: GroupModifyFlags): void {
    this._groupDirtyFlags |= flags;
  }

  private _updateState(instant: boolean): void {
    const state = this._getInteractiveState();
    if (this._state !== state) {
      this._state = state;
      this._transitions.forEach((transition) => transition._setState(state, instant));
    }
  }

  private _getInteractiveState(): InteractiveState {
    if (!this._globalInteractive) {
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
