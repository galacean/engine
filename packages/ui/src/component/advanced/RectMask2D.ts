import { Component, DependentMode, Vector3, Vector4, dependentComponents } from "@galacean/engine";
import { RectMaskMode } from "../../enums/RectMaskMode";
import { UICanvas } from "../UICanvas";
import { UITransform } from "../UITransform";

/**
 * Clips descendant graphics to an axis-aligned rectangle or its complement.
 * Each ancestor contributes its own constraint; nested masks intersect their retained areas.
 * Inside masks merge into one shader clipping rectangle and do not use stencil.
 * Nonempty Outside masks share an eight-level stencil limit with image Masks and require
 * a stencil attachment. UI manages these bits while masks are active.
 */
@dependentComponents(UITransform, DependentMode.AutoAdd)
export class RectMask2D extends Component {
  private static _identityAxisX: Vector4 = new Vector4(1, 0, 0, 0);
  private static _identityAxisY: Vector4 = new Vector4(0, 1, 0, 0);
  private static _tempRect: Vector4 = new Vector4();
  private static _tempCorner0: Vector3 = new Vector3();
  private static _tempCorner1: Vector3 = new Vector3();
  private static _tempCorner2: Vector3 = new Vector3();
  private static _tempCorner3: Vector3 = new Vector3();

  /** Area retained for descendants. Defaults to Inside. An empty Outside mask excludes nothing. */
  mode: RectMaskMode = RectMaskMode.Inside;

  /**
   * @internal
   */
  _getCanvasRect(axisX: Vector4, axisY: Vector4, out: Vector4): boolean {
    const transform = <UITransform>this.entity.transform;
    const { x: width, y: height } = transform.size;
    if (!width || !height) {
      return false;
    }

    const { x: pivotX, y: pivotY } = transform.pivot;
    const left = -width * pivotX;
    const right = width * (1 - pivotX);
    const bottom = -height * pivotY;
    const top = height * (1 - pivotY);

    const worldMatrix = transform.worldMatrix;
    const corner0 = RectMask2D._tempCorner0;
    const corner1 = RectMask2D._tempCorner1;
    const corner2 = RectMask2D._tempCorner2;
    const corner3 = RectMask2D._tempCorner3;
    Vector3.transformCoordinate(corner0.set(left, bottom, 0), worldMatrix, corner0);
    Vector3.transformCoordinate(corner1.set(left, top, 0), worldMatrix, corner1);
    Vector3.transformCoordinate(corner2.set(right, bottom, 0), worldMatrix, corner2);
    Vector3.transformCoordinate(corner3.set(right, top, 0), worldMatrix, corner3);

    const x0 = corner0.x * axisX.x + corner0.y * axisX.y + corner0.z * axisX.z + axisX.w;
    const x1 = corner1.x * axisX.x + corner1.y * axisX.y + corner1.z * axisX.z + axisX.w;
    const x2 = corner2.x * axisX.x + corner2.y * axisX.y + corner2.z * axisX.z + axisX.w;
    const x3 = corner3.x * axisX.x + corner3.y * axisX.y + corner3.z * axisX.z + axisX.w;

    const y0 = corner0.x * axisY.x + corner0.y * axisY.y + corner0.z * axisY.z + axisY.w;
    const y1 = corner1.x * axisY.x + corner1.y * axisY.y + corner1.z * axisY.z + axisY.w;
    const y2 = corner2.x * axisY.x + corner2.y * axisY.y + corner2.z * axisY.z + axisY.w;
    const y3 = corner3.x * axisY.x + corner3.y * axisY.y + corner3.z * axisY.z + axisY.w;

    out.set(Math.min(x0, x1, x2, x3), Math.min(y0, y1, y2, y3), Math.max(x0, x1, x2, x3), Math.max(y0, y1, y2, y3));
    return true;
  }

  /**
   * @internal
   */
  _getWorldRect(out: Vector4): boolean {
    return this._getCanvasRect(RectMask2D._identityAxisX, RectMask2D._identityAxisY, out);
  }

  /**
   * @internal
   */
  _containsWorldPoint(worldPoint: Vector3): boolean {
    const worldRect = RectMask2D._tempRect;
    if (!this._getWorldRect(worldRect) || worldRect.x >= worldRect.z || worldRect.y >= worldRect.w) {
      return false;
    }
    const { x, y } = worldPoint;
    return x >= worldRect.x && x <= worldRect.z && y >= worldRect.y && y <= worldRect.w;
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    this.entity._updateUIHierarchyVersion(UICanvas._hierarchyCounter);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    this.entity._updateUIHierarchyVersion(UICanvas._hierarchyCounter);
  }
}
