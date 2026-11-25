import { BoundingBox, Entity, MaskRenderable, SpriteMaskInteraction, Vector2 } from "@galacean/engine";
import type { IMaskRenderable } from "@galacean/engine";
import { UIRenderer } from "../UIRenderer";
import { UITransform } from "../UITransform";

/**
 * Clips descendant UI graphics to this sprite's alpha shape.
 * Nested Masks intersect; siblings and other canvases are unaffected.
 * Raycast filtering tests the mask sprite's rectangular bounds without GPU pixel readback.
 * Image Masks and nonempty Outside RectMask2D ancestors share an eight-level stencil limit.
 * Screen targets acquire stencil on demand; custom targets must supply a stencil attachment.
 * UI manages these bits while masks are active;
 * custom stencil materials must not depend on preserving their values across UI mask draws.
 */
export class Mask extends MaskRenderable(UIRenderer) {
  /** @internal */
  override _getUIMask(): IMaskRenderable {
    return this;
  }

  /**
   * @internal
   */
  override _getChunkManager() {
    // @ts-ignore
    return this.engine._batcherManager.primitiveChunkManagerMask;
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._maskInteraction = SpriteMaskInteraction.None;
    this._initMask();
    this.raycastEnabled = false;
  }

  /**
   * @internal
   */
  override _onClone(target: Mask): void {
    // @ts-ignore
    super._onClone(target);
    this._cloneMaskData(target);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const rootCanvas = this._getRootCanvas();
    if (this.sprite && rootCanvas) {
      this._updateMaskBounds(worldBounds);
    } else {
      const { worldPosition } = this._transformEntity!.transform;
      worldBounds.min.copyFrom(worldPosition);
      worldBounds.max.copyFrom(worldPosition);
    }
  }

  /**
   * @inheritdoc
   */
  protected override _render(context): void {
    this._renderMask(0);
  }

  /**
   * @inheritdoc
   */
  protected override _onDestroy(): void {
    this._destroyMaskResources();

    super._onDestroy();
  }

  override _getSpriteWidth(): number {
    return (<UITransform>this._transformEntity!.transform).size.x;
  }

  override _getSpriteHeight(): number {
    return (<UITransform>this._transformEntity!.transform).size.y;
  }

  override _getSpritePivot(): Vector2 {
    return (<UITransform>this._transformEntity!.transform).pivot;
  }
}
