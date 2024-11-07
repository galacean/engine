import {
  Component,
  ComponentType,
  DisorderedArray,
  Entity,
  EntityModifyFlags,
  assignmentClone,
  ignoreClone
} from "@galacean/engine";
import { EntityUIModifyFlags } from "./UICanvas";
import { Utils } from "./Utils";
import { IUIGroupable } from "./interface/IUIGroupable";

export class UIGroup extends Component {
  /** @internal */
  @ignoreClone
  _parentGroup: UIGroup;
  /** @internal */
  @ignoreClone
  _groupIndex: number = -1;
  /** @internal */
  @ignoreClone
  _disorderedGroups: DisorderedArray<UIGroup> = new DisorderedArray();
  /** @internal */
  @ignoreClone
  _disorderedElements: DisorderedArray<IUIGroupable> = new DisorderedArray();

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

  constructor(entity: Entity) {
    super(entity);
    // @ts-ignore
    this._componentType = ComponentType.UIGroup;
  }

  get ignoreParentGroup(): boolean {
    return this._ignoreParentGroup;
  }

  set ignoreParentGroup(val: boolean) {
    if (this._ignoreParentGroup !== val) {
      this._ignoreParentGroup = val;
      this._updateGlobalModify(GroupModifyFlags.All);
    }
  }

  get interactive(): boolean {
    return this._interactive;
  }

  set interactive(val: boolean) {
    if (this._interactive !== val) {
      this._interactive = val;
      this._updateGlobalModify(GroupModifyFlags.Interactive);
    }
  }

  get alpha(): number {
    return this._alpha;
  }

  set alpha(val: number) {
    val = Math.max(0, Math.min(val, 1));
    if (this._alpha !== val) {
      this._alpha = val;
      this._updateGlobalModify(GroupModifyFlags.Alpha);
    }
  }

  _getGlobalInteractive(): boolean {
    return this._globalInteractive;
  }

  get globalAlpha(): number {
    return this._globalAlpha;
  }

  get globalInteractive(): boolean {
    return this._globalInteractive;
  }

  /**
   * @internal
   */
  _updateGlobalModify(flags: GroupModifyFlags): void {
    let passDownFlags = GroupModifyFlags.None;
    const parentGroup = this._parentGroup;
    if (flags & GroupModifyFlags.Alpha) {
      const alpha = this._alpha * (!this._ignoreParentGroup && parentGroup ? parentGroup._globalAlpha : 1);
      if (this._globalAlpha !== alpha) {
        this._globalAlpha = alpha;
        passDownFlags |= GroupModifyFlags.Alpha;
      }
    }
    if (flags & GroupModifyFlags.Interactive) {
      const interactive =
        this._interactive && (!this._ignoreParentGroup && parentGroup ? parentGroup.globalInteractive : true);
      if (this._globalInteractive !== interactive) {
        this._globalInteractive = interactive;
        passDownFlags |= GroupModifyFlags.Interactive;
      }
    }
    if (!!flags) {
      this._disorderedElements.forEach((element) => {
        element._onGroupModify(passDownFlags);
      });
    }
    if (!!passDownFlags) {
      this._disorderedGroups.forEach((element) => {
        element._updateGlobalModify(passDownFlags);
      });
    }
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    const entity = this.entity;
    // @ts-ignore
    entity._dispatchModify(EntityUIModifyFlags.UIGroupEnableInScene);
    this._registryToParentGroup(Utils.getGroupInParents(entity.parent));
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    const entityListeners = this._entityListeners;
    for (let i = 0, n = entityListeners.length; i < n; i++) {
      // @ts-ignore
      entityListeners[i]._unRegisterModifyListener(this._onEntityModify);
    }
    entityListeners.length = 0;
    const parentGroup = this._parentGroup;
    const disorderedElements = this._disorderedElements;
    disorderedElements.forEach((element) => {
      Utils.registerElementToGroup(element, parentGroup);
    });
    disorderedElements.length = 0;
    disorderedElements.garbageCollection();
    const disorderedGroups = this._disorderedGroups;
    disorderedGroups.forEach((element: UIGroup) => {
      element._registryToParentGroup(parentGroup);
    });
    disorderedGroups.length = 0;
    disorderedGroups.garbageCollection();
    this._parentGroup = null;
    // @ts-ignore
    this.entity._dispatchModify(EntityUIModifyFlags.UIGroupDisableInScene);
  }

  private _registryToParentGroup(parentGroup: UIGroup): void {
    let entity = this.entity;
    const preParentGroup = this._parentGroup;
    if (parentGroup !== preParentGroup) {
      this._parentGroup = parentGroup;
      if (preParentGroup) {
        const replaced = preParentGroup._disorderedGroups.deleteByIndex(this._groupIndex);
        replaced && (replaced._groupIndex = this._groupIndex);
        this._groupIndex = -1;
      }
      if (parentGroup) {
        const disorderedGroups = parentGroup._disorderedGroups;
        this._groupIndex = disorderedGroups.length;
        disorderedGroups.add(this);
      }
      this._updateGlobalModify(GroupModifyFlags.All);
    }
    let index = 0;
    const parentGroupEntity = parentGroup?.entity;
    const entityListeners = this._entityListeners;
    while (entity && entity !== parentGroupEntity) {
      const preListener = entityListeners[index];
      if (preListener !== entity) {
        // @ts-ignore
        preListener?._unRegisterModifyListener(this._onEntityModify);
        entityListeners[index] = entity;
        // @ts-ignore
        entity._registerModifyListener(this._onEntityModify);
      }
      entity = entity.parent;
      index++;
    }
    entityListeners.length = index;
  }

  private _onEntityModify(flags: number): void {
    if (flags === EntityModifyFlags.Parent || flags === EntityUIModifyFlags.UIGroupEnableInScene) {
      this._registryToParentGroup(Utils.getGroupInParents(this.entity.parent));
    }
  }
}

export enum GroupModifyFlags {
  None = 0x0,
  Alpha = 0x1,
  Interactive = 0x2,
  All = 0x3
}
