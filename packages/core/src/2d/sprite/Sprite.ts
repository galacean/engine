import { BoundingBox, MathUtil, Rect, Vector2, Vector4 } from "@oasis-engine/math";
import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { ListenerUpdateFlag } from "../../ListenerUpdateFlag";
import { Texture2D } from "../../texture/Texture2D";
import { UpdateFlagManager } from "../../UpdateFlagManager";
import { SpritePropertyDirtyFlag } from "../enums/SpriteDirtyFlag";

/**
 * 2D sprite.
 */
export class Sprite extends RefObject {
  /** The name of sprite. */
  name: string;

  /** @internal temp solution. */
  _assetID: number;

  /** Intermediate product data. */
  /** The pixel size of the sprite. */
  private _width: number;
  private _height: number;
  /** Normalized left, bottom, right and top. */
  private _edges: number[] = [0, 0, 1, 1];
  private _uvs: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];

  /** How to get form texture. */
  private _texture: Texture2D = null;
  private _atlasRotated: boolean = false;
  private _atlasRegion: Rect = new Rect(0, 0, 1, 1);
  private _atlasRegionOffset: Vector4 = new Vector4(0, 0, 0, 0);

  /** How to show sprite. */
  private _region: Rect = new Rect(0, 0, 1, 1);
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  private _border: Vector4 = new Vector4(0, 0, 0, 0);

  /** Dirty flag. */
  private _dirtyFlag: DirtyFlag = DirtyFlag.all;
  private _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  /**
   * The reference to the used texture.
   */
  get texture(): Texture2D {
    return this._texture;
  }

  set texture(value: Texture2D) {
    if (this._texture !== value) {
      this._texture = value;
      this._dispatchSpriteChange(SpritePropertyDirtyFlag.texture);
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
      this._dispatchSpriteChange(SpritePropertyDirtyFlag.atlas);
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
    this._atlasRegion.setValue(x, y, MathUtil.clamp(value.width, 0, 1 - x), MathUtil.clamp(value.height, 0, 1 - y));
    this._dispatchSpriteChange(SpritePropertyDirtyFlag.atlas);
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
    this._atlasRegionOffset.setValue(x, y, MathUtil.clamp(value.z, 0, 1 - x), MathUtil.clamp(value.w, 0, 1 - y));
    this._dispatchSpriteChange(SpritePropertyDirtyFlag.atlas);
  }

  /**
   * The rectangle region of the sprite, specified in normalized.
   */
  get region(): Rect {
    return this._region;
  }

  set region(value: Rect) {
    const region = this._region;
    const x = MathUtil.clamp(value.x, 0, 1);
    const y = MathUtil.clamp(value.y, 0, 1);
    region.setValue(x, y, MathUtil.clamp(value.width, 0, 1 - x), MathUtil.clamp(value.height, 0, 1 - y));
    this._dispatchSpriteChange(SpritePropertyDirtyFlag.atlas);
  }

  /**
   * Location of the sprite's center point in the rectangle region, specified in normalized.
   * The origin is at the bottom left and the default value is (0.5, 0.5).
   */
  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(value: Vector2) {
    const pivot = this._pivot;
    if (pivot === value) {
      this._dispatchSpriteChange(SpritePropertyDirtyFlag.pivot);
    } else {
      const { x, y } = value;
      if (pivot.x !== x || pivot.y !== y) {
        pivot.setValue(x, y);
        this._dispatchSpriteChange(SpritePropertyDirtyFlag.pivot);
      }
    }
  }

  /**
   * Get the border of the sprite.
   *  x      y       z     w
   *  |      |       |     |
   * Left, bottom, right, top.
   */
  get border(): Vector4 {
    return this._border;
  }

  set border(value: Vector4) {
    const border = this._border;
    const x = MathUtil.clamp(value.x, 0, 1);
    const y = MathUtil.clamp(value.y, 0, 1);
    border.setValue(x, y, MathUtil.clamp(value.z, 0, 1 - x), MathUtil.clamp(value.w, 0, 1 - y));
    this._dispatchSpriteChange(SpritePropertyDirtyFlag.border);
  }

  /**
   * Get the pixel width of the sprite.
   */
  get width(): Readonly<number> {
    this._isContainDirtyFlag(DirtyFlag.size) && this._updateSize();
    return this._width;
  }

  /**
   * Get the pixel height of the sprite.
   */
  get height(): Readonly<number> {
    this._isContainDirtyFlag(DirtyFlag.size) && this._updateSize();
    return this._height;
  }

  /**
   * Get the normalized edges of the sprite.
   */
  get edges(): Readonly<number[]> {
    this._isContainDirtyFlag(DirtyFlag.edges) && this._updateEdges();
    return this._edges;
  }

  /**
   * Get the uvs of the sprite.
   */
  get uvs(): Readonly<Vector2[]> {
    this._isContainDirtyFlag(DirtyFlag.uvs) && this._updateUVs();
    return this._uvs;
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
    region && region.cloneTo(this._region);
    pivot && pivot.cloneTo(this._pivot);
    border && border.cloneTo(this._border);
    this.name = name;
  }

  /**
   * Clone.
   * @returns Cloned sprite
   */
  clone(): Sprite {
    const cloneSprite = new Sprite(this._engine, this._texture, this._region, this._pivot, this._border, this.name);
    cloneSprite._assetID = this._assetID;
    return cloneSprite;
  }

  /**
   * @internal
   */
  _registerUpdateFlag(): ListenerUpdateFlag {
    return this._updateFlagManager.createFlag(ListenerUpdateFlag);
  }

  /**
   * @override
   */
  _onDestroy(): void {
    if (this._texture) {
      this._texture = null;
    }
  }

  private _updateSize(): void {
    if (this._texture) {
      const { _texture, _atlasRegion, _atlasRegionOffset, _region } = this;
      this._width =
        ((_texture.width * _atlasRegion.width) / (1 - _atlasRegionOffset.x - _atlasRegionOffset.z)) * _region.width;
      this._height =
        ((_texture.height * _atlasRegion.height) / (1 - _atlasRegionOffset.y - _atlasRegionOffset.w)) * _region.height;
    }
    this._setDirtyFlagFalse(DirtyFlag.size);
  }

  private _updateEdges() {
    const { x: blankLeft, y: blankTop, z: blankRight, w: blankBottom } = this._atlasRegionOffset;
    const { x: regionX, y: regionY, width: regionW, height: regionH } = this._region;
    const regionRight = 1 - regionX - regionW;
    const regionBottom = 1 - regionY - regionH;
    const edges = this._edges;
    // Coordinates of the four boundaries.
    // Left.
    edges[0] = Math.max(blankLeft - regionX, 0) / regionW;
    // Bottom.
    edges[1] = Math.max(blankBottom - regionY, 0) / regionH;
    // Right.
    edges[2] = 1 - Math.max(blankRight - regionRight, 0) / regionW;
    // Top.
    edges[3] = 1 - Math.max(blankTop - regionBottom, 0) / regionH;
    this._setDirtyFlagFalse(DirtyFlag.edges);
  }

  private _updateUVs() {
    const { _uvs: uv, _atlasRegionOffset: atlasRegionOffset } = this;
    const { x: regionX, y: regionY, width: regionW, height: regionH } = this._region;
    const regionRight = 1 - regionX - regionW;
    const regionBottom = 1 - regionY - regionH;
    const { x: atlasRegionX, y: atlasRegionY, width: atlasRegionW, height: atlasRegionH } = this._atlasRegion;
    const { x: offsetLeft, y: offsetTop, z: offsetRight, w: offsetBottom } = atlasRegionOffset;
    const realWidth = atlasRegionW / (1 - offsetLeft - offsetRight);
    const realHeight = atlasRegionH / (1 - offsetTop - offsetBottom);
    // Coordinates of the four boundaries.
    const left = Math.max(regionX - offsetLeft, 0) * realWidth + atlasRegionX;
    const top = Math.max(regionBottom - offsetTop, 0) * realHeight + atlasRegionY;
    const right = atlasRegionW + atlasRegionX - Math.max(regionRight - offsetRight, 0) * realWidth;
    const bottom = atlasRegionH + atlasRegionY - Math.max(regionY - offsetBottom, 0) * realHeight;
    const { x: borderLeft, y: borderBottom, z: borderRight, w: borderTop } = this._border;
    // Left-Bottom
    uv[0].setValue(left, bottom);
    // Border ( Left-Bottom )
    uv[1].setValue(
      (regionX - offsetLeft + borderLeft * regionW) * realWidth + atlasRegionX,
      atlasRegionH + atlasRegionY - (regionY - offsetBottom + borderBottom * regionH) * realHeight
    );
    // Border ( Right-Top )
    uv[2].setValue(
      atlasRegionW + atlasRegionX - (regionRight - offsetRight + borderRight * regionW) * realWidth,
      (regionBottom - offsetTop + borderTop * regionH) * realHeight + atlasRegionY
    );
    // Right-Top
    uv[3].setValue(right, top);
    this._setDirtyFlagFalse(DirtyFlag.uvs);
  }

  private _isContainDirtyFlag(type: DirtyFlag): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  private _setDirtyFlagFalse(type: DirtyFlag): void {
    this._dirtyFlag &= ~type;
  }

  private _dispatchSpriteChange(type: SpritePropertyDirtyFlag): void {
    switch (type) {
      case SpritePropertyDirtyFlag.atlas:
      case SpritePropertyDirtyFlag.region:
        this._dirtyFlag |= DirtyFlag.all;
        break;
      case SpritePropertyDirtyFlag.border:
        // Update sliced uvs.
        this._dirtyFlag |= DirtyFlag.uvs;
        break;
      default:
        break;
    }
    this._updateFlagManager.dispatch(type);
  }
}

enum DirtyFlag {
  size = 0x1,
  edges = 0x2,
  uvs = 0x4,
  all = 0x7
}
