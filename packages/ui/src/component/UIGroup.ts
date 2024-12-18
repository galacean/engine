import { Component, DisorderedArray, Entity, EntityModifyFlags, assignmentClone, ignoreClone } from "@galacean/engine";
import { Utils } from "../Utils";
import { IGroupAble } from "../interface/IGroupAble";
import { EntityUIModifyFlags, UICanvas } from "./UICanvas";

export class UIGroup extends Component implements IGroupAble {
  /** @internal */
  @ignoreClone
  _indexInGroup: number = -1;
  /** @internal */
  @ignoreClone
  _indexInRootCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _group: UIGroup;
  /** @internal */
  @ignoreClone
  _rootCanvas: UICanvas;
  /** @internal */
  @ignoreClone
  _disorderedElements: DisorderedArray<IGroupAble> = new DisorderedArray<IGroupAble>();

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

  /** @internal */
  @ignoreClone
  _rootCanvasListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _groupListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _isRootCanvasDirty: boolean = true;
  /** @internal */
  @ignoreClone
  _isGroupDirty: boolean = true;
  /** @internal */
  @ignoreClone
  _groupDirtyFlags: number = GroupModifyFlags.None;

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
      if (this._ignoreParentGroup) {
        this._globalAlpha = this._alpha;
      } else {
        const parentGroup = this._getGroup();
        this._globalAlpha = this._alpha * (parentGroup ? parentGroup.globalAlpha : 1);
      }
      this._setDirtyFlagFalse(GroupModifyFlags.GlobalAlpha);
    }
    return this._globalAlpha;
  }

  get globalInteractive(): boolean {
    if (this._isContainDirtyFlag(GroupModifyFlags.GlobalInteractive)) {
      if (this._ignoreParentGroup) {
        this._globalInteractive = this._interactive;
      } else {
        const parentGroup = this._getGroup();
        this._globalInteractive = this._interactive && (!parentGroup || parentGroup.globalInteractive);
      }
      this._setDirtyFlagFalse(GroupModifyFlags.GlobalInteractive);
    }
    return this._globalInteractive;
  }

  constructor(entity: Entity) {
    super(entity);
    this._rootCanvasListener = this._rootCanvasListener.bind(this);
    this._groupListener = this._groupListener.bind(this);
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    Utils.rootCanvasDirty(this);
    Utils.groupDirty(this);
    // @ts-ignore
    this.entity._dispatchModify(EntityUIModifyFlags.GroupEnableInScene);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    Utils.cancelRootCanvasLink(this);
    Utils.cancelGroupLink(this);
    const disorderedElements = this._disorderedElements;
    disorderedElements.forEach((element: IGroupAble) => {
      Utils.groupDirty(element);
    });
    disorderedElements.length = 0;
    disorderedElements.garbageCollection();
    this._isRootCanvasDirty = this._isGroupDirty = false;
  }

  /**
   * @internal
   */
  _getRootCanvas(): UICanvas {
    if (this._isRootCanvasDirty) {
      Utils.linkToRootCanvas(this, Utils.searchRootCanvasInParents(this));
      this._isRootCanvasDirty = false;
      Utils.updateRootCanvasListener(this);
    }
    return this._rootCanvas;
  }

  /**
   * @internal
   */
  _getGroup(): UIGroup {
    if (this._isGroupDirty) {
      Utils.linkToGroup(this, Utils.searchGroupInParents(this));
      this._isGroupDirty = false;
      this._onGroupModify(GroupModifyFlags.All);
      Utils.updateGroupListener(this);
    }
    return this._group;
  }

  /**
   * @internal
   */
  @ignoreClone
  _groupListener(flag: number): void {
    if (this._isGroupDirty) return;
    if (flag === EntityModifyFlags.Parent || flag === EntityUIModifyFlags.GroupEnableInScene) {
      Utils.groupDirty(this);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _rootCanvasListener(flag: number): void {
    if (this._isRootCanvasDirty) return;
    if (flag === EntityModifyFlags.Parent || flag === EntityUIModifyFlags.CanvasEnableInScene) {
      Utils.rootCanvasDirty(this);
      Utils.groupDirty(this);
    }
  }

  /**
   * @internal
   */
  _onGroupModify(flags: GroupModifyFlags, isPass: boolean = false): void {
    if (isPass && this._ignoreParentGroup) return;
    if (this._isContainDirtyFlags(flags)) return;
    this._setDirtyFlagTrue(flags);
    this._disorderedElements.forEach((element) => {
      element._onGroupModify(flags, true);
    });
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
