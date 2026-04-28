import {
  BoundingBox,
  Entity,
  Material,
  RenderContext,
  RendererUpdateFlags,
  SpriteDrawMode,
  SpriteRenderable,
  SpriteRenderableFlags,
  SubPrimitiveChunk,
  Texture2D,
  ignoreClone
} from "@galacean/engine";
import { RootCanvasModifyFlags } from "../UICanvas";
import { UIRenderer } from "../UIRenderer";
import { UITransform, UITransformModifyFlags } from "../UITransform";

/**
 * UI element that renders an image.
 */
export class Image extends SpriteRenderable(UIRenderer) {
  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._initSpriteRenderable(UIRenderer._textureProperty);
  }

  // ===== Abstract implementations =====

  /** @internal */
  override _getColor() {
    return this._color;
  }

  /** @internal */
  override _getDefaultSpriteMaterial(): Material {
    // @ts-ignore
    return this._engine._getUIDefaultMaterial();
  }

  /** @internal */
  override _submitSpriteRenderElement(
    context: RenderContext,
    material: Material,
    subChunk: SubPrimitiveChunk,
    texture: Texture2D
  ): void {
    this._submitToCanvas(context, material, subChunk, texture);
  }

  // ===== Image-specific =====

  /**
   * @internal
   */
  _onRootCanvasModify(flag: RootCanvasModifyFlags): void {
    if (flag & RootCanvasModifyFlags.ReferenceResolutionPerUnit) {
      const drawMode = this.drawMode;
      if (drawMode === SpriteDrawMode.Tiled) {
        this._dirtyUpdateFlag |= SpriteRenderableFlags.All;
      } else if (drawMode === SpriteDrawMode.Sliced) {
        this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
      }
    }
  }

  /**
   * @internal
   */
  // @ts-ignore
  _cloneTo(target: Image): void {
    // @ts-ignore
    super._cloneTo(target);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const rootCanvas = this._getRootCanvas();
    if (this.sprite && rootCanvas) {
      super._updateBounds(worldBounds);
    } else {
      const { worldPosition } = this._transformEntity.transform;
      worldBounds.min.copyFrom(worldPosition);
      worldBounds.max.copyFrom(worldPosition);
    }
  }

  @ignoreClone
  protected override _onTransformChanged(type: number): void {
    if (type & UITransformModifyFlags.Size && this.drawMode === SpriteDrawMode.Tiled) {
      this._dirtyUpdateFlag |= SpriteRenderableFlags.All;
    }
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }
}