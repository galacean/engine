import { Entity, Matrix, Plane, Ray, Vector2, Vector3 } from "@galacean/engine";
import { UITransform } from "./component";
import { RootCanvasModifyFlags, UICanvas } from "./component/UICanvas";
import { GroupModifyFlags, UIGroup } from "./component/UIGroup";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import { IElement } from "./interface/IElement";
import { IGroupAble } from "./interface/IGroupAble";

export class Utils {
  static setRootCanvasDirty(element: IElement): void {
    if (element._isRootCanvasDirty) return;
    element._isRootCanvasDirty = true;
    this._registerRootCanvas(element, null);
    element._onRootCanvasModify?.(RootCanvasModifyFlags.All);
  }

  static setRootCanvas(element: IElement, rootCanvas: UICanvas): void {
    element._isRootCanvasDirty = false;
    this._registerRootCanvas(element, rootCanvas);
    const fromEntity = element instanceof UICanvas ? element.entity.parent : element.entity;
    const toEntity = rootCanvas?.entity.parent ?? null;
    this._registerListener(fromEntity, toEntity, element._rootCanvasListener, element._rootCanvasListeningEntities);
  }

  static cleanRootCanvas(element: IElement): void {
    this._registerRootCanvas(element, null);
    this._unRegisterListener(element._rootCanvasListener, element._rootCanvasListeningEntities);
  }

  static searchRootCanvasInParents(element: IElement): UICanvas {
    let entity = element instanceof UICanvas ? element.entity.parent : element.entity;
    while (entity) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && component instanceof UICanvas && component._isRootCanvas) {
          return component;
        }
      }
      entity = entity.parent;
    }
    return null;
  }

  static setGroupDirty(element: IGroupAble): void {
    if (element._isGroupDirty) return;
    element._isGroupDirty = true;
    this._registerGroup(element, null);
    element._onGroupModify(GroupModifyFlags.All);
  }

  static setGroup(element: IGroupAble, group: UIGroup): void {
    element._isGroupDirty = false;
    this._registerGroup(element, group);
    const rootCanvas = element._getRootCanvas();
    if (rootCanvas) {
      const fromEntity = element instanceof UIGroup ? element.entity.parent : element.entity;
      const toEntity = group?.entity ?? rootCanvas.entity.parent;
      this._registerListener(fromEntity, toEntity, element._groupListener, element._groupListeningEntities);
    } else {
      this._unRegisterListener(element._groupListener, element._groupListeningEntities);
    }
  }

  static cleanGroup(element: IGroupAble): void {
    this._registerGroup(element, null);
    this._unRegisterListener(element._groupListener, element._groupListeningEntities);
  }

  static searchGroupInParents(element: IGroupAble): UIGroup {
    const rootCanvas = element._getRootCanvas();
    if (!rootCanvas) return null;
    let entity = element instanceof UIGroup ? element.entity.parent : element.entity;
    const rootCanvasParent = rootCanvas.entity.parent;
    while (entity && entity !== rootCanvasParent) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && component instanceof UIGroup) {
          return component;
        }
      }
      entity = entity.parent;
    }
    return null;
  }

  private static _registerRootCanvas(element: IElement, canvas: UICanvas): void {
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

  private static _registerGroup(element: IGroupAble, group: UIGroup): void {
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

  static _tempRay: Ray = new Ray();
  static _tempPlane: Plane = new Plane();
  static _tempVec3: Vector3 = new Vector3();
  static _tempMat: Matrix = new Matrix();
  /**
   * 屏幕上的点在组件中的局部位置
   */
  static screenToLocalPoint(position: Vector2, transform: UITransform, out: Vector3): Boolean {
    const engine = transform.engine;
    // 获取主画布
    let entity = transform.entity;
    let rootCanvas: UICanvas;
    while (entity) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && component instanceof UICanvas && component._isRootCanvas) {
          rootCanvas = component;
        }
      }
      entity = entity.parent;
    }
    if (!rootCanvas) return false;
    // 计算 Ray
    const ray = this._tempRay;
    switch (rootCanvas._realRenderMode) {
      case CanvasRenderMode.ScreenSpaceOverlay:
        // Screen to world ( Assume that world units have a one-to-one relationship with pixel units )
        ray.origin.set(position.x, engine.canvas.height - position.y, 1);
        ray.direction.set(0, 0, -1);
        break;
      case CanvasRenderMode.ScreenSpaceCamera:
        rootCanvas.renderCamera.screenPointToRay(position, ray);
        break;
      default:
        // 暂不支持世界空间，详见 issue #2793
        return false;
    }
    // 用这个射线和 UI 平面相交获取局部坐标
    const plane = this._tempPlane;
    const normal = plane.normal.copyFrom(transform.worldForward);
    plane.distance = -Vector3.dot(normal, transform.worldPosition);
    const curDistance = ray.intersectPlane(plane);
    if (curDistance >= 0 && curDistance < Number.MAX_SAFE_INTEGER) {
      const hitPointWorld = ray.getPoint(curDistance, this._tempVec3);
      const worldMatrixInv = this._tempMat;
      Matrix.invert(transform.worldMatrix, worldMatrixInv);
      Vector3.transformCoordinate(hitPointWorld, worldMatrixInv, out);
      return true;
    }
    return false;
  }
}
