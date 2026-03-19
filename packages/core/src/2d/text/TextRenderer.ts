import { Color } from "@galacean/engine-math";
import { Entity } from "../../Entity";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Renderer } from "../../Renderer";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { SpriteMaskLayer } from "../../enums/SpriteMaskLayer";
import { ShaderData } from "../../shader";
import { ShaderDataGroup } from "../../shader/enums/ShaderDataGroup";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { ISpriteLayout } from "../sprite/ISpriteLayout";
import { Material } from "../../material";
import { TextChunk, TextRenderable, TextRenderableFlags } from "./TextRenderable";
import { WorldTextLayout } from "./WorldTextLayout";

/**
 * Renders a text for 2D graphics.
 */
export class TextRenderer extends TextRenderable(Renderer) {
  @deepClone
  private _color = new Color(1, 1, 1, 1);

  /**
   * Rendering color for the Text.
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
   * The width of the TextRenderer (in 3D world coordinates).
   */
  get width(): number {
    return (<WorldTextLayout>this._layout).width;
  }

  set width(value: number) {
    const layout = <WorldTextLayout>this._layout;
    if (layout.width !== value) {
      layout.width = value;
      this._setDirtyFlagTrue(TextRenderableFlags.Position);
    }
  }

  /**
   * The height of the TextRenderer (in 3D world coordinates).
   */
  get height(): number {
    return (<WorldTextLayout>this._layout).height;
  }

  set height(value: number) {
    const layout = <WorldTextLayout>this._layout;
    if (layout.height !== value) {
      layout.height = value;
      this._setDirtyFlagTrue(TextRenderableFlags.Position);
    }
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
   * The mask layer the sprite renderer belongs to.
   */
  get maskLayer(): SpriteMaskLayer {
    return this._maskLayer;
  }

  set maskLayer(value: SpriteMaskLayer) {
    this._maskLayer = value;
  }

  constructor(entity: Entity) {
    super(entity);
    this._initTextRenderable();
    this._dirtyUpdateFlag |= TextRenderableFlags.Font;
    //@ts-ignore
    this._color._onValueChanged = this._onColorChanged.bind(this);
  }

  // ===== Abstract implementations =====

  override _getChunkManager(): PrimitiveChunkManager {
    return this.engine._batcherManager.primitiveChunkManager2D;
  }

  override _createLayout(): ISpriteLayout {
    return new WorldTextLayout();
  }

  override _submitText(context: RenderContext, material: Material): void {
    const camera = context.camera;
    const engine = camera.engine;
    const textSubRenderElementPool = engine._textSubRenderElementPool;
    const renderElement = engine._renderElementPool.get();
    renderElement.set(this.priority, this._distanceForSort);
    const textChunks = this._getTextChunks();
    const textureProperty = this._getTextTextureProperty();
    for (let i = 0, n = textChunks.length; i < n; ++i) {
      const { subChunk, texture } = textChunks[i];
      const subRenderElement = textSubRenderElementPool.get();
      subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, texture, subChunk);
      subRenderElement.shaderData ||= new ShaderData(ShaderDataGroup.RenderElement);
      subRenderElement.shaderData.setTexture(textureProperty, texture);
      renderElement.addSubRenderElement(subRenderElement);
    }
    camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  // ===== Private =====

  @ignoreClone
  private _onColorChanged(): void {
    this._setDirtyFlagTrue(TextRenderableFlags.Color);
  }
}
