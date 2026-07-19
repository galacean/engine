import { BoundingBox } from "@galacean/engine-math";
import { Entity } from "../../Entity";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { Renderer, RendererUpdateFlags } from "../../Renderer";
import { ignoreClone } from "../../clone/CloneManager";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { SpriteModifyFlags } from "../enums/SpriteModifyFlags";
import { MaskDirtyFlags, MaskRenderable } from "./MaskRenderable";

/**
 * A component for masking Sprites.
 */
export class SpriteMask extends MaskRenderable(Renderer) {
  /** @internal */
  static _alphaCutoffProperty: ShaderProperty = ShaderProperty.getByName("renderer_MaskAlphaCutoff");
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_MaskTexture");
  /** @internal */
  @ignoreClone
  _subChunk: SubPrimitiveChunk;

  @ignoreClone
  private _automaticWidth: number = 0;
  @ignoreClone
  private _automaticHeight: number = 0;
  private _customWidth: number = undefined;
  private _customHeight: number = undefined;

  /**
   * Render width (in world coordinates).
   *
   * @remarks
   * If width is set, return the set value,
   * otherwise return `SpriteMask.sprite.width`.
   */
  get width(): number {
    if (this._customWidth !== undefined) {
      return this._customWidth;
    } else {
      this._dirtyUpdateFlag & MaskDirtyFlags.AutomaticSize && this._calDefaultSize();
      return this._automaticWidth;
    }
  }

  set width(value: number) {
    if (this._customWidth !== value) {
      this._customWidth = value;
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * Render height (in world coordinates).
   *
   * @remarks
   * If height is set, return the set value,
   * otherwise return `SpriteMask.sprite.height`.
   */
  get height(): number {
    if (this._customHeight !== undefined) {
      return this._customHeight;
    } else {
      this._dirtyUpdateFlag & MaskDirtyFlags.AutomaticSize && this._calDefaultSize();
      return this._automaticHeight;
    }
  }

  set height(value: number) {
    if (this._customHeight !== value) {
      this._customHeight = value;
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._initMask();
  }

  /**
   * @internal
   */
  override _updateTransformShaderData(context: RenderContext, onlyMVP: boolean): void {
    //@todo: Always update world positions to buffer, should opt
    this._updateWorldSpaceTransformShaderData(context, onlyMVP);
  }

  /**
   * @internal
   */
  override _cloneTo(target: SpriteMask): void {
    super._cloneTo(target);
    this._cloneMaskData(target);
  }

  /**
   * @internal
   */
  _getChunkManager(): PrimitiveChunkManager {
    return this.engine._batcherManager.primitiveChunkManagerMask;
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    this._updateMaskBounds(worldBounds);
  }

  /**
   * @inheritdoc
   */
  protected override _render(context: RenderContext): void {
    this._renderMask(this._distanceForSort);
  }

  /**
   * @inheritdoc
   */
  protected override _onDestroy(): void {
    this._destroyMaskResources();

    super._onDestroy();

    if (this._subChunk) {
      this._getChunkManager().freeSubChunk(this._subChunk);
      this._subChunk = null;
    }
  }

  override _getSpriteWidth(): number {
    return this.width;
  }

  override _getSpriteHeight(): number {
    return this.height;
  }

  override _getSpritePivot() {
    return this.sprite?.pivot;
  }

  override _onSpriteChangeExtra(type: SpriteModifyFlags): void {
    switch (type) {
      case SpriteModifyFlags.size:
        this._dirtyUpdateFlag |= MaskDirtyFlags.AutomaticSize;
        if (this._customWidth === undefined || this._customHeight === undefined) {
          this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
        }
        break;
      case SpriteModifyFlags.pivot:
        this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
        break;
    }
  }

  private _calDefaultSize(): void {
    const sprite = this.sprite;
    if (sprite) {
      this._automaticWidth = sprite.width;
      this._automaticHeight = sprite.height;
    } else {
      this._automaticWidth = this._automaticHeight = 0;
    }
    this._dirtyUpdateFlag &= ~MaskDirtyFlags.AutomaticSize;
  }
}
