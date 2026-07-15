import { Entity } from "../Entity";
import { GroupModifyFlags, IUIElement, IUIGroup, IUIGroupAble, RootCanvasModifyFlags } from "./IUIElement";
import { IUICanvas } from "./IUICanvas";

/**
 * Root-canvas / group ownership bookkeeping for UI elements and canvas-hosted renderers.
 * The ui package's `Utils` delegates here; renderer packages (e.g. spine) call it directly
 * so they can be hosted by a `UICanvas` without depending on the ui package.
 */
export class UIElementUtils {
  /**
   * Monotonic version used by root canvases to detect hierarchy changes: elements stamp it
   * onto their entity chain on enable/disable/move, canvases bump it after each rebuild.
   * Starts above the Entity field default so the first stamp always propagates.
   */
  static _hierarchyCounter = 1;

  static setRootCanvasDirty(element: IUIElement): void {
    if (element._isRootCanvasDirty) return;
    element._isRootCanvasDirty = true;
    this._registerRootCanvas(element, null);
    element._onRootCanvasModify?.(RootCanvasModifyFlags.All);
  }

  /**
   * @param listenerStartEntity - The entity the parent-chain listeners start from
   * (the element's own entity; a nested canvas element starts from its parent).
   */
  static setRootCanvas(element: IUIElement, rootCanvas: IUICanvas, listenerStartEntity: Entity): void {
    element._isRootCanvasDirty = false;
    this._registerRootCanvas(element, rootCanvas);
    const toEntity = rootCanvas?.entity.parent ?? null;
    this._registerListener(
      listenerStartEntity,
      toEntity,
      element._rootCanvasListener,
      element._rootCanvasListeningEntities
    );
  }

  static cleanRootCanvas(element: IUIElement): void {
    this._registerRootCanvas(element, null);
    this._unRegisterListener(element._rootCanvasListener, element._rootCanvasListeningEntities);
  }

  static searchRootCanvasInParents(startEntity: Entity): IUICanvas {
    let entity = startEntity;
    while (entity) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && (component as unknown as IUICanvas)._isRootCanvas === true) {
          return component as unknown as IUICanvas;
        }
      }
      entity = entity.parent;
    }
    return null;
  }

  static setGroupDirty(element: IUIGroupAble): void {
    if (element._isGroupDirty) return;
    element._isGroupDirty = true;
    this._registerGroup(element, null);
    element._onGroupModify(GroupModifyFlags.All);
  }

  /**
   * @param listenerStartEntity - The entity the group listeners start from
   * (the element's own entity; a nested group element starts from its parent).
   */
  static setGroup(element: IUIGroupAble, group: IUIGroup, listenerStartEntity: Entity): void {
    element._isGroupDirty = false;
    this._registerGroup(element, group);
    const rootCanvas = element._getRootCanvas();
    if (rootCanvas) {
      const toEntity = group?.entity ?? rootCanvas.entity.parent;
      this._registerListener(listenerStartEntity, toEntity, element._groupListener, element._groupListeningEntities);
    } else {
      this._unRegisterListener(element._groupListener, element._groupListeningEntities);
    }
  }

  static cleanGroup(element: IUIGroupAble): void {
    this._registerGroup(element, null);
    this._unRegisterListener(element._groupListener, element._groupListeningEntities);
  }

  static searchGroupInParents(startEntity: Entity, rootCanvas: IUICanvas): IUIGroup {
    if (!rootCanvas) return null;
    let entity = startEntity;
    const rootCanvasParent = rootCanvas.entity.parent;
    while (entity && entity !== rootCanvasParent) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && (component as unknown as IUIGroup)._isUIGroup === true) {
          return component as unknown as IUIGroup;
        }
      }
      entity = entity.parent;
    }
    return null;
  }

  private static _registerRootCanvas(element: IUIElement, canvas: IUICanvas): void {
    const preCanvas = element._rootCanvas;
    if (preCanvas !== canvas) {
      if (preCanvas) {
        const replaced = preCanvas._disorderedElements.deleteByIndex(element._indexInRootCanvas);
        replaced && (replaced._indexInRootCanvas = element._indexInRootCanvas);
        element._indexInRootCanvas = -1;
      }
      if (canvas) {
        const disorderedElements = canvas._disorderedElements;
        element._indexInRootCanvas = disorderedElements.length;
        disorderedElements.add(element);
      }
      element._rootCanvas = canvas;
    }
  }

  private static _registerGroup(element: IUIGroupAble, group: IUIGroup): void {
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
      element._onGroupModify(GroupModifyFlags.All);
    }
  }

  private static _registerListener(
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

  private static _unRegisterListener(listener: (flag: number, param?: any) => void, listeningEntities: Entity[]): void {
    for (let i = 0, n = listeningEntities.length; i < n; i++) {
      // @ts-ignore
      listeningEntities[i]._unRegisterModifyListener(listener);
    }
    listeningEntities.length = 0;
  }
}
