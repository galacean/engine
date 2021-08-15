import { BoundingBox, MathUtil, Rect, Vector2 } from "@oasis-engine/math";
import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";

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

  private _pixelsPerUnit: number;
  private _texture: Texture2D = null;
  private _originalSize: Vector2 = null;
  private _atlasRotated: boolean = false;
  private _region: Rect = new Rect(0, 0, 1, 1);
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  private _atlasRegion: Rect = new Rect(0, 0, 1, 1);
  private _atlasRegionOffset: Vector2 = new Vector2(0, 0);
  private _dirtyFlag: DirtyFlag = DirtyFlag.all;

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
   * The original size of the sprite.
   */
  get originalSize(): Vector2 {
    const { _originalSize, _texture } = this;
    if (!_originalSize && _texture) {
      this._originalSize = new Vector2(_texture.width, _texture.height);
    }
    return _originalSize;
  }

  set originalSize(value: Vector2) {
    if (!this._originalSize) {
      this._originalSize = value.clone();
    } else {
      value.cloneTo(this._originalSize);
    }
    this._setDirtyFlagTrue(DirtyFlag.positions);
  }

  /**
   *  Bounding volume of the sprite.
   *  @remarks The returned bounds should be considered deep-read-only.
   */
  get bounds(): Readonly<BoundingBox> {
    if (this._isContainDirtyFlag(DirtyFlag.positions)) {
      this._updatePositionsAndBounds();
      // this._setDirtyFlagFalse(DirtyFlag.positions);
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
      this._setDirtyFlagTrue(DirtyFlag.uv);
    }
  }

  /**
   * The rectangle region of the original texture on its atlas texture, specified in normalized.
   */
  get atlasRegion(): Rect {
    return this._atlasRegion;
  }

  set atlasRegion(value: Rect) {
    const atlasRegion = this._atlasRegion;
    const x = MathUtil.clamp(value.x, 0, 1);
    const y = MathUtil.clamp(value.y, 0, 1);
    atlasRegion.setValue(x, y, MathUtil.clamp(value.width, 0, 1 - x), MathUtil.clamp(value.height, 0, 1 - y));
    this._setDirtyFlagTrue(DirtyFlag.uv);
  }

  /**
   * The rectangle region offset of the original texture on its atlas texture, specified in normalized.
   */
  get atlasRegionOffset(): Vector2 {
    return this._atlasRegionOffset;
  }

  set atlasRegionOffset(value: Vector2) {
    this._atlasRegionOffset.setValue(MathUtil.clamp(value.x, 0, 1), MathUtil.clamp(value.y, 0, 1));
    this._setDirtyFlagTrue(DirtyFlag.positions);
  }

  /**
   * Location of the sprite's center point in the rectangle region on the original texture, specified in normalized.
   */
  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(value: Vector2) {
    this._pivot.setValue(MathUtil.clamp(value.x, 0, 1), MathUtil.clamp(value.y, 0, 1));
    this._setDirtyFlagTrue(DirtyFlag.positions);
  }

  /**
   * The rectangle region of the sprite on the original texture, specified in normalized.
   */
  get region(): Rect {
    return this._region;
  }

  set region(value: Rect) {
    const region = this._region;
    const x = MathUtil.clamp(value.x, 0, 1);
    const y = MathUtil.clamp(value.y, 0, 1);
    region.setValue(x, y, MathUtil.clamp(value.width, 0, 1 - x), MathUtil.clamp(value.height, 0, 1 - y));
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

    region && region.cloneTo(this._region);
    pivot && pivot.cloneTo(this._pivot);

    this._triangles = Sprite._rectangleTriangles;
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
    const { originalSize, _bounds: bounds } = this;
    if (originalSize) {
      const { _atlasRegion, _texture, _atlasRegionOffset, _pivot } = this;
      const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = this._region;
      const pixelsPerUnitReciprocal = 1.0 / this._pixelsPerUnit;

      // The coordinates of the trimmed up, down, left, and right.
      const leftBlankSpace = _atlasRegionOffset.x;
      const topBlankSpace = _atlasRegionOffset.y;
      const rightBlankSpace = (_texture.width * _atlasRegion.width) / originalSize.x + leftBlankSpace;
      const downBlankSpace = (_texture.height * _atlasRegion.height) / originalSize.y + topBlankSpace;

      // The size of the real rendering.
      let realRenderWidth: number;
      let realRenderHeight: number;
      if (
        regionX + regionWidth <= leftBlankSpace ||
        regionY + regionHeight <= topBlankSpace ||
        regionX >= rightBlankSpace ||
        regionY >= downBlankSpace
      ) {
        realRenderWidth = realRenderHeight = 0;
      } else {
        realRenderWidth = Math.min(rightBlankSpace, regionX + regionWidth) - Math.max(leftBlankSpace, regionX);
        realRenderHeight = Math.min(downBlankSpace, regionY + regionHeight) - Math.max(topBlankSpace, regionY);
        realRenderWidth = realRenderWidth * originalSize.x * pixelsPerUnitReciprocal;
        realRenderHeight = realRenderHeight * originalSize.y * pixelsPerUnitReciprocal;
      }

      // Get the distance between the anchor point and the four sides.
      const lx =
        (-_pivot.x * regionWidth + (leftBlankSpace > regionX ? leftBlankSpace - regionX : 0)) *
        originalSize.x *
        pixelsPerUnitReciprocal;
      const ty =
        (_pivot.y * regionHeight - (topBlankSpace > regionY ? topBlankSpace - regionY : 0)) *
        originalSize.y *
        pixelsPerUnitReciprocal;
      const rx = lx + realRenderWidth;
      const by = ty - realRenderHeight;

      // Assign values ​​to _positions
      const positions = this._positions;
      // Top-left.
      positions[0].setValue(lx, ty);
      // Top-right.
      positions[1].setValue(rx, ty);
      // Bottom-right.
      positions[2].setValue(rx, by);
      // Bottom-left.
      positions[3].setValue(lx, by);

      // Update bounds.
      bounds.min.setValue(lx, by, 0);
      bounds.max.setValue(rx, ty, 0);
    } else {
      // Update bounds.
      bounds.min.setValue(0, 0, 0);
      bounds.max.setValue(0, 0, 0);
    }
  }

  /**
   * Update mesh.
   */
  private _updateMesh(): void {
    if (this._isContainDirtyFlag(DirtyFlag.positions)) {
      this._updatePositionsAndBounds();
    }

    if (this._isContainDirtyFlag(DirtyFlag.uv)) {
      const { _region: region, _atlasRegion: atlasRegion, _uv, originalSize, _atlasRegionOffset, _texture } = this;
      const { width: atlasRegionWidth, height: atlasRegionHeight } = atlasRegion;
      // 上下左右的间隔
      const leftSub = _atlasRegionOffset.x;
      const topSub = _atlasRegionOffset.y;
      const rightSub = (_texture.width * atlasRegion.width) / originalSize.x + leftSub;
      const downSub = (_texture.height * atlasRegion.height) / originalSize.y + topSub;

      let left: number = 0;
      let top: number = 0;
      let rw: number;
      let rh: number;
      if (
        region.x + region.width <= leftSub ||
        region.y + region.height <= topSub ||
        region.x >= rightSub ||
        region.y >= downSub
      ) {
        rw = rh = 0;
      } else {
        rw = Math.min(rightSub, region.x + region.width) - Math.max(leftSub, region.x);
        rh = Math.min(downSub, region.y + region.height) - Math.max(topSub, region.y);
        rw = (rw * originalSize.x) / this._texture.width;
        rh = (rh * originalSize.y) / this._texture.height;
        left = Math.max(leftSub, region.x) - leftSub;
        top = Math.max(topSub, region.y) - topSub;
      }

      left = (left * originalSize.x) / this._texture.width + atlasRegion.x;
      top = (top * originalSize.y) / this._texture.height + atlasRegion.y;
      const right = left + rw;
      const bottom = top + rh;

      if (this._atlasRotated) {
        // If it is rotated, we need to rotate the UV 90 degrees counterclockwise to correct it.
        // Top-left.
        _uv[0].setValue(right, top);
        // Top-right.
        _uv[1].setValue(right, bottom);
        // Bottom-right.
        _uv[2].setValue(left, bottom);
        // Bottom-left.
        _uv[3].setValue(left, top);
      } else {
        // Top-left.
        _uv[0].setValue(left, top);
        // Top-right.
        _uv[1].setValue(right, top);
        // Bottom-right.
        _uv[2].setValue(right, bottom);
        // Bottom-left.
        _uv[3].setValue(left, bottom);
      }
    }
  }

  /**
   * @internal
   * Update mesh data of the sprite.
   * @returns True if the data is refreshed, false otherwise.
   */
  _updateMeshData(): boolean {
    if (this._isContainDirtyFlag(DirtyFlag.all)) {
      this._updateMesh();
      this._setDirtyFlagFalse(DirtyFlag.all);
      return true;
    }
    return false;
  }

  private _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  private _setDirtyFlagTrue(type: number): void {
    this._dirtyFlag |= type;
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
