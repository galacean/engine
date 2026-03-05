import { BoundingBox, Entity, MaskRenderable, Vector2 } from "@galacean/engine";
import type { IMaskRenderable } from "@galacean/engine";
import { UIRenderer, UITransform } from "..";

export class Mask extends MaskRenderable(UIRenderer) {
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
    this._initMask();
    this.raycastEnabled = false;
  }

  /**
   * @internal
   */
  _cloneTo(target: Mask, srcRoot: Entity, targetRoot: Entity): void {
    // @ts-ignore
    super._cloneTo(target, srcRoot, targetRoot);
    this._cloneMaskData(target);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const rootCanvas = this._getRootCanvas();
    if (this.sprite && rootCanvas) {
      this._updateMaskBounds(worldBounds);
    } else {
      const { worldPosition } = this._transformEntity.transform;
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

    if (this._subChunk) {
      this._getChunkManager().freeSubChunk(this._subChunk);
      this._subChunk = null;
    }
  }

  override _getMaskWidth(): number {
    return (<UITransform>this._transformEntity.transform).size.x;
  }

  override _getMaskHeight(): number {
    return (<UITransform>this._transformEntity.transform).size.y;
  }

  override _getMaskPivot(): Vector2 {
    return (<UITransform>this._transformEntity.transform).pivot;
  }
}
