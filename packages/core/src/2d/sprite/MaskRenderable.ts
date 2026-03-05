import { BoundingBox, Vector2, Vector3 } from "@galacean/engine-math";
import { BatchUtils } from "../../RenderPipeline/BatchUtils";
import { IMask } from "../../RenderPipeline/MaskManager";
import { RenderElement } from "../../RenderPipeline/RenderElement";
import { SubRenderElement } from "../../RenderPipeline/SubRenderElement";
import { Renderer, RendererUpdateFlags } from "../../Renderer";
import { assignmentClone, ignoreClone } from "../../clone/CloneManager";
import { SpriteMaskLayer } from "../../enums/SpriteMaskLayer";
import { ShaderProperty } from "../../shader/ShaderProperty";
import type { ISpriteRenderer } from "../assembler/ISpriteRenderer";
import { SimpleSpriteAssembler } from "../assembler/SimpleSpriteAssembler";
import { SpriteModifyFlags } from "../enums/SpriteModifyFlags";
import { Sprite } from "./Sprite";
import { SpriteMaskUtils } from "./SpriteMaskUtils";

type RendererConstructor = abstract new (...args: any[]) => Renderer;

/** @internal */
const _maskTextureProperty = ShaderProperty.getByName("renderer_MaskTexture");
/** @internal */
const _alphaCutoffProperty = ShaderProperty.getByName("renderer_MaskAlphaCutoff");

/**
 * Public contract of the MaskRenderable mixin, used for declaration file generation.
 */
export interface IMaskRenderable extends IMask {
  influenceLayers: SpriteMaskLayer;
  flipX: boolean;
  flipY: boolean;
  sprite: Sprite;
  alphaCutoff: number;
  _renderElement: RenderElement;
  _maskIndex: number;
  _containsWorldPoint(worldPoint: Vector3): boolean;
  _initMask(): void;
  _cloneMaskData(target: IMaskRenderable): void;
  _destroyMaskResources(): void;
  _updateMaskBounds(worldBounds: BoundingBox): void;
  _renderMask(distanceForSort: number): void;
  _onSpriteChange(type: SpriteModifyFlags): void;
  _onSpriteChangeExtra(type: SpriteModifyFlags): void;
  _getMaskWidth(): number;
  _getMaskHeight(): number;
  _getMaskPivot(): Vector2;
}

/**
 * Mixin that provides shared mask rendering logic for both 2D SpriteMask and UI Mask.
 */
export function MaskRenderable<T extends RendererConstructor>(
  Base: T
): (abstract new (...args: any[]) => IMaskRenderable) & T {
  abstract class MaskRenderableBase extends Base implements IMask {
    @assignmentClone
    private _influenceLayers: SpriteMaskLayer = SpriteMaskLayer.Everything;
    /** @internal */
    @ignoreClone
    _renderElement: RenderElement;
    /** @internal */
    @ignoreClone
    _maskIndex: number = -1;
    @ignoreClone
    private _sprite: Sprite = null;
    @assignmentClone
    private _flipX: boolean = false;
    @assignmentClone
    private _flipY: boolean = false;
    @assignmentClone
    private _alphaCutoff: number = 0.5;

    /**
     * The mask layers the sprite mask influence to.
     */
    get influenceLayers(): SpriteMaskLayer {
      return this._influenceLayers;
    }

    set influenceLayers(value: SpriteMaskLayer) {
      if (this._influenceLayers !== value) {
        this._influenceLayers = value;
        if (this._phasedActiveInScene) {
          // @ts-ignore
          this.scene._maskManager.onMaskInfluenceLayersChange();
        }
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
     * The Sprite to render.
     */
    get sprite(): Sprite {
      return this._sprite;
    }

    set sprite(value: Sprite | null) {
      this._sprite = SpriteMaskUtils.setSprite(
        this,
        this._sprite,
        value,
        this._onSpriteChange,
        _maskTextureProperty,
        MaskDirtyFlags.All
      );
    }

    /**
     * The minimum alpha value used by the mask to select the area of influence defined over the mask's sprite. Value between 0 and 1.
     */
    get alphaCutoff(): number {
      return this._alphaCutoff;
    }

    set alphaCutoff(value: number) {
      if (this._alphaCutoff !== value) {
        this._alphaCutoff = value;
        this.shaderData.setFloat(_alphaCutoffProperty, value);
      }
    }

    /**
     * @internal
     */
    override _canBatch(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
      return BatchUtils.canBatchSpriteMask(elementA, elementB);
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
    // @ts-ignore
    override _onEnableInScene(): void {
      // @ts-ignore
      super._onEnableInScene();
      // @ts-ignore
      this.scene._maskManager.addSpriteMask(this);
    }

    /**
     * @internal
     */
    // @ts-ignore
    override _onDisableInScene(): void {
      // @ts-ignore
      super._onDisableInScene();
      // @ts-ignore
      this.scene._maskManager.removeSpriteMask(this);
    }

    /**
     * @internal
     */
    _containsWorldPoint(worldPoint: Vector3): boolean {
      return SpriteMaskUtils.containsWorldPoint(
        worldPoint,
        this._sprite,
        this._transformEntity.transform.worldMatrix,
        this._getMaskWidth(),
        this._getMaskHeight(),
        this._getMaskPivot(),
        this._flipX,
        this._flipY,
        this._alphaCutoff
      );
    }

    /**
     * @internal
     * Initialize shared mask resources. Must be called from subclass constructor.
     */
    _initMask(): void {
      SimpleSpriteAssembler.resetData(this as unknown as ISpriteRenderer);
      // @ts-ignore
      this.setMaterial(this._engine._basicResources.spriteMaskDefaultMaterial);
      this.shaderData.setFloat(_alphaCutoffProperty, this._alphaCutoff);
      this._renderElement = new RenderElement();
      this._renderElement.addSubRenderElement(new SubRenderElement());
      this._onSpriteChange = this._onSpriteChange.bind(this);
    }

    /**
     * @internal
     * Clone mask data to target. Called from subclass _cloneTo.
     */
    _cloneMaskData(target: MaskRenderableBase): void {
      target.sprite = this._sprite;
    }

    /**
     * @internal
     * Release mask sprite resources. Called from subclass _onDestroy.
     */
    _destroyMaskResources(): void {
      SpriteMaskUtils.releaseSprite(this, this._sprite, this._onSpriteChange);
      this._sprite = null;
      this._renderElement = null;
    }

    /**
     * @internal
     * Shared update-bounds logic via SpriteMaskUtils.
     */
    _updateMaskBounds(worldBounds: BoundingBox): void {
      const transform = this._transformEntity.transform;
      SpriteMaskUtils.updateBounds(
        this as unknown as ISpriteRenderer,
        this._sprite,
        worldBounds,
        transform.worldMatrix,
        transform.worldPosition,
        this._getMaskWidth(),
        this._getMaskHeight(),
        this._getMaskPivot(),
        this._flipX,
        this._flipY
      );
    }

    /**
     * @internal
     * Shared render logic for mask geometry.
     */
    _renderMask(distanceForSort: number): void {
      const { _sprite: sprite } = this;
      const width = this._getMaskWidth();
      const height = this._getMaskHeight();
      if (!sprite?.texture || !width || !height) {
        return;
      }

      let material = this.getMaterial();
      if (!material) {
        return;
      }
      // @ts-ignore
      if (material.destroyed) {
        // @ts-ignore
        material = this._engine._basicResources.spriteMaskDefaultMaterial;
      }

      // Update position
      if (this._dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
        SpriteMaskUtils.updatePositions(
          this as unknown as ISpriteRenderer,
          this._transformEntity.transform.worldMatrix,
          width,
          height,
          this._getMaskPivot(),
          this._flipX,
          this._flipY
        );
        this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
      }

      // Update uv
      if (this._dirtyUpdateFlag & MaskDirtyFlags.UV) {
        SpriteMaskUtils.updateUVs(this as unknown as ISpriteRenderer);
        this._dirtyUpdateFlag &= ~MaskDirtyFlags.UV;
      }

      SpriteMaskUtils.setupRenderElement(
        this._renderElement,
        this,
        material,
        (this as any)._subChunk,
        sprite.texture,
        distanceForSort
      );
    }

    /** @internal */
    @ignoreClone
    _onSpriteChange(type: SpriteModifyFlags): void {
      switch (type) {
        case SpriteModifyFlags.texture:
          this.shaderData.setTexture(_maskTextureProperty, this.sprite.texture);
          break;
        case SpriteModifyFlags.region:
        case SpriteModifyFlags.atlasRegionOffset:
          this._dirtyUpdateFlag |= MaskDirtyFlags.WorldVolumeAndUV;
          break;
        case SpriteModifyFlags.atlasRegion:
          this._dirtyUpdateFlag |= MaskDirtyFlags.UV;
          break;
        case SpriteModifyFlags.destroy:
          this.sprite = null;
          break;
        default:
          this._onSpriteChangeExtra(type);
          break;
      }
    }

    /**
     * @internal
     * Hook for subclass-specific sprite change handling.
     * SpriteMask overrides this to handle size/pivot changes.
     */
    _onSpriteChangeExtra(type: SpriteModifyFlags): void {}

    /** @internal */
    _getMaskWidth(): number {
      return 0;
    }
    /** @internal */
    _getMaskHeight(): number {
      return 0;
    }
    /** @internal */
    _getMaskPivot(): Vector2 {
      return null;
    }
  }

  return MaskRenderableBase as unknown as (abstract new (...args: any[]) => IMaskRenderable) & T;
}

/**
 * @remarks Extends `RendererUpdateFlags`.
 */
export enum MaskDirtyFlags {
  /** UV. */
  UV = 0x2,
  /** Automatic Size. */
  AutomaticSize = 0x4,
  /** WorldVolume and UV. */
  WorldVolumeAndUV = 0x3,
  /** All. */
  All = 0x7
}
