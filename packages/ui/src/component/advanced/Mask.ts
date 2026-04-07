import {
  BoundingBox,
  Entity,
  Material,
  PrimitiveChunkManager,
  RenderContext,
  RendererUpdateFlags,
  ShaderProperty,
  SubPrimitiveChunk,
  Texture2D,
  SpriteRenderable,
  assignmentClone,
  ignoreClone
} from "@galacean/engine";
import { UIRenderer } from "../UIRenderer";

/**
 * UI component that masks descendant UI elements using a sprite shape.
 *
 * @remarks
 * Uses stencil buffer. All UIRenderers that are descendants of the Mask's entity
 * are automatically clipped to the mask shape — no manual maskInteraction setup needed.
 */
export class Mask extends SpriteRenderable(UIRenderer) {
  /** @internal */
  static _maskTextureProperty: ShaderProperty = ShaderProperty.getByName("renderer_MaskTexture");
  /** @internal */
  static _alphaCutoffProperty: ShaderProperty = ShaderProperty.getByName("renderer_MaskAlphaCutoff");

  @assignmentClone
  private _alphaCutoff: number = 0.5;

  /**
   * The minimum alpha value used by the mask to select the area of influence.
   * Value between 0 and 1.
   */
  get alphaCutoff(): number {
    return this._alphaCutoff;
  }

  set alphaCutoff(value: number) {
    if (this._alphaCutoff !== value) {
      this._alphaCutoff = value;
      this.shaderData.setFloat(Mask._alphaCutoffProperty, value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._initSpriteRenderable(Mask._maskTextureProperty);
    this.shaderData.setFloat(Mask._alphaCutoffProperty, this._alphaCutoff);
    this.raycastEnabled = false;
  }

  // ===== SpriteRenderable abstract implementations =====

  /** @internal */
  override _getChunkManager(): PrimitiveChunkManager {
    // @ts-ignore
    return this.engine._batcherManager.primitiveChunkManagerMask;
  }

  /** @internal */
  override _getDefaultSpriteMaterial(): Material {
    // @ts-ignore
    return this._engine._basicResources.spriteMaskDefaultMaterial;
  }

  /** @internal */
  override _submitSpriteRenderElement(
    context: RenderContext,
    material: Material,
    subChunk: SubPrimitiveChunk,
    texture: Texture2D
  ): void {
    // stencilOp = 1 (increment), forceAllRenderQueue = true
    this._submitToCanvas(context, material, subChunk, texture, 1, true);
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
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }
}