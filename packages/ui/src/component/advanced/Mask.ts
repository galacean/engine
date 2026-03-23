import {
  BoundingBox,
  Entity,
  Material,
  PrimitiveChunkManager,
  RenderContext,
  RenderQueueFlags,
  ShaderProperty,
  SubPrimitiveChunk,
  Texture2D,
  SpriteRenderable,
  assignmentClone,
  ignoreClone
} from "@galacean/engine";
import type { Vector2 } from "@galacean/engine";
import { CanvasRenderMode } from "../../enums/CanvasRenderMode";
import { UIRenderer } from "../UIRenderer";
import { UITransform } from "../UITransform";

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
    const canvas = this._getRootCanvas();
    if (!canvas) return;

    const engine = context.camera.engine;
    const subRenderElement = engine._subRenderElementPool.get();
    subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, texture, subChunk);
    subRenderElement.shaderPasses = material.shader.subShaders[0].passes;
    subRenderElement.renderQueueFlags = RenderQueueFlags.All;

    // Mark as stencil write (increment) at current stencil depth
    subRenderElement.uiStencilDepth = this._uiStencilDepth;
    subRenderElement.uiStencilOp = 1; // increment

    canvas._renderElement.addSubRenderElement(subRenderElement);
  }

  /** @internal */
  override _getSpriteWidth(): number {
    return (<UITransform>this._transformEntity.transform).size.x;
  }

  /** @internal */
  override _getSpriteHeight(): number {
    return (<UITransform>this._transformEntity.transform).size.y;
  }

  /** @internal */
  override _getSpritePivot(): Vector2 {
    return (<UITransform>this._transformEntity.transform).pivot;
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
    // @ts-ignore
    this._dirtyUpdateFlag |= 0x1; // RendererUpdateFlags.WorldVolume
  }
}
