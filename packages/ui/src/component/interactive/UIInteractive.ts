import { Entity, EntityModifyFlags, Script, ignoreClone } from "@galacean/engine";
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
  /** @internal */
  @ignoreClone
  _isGroupDirty: boolean = false;
  /** @internal */
  @ignoreClone
  _isCanvasDirty: boolean = false;
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

  get interactive() {
    return this._interactive;
  }

  set interactive(value: boolean) {
    if (this._interactive !== value) {
      this._interactive = value;
      this._globalInteractiveDirty = true;
    }
  }

  get globalInteractive(): boolean {
    this._updateGlobalInteractive();
    return this._globalInteractive;
  }

  /**
   * @internal
   */
  get canvas(): UICanvas {
    if (this._isCanvasDirty) {
      const curCanvas = Utils.getCanvasInParents(this.entity);
      Utils._registerElementToCanvas(this, this._canvas, curCanvas);
      Utils._registerElementToCanvasListener(this, curCanvas);
      this._isCanvasDirty = false;
    }
    return this._canvas;
  }

  /**
   * @internal
   */
  get group(): UIGroup {
    if (this._isGroupDirty) {
      const canvas = this.canvas;
      const group = canvas ? Utils.getGroupInParents(this.entity, canvas.entity) : null;
      Utils._registerElementToGroup(this, this._group, group);
      Utils._registerElementToGroupListener(this, canvas);
      this._isGroupDirty = false;
    }
    return this._group;
  }

  constructor(entity: Entity) {
    super(entity);
    this._groupListener = this._groupListener.bind(this);
    this._canvasListener = this._canvasListener.bind(this);
  }

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

  addTransition<T extends new (interactive: UIInteractive) => Transition>(type: T): InstanceType<T> {
    const transition = new type(this) as InstanceType<T>;
    this._transitions.push(transition);
    transition._setState(this._state, true);
    return transition;
  }

  override onUpdate(deltaTime: number): void {
    this.globalInteractive && this._transitions.forEach((transition) => transition._onUpdate(deltaTime));
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
    this._transitions.forEach((transition) => transition.destroy());
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    // @ts-ignore
    super._onEnableInScene();
    Utils._onCanvasDirty(this, this._canvas);
    Utils._onGroupDirty(this, this._group);
    this._updateState(true);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    // @ts-ignore
    super._onDisableInScene();
    Utils._unRegisterListener(this._canvasListener, this._canvasListeningEntities);
    Utils._unRegisterListener(this._groupListener, this._groupListeningEntities);
    this._isPointerInside = this._isPointerDragging = false;
    this._isCanvasDirty = this._isGroupDirty = false;
  }

  /**
   * @internal
   */
  _removeTransition(transition: Transition): void {
    const transitions = this._transitions;
    for (let i = transitions.length - 1; i >= 0; i--) {
      if (transitions[i] === transition) {
        transitions.splice(i, 1);
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
      Utils._onGroupDirty(this, this._group);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _canvasListener(flag: number): void {
    if (this._isCanvasDirty) return;
    if (flag === EntityModifyFlags.Parent || flag === EntityUIModifyFlags.CanvasEnableInScene) {
      Utils._onCanvasDirty(this, this._canvas);
      Utils._onGroupDirty(this, this._group);
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
      const group = this.group;
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
      this._transitions.forEach((transition) => transition._setState(state, instant));
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
