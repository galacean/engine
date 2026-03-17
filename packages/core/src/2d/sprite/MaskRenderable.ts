import { BoundingBox, Vector2, Vector3 } from "@galacean/engine-math";
import { BatchUtils } from "../../RenderPipeline/BatchUtils";
import { RenderElement } from "../../RenderPipeline/RenderElement";
import { RenderQueueFlags } from "../../RenderPipeline/BasicRenderPipeline";
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

/**
 * Public contract of the MaskRenderable mixin, used for declaration file generation.
 */
export interface IMaskRenderable {
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
  _getSpriteWidth(): number;
  _getSpriteHeight(): number;
  _getSpritePivot(): Vector2;
}

/**
 * Mixin that provides shared mask rendering logic for both 2D SpriteMask and UI Mask.
 */
export function MaskRenderable<T extends RendererConstructor>(
  Base: T
): (abstract new (...args: any[]) => IMaskRenderable) & T {
  abstract class MaskRenderableBase extends Base implements IMaskRenderable {
    private static _maskTextureProperty = ShaderProperty.getByName("renderer_MaskTexture");
    private static _alphaCutoffProperty = ShaderProperty.getByName("renderer_MaskAlphaCutoff");

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
      const lastSprite = this._sprite;
      if (lastSprite !== value) {
        if (lastSprite) {
          this._addResourceReferCount(lastSprite, -1);
          lastSprite._updateFlagManager.removeListener(this._onSpriteChange);
        }
        this._dirtyUpdateFlag |= MaskDirtyFlags.All;
        if (value) {
          this._addResourceReferCount(value, 1);
          value._updateFlagManager.addListener(this._onSpriteChange);
          this.shaderData.setTexture(MaskRenderableBase._maskTextureProperty, value.texture);
        } else {
          this.shaderData.setTexture(MaskRenderableBase._maskTextureProperty, null);
        }
        this._sprite = value;
      }
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
        this.shaderData.setFloat(MaskRenderableBase._alphaCutoffProperty, value);
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
        this._getSpriteWidth(),
        this._getSpriteHeight(),
        this._getSpritePivot(),
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
      this.shaderData.setFloat(MaskRenderableBase._alphaCutoffProperty, this._alphaCutoff);
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
      const sprite = this._sprite;
      if (sprite) {
        this._addResourceReferCount(sprite, -1);
        sprite._updateFlagManager.removeListener(this._onSpriteChange);
      }
      this._sprite = null;
      this._renderElement = null;
    }

    /**
     * @internal
     * Update bounds using SimpleSpriteAssembler directly.
     */
    _updateMaskBounds(worldBounds: BoundingBox): void {
      const sprite = this._sprite;
      if (sprite) {
        SimpleSpriteAssembler.updatePositions(
          this as unknown as ISpriteRenderer,
          this._transformEntity.transform.worldMatrix,
          this._getSpriteWidth(),
          this._getSpriteHeight(),
          this._getSpritePivot(),
          this._flipX,
          this._flipY
        );
      } else {
        const { worldPosition } = this._transformEntity.transform;
        worldBounds.min.copyFrom(worldPosition);
        worldBounds.max.copyFrom(worldPosition);
      }
    }

    /**
     * @internal
     * Shared render logic for mask geometry.
     */
    _renderMask(distanceForSort: number): void {
      const { _sprite: sprite } = this;
      const width = this._getSpriteWidth();
      const height = this._getSpriteHeight();
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
        SimpleSpriteAssembler.updatePositions(
          this as unknown as ISpriteRenderer,
          this._transformEntity.transform.worldMatrix,
          width,
          height,
          this._getSpritePivot(),
          this._flipX,
          this._flipY
        );
        this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
      }

      // Update uv
      if (this._dirtyUpdateFlag & MaskDirtyFlags.UV) {
        SimpleSpriteAssembler.updateUVs(this as unknown as ISpriteRenderer);
        this._dirtyUpdateFlag &= ~MaskDirtyFlags.UV;
      }

      // Push render element
      const subRenderElement = this._renderElement.subRenderElements[0];
      this._renderElement.set(this.priority, distanceForSort);
      const subChunk = (this as any)._subChunk;
      subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, sprite.texture, subChunk);
      subRenderElement.shaderPasses = material.shader.subShaders[0].passes;
      subRenderElement.renderQueueFlags = RenderQueueFlags.All;
      this._renderElement.addSubRenderElement(subRenderElement);
    }

    /** @internal */
    @ignoreClone
    _onSpriteChange(type: SpriteModifyFlags): void {
      switch (type) {
        case SpriteModifyFlags.texture:
          this.shaderData.setTexture(MaskRenderableBase._maskTextureProperty, this.sprite.texture);
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
    _getSpriteWidth(): number {
      return 0;
    }
    /** @internal */
    _getSpriteHeight(): number {
      return 0;
    }
    /** @internal */
    _getSpritePivot(): Vector2 {
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
  AutomaticSize = 0x8,
  /** WorldVolume and UV. */
  WorldVolumeAndUV = 0x3,
  /** All. */
  All = 0xb
}

type RendererConstructor = abstract new (...args: any[]) => Renderer;
