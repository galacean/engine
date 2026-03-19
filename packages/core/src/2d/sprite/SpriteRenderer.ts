import { Color } from "@galacean/engine-math";
import { Entity } from "../../Entity";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { Renderer, RendererUpdateFlags } from "../../Renderer";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { SpriteMaskLayer } from "../../enums/SpriteMaskLayer";
import { Material } from "../../material";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { Texture2D } from "../../texture";
import { ISpriteLayout } from "./ISpriteLayout";
import { SpriteDrawMode } from "../enums/SpriteDrawMode";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { SpriteRenderable, SpriteRenderableFlags } from "./SpriteRenderable";
import { WorldSpriteLayout } from "./WorldSpriteLayout";

/**
 * Renders a Sprite for 2D graphics.
 */
export class SpriteRenderer extends SpriteRenderable(Renderer) {
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_SpriteTexture");

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
   * Render width (in world coordinates).
   *
   * @remarks
   * If width is set, return the set value,
   * otherwise return `SpriteRenderer.sprite.width`.
   */
  get width(): number {
    return (<WorldSpriteLayout>this._layout).width;
  }

  set width(value: number) {
    const layout = <WorldSpriteLayout>this._layout;
    if (layout.customWidth !== value) {
      layout.width = value;
      this._dirtyUpdateFlag |=
        this.drawMode === SpriteDrawMode.Tiled
          ? SpriteRenderableFlags.WorldVolumeUVAndColor
          : RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * Render height (in world coordinates).
   *
   * @remarks
   * If height is set, return the set value,
   * otherwise return `SpriteRenderer.sprite.height`.
   */
  get height(): number {
    return (<WorldSpriteLayout>this._layout).height;
  }

  set height(value: number) {
    const layout = <WorldSpriteLayout>this._layout;
    if (layout.customHeight !== value) {
      layout.height = value;
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
    return (<WorldSpriteLayout>this._layout).flipX;
  }

  set flipX(value: boolean) {
    const layout = <WorldSpriteLayout>this._layout;
    if (layout.flipX !== value) {
      layout.flipX = value;
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * Flips the sprite on the Y axis.
   */
  get flipY(): boolean {
    return (<WorldSpriteLayout>this._layout).flipY;
  }

  set flipY(value: boolean) {
    const layout = <WorldSpriteLayout>this._layout;
    if (layout.flipY !== value) {
      layout.flipY = value;
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

  /** @internal */
  override _createLayout(): ISpriteLayout {
    return new WorldSpriteLayout(() => this.sprite);
  }

  // ===== Private =====

  @ignoreClone
  private _onColorChanged(): void {
    this._dirtyUpdateFlag |= SpriteRenderableFlags.Color;
  }
}
