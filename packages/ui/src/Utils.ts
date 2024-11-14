import { ComponentType, Entity } from "@galacean/engine";
import { UICanvas } from "./component/UICanvas";
import { GroupModifyFlags, UIGroup } from "./component/UIGroup";
import { IElement } from "./interface/IElement";
import { IGroupAble } from "./interface/IGroupAble";

export class Utils {
  static registerListener(
    entity: Entity,
    root: Entity,
    listener: (flag: number, param?: any) => void,
    listeningEntities: Entity[]
  ): void {
    let count = 0;
    while (entity && entity !== root) {
      const preEntity = listeningEntities[count];
      if (preEntity !== entity) {
        // @ts-ignore
        preEntity?._unRegisterModifyListener(listener);
        listeningEntities[count] = entity;
        // @ts-ignore
        entity._registerModifyListener(listener);
      }
      entity = entity.parent;
      count++;
    }
    listeningEntities.length = count;
  }

  static unRegisterGroupListener(element: IGroupAble): void {
    const group = element._group;
    if (group) {
      const replaced = group._disorderedElements.deleteByIndex(element._indexInGroup);
      replaced && (replaced._indexInGroup = element._indexInGroup);
      element._indexInGroup = -1;
      element._group = null;
    }
    const listeningEntities = element._groupListeningEntities;
    const groupListener = element._groupListener;
    for (let i = 0, n = listeningEntities.length; i < n; i++) {
      // @ts-ignore
      listeningEntities[i]._unRegisterModifyListener(groupListener);
    }
    listeningEntities.length = 0;
  }

  static unRegisterCanvasListener(element: IElement, isGraphics: boolean = false): void {
    const canvas = element._canvas;
    if (canvas) {
      const replaced = canvas._disorderedElements.deleteByIndex(element._indexInCanvas);
      replaced && (replaced._indexInCanvas = element._indexInCanvas);
      element._indexInCanvas = -1;
      element._canvas = null;
      isGraphics && (canvas._hierarchyDirty = true);
    }
    const listeningEntities = element._canvasListeningEntities;
    const canvasListener = element._canvasListener;
    for (let i = 0, n = listeningEntities.length; i < n; i++) {
      // @ts-ignore
      listeningEntities[i]._unRegisterModifyListener(canvasListener);
    }
    listeningEntities.length = 0;
  }

  // static registerElementToCanvas(
  //   element: IElement,
  //   canvas: UICanvas,
  //   instant: boolean = false,
  //   isGraphics: boolean = false
  // ): void {
  //   const preCanvas = element._canvas;
  //   if (preCanvas !== canvas) {
  //     element._canvas = canvas;
  //     if (preCanvas) {
  //       const replaced = preCanvas._disorderedElements.deleteByIndex(element._indexInCanvas);
  //       replaced && (replaced._indexInCanvas = element._indexInCanvas);
  //       element._indexInCanvas = -1;
  //       isGraphics && (preCanvas._hierarchyDirty = true);
  //     }
  //     if (canvas) {
  //       const disorderedElements = canvas._disorderedElements;
  //       element._indexInCanvas = disorderedElements.length;
  //       disorderedElements.add(element);
  //       isGraphics && (canvas._hierarchyDirty = true);
  //     }
  //     element._canvas = canvas;
  //   }
  //   if (instant) {
  //     Utils.registerListener(element.entity, canvas?.entity, element._canvasListener, element._canvasListeningEntities);
  //   }
  // }

  static registerElementToGroup(element: IGroupAble, group: UIGroup, instant: boolean = false): void {
    const preGroup = element._group;
    if (preGroup !== group) {
      if (preGroup) {
        const replaced = preGroup._disorderedElements.deleteByIndex(element._indexInGroup);
        replaced && (replaced._indexInGroup = element._indexInGroup);
        element._indexInGroup = -1;
      }
      if (group) {
        const disorderedElements = group._disorderedElements;
        element._indexInGroup = disorderedElements.length;
        disorderedElements.add(element);
      }
      element._group = group;
      instant && element._onGroupModify(GroupModifyFlags.All);
    }
    if (instant) {
      const rootCanvas = element._canvas;
      const root = group ? group.entity : rootCanvas.entity;
      Utils.registerListener(element.entity, root, element._groupListener, element._groupListeningEntities);
    }
  }

  static getCanvasInParents(entity: Entity, root?: Entity): UICanvas {
    entity = entity.parent;
    let rootCanvas: UICanvas = null;
    while (entity && entity !== root) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && component._componentType === ComponentType.UICanvas) {
          rootCanvas = <UICanvas>component;
          if (rootCanvas._isRootCanvas) {
            return rootCanvas;
          }
        }
      }
      entity = entity.parent;
    }
    return rootCanvas;
  }

  static getGroupInParents(entity: Entity, root: Entity): UIGroup {
    entity = entity.parent;
    while (entity && entity !== root) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && component._componentType === ComponentType.UIGroup) {
          return <UIGroup>component;
        }
      }
      entity = entity.parent;
    }
    return null;
  }

  static _getCanvas(element: IElement): UICanvas {
    if (element._isCanvasDirty) {
      this._registerElementToCanvas(element, Utils.getCanvasInParents(element.entity));
      element._isCanvasDirty = false;
    }
    return element._canvas;
  }

  static _registerElementToCanvas(element: IElement, canvas: UICanvas): void {
    if (canvas) {
      const disorderedElements = canvas._disorderedElements;
      element._indexInCanvas = disorderedElements.length;
      disorderedElements.add(element);
      element._canvas = canvas;
    }
    Utils.registerListener(element.entity, canvas?.entity, element._canvasListener, element._canvasListeningEntities);
  }

  static _getGroup(element: IGroupAble): UIGroup {
    if (element._isGroupDirty) {
      this._registerElementToGroup(element, Utils.getGroupInParents(element.entity, this._getCanvas(element).entity));
      element._isGroupDirty = false;
    }
    return element._group;
  }

  static _registerElementToGroup(element: IGroupAble, group: UIGroup): void {
    if (group) {
      const disorderedElements = group._disorderedElements;
      element._indexInGroup = disorderedElements.length;
      disorderedElements.add(element);
      element._group = group;
    }
    const rootCanvas = this._getCanvas(element);
    const root = group ? group.entity : rootCanvas.entity;
    Utils.registerListener(element.entity, root, element._groupListener, element._groupListeningEntities);
  }

  static _onGroupChange(element: IGroupAble): void {
    element._isGroupDirty = true;
    const preGroup = element._group;
    if (preGroup) {
      const replaced = preGroup._disorderedElements.deleteByIndex(element._indexInGroup);
      replaced && (replaced._indexInGroup = element._indexInGroup);
      element._indexInGroup = -1;
    }
    element._group = null;
    element._onGroupModify(GroupModifyFlags.All);
  }

  static _onCanvasChange(element: IElement, isGraphics: boolean = false): void {
    element._isCanvasDirty = true;
    const preCanvas = element._canvas;
    if (preCanvas) {
      const replaced = preCanvas._disorderedElements.deleteByIndex(element._indexInCanvas);
      replaced && (replaced._indexInCanvas = element._indexInCanvas);
      element._indexInCanvas = -1;
      isGraphics && (preCanvas._hierarchyDirty = true);
    }
    element._canvas = null;
  }
}
