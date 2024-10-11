import { Component } from "../Component";
import { DisorderedArray } from "../DisorderedArray";
import { Entity, EntityModifyFlags } from "../Entity";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { ComponentType } from "../enums/ComponentType";
import { UIUtil } from "./UIUtil";
import { IUIElement } from "./interface/IUIElement";

export class UIGroup extends Component {
  /** @internal */
  @ignoreClone
  _disorderedElements: DisorderedArray<IUIElement> = new DisorderedArray();
  /** @internal */
  @ignoreClone
  _parentGroup: UIGroup;
  /** @internal */
  @ignoreClone
  _parentGroupEntity: Entity;
  /** @internal */
  @ignoreClone
  _groupIndex: number = -1;
  /** @internal */
  @ignoreClone
  _disorderedGroups: DisorderedArray<UIGroup> = new DisorderedArray();

  @assignmentClone
  private _ignoreParentGroup = false;
  @assignmentClone
  private _raycastEnabled = true;
  @assignmentClone
  private _alpha = 1;
  @ignoreClone
  private _globalAlpha = 1;
  @ignoreClone
  private _globalRaycastEnable = true;
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
      this._updateGlobalModify(UIGroupModifyFlags.All);
    }
  }

  get raycastEnabled(): boolean {
    return this._raycastEnabled;
  }

  set raycastEnabled(val: boolean) {
    if (this._raycastEnabled !== val) {
      this._raycastEnabled = val;
      this._updateGlobalModify(UIGroupModifyFlags.RaycastEnable);
    }
  }

  get alpha(): number {
    return this._alpha;
  }

  set alpha(val: number) {
    val = Math.max(0, Math.min(val, 1));
    if (this._alpha !== val) {
      this._alpha = val;
      this._updateGlobalModify(UIGroupModifyFlags.Alpha);
    }
  }

  /**
   * @internal
   */
  _getGlobalAlpha(): number {
    return this._globalAlpha;
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
  _updateGlobalModify(flags: UIGroupModifyFlags): void {
    let passDownFlags = UIGroupModifyFlags.None;
    const parentGroup = this._parentGroup;
    if (flags & UIGroupModifyFlags.Alpha) {
      const alpha = this._alpha * (!this._ignoreParentGroup && parentGroup ? parentGroup._getGlobalAlpha() : 1);
      if (this._globalAlpha !== alpha) {
        this._globalAlpha = alpha;
        passDownFlags |= UIGroupModifyFlags.Alpha;
      }
    }
    if (flags & UIGroupModifyFlags.RaycastEnable) {
      const raycastEnable =
        this._raycastEnabled &&
        (!this._ignoreParentGroup && parentGroup ? parentGroup?._getGlobalRaycastEnable() : true);
      if (this._globalRaycastEnable !== raycastEnable) {
        this._globalRaycastEnable = raycastEnable;
        passDownFlags |= UIGroupModifyFlags.RaycastEnable;
      }
    }
    this._disorderedGroups.forEach(
      (element: UIGroup) => {
        element._updateGlobalModify(passDownFlags);
      },
      () => {}
    );
  }

  override _onEnableInScene(): void {
    const entity = this._entity;
    entity._dispatchModify(EntityModifyFlags.UIGroupEnableInScene);
    this._registryToParentGroup(UIUtil.getGroupInParent(entity.parent));
  }

  override _onDisableInScene(): void {
    const listeners = this._entityListeners;
    for (let i = 0, n = listeners.length; i < n; i++) {
      listeners[i]._unRegisterModifyListener(this._onEntityModify);
    }
    listeners.length = 0;
    this._parentGroupEntity?._unRegisterModifyListener(this._onParentEntityModify);
    const parentGroup = this._parentGroup;
    const { _disorderedElements: disorderedElements, _disorderedGroups: disorderedGroups } = this;
    disorderedElements.forEach(
      (element: IUIElement) => {
        UIUtil.registerUIToGroup(element, parentGroup);
      },
      () => {}
    );
    disorderedElements.length = 0;
    disorderedElements.garbageCollection();
    disorderedGroups.forEach(
      (element: UIGroup) => {
        element._registryToParentGroup(parentGroup);
      },
      () => {}
    );
    disorderedGroups.length = 0;
    disorderedGroups.garbageCollection();
    this._parentGroup = this._parentGroupEntity = null;
    this._entity._dispatchModify(EntityModifyFlags.UIGroupDisableInScene);
  }

  private _registryToParentGroup(parentGroup: UIGroup): void {
    let entity = this._entity;
    const preParentGroup = this._parentGroup;
    if (parentGroup !== preParentGroup) {
      const parentGroupEntity = parentGroup?.entity;
      let index = 0;
      const listeners = this._entityListeners;
      while (entity && entity !== parentGroupEntity) {
        const preListener = listeners[index];
        if (preListener !== entity) {
          preListener?._unRegisterModifyListener(this._onEntityModify);
          listeners[index] = entity;
          entity._registerModifyListener(this._onEntityModify);
        }
        entity = entity.parent;
      }
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
      const preParentGroupEntity = this._parentGroupEntity;
      if (preParentGroupEntity !== parentGroupEntity) {
        preParentGroupEntity && preParentGroupEntity._unRegisterModifyListener(this._onParentEntityModify);
        parentGroupEntity && parentGroupEntity._registerModifyListener(this._onParentEntityModify);
      }
    }
    this._updateGlobalModify(UIGroupModifyFlags.All);
  }

  private _onParentEntityModify(flags: EntityModifyFlags): void {
    if (flags === EntityModifyFlags.UIGroupEnableInScene) {
      this._registryToParentGroup(UIUtil.getGroupInParent(this._entity.parent));
    }
  }

  private _onEntityModify(flags: EntityModifyFlags): void {
    switch (flags) {
      case EntityModifyFlags.Parent:
      case EntityModifyFlags.UIGroupEnableInScene:
        this._registryToParentGroup(UIUtil.getGroupInParent(this._entity.parent));
        break;
      default:
        break;
    }
  }
}

export enum UIGroupModifyFlags {
  None = 0x0,
  Alpha = 0x1,
  RaycastEnable = 0x2,
  All = 0x3
}
