import { Color, Vector2 } from "@galacean/engine-math";
import { Entity } from "../../Entity";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { Renderer, RendererUpdateFlags } from "../../Renderer";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { SpriteMaskLayer } from "../../enums/SpriteMaskLayer";
import { Material } from "../../material";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { Texture2D } from "../../texture";
import { SpriteDrawMode } from "../enums/SpriteDrawMode";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { SpriteRenderable, SpriteRenderableFlags } from "./SpriteRenderable";

/**
 * Renders a Sprite for 2D graphics.
 */
export class SpriteRenderer extends SpriteRenderable(Renderer) {
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_SpriteTexture");

  /** @internal */
  @assignmentClone
  _maskInteraction: SpriteMaskInteraction = SpriteMaskInteraction.None;
  /** @internal */
  @assignmentClone
  _maskLayer: SpriteMaskLayer = SpriteMaskLayer.Layer0;

  @deepClone
  private _color: Color = new Color(1, 1, 1, 1);

  /**
   * Rendering color for the Sprite graphic.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    if (this._color !== value) {
      this._color.copyFrom(value);
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
   * The mask layer the sprite renderer belongs to.
   */
  get maskLayer(): SpriteMaskLayer {
    return this._maskLayer;
  }

  set maskLayer(value: SpriteMaskLayer) {
    this._maskLayer = value;
  }

  /**
   * Interacts with the masks.
   */
  get maskInteraction(): SpriteMaskInteraction {
    return this._maskInteraction;
  }

  set maskInteraction(value: SpriteMaskInteraction) {
    if (this._maskInteraction !== value) {
      this._maskInteraction = value;
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._initSpriteRenderable(SpriteRenderer._textureProperty);
    //@ts-ignore
    this._color._onValueChanged = this._onColorChanged.bind(this);
  }

  // ===== Abstract implementations =====

  /** @internal */
  override _getColor(): Color {
    return this._color;
  }

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
    return this.engine._batcherManager.primitiveChunkManager2D;
  }

  /** @internal */
  override _getDefaultSpriteMaterial(): Material {
    return this._engine._basicResources.spriteDefaultMaterial;
  }

  /** @internal */
  override _submitSpriteRenderElement(
    context: RenderContext,
    material: Material,
    subChunk: SubPrimitiveChunk,
    texture: Texture2D
  ): void {
    const camera = context.camera;
    const engine = camera.engine;
    const renderElement = engine._renderElementPool.get();
    renderElement.set(this.priority, this._distanceForSort);
    const subRenderElement = engine._subRenderElementPool.get();
    subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, texture, subChunk);
    renderElement.addSubRenderElement(subRenderElement);
    camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  // ===== Private =====

  @ignoreClone
  private _onColorChanged(): void {
    this._dirtyUpdateFlag |= SpriteRenderableFlags.Color;
  }
}