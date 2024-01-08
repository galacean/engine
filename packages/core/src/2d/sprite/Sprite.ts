import { BoundingBox, MathUtil, Rect, Vector2, Vector4 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { UpdateFlagManager } from "../../UpdateFlagManager";
import { ReferResource } from "../../asset/ReferResource";
import { Texture2D } from "../../texture/Texture2D";
import { SpriteAtlas } from "../atlas/SpriteAtlas";
import { SpriteModifyFlags } from "../enums/SpriteModifyFlags";

/**
 * 2D sprite.
 */
export class Sprite extends ReferResource {
  /** The name of sprite. */
  name: string;

  private _automaticWidth: number = 0;
  private _automaticHeight: number = 0;
  private _customWidth: number = undefined;
  private _customHeight: number = undefined;

  private _positions: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];
  private _uvs: Vector2[] = [
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2()
  ];
  private _bounds: BoundingBox = new BoundingBox();

  private _texture: Texture2D = null;
  private _atlasRotated: boolean = false;
  private _atlasRegion: Rect = new Rect(0, 0, 1, 1);
  private _atlasRegionOffset: Vector4 = new Vector4(0, 0, 0, 0);

  private _region: Rect = new Rect(0, 0, 1, 1);
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  private _border: Vector4 = new Vector4(0, 0, 0, 0);

  private _dirtyUpdateFlag: SpriteUpdateFlags = SpriteUpdateFlags.all;

  /** @internal */
  _atlas: SpriteAtlas;
  /** @internal */
  _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  /**
   * The reference to the used texture.
   */
  get texture(): Texture2D {
    return this._texture;
  }

  set texture(value: Texture2D) {
    if (this._texture !== value) {
      this._texture = value;
      this._dispatchSpriteChange(SpriteModifyFlags.texture);
      if (this._customWidth === undefined || this._customHeight === undefined) {
        this._dispatchSpriteChange(SpriteModifyFlags.size);
      }
    }
  }

  /**
   * The width of the sprite (in world coordinates).
   *
   * @remarks
   * If width is set, return the set value,
   * otherwise return the width calculated according to `Texture.width`, `Sprite.region`, `Sprite.atlasRegion`, `Sprite.atlasRegionOffset` and `Engine._pixelsPerUnit`.
   */
  get width(): number {
    if (this._customWidth !== undefined) {
      return this._customWidth;
    } else {
      this._dirtyUpdateFlag & SpriteUpdateFlags.automaticSize && this._calDefaultSize();
      return this._automaticWidth;
    }
  }

  set width(value: number) {
    if (this._customWidth !== value) {
      this._customWidth = value;
      this._dispatchSpriteChange(SpriteModifyFlags.size);
    }
  }

  /**
   * The height of the sprite (in world coordinates).
   *
   * @remarks
   * If height is set, return the set value,
   * otherwise return the height calculated according to `Texture.height`, `Sprite.region`, `Sprite.atlasRegion`, `Sprite.atlasRegionOffset` and `Engine._pixelsPerUnit`.
   */
  get height(): number {
    if (this._customHeight !== undefined) {
      return this._customHeight;
    } else {
      this._dirtyUpdateFlag & SpriteUpdateFlags.automaticSize && this._calDefaultSize();
      return this._automaticHeight;
    }
  }

  set height(value: number) {
    if (this._customHeight !== value) {
      this._customHeight = value;
      this._dispatchSpriteChange(SpriteModifyFlags.size);
    }
  }

  /**
   * Is it rotated 90 degrees clockwise when packing.
   */
  get atlasRotated(): boolean {
    return this._atlasRotated;
  }

  set atlasRotated(value: boolean) {
    if (this._atlasRotated != value) {
      this._atlasRotated = value;
    }
  }

  /**
   * The rectangle region of the original texture on its atlas texture, specified in normalized.
   */
  get atlasRegion(): Rect {
    return this._atlasRegion;
  }

  set atlasRegion(value: Rect) {
    const x = MathUtil.clamp(value.x, 0, 1);
    const y = MathUtil.clamp(value.y, 0, 1);
    this._atlasRegion.set(x, y, MathUtil.clamp(value.width, 0, 1 - x), MathUtil.clamp(value.height, 0, 1 - y));
    this._dispatchSpriteChange(SpriteModifyFlags.atlasRegion);
    if (this._customWidth === undefined || this._customHeight === undefined) {
      this._dispatchSpriteChange(SpriteModifyFlags.size);
    }
  }

  /**
   * The rectangle region offset of the original texture on its atlas texture, specified in normalized.
   */
  get atlasRegionOffset(): Vector4 {
    return this._atlasRegionOffset;
  }

  set atlasRegionOffset(value: Vector4) {
    const x = MathUtil.clamp(value.x, 0, 1);
    const y = MathUtil.clamp(value.y, 0, 1);
    this._atlasRegionOffset.set(x, y, MathUtil.clamp(value.z, 0, 1 - x), MathUtil.clamp(value.w, 0, 1 - y));
    this._dispatchSpriteChange(SpriteModifyFlags.atlasRegionOffset);
    if (this._customWidth === undefined || this._customHeight === undefined) {
      this._dispatchSpriteChange(SpriteModifyFlags.size);
    }
  }

  /**
   * The rectangle region of the sprite, specified in normalized.
   */
  get region(): Rect {
    return this._region;
  }

  set region(value: Rect) {
    this._region !== value && this._region.copyFrom(value);
  }

  /**
   * Location of the sprite's center point in the rectangle region, specified in normalized.
   * The origin is at the bottom left and the default value is (0.5, 0.5).
   */
  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(value: Vector2) {
    this._pivot !== value && this._pivot.copyFrom(value);
  }

  /**
   * Get the border of the sprite.
   *  x      y       z     w
   *  |      |       |     |
   * Left, bottom, right, top.
   * @remarks only use in sliced or tiled mode.
   */
  get border(): Vector4 {
    return this._border;
  }

  set border(value: Vector4) {
    this._border !== value && this._border.copyFrom(value);
  }

  /**
   * Constructor a Sprite.
   * @param engine - Engine to which the sprite belongs
   * @param texture - Texture from which to obtain the Sprite
   * @param region - Rectangle region of the texture to use for the Sprite, specified in normalized
   * @param pivot - Sprite's pivot point relative to its graphic rectangle, specified in normalized
   * @param border - Boundaries when using Slice DrawMode, specified in normalized
   * @param name - The name of Sprite
   */
  constructor(
    engine: Engine,
    texture: Texture2D = null,
    region: Rect = null,
    pivot: Vector2 = null,
    border: Vector4 = null,
    name: string = null
  ) {
    super(engine);
    this._texture = texture;
    this._onRegionChange = this._onRegionChange.bind(this);
    this._onPivotChange = this._onPivotChange.bind(this);
    this._onBorderChange = this._onBorderChange.bind(this);
    // @ts-ignore
    this._region._onValueChanged = this._onRegionChange;
    // @ts-ignore
    this._pivot._onValueChanged = this._onPivotChange;
    // @ts-ignore
    this._border._onValueChanged = this._onBorderChange;
    region && this._region.copyFrom(region);
    pivot && this._pivot.copyFrom(pivot);
    border && this._border.copyFrom(border);
    this.name = name;
  }

  /**
   * Clone.
   * @returns Cloned sprite
   */
  clone(): Sprite {
    const cloneSprite = new Sprite(this._engine, this._texture, this._region, this._pivot, this._border, this.name);
    cloneSprite._atlasRotated = this._atlasRotated;
    cloneSprite._atlasRegion.copyFrom(this._atlasRegion);
    cloneSprite._atlasRegionOffset.copyFrom(this._atlasRegionOffset);
    return cloneSprite;
  }

  /**
   * @internal
   */
  _getPositions(): Vector2[] {
    this._dirtyUpdateFlag & SpriteUpdateFlags.positions && this._updatePositions();
    return this._positions;
  }

  /**
   * @internal
   */
  _getUVs(): Vector2[] {
    this._dirtyUpdateFlag & SpriteUpdateFlags.uvs && this._updateUVs();
    return this._uvs;
  }

  /**
   * @internal
   */
  _getBounds(): BoundingBox {
    this._dirtyUpdateFlag & SpriteUpdateFlags.positions && this._updatePositions();
    return this._bounds;
  }

  /**
   * @internal
   */
  override _addReferCount(value: number): void {
    super._addReferCount(value);
    this._atlas?._addReferCount(value);
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    this._dispatchSpriteChange(SpriteModifyFlags.destroy);
    super._onDestroy();
    this._positions.length = 0;
    this._positions = null;
    this._uvs.length = 0;
    this._uvs = null;
    this._atlasRegion = null;
    this._atlasRegionOffset = null;
    this._region = null;
    this._pivot = null;
    this._border = null;
    this._bounds = null;
    this._atlas = null;
    this._texture = null;
    this._updateFlagManager = null;
  }

  private _calDefaultSize(): void {
    if (this._texture) {
      const { _texture, _atlasRegion, _atlasRegionOffset, _region, _atlasRotated } = this;
      const ppuReciprocal = 1.0 / Engine._pixelsPerUnit;
      const originWidth = _texture.width * (_atlasRotated ? _atlasRegion.height : _atlasRegion.width);
      const originHeight = _texture.height * (_atlasRotated ? _atlasRegion.width : _atlasRegion.height);
      this._automaticWidth =
        (originWidth / (1 - _atlasRegionOffset.x - _atlasRegionOffset.z)) * _region.width * ppuReciprocal;
      this._automaticHeight =
        (originHeight / (1 - _atlasRegionOffset.y - _atlasRegionOffset.w)) * _region.height * ppuReciprocal;
    } else {
      this._automaticWidth = this._automaticHeight = 0;
    }
    this._dirtyUpdateFlag &= ~SpriteUpdateFlags.automaticSize;
  }

  private _updatePositions(): void {
    const blank = this._atlasRegionOffset;
    const { x: regionX, y: regionY, width: regionW, height: regionH } = this._region;
    const regionRight = 1 - regionX - regionW;
    const regionBottom = 1 - regionY - regionH;
    const left = Math.max(blank.x - regionX, 0) / regionW;
    const bottom = Math.max(blank.w - regionY, 0) / regionH;
    const right = 1 - Math.max(blank.z - regionRight, 0) / regionW;
    const top = 1 - Math.max(blank.y - regionBottom, 0) / regionH;

    // Update positions.
    // ---------------
    //  2 - 3
    //  |   |
    //  0 - 1
    // ---------------
    const positions = this._positions;
    positions[0].set(left, bottom);
    positions[1].set(right, bottom);
    positions[2].set(left, top);
    positions[3].set(right, top);

    const { min, max } = this._bounds;
    min.set(left, bottom, 0);
    max.set(right, top, 0);
    this._dirtyUpdateFlag &= ~SpriteUpdateFlags.positions;
  }

  private _updateUVs(): void {
    const { _uvs: uvs, _atlasRotated: atlasRotated, _border: border } = this;
    const { x: regionLeft, y: regionTop, width: regionW, height: regionH } = this._region;
    const regionRight = 1 - regionLeft - regionW;
    const regionBottom = 1 - regionTop - regionH;
    const { x: atlasRegionX, y: atlasRegionY, width: atlasRegionW, height: atlasRegionH } = this._atlasRegion;
    const { x: offsetLeft, y: offsetTop, z: offsetRight, w: offsetBottom } = this._atlasRegionOffset;
    const realWidth = atlasRegionW / (1 - offsetLeft - offsetRight);
    const realHeight = atlasRegionH / (1 - offsetTop - offsetBottom);
    // Coordinates of the boundaries.
    let left: number, top: number, right: number, bottom: number;
    let borderLeft: number, borderTop: number, borderRight: number, borderBottom: number;
    if (atlasRotated) {
      left = Math.max(regionBottom - offsetLeft, 0) * realWidth + atlasRegionX;
      top = Math.max(regionLeft - offsetTop, 0) * realHeight + atlasRegionY;
      right = atlasRegionW + atlasRegionX - Math.max(regionTop - offsetRight, 0) * realWidth;
      bottom = atlasRegionH + atlasRegionY - Math.max(regionRight - offsetBottom, 0) * realHeight;
      borderLeft = (regionBottom - offsetLeft + border.y * regionH) * realWidth + atlasRegionX;
      borderTop = (regionLeft - offsetTop + border.x * regionW) * realHeight + atlasRegionY;
      borderRight = atlasRegionW + atlasRegionX - (regionTop - offsetRight + border.w * regionH) * realWidth;
      borderBottom = atlasRegionH + atlasRegionY - (regionRight - offsetBottom + border.z * regionW) * realHeight;
    } else {
      left = Math.max(regionLeft - offsetLeft, 0) * realWidth + atlasRegionX;
      top = Math.max(regionBottom - offsetTop, 0) * realHeight + atlasRegionY;
      right = atlasRegionW + atlasRegionX - Math.max(regionRight - offsetRight, 0) * realWidth;
      bottom = atlasRegionH + atlasRegionY - Math.max(regionTop - offsetBottom, 0) * realHeight;
      borderLeft = (regionLeft - offsetLeft + border.x * regionW) * realWidth + atlasRegionX;
      borderTop = (regionBottom - offsetTop + border.w * regionH) * realHeight + atlasRegionY;
      borderRight = atlasRegionW + atlasRegionX - (regionRight - offsetRight + border.z * regionW) * realWidth;
      borderBottom = atlasRegionH + atlasRegionY - (regionTop - offsetBottom + border.y * regionH) * realHeight;
    }

    if (atlasRotated) {
      uvs[0].set(left, top);
      uvs[1].set(left, borderTop);
      uvs[2].set(left, borderBottom);
      uvs[3].set(left, bottom);
      uvs[4].set(borderLeft, top);
      uvs[5].set(borderLeft, borderTop);
      uvs[6].set(borderLeft, borderBottom);
      uvs[7].set(borderLeft, bottom);
      uvs[8].set(borderRight, top);
      uvs[9].set(borderRight, borderTop);
      uvs[10].set(borderRight, borderBottom);
      uvs[11].set(borderRight, bottom);
      uvs[12].set(right, top);
      uvs[13].set(right, borderTop);
      uvs[14].set(right, borderBottom);
      uvs[15].set(right, bottom);
    } else {
      uvs[0].set(left, bottom);
      uvs[1].set(borderLeft, bottom);
      uvs[2].set(borderRight, bottom);
      uvs[3].set(right, bottom);
      uvs[4].set(left, borderBottom);
      uvs[5].set(borderLeft, borderBottom);
      uvs[6].set(borderRight, borderBottom);
      uvs[7].set(right, borderBottom);
      uvs[8].set(left, borderTop);
      uvs[9].set(borderLeft, borderTop);
      uvs[10].set(borderRight, borderTop);
      uvs[11].set(right, borderTop);
      uvs[12].set(left, top);
      uvs[13].set(borderLeft, top);
      uvs[14].set(borderRight, top);
      uvs[15].set(right, top);
    }
    this._dirtyUpdateFlag &= ~SpriteUpdateFlags.uvs;
  }

  private _dispatchSpriteChange(type: SpriteModifyFlags): void {
    switch (type) {
      case SpriteModifyFlags.texture:
        this._dirtyUpdateFlag |= SpriteUpdateFlags.automaticSize;
        break;
      case SpriteModifyFlags.atlasRegionOffset:
      case SpriteModifyFlags.region:
        this._dirtyUpdateFlag |= SpriteUpdateFlags.all;
        break;
      case SpriteModifyFlags.atlasRegion:
        this._dirtyUpdateFlag |= SpriteUpdateFlags.automaticSize | SpriteUpdateFlags.uvs;
        break;
      case SpriteModifyFlags.border:
        this._dirtyUpdateFlag |= SpriteUpdateFlags.uvs;
        break;
    }
    this._updateFlagManager.dispatch(type);
  }

  private _onRegionChange(): void {
    const { _region: region } = this;
    // @ts-ignore
    region._onValueChanged = null;
    const x = MathUtil.clamp(region.x, 0, 1);
    const y = MathUtil.clamp(region.y, 0, 1);
    region.set(x, y, MathUtil.clamp(region.width, 0, 1 - x), MathUtil.clamp(region.height, 0, 1 - y));
    this._dispatchSpriteChange(SpriteModifyFlags.region);
    if (this._customWidth === undefined || this._customHeight === undefined) {
      this._dispatchSpriteChange(SpriteModifyFlags.size);
    }
    // @ts-ignore
    region._onValueChanged = this._onRegionChange;
  }

  private _onPivotChange(): void {
    this._dispatchSpriteChange(SpriteModifyFlags.pivot);
  }

  private _onBorderChange(): void {
    const { _border: border } = this;
    // @ts-ignore
    border._onValueChanged = null;
    const x = MathUtil.clamp(border.x, 0, 1);
    const y = MathUtil.clamp(border.y, 0, 1);
    border.set(x, y, MathUtil.clamp(border.z, 0, 1 - x), MathUtil.clamp(border.w, 0, 1 - y));
    this._dispatchSpriteChange(SpriteModifyFlags.border);
    // @ts-ignore
    border._onValueChanged = this._onBorderChange;
  }
}

enum SpriteUpdateFlags {
  positions = 0x1,
  uvs = 0x2,
  automaticSize = 0x4,
  all = 0x7
}
