import { Vector2, Vector3 } from "@galacean/engine-math";
import { Entity } from "../../Entity";
import { RenderQueueFlags } from "../../RenderPipeline/BasicRenderPipeline";
import { BatchUtils } from "../../RenderPipeline/BatchUtils";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { RenderElement } from "../../RenderPipeline/RenderElement";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { SubRenderElement } from "../../RenderPipeline/SubRenderElement";
import { Renderer, RendererUpdateFlags } from "../../Renderer";
import { assignmentClone, ignoreClone } from "../../clone/CloneManager";
import { SpriteMaskLayer } from "../../enums/SpriteMaskLayer";
import { Material } from "../../material";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { Texture2D } from "../../texture";
import { SpriteDrawMode } from "../enums/SpriteDrawMode";
import { SpriteRenderable, SpriteRenderableFlags } from "./SpriteRenderable";
import { SpriteMaskUtils } from "./SpriteMaskUtils";

/**
 * A component for masking Sprites.
 */
export class SpriteMask extends SpriteRenderable(Renderer) {
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_MaskTexture");
  /** @internal */
  static _alphaCutoffProperty: ShaderProperty = ShaderProperty.getByName("renderer_MaskAlphaCutoff");

  /** The mask layers the sprite mask influence to. */
  @assignmentClone
  influenceLayers: SpriteMaskLayer = SpriteMaskLayer.Everything;
  /** @internal */
  @ignoreClone
  _renderElement: RenderElement;
  /** @internal */
  @ignoreClone
  _maskIndex: number = -1;

  @assignmentClone
  private _alphaCutoff: number = 0.5;

  /**
   * The minimum alpha value used by the mask to select the area of influence defined over the mask's sprite. Value between 0 and 1.
   */
  get alphaCutoff(): number {
    return this._alphaCutoff;
  }

  set alphaCutoff(value: number) {
    if (this._alphaCutoff !== value) {
      this._alphaCutoff = value;
      this.shaderData.setFloat(SpriteMask._alphaCutoffProperty, value);
    }
  }

  /**
   * Render width. If set, uses custom value; otherwise uses sprite's natural width.
   */
  get width(): number {
    return this._getWidth();
  }

  set width(value: number) {
    if (this._customWidth !== value) {
      this._customWidth = value;
      this._dirtyUpdateFlag |=
        this.drawMode === SpriteDrawMode.Tiled
          ? SpriteRenderableFlags.WorldVolumeUVAndColor
          : RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * Render height. If set, uses custom value; otherwise uses sprite's natural height.
   */
  get height(): number {
    return this._getHeight();
  }

  set height(value: number) {
    if (this._customHeight !== value) {
      this._customHeight = value;
      this._dirtyUpdateFlag |=
        this.drawMode === SpriteDrawMode.Tiled
          ? SpriteRenderableFlags.WorldVolumeUVAndColor
          : RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * Flips the sprite on the X axis.
   */
  get flipX(): boolean {
    return this._flipX;
  }

  set flipX(value: boolean) {
    if (this._flipX !== value) {
      this._flipX = value;
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * Flips the sprite on the Y axis.
   */
  get flipY(): boolean {
    return this._flipY;
  }

  set flipY(value: boolean) {
    if (this._flipY !== value) {
      this._flipY = value;
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._initSpriteRenderable(SpriteMask._textureProperty);
    this.shaderData.setFloat(SpriteMask._alphaCutoffProperty, this._alphaCutoff);
    this._renderElement = new RenderElement();
    this._renderElement.addSubRenderElement(new SubRenderElement());
  }

  // ===== SpriteRenderable abstract implementations =====

  /** @internal */
  override _getWidth(): number {
    if (this._customWidth !== undefined) {
      return this._customWidth;
    }
    if (this._autoSizeDirty) {
      this._calDefaultSize();
    }
    return this._automaticWidth;
  }

  /** @internal */
  override _getHeight(): number {
    if (this._customHeight !== undefined) {
      return this._customHeight;
    }
    if (this._autoSizeDirty) {
      this._calDefaultSize();
    }
    return this._automaticHeight;
  }

  /** @internal */
  override _getAlpha(): number {
    return 1;
  }

  /** @internal */
  override _getPivot(): Vector2 {
    return this.sprite?.pivot;
  }

  /** @internal */
  override _getReferenceResolutionPerUnit(): number | undefined {
    return undefined;
  }

  /** @internal */
  override _getChunkManager(): PrimitiveChunkManager {
    return this.engine._batcherManager.primitiveChunkManagerMask;
  }

  /** @internal */
  override _getDefaultSpriteMaterial(): Material {
    return this._engine._basicResources.spriteMaskDefaultMaterial;
  }

  /** @internal */
  override _submitSpriteRenderElement(
    context: RenderContext,
    material: Material,
    subChunk: SubPrimitiveChunk,
    texture: Texture2D
  ): void {
    const renderElement = this._renderElement;
    const subRenderElement = renderElement.subRenderElements[0];
    renderElement.set(this.priority, this._distanceForSort);
    subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, texture, subChunk);
    subRenderElement.shaderPasses = material.shader.subShaders[0].passes;
    subRenderElement.renderQueueFlags = RenderQueueFlags.All;
    renderElement.addSubRenderElement(subRenderElement);
  }

  // ===== Mask-specific overrides =====

  /** @internal */
  override _canBatch(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    return BatchUtils.canBatchSpriteMask(elementA, elementB);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    super._onEnableInScene();
    this.scene._maskManager.addSpriteMask(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    super._onDisableInScene();
    this.scene._maskManager.removeSpriteMask(this);
  }

  /**
   * @internal
   */
  _containsWorldPoint(worldPoint: Vector3): boolean {
    const sprite = this.sprite;
    if (!sprite) return false;
    return SpriteMaskUtils.containsWorldPoint(
      worldPoint,
      sprite,
      this._transformEntity.transform.worldMatrix,
      this.width,
      this.height,
      sprite.pivot,
      this.flipX,
      this.flipY,
      this.alphaCutoff
    );
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._renderElement = null;
  }
}