import {
  assignmentClone,
  BatchUtils,
  BoundingBox,
  Entity,
  ignoreClone,
  ISpriteRenderer,
  RenderElement,
  RendererUpdateFlags,
  ShaderProperty,
  SimpleSpriteAssembler,
  Sprite,
  SpriteMaskLayer,
  SpriteMaskUtils,
  SpriteModifyFlags,
  SubRenderElement,
  Vector3
} from "@galacean/engine";
import { UIRenderer, UITransform } from "..";

export class Mask extends UIRenderer implements ISpriteRenderer {
  /** @internal */
  static _maskTextureProperty: ShaderProperty = ShaderProperty.getByName("renderer_MaskTexture");
  /** @internal */
  static _alphaCutoffProperty: ShaderProperty = ShaderProperty.getByName("renderer_MaskAlphaCutoff");

  /** The mask layers the sprite mask influence to. */
  @assignmentClone
  private _influenceLayers: SpriteMaskLayer = SpriteMaskLayer.Everything;
  /** @internal */
  @ignoreClone
  _renderElement;
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
   * @internal
   */
  override _getChunkManager() {
    // @ts-ignore
    return this.engine._batcherManager.primitiveChunkManagerMask;
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
      Mask._maskTextureProperty,
      MaskUpdateFlags.All
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
      this.shaderData.setFloat(Mask._alphaCutoffProperty, value);
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
  constructor(entity: Entity) {
    super(entity);
    SimpleSpriteAssembler.resetData(this);
    // @ts-ignore
    this.setMaterial(this._engine._basicResources.spriteMaskDefaultMaterial);
    this.shaderData.setFloat(Mask._alphaCutoffProperty, this._alphaCutoff);
    this._renderElement = new RenderElement();
    this._renderElement.addSubRenderElement(new SubRenderElement());
    this._onSpriteChange = this._onSpriteChange.bind(this);
    this.raycastEnabled = false;
  }

  /**
   * @internal
   */
  _cloneTo(target: Mask, srcRoot: Entity, targetRoot: Entity): void {
    // @ts-ignore
    super._cloneTo(target, srcRoot, targetRoot);
    target.sprite = this._sprite;
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    super._onEnableInScene();
    // @ts-ignore
    this.scene._maskManager.addSpriteMask(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    super._onDisableInScene();
    // @ts-ignore
    this.scene._maskManager.removeSpriteMask(this);
  }

  /**
   * @internal
   */
  _containsWorldPoint(worldPoint: Vector3): boolean {
    const { _sprite: sprite } = this;
    const transform = <UITransform>this._transformEntity.transform;
    const { x: width, y: height } = transform.size;
    return SpriteMaskUtils.containsWorldPoint(
      worldPoint,
      sprite,
      transform.worldMatrix,
      width,
      height,
      transform.pivot,
      this._flipX,
      this._flipY,
      this._alphaCutoff
    );
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const sprite = this._sprite;
    const rootCanvas = this._getRootCanvas();
    if (sprite && rootCanvas) {
      const transform = <UITransform>this._transformEntity.transform;
      const { x: width, y: height } = transform.size;
      SpriteMaskUtils.updateBounds(
        this,
        sprite,
        worldBounds,
        transform.worldMatrix,
        transform.worldPosition,
        width,
        height,
        transform.pivot,
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
   * @inheritdoc
   */
  protected override _render(context): void {
    const { _sprite: sprite } = this;
    const transform = <UITransform>this._transformEntity.transform;
    const { x: width, y: height } = transform.size;
    if (!sprite?.texture || !width || !height) {
      return;
    }

    let material = this.getMaterial();
    if (!material) {
      return;
    }
    // @ts-ignore
    const { _engine: engine } = this;
    // @todo: This question needs to be raised rather than hidden.
    if (material.destroyed) {
      // @ts-ignore
      material = engine._basicResources.spriteMaskDefaultMaterial;
    }

    // Update position
    if (this._dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
      SpriteMaskUtils.updatePositions(
        this,
        transform.worldMatrix,
        width,
        height,
        transform.pivot,
        this._flipX,
        this._flipY
      );
      this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
    }

    // Update uv
    if (this._dirtyUpdateFlag & MaskUpdateFlags.UV) {
      SpriteMaskUtils.updateUVs(this);
      this._dirtyUpdateFlag &= ~MaskUpdateFlags.UV;
    }
    SpriteMaskUtils.setupRenderElement(this._renderElement, this, material, this._subChunk, this.sprite.texture, 0);
  }

  /**
   * @inheritdoc
   */
  protected override _onDestroy(): void {
    SpriteMaskUtils.releaseSprite(this, this._sprite, this._onSpriteChange);
    this._sprite = null;

    super._onDestroy();

    if (this._subChunk) {
      this._getChunkManager().freeSubChunk(this._subChunk);
      this._subChunk = null;
    }

    this._renderElement = null;
  }

  @ignoreClone
  private _onSpriteChange(type: SpriteModifyFlags): void {
    switch (type) {
      case SpriteModifyFlags.texture:
        this.shaderData.setTexture(Mask._maskTextureProperty, this.sprite.texture);
        break;
      case SpriteModifyFlags.region:
      case SpriteModifyFlags.atlasRegionOffset:
        this._dirtyUpdateFlag |= MaskUpdateFlags.WorldVolumeAndUV;
        break;
      case SpriteModifyFlags.atlasRegion:
        this._dirtyUpdateFlag |= MaskUpdateFlags.UV;
        break;
      case SpriteModifyFlags.destroy:
        this.sprite = null;
        break;
      default:
        break;
    }
  }
}

/**
 * @remarks Extends `RendererUpdateFlags`.
 */
enum MaskUpdateFlags {
  /** UV. */
  UV = 0x2,
  /** Automatic Size. */
  AutomaticSize = 0x4,
  /** WorldVolume and UV. */
  WorldVolumeAndUV = 0x3,
  /** All. */
  All = 0x7
}
