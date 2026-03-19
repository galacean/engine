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
  _getChunkManager(): PrimitiveChunkManager;
  _getDefaultSpriteMaterial(): Material;
  _getSpriteAlpha(): number;
  _getSpriteWidth(): number;
  _getSpriteHeight(): number;
  _getSpritePivot(): Vector2;
  _getSpriteFlipX(): boolean;
  _getSpriteFlipY(): boolean;
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

    // ===== Abstract methods: host MUST implement =====

    /** The color used by assemblers. */
    abstract get color(): Color;

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

    /** The sprite width for layout. */
    abstract _getSpriteWidth(): number;

    /** The sprite height for layout. */
    abstract _getSpriteHeight(): number;

    // ===== Methods with defaults: host CAN override =====

    /** Final alpha multiplier. Default: 1. UI hosts override to globalAlpha. */
    _getSpriteAlpha(): number {
      return 1;
    }

    /** Sprite pivot. Default: sprite's own pivot. */
    _getSpritePivot(): Vector2 {
      return this._spriteData.sprite?.pivot;
    }

    /** Whether to flip X. Default: false. */
    _getSpriteFlipX(): boolean {
      return false;
    }

    /** Whether to flip Y. Default: false. */
    _getSpriteFlipY(): boolean {
      return false;
    }

    /** Reference resolution per unit. Default: undefined. */
    _getReferenceResolutionPerUnit(): number | undefined {
      return undefined;
    }

    /** Called when sprite size changes. Host can override to mark dirty flags. */
    _onSpriteSizeChanged(): void {}

    /** Called when sprite pivot changes. Host can override to mark dirty flags. */
    _onSpritePivotChanged(): void {}

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
          this._getSpriteWidth(),
          this._getSpriteHeight(),
          this._getSpritePivot(),
          this._getSpriteFlipX(),
          this._getSpriteFlipY(),
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
      const width = this._getSpriteWidth();
      const height = this._getSpriteHeight();
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

      const alpha = this._getSpriteAlpha();
      if (this.color.a * alpha <= 0) {
        return;
      }

      // Update position
      if (this._dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
        this._assembler.updatePositions(
          this._spriteData,
          this._getChunkManager(),
          this._transformEntity.transform.worldMatrix,
          this._getSpriteWidth(),
          this._getSpriteHeight(),
          this._getSpritePivot(),
          this._getSpriteFlipX(),
          this._getSpriteFlipY(),
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
      if (this._dirtyUpdateFlag & SpriteRenderableFlags.Color) {
        this._assembler.updateColor(this._spriteData, this.color, alpha);
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
