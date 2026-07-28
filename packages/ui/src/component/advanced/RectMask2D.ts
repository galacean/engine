import { Component, DependentMode, Entity, Vector2, Vector3, Vector4, dependentComponents } from "@galacean/engine";
import { UICanvas } from "../UICanvas";
import { UITransform } from "../UITransform";

/**
 * UI component that clips descendant graphics by an axis-aligned rectangle.
 */
@dependentComponents(UITransform, DependentMode.AutoAdd)
export class RectMask2D extends Component {
  private static _tempRect: Vector4 = new Vector4();
  private static _tempCorner0: Vector3 = new Vector3();
  private static _tempCorner1: Vector3 = new Vector3();
  private static _tempCorner2: Vector3 = new Vector3();
  private static _tempCorner3: Vector3 = new Vector3();

  private _softness: Vector2 = new Vector2(0, 0);
  private _alphaClip: boolean = false;

  /**
   * Soft clipping width on X/Y axis in world space.
   */
  get softness(): Vector2 {
    return this._softness;
  }

  set softness(value: Vector2) {
    const softness = this._softness;
    if (softness === value) {
      return;
    }
    if (softness.x !== value.x || softness.y !== value.y) {
      softness.copyFrom(value);
      this._clampSoftness();
    }
  }

  /**
   * Whether to enable hard clip (discard) when outside the rect.
   */
  get alphaClip(): boolean {
    return this._alphaClip;
  }

  set alphaClip(value: boolean) {
    this._alphaClip = value;
  }

  /**
   * @internal
   */
  _getWorldRect(out: Vector4): boolean {
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

    const minX = Math.min(corner0.x, corner1.x, corner2.x, corner3.x);
    const minY = Math.min(corner0.y, corner1.y, corner2.y, corner3.y);
    const maxX = Math.max(corner0.x, corner1.x, corner2.x, corner3.x);
    const maxY = Math.max(corner0.y, corner1.y, corner2.y, corner3.y);
    out.set(minX, minY, maxX, maxY);
    return true;
  }

  /**
   * @internal
   */
  _containsWorldPoint(worldPoint: Vector3): boolean {
    const worldRect = RectMask2D._tempRect;
    if (!this._getWorldRect(worldRect)) {
      return false;
    }
    const { x, y } = worldPoint;
    return x >= worldRect.x && x <= worldRect.z && y >= worldRect.y && y <= worldRect.w;
  }

  constructor(entity: Entity) {
    super(entity);
    this._onSoftnessChanged = this._onSoftnessChanged.bind(this);
    // @ts-ignore
    this._softness._onValueChanged = this._onSoftnessChanged;
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    this.entity._updateUIHierarchyVersion(UICanvas._hierarchyCounter);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    this.entity._updateUIHierarchyVersion(UICanvas._hierarchyCounter);
  }

  _onClone(target: RectMask2D): void {
    // RectMask2D extends Component directly, so it has no parent clone hook to call.
    const targetSoftness = target._softness;
    // @ts-ignore
    targetSoftness._onValueChanged = null;
    targetSoftness.copyFrom(this._softness);
    target._clampSoftness();
    // @ts-ignore
    targetSoftness._onValueChanged = target._onSoftnessChanged;
  }

  protected override _onDestroy(): void {
    // @ts-ignore
    this._softness._onValueChanged = null;
    this._softness = null;
    super._onDestroy();
  }

  private _onSoftnessChanged(): void {
    this._clampSoftness();
  }

  private _clampSoftness(): void {
    const softness = this._softness;
    if (softness.x < 0) {
      softness.x = 0;
    }
    if (softness.y < 0) {
      softness.y = 0;
    }
  }
}
