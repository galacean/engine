import { Color, MathUtil } from "@galacean/engine-math";
import { Sprite, SpriteDrawMode, SpriteTileMode } from "../2d";
import { ISpriteAssembler } from "../2d/assembler/ISpriteAssembler";
import { SimpleSpriteAssembler } from "../2d/assembler/SimpleSpriteAssembler";
import { SlicedSpriteAssembler } from "../2d/assembler/SlicedSpriteAssembler";
import { TiledSpriteAssembler } from "../2d/assembler/TiledSpriteAssembler";
import { SpriteModifyFlags } from "../2d/enums/SpriteModifyFlags";
import { Entity } from "../Entity";
import { BatchUtils } from "../RenderPipeline/BatchUtils";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { SubRenderElement } from "../RenderPipeline/SubRenderElement";
import { RendererUpdateFlags } from "../Renderer";
import { assignmentClone, deepClone, ignoreClone } from "../clone/CloneManager";
import { UIRenderer, UIRendererUpdateFlags } from "./UIRenderer";

export class UIImage extends UIRenderer {
  @deepClone
  private _color: Color = new Color(1, 1, 1, 1);
  @ignoreClone
  private _sprite: Sprite = null;
  @ignoreClone
  private _drawMode: SpriteDrawMode;
  @assignmentClone
  private _assembler: ISpriteAssembler;
  @assignmentClone
  private _tileMode: SpriteTileMode = SpriteTileMode.Continuous;
  @assignmentClone
  private _tiledAdaptiveThreshold: number = 0.5;

  /**
   * The draw mode of the sprite renderer.
   */
  get drawMode(): SpriteDrawMode {
    return this._drawMode;
  }

  set drawMode(value: SpriteDrawMode) {
    if (this._drawMode !== value) {
      this._drawMode = value;
      switch (value) {
        case SpriteDrawMode.Simple:
          this._assembler = SimpleSpriteAssembler;
          break;
        case SpriteDrawMode.Sliced:
          this._assembler = SlicedSpriteAssembler;
          break;
        case SpriteDrawMode.Tiled:
          this._assembler = TiledSpriteAssembler;
          break;
        default:
          break;
      }
      this._assembler.resetData(this);
      this._dirtyUpdateFlag |= ImageUpdateFlags.VertexData;
    }
  }

  /**
   * The tiling mode of the sprite renderer. (Only works in tiled mode.)
   */
  get tileMode(): SpriteTileMode {
    return this._tileMode;
  }

  set tileMode(value: SpriteTileMode) {
    if (this._tileMode !== value) {
      this._tileMode = value;
      if (this.drawMode === SpriteDrawMode.Tiled) {
        this._dirtyUpdateFlag |= ImageUpdateFlags.VertexData;
      }
    }
  }

  /**
   * Stretch Threshold in Tile Adaptive Mode, specified in normalized. (Only works in tiled adaptive mode.)
   */
  get tiledAdaptiveThreshold(): number {
    return this._tiledAdaptiveThreshold;
  }

  set tiledAdaptiveThreshold(value: number) {
    if (value !== this._tiledAdaptiveThreshold) {
      value = MathUtil.clamp(value, 0, 1);
      this._tiledAdaptiveThreshold = value;
      if (this.drawMode === SpriteDrawMode.Tiled) {
        this._dirtyUpdateFlag |= ImageUpdateFlags.VertexData;
      }
    }
  }

  /**
   * The Sprite to render.
   */
  get sprite(): Sprite {
    return this._sprite;
  }

  set sprite(value: Sprite | null) {
    const lastSprite = this._sprite;
    if (lastSprite !== value) {
      if (lastSprite) {
        this._addResourceReferCount(lastSprite, -1);
        lastSprite._updateFlagManager.removeListener(this._onSpriteChange);
      }
      this._dirtyUpdateFlag |= ImageUpdateFlags.All;
      if (value) {
        this._addResourceReferCount(value, 1);
        value._updateFlagManager.addListener(this._onSpriteChange);
        this.shaderData.setTexture(UIRenderer._textureProperty, value.texture);
      } else {
        this.shaderData.setTexture(UIRenderer._textureProperty, null);
      }
      this._sprite = value;
    }
  }

  /**
   * Rendering color for the Sprite graphic.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    if (this._color !== value) {
      this._color.copyFrom(value);
      this._dirtyUpdateFlag |= ImageUpdateFlags.VertexColor;
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);

    this.drawMode = SpriteDrawMode.Simple;
    this._dirtyUpdateFlag |= ImageUpdateFlags.VertexColor;
    this.setMaterial(this._engine._uiDefaultMaterial);
    this._onSpriteChange = this._onSpriteChange.bind(this);
  }

  /**
   * @internal
   */
  protected override _render(context: RenderContext): void {
    const { _sprite: sprite } = this;
    const { _uiTransform: uiTransform } = this;
    const { x: width, y: height } = uiTransform.rect;
    if (!sprite?.texture || !width || !height) {
      return;
    }

    let material = this.getMaterial();
    if (!material) {
      return;
    }
    // @todo: This question needs to be raised rather than hidden.
    if (material.destroyed) {
      material = this._engine._uiDefaultMaterial;
    }

    // Update position
    if (this._dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
      this._assembler.updatePositions(this, width, height, uiTransform.pivot);
      this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
    }

    // Update uv
    if (this._dirtyUpdateFlag & ImageUpdateFlags.UV) {
      this._assembler.updateUVs(this);
      this._dirtyUpdateFlag &= ~ImageUpdateFlags.UV;
    }

    // Update color
    if (this._dirtyUpdateFlag & ImageUpdateFlags.Color) {
      this._assembler.updateColor(this, this._groupAlpha);
      this._dirtyUpdateFlag &= ~ImageUpdateFlags.Color;
    }

    // Init sub render element.
    const { engine } = context.camera;
    const renderElement = this.uiCanvas._renderElement;
    const subRenderElement = engine._subRenderElementPool.get();
    const subChunk = this._subChunk;
    subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, this.sprite.texture, subChunk);
    renderElement.addSubRenderElement(subRenderElement);
  }

  /**
   * @internal
   */
  override _canBatch(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    return BatchUtils.canBatchSprite(elementA, elementB);
  }

  /**
   * @internal
   */
  override _batch(elementA: SubRenderElement, elementB?: SubRenderElement): void {
    BatchUtils.batchFor2D(elementA, elementB);
  }

  protected override _onDestroy(): void {
    const sprite = this._sprite;
    if (sprite) {
      this._addResourceReferCount(sprite, -1);
      sprite._updateFlagManager.removeListener(this._onSpriteChange);
    }

    super._onDestroy();

    this._entity = null;
    this._color = null;
    this._sprite = null;
    this._assembler = null;
  }

  @ignoreClone
  private _onSpriteChange(type: SpriteModifyFlags): void {
    switch (type) {
      case SpriteModifyFlags.texture:
        this.shaderData.setTexture(UIRenderer._textureProperty, this.sprite.texture);
        break;
      case SpriteModifyFlags.size:
        const { _drawMode: drawMode } = this;
        switch (drawMode) {
          case SpriteDrawMode.Sliced:
            this._dirtyUpdateFlag |= ImageUpdateFlags.Position;
            break;
          case SpriteDrawMode.Tiled:
            this._dirtyUpdateFlag |= ImageUpdateFlags.VertexData;
            break;
          default:
            break;
        }
        break;
      case SpriteModifyFlags.border:
        this._drawMode === SpriteDrawMode.Sliced && (this._dirtyUpdateFlag |= ImageUpdateFlags.VertexData);
        break;
      case SpriteModifyFlags.region:
      case SpriteModifyFlags.atlasRegionOffset:
        this._dirtyUpdateFlag |= ImageUpdateFlags.PositionAndUV;
        break;
      case SpriteModifyFlags.atlasRegion:
        this._dirtyUpdateFlag |= ImageUpdateFlags.UV;
        break;
      case SpriteModifyFlags.pivot:
        this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
        break;
      case SpriteModifyFlags.destroy:
        this.sprite = null;
        break;
    }
  }
}

/**
 * @remarks Extends `RendererUpdateFlag`.
 */
enum ImageUpdateFlags {
  /** Position. */
  Position = 0x1,
  /** UV. */
  UV = 0x2,
  /** Position and UV. */
  PositionAndUV = 0x3,
  /** Vertex Color. */
  VertexColor = 0x4,
  /** Vertex data. */
  VertexData = 0x7,

  /** Vertex Color and Group Color. */
  Color = ImageUpdateFlags.VertexColor | UIRendererUpdateFlags.GroupColor,
  /** All. */
  All = 0x7 | UIRendererUpdateFlags.GroupColor
}
