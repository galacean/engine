import { Logger, SpriteMaskInteraction, Vector3, Vector4 } from "@galacean/engine";
import type { IMaskRenderable, Ray, Renderer } from "@galacean/engine";
import { RectMaskMode } from "../enums/RectMaskMode";
import type { UICanvas } from "./UICanvas";
import type { RectMask2D } from "./advanced/RectMask2D";

/** The constraints inherited by graphics in one branch of a canvas. */
export class UIClipScope {
  static readonly empty = new UIClipScope(null);
  private static readonly _tempRect = new Vector4();

  readonly masks: readonly IMaskRenderable[];
  readonly outsideRects: Vector4[] = [];
  readonly axisX = new Vector4(1, 0, 0, 0);
  readonly axisY = new Vector4(0, 1, 0, 0);
  readonly insideRect = new Vector4();
  hasInside = false;

  private _version = -1;

  constructor(
    private readonly _parent: UIClipScope | null,
    private readonly _rect?: RectMask2D,
    mask?: IMaskRenderable
  ) {
    const masks = _parent?.masks ?? [];
    this.masks = mask ? [...masks, mask] : masks;
  }

  /** Refresh once per canvas render or input query. Either can follow a same-frame transform change. */
  resolve(canvas: UICanvas, version: number): void {
    if (this === UIClipScope.empty || this._version === version) return;
    this._version = version;
    const { axisX, axisY, insideRect, outsideRects } = this;
    let count = 0;
    let hasInside = false;
    let hasCanvasSpace: boolean | undefined;
    insideRect.set(-Infinity, -Infinity, Infinity, Infinity);
    for (let scope: UIClipScope | null = this; scope; scope = scope._parent) {
      const mask = scope._rect;
      if (!mask) continue;
      hasCanvasSpace ??= canvas._getWorldToLocalXY(axisX, axisY);
      const rect = UIClipScope._tempRect;
      const valid = hasCanvasSpace && mask._getCanvasRect(axisX, axisY, rect) && rect.x < rect.z && rect.y < rect.w;
      if (mask.mode === RectMaskMode.Outside) {
        if (valid) (outsideRects[count++] ??= new Vector4()).copyFrom(rect);
      } else {
        hasInside = true;
        if (!valid) rect.set(1, 1, 0, 0);
        insideRect.set(
          Math.max(insideRect.x, rect.x),
          Math.max(insideRect.y, rect.y),
          Math.min(insideRect.z, rect.z),
          Math.min(insideRect.w, rect.w)
        );
      }
    }
    if (insideRect.x >= insideRect.z || insideRect.y >= insideRect.w) insideRect.set(1, 1, 0, 0);
    this.hasInside = hasInside;
    outsideRects.length = count;
  }

  canBatch(a: Renderer, b: Renderer): boolean {
    return this.outsideRects.length === 0 || UIClipScope._areCoplanar(a, b);
  }

  private static _areCoplanar(a: Renderer, b: Renderer): boolean {
    if (a === b) return true;
    const ae = a.entity.transform.worldMatrix.elements;
    const be = b.entity.transform.worldMatrix.elements;
    // Use transformed XY basis vectors, not forward directions: parent transforms can shear.
    const ax = ae[1] * ae[6] - ae[2] * ae[5];
    const ay = ae[2] * ae[4] - ae[0] * ae[6];
    const az = ae[0] * ae[5] - ae[1] * ae[4];
    const bx = be[1] * be[6] - be[2] * be[5];
    const by = be[2] * be[4] - be[0] * be[6];
    const bz = be[0] * be[5] - be[1] * be[4];
    // A shared stencil test is valid only when the screen sample maps to the same world point.
    // Exact comparison may split nearly coplanar graphics, but must never merge distinct planes.
    return (
      (ax !== 0 || ay !== 0 || az !== 0) &&
      (bx !== 0 || by !== 0 || bz !== 0) &&
      ay * bz === az * by &&
      az * bx === ax * bz &&
      ax * by === ay * bx &&
      ax * (be[12] - ae[12]) + ay * (be[13] - ae[13]) + az * (be[14] - ae[14]) === 0
    );
  }

  fitsStencil(interaction: SpriteMaskInteraction): boolean {
    const maskCount = interaction === SpriteMaskInteraction.None ? 0 : this.masks.length;
    if (maskCount + this.outsideRects.length <= 8) return true;
    Logger.warn(
      "UI masks support at most 8 stencil ancestors (Mask and nonempty RectMask2D Outside). RectMask2D Inside does not use stencil."
    );
    return false;
  }

  contains(
    point: Vector3,
    ray: Ray,
    minDistance: number,
    maxDistance: number,
    interaction: SpriteMaskInteraction
  ): boolean {
    if (this.hasInside || this.outsideRects.length) {
      const { axisX, axisY, insideRect } = this;
      const x = point.x * axisX.x + point.y * axisX.y + point.z * axisX.z + axisX.w;
      const y = point.x * axisY.x + point.y * axisY.y + point.z * axisY.z + axisY.w;
      if (this.hasInside && (x < insideRect.x || y < insideRect.y || x > insideRect.z || y > insideRect.w))
        return false;
      for (const rect of this.outsideRects) {
        if (x >= rect.x && y >= rect.y && x <= rect.z && y <= rect.w) return false;
      }
    }
    if (interaction === SpriteMaskInteraction.None || !this.masks.length) return true;
    for (const mask of this.masks) {
      if (!mask._containsRay(ray, maxDistance, minDistance))
        return interaction === SpriteMaskInteraction.VisibleOutsideMask;
    }
    return interaction !== SpriteMaskInteraction.VisibleOutsideMask;
  }
}
