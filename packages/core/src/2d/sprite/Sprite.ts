import { BoundingBox, MathUtil, Rect, Vector2, Vector4 } from "@oasis-engine/math";
import { RefObject } from "../../asset/RefObject";
import { BoolUpdateFlag } from "../../BoolUpdateFlag";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";
import { UpdateFlagManager } from "../../UpdateFlagManager";

/**
 * 2D sprite.
 */
export class Sprite extends RefObject {
  private static _rectangleTriangles: number[] = [0, 2, 1, 2, 0, 3];

  /** The name of sprite. */
  name: string;

  /** @internal */
  _uv: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];
  /** @internal */
  _positions: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];
  /** @internal */
  _bounds: BoundingBox = new BoundingBox();
  /** @internal */
  _triangles: number[];
  /** @internal temp solution. */
  _assetID: number;

  private _pixelsPerUnit: number;
  private _texture: Texture2D = null;
  private _atlasRotated: boolean = false;
  private _region: Rect = new Rect(0, 0, 1, 1);
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  private _atlasRegion: Rect = new Rect(0, 0, 1, 1);
  private _atlasRegionOffset: Vector4 = new Vector4(0, 0, 0, 0);
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
      this._setDirtyFlagTrue(DirtyFlag.positions);
    }
  }

  /**
   *  Bounding volume of the sprite.
   *  @remarks The returned bounds should be considered deep-read-only.
   */
  get bounds(): Readonly<BoundingBox> {
    if (this._isContainDirtyFlag(DirtyFlag.positions) && this._texture) {
      this._updatePositionsAndBounds();
      this._setDirtyFlagFalse(DirtyFlag.positions);
    }
    return this._bounds;
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
      this._setDirtyFlagTrue(DirtyFlag.positions | DirtyFlag.uv);
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
    this._setDirtyFlagTrue(DirtyFlag.positions | DirtyFlag.uv);
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
    this._setDirtyFlagTrue(DirtyFlag.positions | DirtyFlag.uv);
  }

  /**
   * Location of the sprite's center point in the rectangle region, specified in normalized.
   */
  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(value: Vector2) {
    const pivot = this._pivot;
    const { x, y } = value;
    if (pivot === value || pivot.x !== x || pivot.y !== y) {
      pivot.set(x, y);
      this._setDirtyFlagTrue(DirtyFlag.positions);
    }
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
    region.set(x, y, MathUtil.clamp(value.width, 0, 1 - x), MathUtil.clamp(value.height, 0, 1 - y));
    this._setDirtyFlagTrue(DirtyFlag.positions | DirtyFlag.uv);
  }

  /**
   * The number of pixels in the sprite that correspond to one unit in world space.
   */
  get pixelsPerUnit(): number {
    return this._pixelsPerUnit;
  }

  set pixelsPerUnit(value: number) {
    if (this._pixelsPerUnit !== value) {
      this._pixelsPerUnit = value;
      this._setDirtyFlagTrue(DirtyFlag.positions);
    }
  }

  /**
   * Constructor a Sprite.
   * @param engine - Engine to which the sprite belongs
   * @param texture - Texture from which to obtain the Sprite
   * @param region - Rectangle region of the texture to use for the Sprite, specified in normalized
   * @param pivot - Sprite's pivot point relative to its graphic rectangle, specified in normalized
   * @param pixelsPerUnit - The number of pixels in the Sprite that correspond to one unit in world space
   * @param name - The name of Sprite
   */
  constructor(
    engine: Engine,
    texture: Texture2D = null,
    region: Rect = null,
    pivot: Vector2 = null,
    pixelsPerUnit: number = 128,
    name: string = null
  ) {
    super(engine);

    this.name = name;
    this._texture = texture;
    this._pixelsPerUnit = pixelsPerUnit;

    region && this._region.copyFrom(region);
    pivot && this._pivot.copyFrom(pivot);

    this._triangles = Sprite._rectangleTriangles;
  }

  /**
   * Clone.
   * @returns Cloned sprite
   */
  clone(): Sprite {
    const cloneSprite = new Sprite(
      this._engine,
      this._texture,
      this._region,
      this._pivot,
      this._pixelsPerUnit,
      this.name
    );
    cloneSprite._assetID = this._assetID;
    cloneSprite._atlasRotated = this._atlasRotated;
    cloneSprite._atlasRegion.copyFrom(this._atlasRegion);
    cloneSprite._atlasRegionOffset.copyFrom(this._atlasRegionOffset);
    return cloneSprite;
  }

  /**
   * @internal
   */
  _registerUpdateFlag(): BoolUpdateFlag {
    return this._updateFlagManager.createFlag(BoolUpdateFlag);
  }

  /**
   * @override
   */
  _onDestroy(): void {
    if (this._texture) {
      this._texture = null;
    }
  }

  /**
   * Update positions and bounds.
   */
  private _updatePositionsAndBounds(): void {
    const { _texture: texture, _bounds: bounds } = this;
    if (texture) {
      const { _atlasRegion: atlasRegion, _pivot: pivot } = this;
      const { x: blankLeft, y: blankTop, z: blankRight, w: blankBottom } = this._atlasRegionOffset;
      const { x: regionX, y: regionY, width: regionW, height: regionH } = this._region;
      const regionRight = 1 - regionX - regionW;
      const regionBottom = 1 - regionY - regionH;
      // Real rendering size.
      const realRenderW =
        (texture.width * atlasRegion.width * regionW) / ((1 - blankLeft - blankRight) * this._pixelsPerUnit);
      const realRenderH =
        (texture.height * atlasRegion.height * regionH) / ((1 - blankTop - blankBottom) * this._pixelsPerUnit);
      // Coordinates of the four boundaries.
      const left = (Math.max(blankLeft - regionX, 0) / regionW - pivot.x) * realRenderW;
      const right = (1 - Math.max(blankRight - regionRight, 0) / regionW - pivot.x) * realRenderW;
      const top = (1 - Math.max(blankTop - regionBottom, 0) / regionH - pivot.y) * realRenderH;
      const bottom = (Math.max(blankBottom - regionY, 0) / regionH - pivot.y) * realRenderH;
      // Assign values ​​to _positions
      const positions = this._positions;
      // Top-left.
      positions[0].set(left, top);
      // Top-right.
      positions[1].set(right, top);
      // Bottom-right.
      positions[2].set(right, bottom);
      // Bottom-left.
      positions[3].set(left, bottom);

      // Update bounds.
      bounds.min.set(left, bottom, 0);
      bounds.max.set(right, top, 0);
    } else {
      // Update bounds.
      bounds.min.set(0, 0, 0);
      bounds.max.set(0, 0, 0);
    }
  }

  /**
   * @internal
   */
  _updateMesh(): void {
    if (this._isContainDirtyFlag(DirtyFlag.positions)) {
      this._updatePositionsAndBounds();
    }

    if (this._isContainDirtyFlag(DirtyFlag.uv)) {
      const { _uv: uv, _atlasRegionOffset: atlasRegionOffset } = this;
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
      // Top-left.
      uv[0].set(left, top);
      // Top-right.
      uv[1].set(right, top);
      // Bottom-right.
      uv[2].set(right, bottom);
      // Bottom-left.
      uv[3].set(left, bottom);
    }
    this._setDirtyFlagFalse(DirtyFlag.all);
  }

  private _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  private _setDirtyFlagTrue(type: number): void {
    this._dirtyFlag |= type;
    this._updateFlagManager.dispatch();
  }

  private _setDirtyFlagFalse(type: number): void {
    this._dirtyFlag &= ~type;
  }
}

enum DirtyFlag {
  positions = 0x1,
  uv = 0x2,
  all = 0x3
}
