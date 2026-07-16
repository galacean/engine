import {
  Entity,
  GroupModifyFlags,
  Matrix,
  Plane,
  Ray,
  RootCanvasModifyFlags,
  ShaderData,
  ShaderProperty,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine";
import { UITransform } from "./component";
import { UICanvas } from "./component/UICanvas";
import { UIGroup } from "./component/UIGroup";
import { RectMask2D } from "./component/advanced/RectMask2D";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import type { IUIElement, IUIGroupAble } from "@galacean/engine";

/**
 * The rect-clip state a renderer carries so `RectMask2D` ancestors can clip it in the shader.
 * Implemented by `UIRenderer` and by canvas-hosted renderers (e.g. spine).
 */
export interface IRectMaskTarget {
  shaderData: ShaderData;
  _rectMasks: RectMask2D[];
  _rectMaskRect: Vector4;
  _rectMaskSoftness: Vector4;
  _rectMaskEnabled: boolean;
  _rectMaskHardClip: boolean;
}

export class Utils {
  static _tempRay: Ray = new Ray();
  static _tempPlane: Plane = new Plane();
  static _tempVec3: Vector3 = new Vector3();
  static _tempMat: Matrix = new Matrix();
  static _tempRect: Vector4 = new Vector4();

  /** @internal */
  static _rectClipRectProperty: ShaderProperty = ShaderProperty.getByName("renderer_UIRectClipRect");
  /** @internal */
  static _rectClipEnabledProperty: ShaderProperty = ShaderProperty.getByName("renderer_UIRectClipEnabled");
  /** @internal */
  static _rectClipSoftnessProperty: ShaderProperty = ShaderProperty.getByName("renderer_UIRectClipSoftness");
  /** @internal */
  static _rectClipHardClipProperty: ShaderProperty = ShaderProperty.getByName("renderer_UIRectClipHardClip");

  /**
   * Local position of a screen point in the component
   */
  static screenToLocalPoint(position: Vector2, transform: UITransform, out: Vector3): Boolean {
    const engine = transform.engine;
    // Get root canvas
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
    // Calculate ray
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
        // World space not yet supported, see issue #2793
        return false;
    }
    // Intersect ray with UI plane to get local coordinates
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

  static setRootCanvasDirty(element: IUIElement): void {
    if (element._isRootCanvasDirty) return;
    element._isRootCanvasDirty = true;
    this._registerRootCanvas(element, null);
    element._onRootCanvasModify?.(RootCanvasModifyFlags.All);
  }

  static setRootCanvas(element: IUIElement, rootCanvas: UICanvas): void {
    element._isRootCanvasDirty = false;
    this._registerRootCanvas(element, rootCanvas);
    const fromEntity = element instanceof UICanvas ? element.entity.parent : element.entity;
    const toEntity = rootCanvas?.entity.parent ?? null;
    this._registerListener(fromEntity, toEntity, element._rootCanvasListener, element._rootCanvasListeningEntities);
  }

  static cleanRootCanvas(element: IUIElement): void {
    this._registerRootCanvas(element, null);
    this._unRegisterListener(element._rootCanvasListener, element._rootCanvasListeningEntities);
  }

  static searchRootCanvasInParents(element: IUIElement): UICanvas {
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

  static setGroupDirty(element: IUIGroupAble): void {
    if (element._isGroupDirty) return;
    element._isGroupDirty = true;
    this._registerGroup(element, null);
    element._onGroupModify(GroupModifyFlags.All);
  }

  static setGroup(element: IUIGroupAble, group: UIGroup): void {
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

  static cleanGroup(element: IUIGroupAble): void {
    this._registerGroup(element, null);
    this._unRegisterListener(element._groupListener, element._groupListeningEntities);
  }

  static searchGroupInParents(element: IUIGroupAble): UIGroup {
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

  private static _registerRootCanvas(element: IUIElement, canvas: UICanvas): void {
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

  private static _registerGroup(element: IUIGroupAble, group: UIGroup): void {
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

  /**
   * @internal
   * Recompute the target's rect-clip shader state from its assigned `RectMask2D` list.
   */
  static updateRectMaskClipState(target: IRectMaskTarget): void {
    const rectMasks = target._rectMasks;
    const count = rectMasks.length;
    if (count <= 0) {
      this.resetRectMaskClipState(target);
      return;
    }

    let minX = Number.NEGATIVE_INFINITY;
    let minY = Number.NEGATIVE_INFINITY;
    let maxX = Number.POSITIVE_INFINITY;
    let maxY = Number.POSITIVE_INFINITY;
    let clipSoftnessLeft = 0;
    let clipSoftnessBottom = 0;
    let clipSoftnessRight = 0;
    let clipSoftnessTop = 0;
    let clipHardClip = false;
    let hasActiveMask = false;
    const tempRect = Utils._tempRect;
    for (let i = 0; i < count; i++) {
      const rectMask = rectMasks[i];
      if (!rectMask.enabled || !rectMask.entity.isActiveInHierarchy) {
        continue;
      }
      hasActiveMask = true;
      const softness = rectMask.softness;
      if (!clipHardClip && rectMask.alphaClip) {
        clipHardClip = true;
      }
      if (!rectMask._getWorldRect(tempRect)) {
        minX = 1;
        minY = 1;
        maxX = 0;
        maxY = 0;
        break;
      }
      if (tempRect.x > minX) {
        minX = tempRect.x;
        clipSoftnessLeft = softness.x;
      }
      if (tempRect.y > minY) {
        minY = tempRect.y;
        clipSoftnessBottom = softness.y;
      }
      if (tempRect.z < maxX) {
        maxX = tempRect.z;
        clipSoftnessRight = softness.x;
      }
      if (tempRect.w < maxY) {
        maxY = tempRect.w;
        clipSoftnessTop = softness.y;
      }
    }

    if (!hasActiveMask) {
      this.resetRectMaskClipState(target);
      return;
    }

    if (minX >= maxX || minY >= maxY) {
      minX = 1;
      minY = 1;
      maxX = 0;
      maxY = 0;
      clipSoftnessLeft = 0;
      clipSoftnessBottom = 0;
      clipSoftnessRight = 0;
      clipSoftnessTop = 0;
    }

    const rectMaskRect = target._rectMaskRect;
    if (rectMaskRect.x !== minX || rectMaskRect.y !== minY || rectMaskRect.z !== maxX || rectMaskRect.w !== maxY) {
      rectMaskRect.set(minX, minY, maxX, maxY);
      target.shaderData.setVector4(Utils._rectClipRectProperty, rectMaskRect);
    }

    const rectMaskSoftness = target._rectMaskSoftness;
    if (
      rectMaskSoftness.x !== clipSoftnessLeft ||
      rectMaskSoftness.y !== clipSoftnessBottom ||
      rectMaskSoftness.z !== clipSoftnessRight ||
      rectMaskSoftness.w !== clipSoftnessTop
    ) {
      rectMaskSoftness.set(clipSoftnessLeft, clipSoftnessBottom, clipSoftnessRight, clipSoftnessTop);
      target.shaderData.setVector4(Utils._rectClipSoftnessProperty, rectMaskSoftness);
    }

    if (target._rectMaskHardClip !== clipHardClip) {
      target._rectMaskHardClip = clipHardClip;
      target.shaderData.setFloat(Utils._rectClipHardClipProperty, clipHardClip ? 1 : 0);
    }

    if (!target._rectMaskEnabled) {
      target._rectMaskEnabled = true;
      target.shaderData.setFloat(Utils._rectClipEnabledProperty, 1);
    }
  }

  /**
   * @internal
   */
  static resetRectMaskClipState(target: IRectMaskTarget): void {
    if (target._rectMaskEnabled) {
      target._rectMaskEnabled = false;
      target.shaderData.setFloat(Utils._rectClipEnabledProperty, 0);
    }
    const rectMaskSoftness = target._rectMaskSoftness;
    if (rectMaskSoftness.x !== 0 || rectMaskSoftness.y !== 0 || rectMaskSoftness.z !== 0 || rectMaskSoftness.w !== 0) {
      rectMaskSoftness.set(0, 0, 0, 0);
      target.shaderData.setVector4(Utils._rectClipSoftnessProperty, rectMaskSoftness);
    }
    if (target._rectMaskHardClip) {
      target._rectMaskHardClip = false;
      target.shaderData.setFloat(Utils._rectClipHardClipProperty, 0);
    }
  }
}
