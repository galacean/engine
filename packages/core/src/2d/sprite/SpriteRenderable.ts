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
import { ISpriteRenderer } from "../assembler/ISpriteRenderer";
import { SimpleSpriteAssembler } from "../assembler/SimpleSpriteAssembler";
import { SlicedSpriteAssembler } from "../assembler/SlicedSpriteAssembler";
import { TiledSpriteAssembler } from "../assembler/TiledSpriteAssembler";
import { SpriteDrawMode } from "../enums/SpriteDrawMode";
import { SpriteModifyFlags } from "../enums/SpriteModifyFlags";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { ISpriteLayout } from "./ISpriteLayout";
import { Sprite } from "./Sprite";
import { SpriteDataBinding } from "./SpriteDataBinding";

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
  _subChunk: SubPrimitiveChunk;
  _dataBinding: SpriteDataBinding;
  _layout: ISpriteLayout;
  _getChunkManager(): PrimitiveChunkManager;
  _getDefaultSpriteMaterial(): Material;
  _getSpriteAlpha(): number;
  _submitSpriteRenderElement(
    context: RenderContext,
    material: Material,
    subChunk: SubPrimitiveChunk,
    texture: Texture2D
  ): void;
  _createLayout(): ISpriteLayout;
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
  abstract class SpriteRenderableHost extends Base implements ISpriteRenderer {
    /** @internal */
    @ignoreClone
    _subChunk: SubPrimitiveChunk;
    /** @internal */
    @ignoreClone
    _dataBinding: SpriteDataBinding;
    /** @internal */
    @ignoreClone
    _layout: ISpriteLayout;

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

    /** Create the layout for this host type. */
    abstract _createLayout(): ISpriteLayout;

    // ===== Methods with defaults: host CAN override =====

    /** Final alpha multiplier. Default: 1. UI hosts override to globalAlpha. */
    _getSpriteAlpha(): number {
      return 1;
    }

    // ===== Public API (forwarding) =====

    /**
     * The Sprite to render.
     */
    get sprite(): Sprite | null {
      return this._dataBinding.sprite;
    }

    set sprite(value: Sprite | null) {
      this._dataBinding.sprite = value;
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
        this._assembler.resetData(this);
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
      this._dataBinding = new SpriteDataBinding(
        this as any,
        textureProperty,
        this._onSpriteChanged.bind(this)
      );
      this._layout = this._createLayout();
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
      this._dataBinding.cloneTo(target._dataBinding);
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
      const layout = this._layout;
      if (this._dataBinding.sprite) {
        this._assembler.updatePositions(
          this,
          this._transformEntity.transform.worldMatrix,
          layout.width,
          layout.height,
          layout.pivot,
          layout.flipX,
          layout.flipY,
          layout.referenceResolutionPerUnit
        );
      } else {
        const { worldPosition } = this._transformEntity.transform;
        worldBounds.min.copyFrom(worldPosition);
        worldBounds.max.copyFrom(worldPosition);
      }
    }

    protected override _render(context: RenderContext): void {
      const sprite = this._dataBinding.sprite;
      const layout = this._layout;
      const width = layout.width;
      const height = layout.height;
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
          this,
          this._transformEntity.transform.worldMatrix,
          width,
          height,
          layout.pivot,
          layout.flipX,
          layout.flipY,
          layout.referenceResolutionPerUnit
        );
        this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
      }

      // Update uv
      if (this._dirtyUpdateFlag & SpriteRenderableFlags.UV) {
        this._assembler.updateUVs(this);
        this._dirtyUpdateFlag &= ~SpriteRenderableFlags.UV;
      }

      // Update color
      if (this._dirtyUpdateFlag & SpriteRenderableFlags.Color) {
        this._assembler.updateColor(this, alpha);
        this._dirtyUpdateFlag &= ~SpriteRenderableFlags.Color;
      }

      // Submit
      this._submitSpriteRenderElement(context, material, this._subChunk, sprite.texture);
    }

    protected override _onDestroy(): void {
      this._dataBinding.destroy();

      this._assembler = null;
      this._layout = null;
      if (this._subChunk) {
        this._getChunkManager().freeSubChunk(this._subChunk);
        this._subChunk = null;
      }

      super._onDestroy();
    }

    // ===== Wiring: sprite change dispatch =====

    /**
     * Callback from SpriteDataBinding.
     * `type === null` means sprite instance was replaced; otherwise a specific property changed.
     */
    private _onSpriteChanged(type: SpriteModifyFlags | null): void {
      if (type === null) {
        // Sprite instance replaced — mark everything dirty, notify layout
        this._dirtyUpdateFlag |= SpriteRenderableFlags.All;
        this._layout.onSpriteInstanceChanged();
        return;
      }

      switch (type) {
        case SpriteModifyFlags.size:
          this._dirtyUpdateFlag |= this._layout.onSpriteSizeChanged();
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
          this._dirtyUpdateFlag |= this._layout.onSpritePivotChanged();
          break;
        default:
          break;
      }
    }
  }

  return SpriteRenderableHost as unknown as (abstract new (...args: any[]) => ISpriteRenderable) & T;
}
