import {
  Component,
  ComponentType,
  DisorderedArray,
  Entity,
  EntityModifyFlags,
  assignmentClone,
  ignoreClone
} from "@galacean/engine";
import { Utils } from "../Utils";
import { IGroupAble } from "../interface/IGroupAble";
import { EntityUIModifyFlags, UICanvas } from "./UICanvas";

export class UIGroup extends Component implements IGroupAble {
  /** @internal */
  @ignoreClone
  _indexInGroup: number = -1;
  /** @internal */
  @ignoreClone
  _indexInCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _group: UIGroup;
  /** @internal */
  @ignoreClone
  _canvas: UICanvas;
  /** @internal */
  @ignoreClone
  _disorderedElements: DisorderedArray<IGroupAble> = new DisorderedArray();

  /** @internal */
  @ignoreClone
  _globalAlpha = 1;
  /** @internal */
  _globalInteractive = true;

  @assignmentClone
  private _alpha = 1;
  @assignmentClone
  private _interactive = true;
  @assignmentClone
  private _ignoreParentGroup = false;
  @ignoreClone
  private _entityListeners: Entity[] = [];

  /** @internal */
  @ignoreClone
  _canvasListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _groupListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _isCanvasDirty: boolean = true;
  /** @internal */
  @ignoreClone
  _isGroupDirty: boolean = true;
  /** @internal */
  @ignoreClone
  _groupDirtyFlags: number = GroupModifyFlags.None;

  constructor(entity: Entity) {
    super(entity);
    // @ts-ignore
    this._componentType = ComponentType.UIGroup;
    this._canvasListener = this._canvasListener.bind(this);
    this._groupListener = this._groupListener.bind(this);
  }

  get ignoreParentGroup(): boolean {
    return this._ignoreParentGroup;
  }

  set ignoreParentGroup(val: boolean) {
    if (this._ignoreParentGroup !== val) {
      this._ignoreParentGroup = val;
      this._onGroupModify(GroupModifyFlags.All);
    }
  }

  get interactive(): boolean {
    return this._interactive;
  }

  set interactive(val: boolean) {
    if (this._interactive !== val) {
      this._interactive = val;
      this._onGroupModify(GroupModifyFlags.GlobalInteractive);
    }
  }

  get alpha(): number {
    return this._alpha;
  }

  set alpha(val: number) {
    val = Math.max(0, Math.min(val, 1));
    if (this._alpha !== val) {
      this._alpha = val;
      this._onGroupModify(GroupModifyFlags.GlobalAlpha);
    }
  }

  get globalAlpha(): number {
    if (this._isContainDirtyFlag(GroupModifyFlags.GlobalAlpha)) {
      const parentGroup = Utils._getGroup(this);
      this._globalAlpha = this._alpha * (parentGroup ? parentGroup.globalAlpha : 1);
      this._setDirtyFlagFalse(GroupModifyFlags.GlobalAlpha);
    }
    return this._globalAlpha;
  }

  get globalInteractive(): boolean {
    if (this._isContainDirtyFlag(GroupModifyFlags.GlobalInteractive)) {
      const parentGroup = Utils._getGroup(this);
      this._globalInteractive = this._interactive && (!parentGroup || parentGroup.globalInteractive);
      this._setDirtyFlagFalse(GroupModifyFlags.GlobalInteractive);
    }
    return this._globalInteractive;
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    Utils._onCanvasChange(this);
    Utils._onGroupChange(this);
    // @ts-ignore
    this.entity._dispatchModify(EntityUIModifyFlags.UIGroupEnableInScene);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    Utils.unRegisterCanvasListener(this);
    Utils.unRegisterGroupListener(this);
    const disorderedElements = this._disorderedElements;
    disorderedElements.forEach((element: IGroupAble) => {
      Utils._onGroupChange(element);
    });
    disorderedElements.length = 0;
    disorderedElements.garbageCollection();
    // @ts-ignore
    this.entity._dispatchModify(EntityUIModifyFlags.UIGroupDisableInScene);
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
  _onGroupModify(flags: GroupModifyFlags): void {
    if (!this._isContainDirtyFlags(flags)) {
      this._setDirtyFlagTrue(flags);
      this._disorderedElements.forEach((element) => {
        element._onGroupModify(flags);
      });
    }
  }

  private _isContainDirtyFlags(targetDirtyFlags: number): boolean {
    return (this._groupDirtyFlags & targetDirtyFlags) === targetDirtyFlags;
  }

  private _isContainDirtyFlag(type: number): boolean {
    return (this._groupDirtyFlags & type) != 0;
  }

  private _setDirtyFlagTrue(type: number) {
    this._groupDirtyFlags |= type;
  }

  private _setDirtyFlagFalse(type: number) {
    this._groupDirtyFlags &= ~type;
  }
}

export enum GroupModifyFlags {
  None = 0x0,
  GlobalAlpha = 0x1,
  GlobalInteractive = 0x2,
  All = 0x3
}
