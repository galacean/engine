import { Component } from "../Component";
import { DisorderedArray } from "../DisorderedArray";
import { Entity, EntityModifyFlags } from "../Entity";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { ComponentType } from "../enums/ComponentType";
import { UICanvas } from "./UICanvas";
import { UIRegistry } from "./UIRegistery";
import { IUIElement } from "./interface/IUIElement";

export class UIGroup extends Component {
  @assignmentClone
  ignoreParentGroup = false;
  @assignmentClone
  raycastEnabled = true;
  @ignoreClone
  _disorderedElements: DisorderedArray<IUIElement> = new DisorderedArray();

  @assignmentClone
  private _alpha = 1;
  @ignoreClone
  private _globalAlpha = 1;
  @ignoreClone
  private _parentGroup: UIGroup;
  @ignoreClone
  private _listeners: Entity[] = [];
  @ignoreClone
  private _parentGroupEntity: Entity;

  constructor(entity: Entity) {
    super(entity);
    this._componentType = ComponentType.UIGroup;
  }

  set alpha(val: number) {
    val = Math.max(0, Math.min(val, 1));
    if (this._alpha !== val) {
      this._alpha = val;
      const parentGroup = this._parentGroup;
      if (parentGroup && !this.ignoreParentGroup) {
        this._setGlobalAlpha(val * parentGroup._getGlobalAlpha());
      } else {
        this._setGlobalAlpha(val);
      }
    }
  }

  get alpha(): number {
    return this._alpha;
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
  _setGlobalAlpha(val: number): void {
    if (val !== this._globalAlpha) {
      this._globalAlpha = val;
      this._disorderedElements.forEach(
        (element: IUIElement) => {
          element._onGroupModify(UIGroupModifyFlags.Alpha);
        },
        () => {}
      );
    }
  }

  override _onEnableInScene(): void {
    this._entity._dispatchModify(EntityModifyFlags.UIGroupEnableInScene);
    this._updateParentGroup();
  }

  override _onDisableInScene(): void {
    const listeners = this._listeners;
    for (let i = 0, n = listeners.length; i < n; i++) {
      listeners[i]._unRegisterModifyListener(this._onEntityModify);
    }
    listeners.length = 0;
    this._parentGroupEntity?._unRegisterModifyListener(this._onParentEntityModify);

    const parentGroup = this._parentGroup;
    this._disorderedElements.forEach(
      (element: IUIElement) => {
        UIRegistry.registerElementToGroup(element, parentGroup);
      },
      () => {}
    );
    this._disorderedElements.length = 0;
    this._disorderedElements.garbageCollection();
    this._parentGroup = this._parentGroupEntity = null;
    this._entity._dispatchModify(EntityModifyFlags.UIGroupDisableInScene);
  }

  private _getParentGroup(): UIGroup {
    let entity = this._entity.parent;
    let _meetRootCanvas = false;
    while (entity) {
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled) {
          switch (component._componentType) {
            case ComponentType.UIRenderer:
              _meetRootCanvas = (<UICanvas>component)._isRootCanvas;
              break;
            case ComponentType.UIGroup:
              return (this._parentGroup = <UIGroup>component);
            default:
              break;
          }
        }
      }
      if (_meetRootCanvas) {
        return null;
      }
      entity = entity.parent;
    }
    return null;
  }

  private _updateParentGroup(): void {
    const preParentGroup = this._parentGroup;
    const parentGroup = this._getParentGroup();
    if (parentGroup !== preParentGroup) {
      const parentGroupEntity = parentGroup?.entity;
      let entity = this._entity;
      let index = 0;
      const listeners = this._listeners;
      while (entity && entity !== parentGroupEntity) {
        const preListener = listeners[index];
        if (preListener !== entity) {
          preListener?._unRegisterModifyListener(this._onEntityModify);
          listeners[index] = entity;
          entity._registerModifyListener(this._onEntityModify);
        }
        entity = entity.parent;
      }
      const preParentGroupEntity = this._parentGroupEntity;
      if (preParentGroupEntity !== parentGroupEntity) {
        parentGroupEntity && parentGroupEntity._registerModifyListener(this._onParentEntityModify);
        preParentGroupEntity && preParentGroupEntity._unRegisterModifyListener(this._onParentEntityModify);
      }
    }
  }

  private _onParentEntityModify(flags: EntityModifyFlags): void {
    flags === EntityModifyFlags.UIGroupDisableInScene && this._updateParentGroup();
  }

  private _onEntityModify(flags: EntityModifyFlags): void {
    switch (flags) {
      case EntityModifyFlags.Parent:
      case EntityModifyFlags.UIGroupEnableInScene:
      case EntityModifyFlags.UICanvasEnableInScene:
        this._updateParentGroup();
        break;
      default:
        break;
    }
  }
}

export enum UIGroupModifyFlags {
  Alpha = 0x1
}
