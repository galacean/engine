import { BoundingBox, Color, MathUtil, Vector2 } from "@galacean/engine-math";
import { BatchUtils } from "../../RenderPipeline/BatchUtils";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { SubRenderElement } from "../../RenderPipeline/SubRenderElement";
import { Renderer, RendererUpdateFlags } from "../../Renderer";
import { assignmentClone, ignoreClone } from "../../clone/CloneManager";
import { Material } from "../../material";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { Texture2D } from "../../texture";
import { ISpriteAssembler } from "../assembler/ISpriteAssembler";
import { SimpleSpriteAssembler } from "../assembler/SimpleSpriteAssembler";
import { SlicedSpriteAssembler } from "../assembler/SlicedSpriteAssembler";
import { TiledSpriteAssembler } from "../assembler/TiledSpriteAssembler";
import { SpriteDrawMode } from "../enums/SpriteDrawMode";
import { SpriteModifyFlags } from "../enums/SpriteModifyFlags";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { Sprite } from "./Sprite";
import { SpritePrimitive } from "./SpritePrimitive";

/**
 * @remarks Extends `RendererUpdateFlags`.
 */
export enum SpriteRenderableFlags {
  /** Color. */
  Color = 0x2,
  /** UV. */
  UV = 0x4,

  /** WorldVolume and UV. */
  WorldVolumeAndUV = 0x5,
  /** WorldVolume, UV and Color. */
  WorldVolumeUVAndColor = 0x7,
  /** All. */
  All = 0x7
}

type RendererConstructor = abstract new (...args: any[]) => Renderer;

/**
 * Public contract of the SpriteRenderable mixin.
 */
export interface ISpriteRenderable {
  sprite: Sprite | null;
  drawMode: SpriteDrawMode;
  tileMode: SpriteTileMode;
  tiledAdaptiveThreshold: number;
  _spriteData: SpritePrimitive;
  /** @internal */
  _customWidth?: number;
  /** @internal */
  _customHeight?: number;
  /** @internal */
  _automaticWidth: number;
  /** @internal */
  _automaticHeight: number;
  /** @internal */
  _autoSizeDirty: boolean;
  /** @internal */
  _flipX: boolean;
  /** @internal */
  _flipY: boolean;
  /** @internal */
  _calDefaultSize(): void;
  _getChunkManager(): PrimitiveChunkManager;
  _getDefaultSpriteMaterial(): Material;
  _getColor(): Color | null;
  _getAlpha(): number;
  _getWidth(): number;
  _getHeight(): number;
  _getPivot(): Vector2;
  _getFlipX(): boolean;
  _getFlipY(): boolean;
  _getReferenceResolutionPerUnit(): number | undefined;
  _onSpriteSizeChanged(): void;
  _onSpritePivotChanged(): void;
  _submitSpriteRenderElement(
    context: RenderContext,
    material: Material,
    subChunk: SubPrimitiveChunk,
    texture: Texture2D
  ): void;
  _initSpriteRenderable(textureProperty: ShaderProperty): void;
}

/**
 * Wiring mixin that provides shared sprite rendering logic for both 2D SpriteRenderer and UI Image.
 *
 * Discipline: this mixin only handles wiring (forwarding, lifecycle hookup, abstract declarations).
 * All host-specific behavior is accessed through abstract methods, composition objects, and hooks.
 * The mixin NEVER touches host private fields directly.
 */
export function SpriteRenderable<T extends RendererConstructor>(
  Base: T
): (abstract new (...args: any[]) => ISpriteRenderable) & T {
  abstract class SpriteRenderableHost extends Base {
    /** @internal */
    @ignoreClone
    _spriteData: SpritePrimitive;

    @ignoreClone
    private _drawMode: SpriteDrawMode;
    @ignoreClone
    private _assembler: ISpriteAssembler;
    @assignmentClone
    private _tileMode: SpriteTileMode = SpriteTileMode.Continuous;
    @assignmentClone
    private _tiledAdaptiveThreshold: number = 0.5;

    // ===== Size management (optional, for 2D sprites) =====

    /** @internal */
    @ignoreClone
    protected _customWidth?: number;
    /** @internal */
    @ignoreClone
    protected _customHeight?: number;
    /** @internal */
    @ignoreClone
    protected _automaticWidth: number = 0;
    /** @internal */
    @ignoreClone
    protected _automaticHeight: number = 0;
    /** @internal */
    @ignoreClone
    protected _autoSizeDirty: boolean = true;
    /** @internal */
    @assignmentClone
    protected _flipX: boolean = false;
    /** @internal */
    @assignmentClone
    protected _flipY: boolean = false;

    // ===== Abstract methods: host MUST implement =====

    /** Which PrimitiveChunkManager to allocate vertex data from. */
    abstract _getChunkManager(): PrimitiveChunkManager;

    /** Default material when material is null or destroyed. */
    abstract _getDefaultSpriteMaterial(): Material;

    /** Push the final render element to the appropriate pipeline. */
    abstract _submitSpriteRenderElement(
      context: RenderContext,
      material: Material,
      subChunk: SubPrimitiveChunk,
      texture: Texture2D
    ): void;

    // ===== Abstract methods: host MUST implement (avoids MRO shadowing) =====

    /** Get width for rendering. 2D hosts use custom/automatic size; UI hosts use UITransform.size. */
    abstract _getWidth(): number;

    /** Get height for rendering. 2D hosts use custom/automatic size; UI hosts use UITransform.size. */
    abstract _getHeight(): number;

    /** Final alpha multiplier. 2D hosts return 1; UI hosts return globalAlpha. */
    abstract _getAlpha(): number;

    /** Pivot for rendering. 2D hosts return sprite pivot; UI hosts return UITransform pivot. */
    abstract _getPivot(): Vector2;

    /** Reference resolution per unit. 2D hosts return undefined; UI hosts return canvas value. */
    abstract _getReferenceResolutionPerUnit(): number | undefined;

    // ===== Methods with defaults: host CAN override =====

    /** Color for vertex coloring. Default: null (no color, for masks). */
    _getColor(): Color | null {
      return null;
    }

    /** Whether to flip X. Default: returns internal _flipX. */
    _getFlipX(): boolean {
      return this._flipX;
    }

    /** Whether to flip Y. Default: returns internal _flipY. */
    _getFlipY(): boolean {
      return this._flipY;
    }

    /** Called when sprite size changes. Default: mark auto size dirty. */
    _onSpriteSizeChanged(): void {
      this._autoSizeDirty = true;
      if (this._customWidth === undefined || this._customHeight === undefined) {
        this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
      }
    }

    /** Called when sprite pivot changes. Default: mark world volume dirty. */
    _onSpritePivotChanged(): void {
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }

    // ===== Internal helpers =====

    /**
     * Calculate default size from sprite.
     * @internal
     */
    protected _calDefaultSize(): void {
      const sprite = this._spriteData.sprite;
      if (sprite) {
        this._automaticWidth = sprite.width;
        this._automaticHeight = sprite.height;
      } else {
        this._automaticWidth = this._automaticHeight = 0;
      }
      this._autoSizeDirty = false;
    }

    // ===== Public API (forwarding) =====

    /**
     * The Sprite to render.
     */
    get sprite(): Sprite | null {
      return this._spriteData.sprite;
    }

    set sprite(value: Sprite | null) {
      this._spriteData.sprite = value;
    }

    /**
     * The draw mode of the sprite.
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
        this._assembler.resetData(this._spriteData, this._getChunkManager());
        this._dirtyUpdateFlag |= SpriteRenderableFlags.WorldVolumeUVAndColor;
      }
    }

    /**
     * The tiling mode of the sprite. (Only works in tiled mode.)
     */
    get tileMode(): SpriteTileMode {
      return this._tileMode;
    }

    set tileMode(value: SpriteTileMode) {
      if (this._tileMode !== value) {
        this._tileMode = value;
        if (this._drawMode === SpriteDrawMode.Tiled) {
          this._dirtyUpdateFlag |= SpriteRenderableFlags.WorldVolumeUVAndColor;
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
        if (this._drawMode === SpriteDrawMode.Tiled) {
          this._dirtyUpdateFlag |= SpriteRenderableFlags.WorldVolumeUVAndColor;
        }
      }
    }

    // ===== Wiring: init =====

    /**
     * Initialize sprite renderable state. Must be called from subclass constructor.
     * @param textureProperty - The shader property used for sprite texture binding.
     * @internal
     */
    _initSpriteRenderable(textureProperty: ShaderProperty): void {
      this._spriteData = new SpritePrimitive(this as any, textureProperty, this._onSpriteChanged.bind(this));
      this.drawMode = SpriteDrawMode.Simple;
      this._dirtyUpdateFlag |= SpriteRenderableFlags.Color;
      this.setMaterial(this._getDefaultSpriteMaterial());
    }

    // ===== Wiring: lifecycle =====

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
    // @ts-ignore
    override _cloneTo(target: SpriteRenderableHost): void {
      // @ts-ignore
      super._cloneTo(target);
      this._spriteData.cloneTo(target._spriteData);
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

    protected override _updateBounds(worldBounds: BoundingBox): void {
      if (this._spriteData.sprite) {
        this._assembler.updatePositions(
          this._spriteData,
          this._getChunkManager(),
          this._transformEntity.transform.worldMatrix,
          this._getWidth(),
          this._getHeight(),
          this._getPivot(),
          this._getFlipX(),
          this._getFlipY(),
          this._bounds,
          this._getReferenceResolutionPerUnit(),
          this._tileMode,
          this._tiledAdaptiveThreshold
        );
      } else {
        const { worldPosition } = this._transformEntity.transform;
        worldBounds.min.copyFrom(worldPosition);
        worldBounds.max.copyFrom(worldPosition);
      }
    }

    protected override _render(context: RenderContext): void {
      const sprite = this._spriteData.sprite;
      const width = this._getWidth();
      const height = this._getHeight();
      if (!sprite?.texture || !width || !height) {
        return;
      }

      let material = this.getMaterial();
      if (!material) {
        return;
      }
      // @todo: This question needs to be raised rather than hidden.
      if (material.destroyed) {
        material = this._getDefaultSpriteMaterial();
      }

      const color = this._getColor();
      const alpha = this._getAlpha();
      if (color && color.a * alpha <= 0) {
        return;
      }

      // Update position
      if (this._dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
        this._assembler.updatePositions(
          this._spriteData,
          this._getChunkManager(),
          this._transformEntity.transform.worldMatrix,
          this._getWidth(),
          this._getHeight(),
          this._getPivot(),
          this._getFlipX(),
          this._getFlipY(),
          this._bounds,
          this._getReferenceResolutionPerUnit(),
          this._tileMode,
          this._tiledAdaptiveThreshold
        );
        this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
      }

      // Update uv
      if (this._dirtyUpdateFlag & SpriteRenderableFlags.UV) {
        this._assembler.updateUVs(this._spriteData);
        this._dirtyUpdateFlag &= ~SpriteRenderableFlags.UV;
      }

      // Update color
      if (color && this._dirtyUpdateFlag & SpriteRenderableFlags.Color) {
        this._assembler.updateColor(this._spriteData, color, alpha);
        this._dirtyUpdateFlag &= ~SpriteRenderableFlags.Color;
      }

      // Submit
      this._submitSpriteRenderElement(context, material, this._spriteData.subChunk, sprite.texture);
    }

    protected override _onDestroy(): void {
      this._spriteData.destroy(this._getChunkManager());

      this._assembler = null;

      super._onDestroy();
    }

    // ===== Wiring: sprite change dispatch =====

    /**
     * Callback from SpritePrimitive.
     * `type === null` means sprite instance was replaced; otherwise a specific property changed.
     */
    private _onSpriteChanged(type: SpriteModifyFlags | null): void {
      if (type === null) {
        // Sprite instance replaced — mark everything dirty
        this._dirtyUpdateFlag |= SpriteRenderableFlags.All;
        this._onSpriteSizeChanged();
        return;
      }

      switch (type) {
        case SpriteModifyFlags.size:
          this._onSpriteSizeChanged();
          switch (this._drawMode) {
            case SpriteDrawMode.Sliced:
              this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
              break;
            case SpriteDrawMode.Tiled:
              this._dirtyUpdateFlag |= SpriteRenderableFlags.WorldVolumeUVAndColor;
              break;
            default:
              break;
          }
          break;
        case SpriteModifyFlags.border:
          switch (this._drawMode) {
            case SpriteDrawMode.Sliced:
              this._dirtyUpdateFlag |= SpriteRenderableFlags.WorldVolumeAndUV;
              break;
            case SpriteDrawMode.Tiled:
              this._dirtyUpdateFlag |= SpriteRenderableFlags.WorldVolumeUVAndColor;
              break;
            default:
              break;
          }
          break;
        case SpriteModifyFlags.region:
        case SpriteModifyFlags.atlasRegionOffset:
          this._dirtyUpdateFlag |= SpriteRenderableFlags.WorldVolumeAndUV;
          break;
        case SpriteModifyFlags.atlasRegion:
          this._dirtyUpdateFlag |= SpriteRenderableFlags.UV;
          break;
        case SpriteModifyFlags.pivot:
          this._onSpritePivotChanged();
          break;
        default:
          break;
      }
    }
  }

  return SpriteRenderableHost as unknown as (abstract new (...args: any[]) => ISpriteRenderable) & T;
}
