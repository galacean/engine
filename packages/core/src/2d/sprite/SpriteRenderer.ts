import { BoundingBox, Color, MathUtil } from "@galacean/engine-math";
import { Entity } from "../../Entity";
import { BatchUtils } from "../../RenderPipeline/BatchUtils";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { SubRenderElement } from "../../RenderPipeline/SubRenderElement";
import { Renderer, RendererUpdateFlags } from "../../Renderer";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ISpriteAssembler } from "../assembler/ISpriteAssembler";
import { ISpriteRenderer } from "../assembler/ISpriteRenderer";
import { SimpleSpriteAssembler } from "../assembler/SimpleSpriteAssembler";
import { SlicedSpriteAssembler } from "../assembler/SlicedSpriteAssembler";
import { TiledSpriteAssembler } from "../assembler/TiledSpriteAssembler";
import { SpriteDrawMode } from "../enums/SpriteDrawMode";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { SpriteModifyFlags } from "../enums/SpriteModifyFlags";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { Sprite } from "./Sprite";
import { SpriteMaskLayer } from "../../enums/SpriteMaskLayer";

/**
 * Renders a Sprite for 2D graphics.
 */
export class SpriteRenderer extends Renderer implements ISpriteRenderer {
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_SpriteTexture");

  /** @internal */
  @ignoreClone
  _subChunk: SubPrimitiveChunk;

  @ignoreClone
  private _drawMode: SpriteDrawMode;
  @ignoreClone
  private _assembler: ISpriteAssembler;
  @assignmentClone
  private _tileMode: SpriteTileMode = SpriteTileMode.Continuous;
  @assignmentClone
  private _tiledAdaptiveThreshold: number = 0.5;

  @deepClone
  private _color: Color = new Color(1, 1, 1, 1);
  @ignoreClone
  private _sprite: Sprite = null;

  @ignoreClone
  private _automaticWidth: number = 0;
  @ignoreClone
  private _automaticHeight: number = 0;
  @assignmentClone
  private _customWidth: number = undefined;
  @assignmentClone
  private _customHeight: number = undefined;
  @assignmentClone
  private _flipX: boolean = false;
  @assignmentClone
  private _flipY: boolean = false;

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
      this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.WorldVolumeUVAndColor;
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
        this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.WorldVolumeUVAndColor;
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
        this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.WorldVolumeUVAndColor;
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
      this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.All;
      if (value) {
        this._addResourceReferCount(value, 1);
        value._updateFlagManager.addListener(this._onSpriteChange);
        this.shaderData.setTexture(SpriteRenderer._textureProperty, value.texture);
      } else {
        this.shaderData.setTexture(SpriteRenderer._textureProperty, null);
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
    if (this._customWidth !== undefined) {
      return this._customWidth;
    } else {
      this._dirtyUpdateFlag & SpriteRendererUpdateFlags.AutomaticSize && this._calDefaultSize();
      return this._automaticWidth;
    }
  }

  set width(value: number) {
    if (this._customWidth !== value) {
      this._customWidth = value;
      this._dirtyUpdateFlag |=
        this._drawMode === SpriteDrawMode.Tiled
          ? SpriteRendererUpdateFlags.WorldVolumeUVAndColor
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
    if (this._customHeight !== undefined) {
      return this._customHeight;
    } else {
      this._dirtyUpdateFlag & SpriteRendererUpdateFlags.AutomaticSize && this._calDefaultSize();
      return this._automaticHeight;
    }
  }

  set height(value: number) {
    if (this._customHeight !== value) {
      this._customHeight = value;
      this._dirtyUpdateFlag |=
        this._drawMode === SpriteDrawMode.Tiled
          ? SpriteRendererUpdateFlags.WorldVolumeUVAndColor
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
    this.drawMode = SpriteDrawMode.Simple;
    this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.Color;
    this.setMaterial(this._engine._basicResources.spriteDefaultMaterial);
    this._onSpriteChange = this._onSpriteChange.bind(this);
    //@ts-ignore
    this._color._onValueChanged = this._onColorChanged.bind(this);
  }

  /**
   * @internal
   */
  override _updateTransformShaderData(context: RenderContext, onlyMVP: boolean, batched: boolean): void {
    //@todo: Always update world positions to buffer, should opt
    super._updateTransformShaderData(context, onlyMVP, true);
  }

  /**
   * @internal
   */
  override _cloneTo(target: SpriteRenderer, srcRoot: Entity, targetRoot: Entity): void {
    super._cloneTo(target, srcRoot, targetRoot);
    target.sprite = this._sprite;
    target.drawMode = this._drawMode;
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

  /**
   * @internal
   */
  _getChunkManager(): PrimitiveChunkManager {
    return this.engine._batcherManager.primitiveChunkManager2D;
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const sprite = this._sprite;
    if (sprite) {
      this._assembler.updatePositions(
        this,
        this._transformEntity.transform.worldMatrix,
        this.width,
        this.height,
        sprite.pivot,
        this._flipX,
        this._flipY
      );
    } else {
      const { worldPosition } = this._transformEntity.transform;
      worldBounds.min.copyFrom(worldPosition);
      worldBounds.max.copyFrom(worldPosition);
    }
  }

  protected override _render(context: RenderContext): void {
    const { _sprite: sprite } = this;
    if (!sprite?.texture || !this.width || !this.height) {
      return;
    }

    let material = this.getMaterial();
    if (!material) {
      return;
    }
    // @todo: This question needs to be raised rather than hidden.
    if (material.destroyed) {
      material = this._engine._basicResources.spriteDefaultMaterial;
    }

    // Update position
    if (this._dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
      this._assembler.updatePositions(
        this,
        this._transformEntity.transform.worldMatrix,
        this.width,
        this.height,
        sprite.pivot,
        this._flipX,
        this._flipY
      );
      this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
    }

    // Update uv
    if (this._dirtyUpdateFlag & SpriteRendererUpdateFlags.UV) {
      this._assembler.updateUVs(this);
      this._dirtyUpdateFlag &= ~SpriteRendererUpdateFlags.UV;
    }

    // Update color
    if (this._dirtyUpdateFlag & SpriteRendererUpdateFlags.Color) {
      this._assembler.updateColor(this, 1);
      this._dirtyUpdateFlag &= ~SpriteRendererUpdateFlags.Color;
    }

    // Push primitive
    const camera = context.camera;
    const engine = camera.engine;
    const renderElement = engine._renderElementPool.get();
    renderElement.set(this.priority, this._distanceForSort);
    const subRenderElement = engine._subRenderElementPool.get();
    const subChunk = this._subChunk;
    subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, this.sprite.texture, subChunk);
    renderElement.addSubRenderElement(subRenderElement);
    camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  protected override _onDestroy(): void {
    const sprite = this._sprite;
    if (sprite) {
      this._addResourceReferCount(sprite, -1);
      sprite._updateFlagManager.removeListener(this._onSpriteChange);
    }

    super._onDestroy();

    this._sprite = null;
    this._assembler = null;
    if (this._subChunk) {
      this._getChunkManager().freeSubChunk(this._subChunk);
      this._subChunk = null;
    }
  }

  private _calDefaultSize(): void {
    const sprite = this._sprite;
    if (sprite) {
      this._automaticWidth = sprite.width;
      this._automaticHeight = sprite.height;
    } else {
      this._automaticWidth = this._automaticHeight = 0;
    }
    this._dirtyUpdateFlag &= ~SpriteRendererUpdateFlags.AutomaticSize;
  }

  @ignoreClone
  private _onSpriteChange(type: SpriteModifyFlags): void {
    switch (type) {
      case SpriteModifyFlags.texture:
        this.shaderData.setTexture(SpriteRenderer._textureProperty, this.sprite.texture);
        break;
      case SpriteModifyFlags.size:
        this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.AutomaticSize;
        if (this._customWidth === undefined || this._customHeight === undefined) {
          this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
        }
        switch (this._drawMode) {
          case SpriteDrawMode.Simple:
            // When the width and height of `SpriteRenderer` are `undefined`,
            // the `size` of `Sprite` will affect the position of `SpriteRenderer`.
            if (this._customWidth === undefined || this._customHeight === undefined) {
              this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
            }
            break;
          case SpriteDrawMode.Sliced:
            this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
            break;
          case SpriteDrawMode.Tiled:
            this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.WorldVolumeUVAndColor;
            break;
        }
        break;
      case SpriteModifyFlags.border:
        switch (this._drawMode) {
          case SpriteDrawMode.Sliced:
            this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.WorldVolumeAndUV;
            break;
          case SpriteDrawMode.Tiled:
            this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.WorldVolumeUVAndColor;
            break;
          default:
            break;
        }
        break;
      case SpriteModifyFlags.region:
      case SpriteModifyFlags.atlasRegionOffset:
        this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.WorldVolumeAndUV;
        break;
      case SpriteModifyFlags.atlasRegion:
        this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.UV;
        break;
      case SpriteModifyFlags.pivot:
        this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
        break;
      case SpriteModifyFlags.destroy:
        this.sprite = null;
        break;
    }
  }

  @ignoreClone
  private _onColorChanged(): void {
    this._dirtyUpdateFlag |= SpriteRendererUpdateFlags.Color;
  }
}

/**
 * @remarks Extends `RendererUpdateFlags`.
 */
enum SpriteRendererUpdateFlags {
  /** UV. */
  UV = 0x2,
  /** Color. */
  Color = 0x4,
  /** Automatic Size. */
  AutomaticSize = 0x8,

  /** WorldVolume and UV. */
  WorldVolumeAndUV = 0x3,
  /** WorldVolume, UV and Color. */
  WorldVolumeUVAndColor = 0x7,
  /** All. */
  All = 0xf
}
