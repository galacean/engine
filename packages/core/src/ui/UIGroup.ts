import { Component } from "../Component";
import { DisorderedArray } from "../DisorderedArray";
import { Entity, EntityModifyFlags } from "../Entity";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { ComponentType } from "../enums/ComponentType";
import { UIUtils } from "./UIUtils";
import { IUIElement } from "./interface/IUIElement";

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
  _disorderedElements: DisorderedArray<IUIElement> = new DisorderedArray();

  /** @internal */
  @ignoreClone
  _globalAlpha = 1;
  /** @internal */
  _globalRaycastEnable = true;

  @assignmentClone
  private _alpha = 1;
  @assignmentClone
  private _raycastEnabled = true;
  @assignmentClone
  private _ignoreParentGroup = false;
  @ignoreClone
  private _entityListeners: Entity[] = [];

  constructor(entity: Entity) {
    super(entity);
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

  get raycastEnabled(): boolean {
    return this._raycastEnabled;
  }

  set raycastEnabled(val: boolean) {
    if (this._raycastEnabled !== val) {
      this._raycastEnabled = val;
      this._updateGlobalModify(GroupModifyFlags.RaycastEnable);
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

  /**
   * @internal
   */
  _getGlobalRaycastEnable(): boolean {
    return this._globalRaycastEnable;
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
    if (flags & GroupModifyFlags.RaycastEnable) {
      const raycastEnable =
        this._raycastEnabled &&
        (!this._ignoreParentGroup && parentGroup ? parentGroup?._getGlobalRaycastEnable() : true);
      if (this._globalRaycastEnable !== raycastEnable) {
        this._globalRaycastEnable = raycastEnable;
        passDownFlags |= GroupModifyFlags.RaycastEnable;
      }
    }
    if (!!flags) {
      this._disorderedElements.forEach(
        (element: IUIElement) => {
          element._onGroupModify(passDownFlags);
        },
        () => {}
      );
    }
    if (!!passDownFlags) {
      this._disorderedGroups.forEach(
        (element: UIGroup) => {
          element._updateGlobalModify(passDownFlags);
        },
        () => {}
      );
    }
  }

  override _onEnableInScene(): void {
    const entity = this._entity;
    entity._dispatchModify(EntityModifyFlags.UIGroupEnableInScene);
    this._registryToParentGroup(UIUtils.getGroupInParents(entity.parent));
  }

  override _onDisableInScene(): void {
    const entityListeners = this._entityListeners;
    for (let i = 0, n = entityListeners.length; i < n; i++) {
      entityListeners[i]._unRegisterModifyListener(this._onEntityModify);
    }
    entityListeners.length = 0;
    const parentGroup = this._parentGroup;
    const disorderedElements = this._disorderedElements;
    disorderedElements.forEach(
      (element: IUIElement) => {
        UIUtils.registerUIToGroup(element, parentGroup);
      },
      () => {}
    );
    disorderedElements.length = 0;
    disorderedElements.garbageCollection();
    const disorderedGroups = this._disorderedGroups;
    disorderedGroups.forEach(
      (element: UIGroup) => {
        element._registryToParentGroup(parentGroup);
      },
      () => {}
    );
    disorderedGroups.length = 0;
    disorderedGroups.garbageCollection();
    this._parentGroup = null;
    this._entity._dispatchModify(EntityModifyFlags.UIGroupDisableInScene);
  }

  private _registryToParentGroup(parentGroup: UIGroup): void {
    let entity = this._entity;
    const preParentGroup = this._parentGroup;
    if (parentGroup !== preParentGroup) {
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
        preListener?._unRegisterModifyListener(this._onEntityModify);
        entityListeners[index] = entity;
        entity._registerModifyListener(this._onEntityModify);
      }
      entity = entity.parent;
      index++;
    }
    entityListeners.length = index;
  }

  private _onEntityModify(flags: EntityModifyFlags): void {
    switch (flags) {
      case EntityModifyFlags.Parent:
      case EntityModifyFlags.UIGroupEnableInScene:
        this._registryToParentGroup(UIUtils.getGroupInParents(this._entity.parent));
        break;
      default:
        break;
    }
  }
}

export enum GroupModifyFlags {
  None = 0x0,
  Alpha = 0x1,
  RaycastEnable = 0x2,
  All = 0x3
}
