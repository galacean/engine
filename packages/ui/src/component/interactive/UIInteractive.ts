import { Entity, EntityModifyFlags, Script, ignoreClone } from "@galacean/engine";
import { UIGroup } from "../..";
import { Utils } from "../../Utils";
import { IGroupAble } from "../../interface/IGroupAble";
import { EntityUIModifyFlags, UICanvas } from "../UICanvas";
import { GroupModifyFlags } from "../UIGroup";
import { Transition } from "./transition/Transition";

/**
 * Interactive component.
 */
export class UIInteractive extends Script implements IGroupAble {
  /** @internal */
  @ignoreClone
  _rootCanvas: UICanvas;
  /** @internal */
  @ignoreClone
  _indexInRootCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _isRootCanvasDirty: boolean = false;
  /** @internal */
  @ignoreClone
  _rootCanvasListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _group: UIGroup;
  /** @internal */
  @ignoreClone
  _indexInGroup: number = -1;
  /** @internal */
  @ignoreClone
  _isGroupDirty: boolean = false;
  /** @internal */
  @ignoreClone
  _groupListeningEntities: Entity[] = [];

  /** @internal */
  @ignoreClone
  _globalInteractive: boolean = false;
  /** @internal */
  @ignoreClone
  _globalInteractiveDirty: boolean = false;

  protected _interactive: boolean = true;
  protected _state: InteractiveState = InteractiveState.Normal;
  protected _transitions: Transition[] = [];

  /** @todo Multi-touch points are not considered yet. */
  private _isPointerInside: boolean = false;
  private _isPointerDragging: boolean = false;

  /**
   * Whether the interactive is enabled.
   */
  get interactive() {
    return this._interactive;
  }

  set interactive(value: boolean) {
    if (this._interactive !== value) {
      this._interactive = value;
      this._globalInteractiveDirty = true;
    }
  }

  /**
   * Whether the interactive is enabled globally.
   * @remarks The global interactive is determined by the interactive of itself and its group.
   */
  get globalInteractive(): boolean {
    this._updateGlobalInteractive();
    return this._globalInteractive;
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._groupListener = this._groupListener.bind(this);
    this._rootCanvasListener = this._rootCanvasListener.bind(this);
  }

  /**
   * Get transition which match the type.
   * @param type - The type of the transition
   * @returns	Transitions which match type
   */
  getTransitions<T extends Transition>(type: new (interactive: UIInteractive) => T, results: T[]): T[] {
    results.length = 0;
    const transitions = this._transitions;
    for (let i = 0, n = transitions.length; i < n; i++) {
      const transition = transitions[i];
      if (transition instanceof type) {
        results.push(transition);
      }
    }
    return results;
  }

  /**
   * Get transition which match the type.
   * @param type - The type of the transition
   * @returns	The first transition which match type
   */
  getTransition<T extends Transition>(type: new (interactive: UIInteractive) => T): T | null {
    const transitions = this._transitions;
    for (let i = 0, n = transitions.length; i < n; i++) {
      const transition = transitions[i];
      if (transition instanceof type) {
        return transition;
      }
    }
    return null;
  }

  /**
   * Add transition based on the transition type.
   * @param type - The type of the transition
   * @returns	The transition which has been added
   */
  addTransition<T extends new (interactive: UIInteractive) => Transition>(type: T): InstanceType<T> {
    const transition = new type(this) as InstanceType<T>;
    this._transitions.push(transition);
    transition._setState(this._state, true);
    return transition;
  }

  override onUpdate(deltaTime: number): void {
    if (this.globalInteractive) {
      const transitions = this._transitions;
      for (let i = 0, n = transitions.length; i < n; i++) {
        transitions[i]._onUpdate(deltaTime);
      }
    }
  }

  override onPointerBeginDrag(): void {
    this._isPointerDragging = true;
    this._updateState(false);
  }

  override onPointerEndDrag(): void {
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

  override onDestroy(): void {
    super.onDestroy();
    const transitions = this._transitions;
    for (let i = 0, n = transitions.length; i < n; i++) {
      transitions[i].destroy();
    }
  }

  /**
   * @internal
   */
  _getRootCanvas(): UICanvas {
    this._isRootCanvasDirty && Utils.setRootCanvas(this, Utils.searchRootCanvasInParents(this));
    return this._rootCanvas;
  }

  /**
   * @internal
   */
  _getGroup(): UIGroup {
    this._isGroupDirty && Utils.setGroup(this, Utils.searchGroupInParents(this));
    return this._group;
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    // @ts-ignore
    super._onEnableInScene();
    Utils.setRootCanvasDirty(this);
    Utils.setGroupDirty(this);
    this._updateState(true);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    // @ts-ignore
    super._onDisableInScene();
    Utils.cleanRootCanvas(this);
    Utils.cleanGroup(this);
    this._isPointerInside = this._isPointerDragging = false;
  }

  /**
   * @internal
   */
  _removeTransition(transition: Transition): void {
    const transitions = this._transitions;
    const lastOneIndex = transitions.length - 1;
    for (let i = lastOneIndex; i >= 0; i--) {
      if (transitions[i] === transition) {
        i !== lastOneIndex && (transitions[i] = transitions[lastOneIndex]);
        transitions.length = lastOneIndex;
        break;
      }
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _groupListener(flag: number): void {
    if (this._isGroupDirty) return;
    if (flag === EntityModifyFlags.Parent || flag === EntityUIModifyFlags.GroupEnableInScene) {
      Utils.setGroupDirty(this);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _rootCanvasListener(flag: number): void {
    if (this._isRootCanvasDirty) return;
    if (flag === EntityModifyFlags.Parent || flag === EntityUIModifyFlags.CanvasEnableInScene) {
      Utils.setRootCanvasDirty(this);
      Utils.setGroupDirty(this);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _onGroupModify(flags: GroupModifyFlags): void {
    if (flags & GroupModifyFlags.GlobalInteractive) {
      this._globalInteractiveDirty = true;
    }
  }

  private _updateGlobalInteractive(): void {
    if (this._globalInteractiveDirty) {
      const group = this._getGroup();
      const globalInteractive = this._interactive && (!group || group.globalInteractive);
      if (this._globalInteractive !== globalInteractive) {
        this._globalInteractive = globalInteractive;
        this._updateState(true);
      }
      this._globalInteractiveDirty = false;
    }
  }

  private _updateState(instant: boolean): void {
    const state = this._getInteractiveState();
    if (this._state !== state) {
      this._state = state;
      const transitions = this._transitions;
      for (let i = 0, n = transitions.length; i < n; i++) {
        transitions[i]._setState(state, instant);
      }
    }
  }

  private _getInteractiveState(): InteractiveState {
    if (!this.globalInteractive) {
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
