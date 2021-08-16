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
  private _packed: boolean = false;
  private _trimmed: boolean = false;
  private _atlasRotated: boolean = false;
  private _originalSize: Vector2 = new Vector2(0, 0);
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
    if (!this._packed && _texture) {
      _originalSize.setValue(_texture.width, _texture.height);
    }
    return _originalSize;
  }

  set originalSize(value: Vector2) {
    value.cloneTo(this._originalSize);
    this._setDirtyFlagTrue(DirtyFlag.positions | DirtyFlag.uv);
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
   * Set whether to be trimmed.
   * @param value Whether to be trimmed
   */
  setTrimmed(value: boolean): void {
    this._trimmed = value;
  }

  /**
   * Set whether to be packaged.
   * @param value whether to be packaged
   */
  setPacked(value: boolean): void {
    this._packed = value;
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
    const { _texture: texture, _bounds: bounds } = this;
    if (texture) {
      const { _atlasRegion: atlasRegion, _pivot: pivot, originalSize } = this;
      const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = this._region;
      const pixelsPerUnitReciprocal = 1.0 / this._pixelsPerUnit;
      const oriWidth = originalSize.x * pixelsPerUnitReciprocal;
      const oriHeight = originalSize.y * pixelsPerUnitReciprocal;
      // Coordinates of the four boundaries.
      let lx: number, ty: number, rx: number, by: number;
      // Real rendering size.
      let realRenderWidth: number, realRenderHeight: number;
      if (this._trimmed) {
        const { _atlasRegionOffset: atlasRegionOffset } = this;
        // The coordinates of the trimmed up, down, left, and right.
        let rightBlankSpace: number, downBlankSpace: number;
        const leftBlankSpace = atlasRegionOffset.x;
        const topBlankSpace = atlasRegionOffset.y;
        if (this._atlasRotated) {
          rightBlankSpace = (texture.width * atlasRegion.height) / originalSize.x + leftBlankSpace;
          downBlankSpace = (texture.height * atlasRegion.width) / originalSize.y + topBlankSpace;
        } else {
          rightBlankSpace = (texture.width * atlasRegion.width) / originalSize.x + leftBlankSpace;
          downBlankSpace = (texture.height * atlasRegion.height) / originalSize.y + topBlankSpace;
        }
        if (
          regionX + regionWidth <= leftBlankSpace ||
          regionY + regionHeight <= topBlankSpace ||
          regionX >= rightBlankSpace ||
          regionY >= downBlankSpace
        ) {
          lx = ty = rx = by = 0;
        } else {
          // The size of the real rendering.
          realRenderWidth =
            (Math.min(rightBlankSpace, regionX + regionWidth) - Math.max(leftBlankSpace, regionX)) * oriWidth;
          realRenderHeight =
            (Math.min(downBlankSpace, regionY + regionHeight) - Math.max(topBlankSpace, regionY)) * oriHeight;
          lx = (-pivot.x * regionWidth + (leftBlankSpace > regionX ? leftBlankSpace - regionX : 0)) * oriWidth;
          ty = (pivot.y * regionHeight - (topBlankSpace > regionY ? topBlankSpace - regionY : 0)) * oriHeight;
          rx = lx + realRenderWidth;
          by = ty - realRenderHeight;
        }
      } else {
        if (this._atlasRotated) {
          realRenderWidth = atlasRegion.height * regionHeight * oriHeight;
          realRenderHeight = atlasRegion.width * regionWidth * oriWidth;
        } else {
          realRenderWidth = atlasRegion.width * regionWidth * oriWidth;
          realRenderHeight = atlasRegion.height * regionHeight * oriHeight;
        }
        lx = -pivot.x * realRenderWidth;
        by = -pivot.y * realRenderHeight;
        rx = realRenderWidth + lx;
        ty = realRenderHeight + by;
      }

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
      const { _atlasRegion: atlasRegion, _uv: uv, _atlasRegionOffset: atlasRegionOffset } = this;
      const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = this._region;
      let left: number, top: number, right: number, bottom: number;
      if (this._trimmed) {
        const { originalSize, _texture: texture } = this;
        // The coordinates of the trimmed up, down, left, and right.
        const leftBlankSpace = atlasRegionOffset.x;
        const topBlankSpace = atlasRegionOffset.y;
        const rightBlankSpace = (texture.width * atlasRegion.width) / originalSize.x + leftBlankSpace;
        const downBlankSpace = (texture.height * atlasRegion.height) / originalSize.y + topBlankSpace;
        if (
          regionX + regionWidth <= leftBlankSpace ||
          regionY + regionHeight <= topBlankSpace ||
          regionX >= rightBlankSpace ||
          regionY >= downBlankSpace
        ) {
          left = top = right = bottom = 0;
        } else {
          // The size of the real rendering.
          const realRenderWidth =
            ((Math.min(rightBlankSpace, regionX + regionWidth) - Math.max(leftBlankSpace, regionX)) * originalSize.x) /
            texture.width;
          const realRenderHeight =
            ((Math.min(downBlankSpace, regionY + regionHeight) - Math.max(topBlankSpace, regionY)) * originalSize.y) /
            texture.height;
          left =
            ((Math.max(leftBlankSpace, regionX) - leftBlankSpace) * originalSize.x) / texture.width + atlasRegion.x;
          top = ((Math.max(topBlankSpace, regionY) - topBlankSpace) * originalSize.y) / texture.height + atlasRegion.y;
          right = left + realRenderWidth;
          bottom = top + realRenderHeight;
        }
      } else {
        left = atlasRegion.x + atlasRegion.width * regionX;
        top = atlasRegion.y + atlasRegion.height * regionY;
        right = left + atlasRegion.width * regionWidth;
        bottom = top + atlasRegion.height * regionHeight;
      }

      if (this._atlasRotated) {
        // If it is rotated, we need to rotate the UV 90 degrees counterclockwise to correct it.
        // Top-left.
        uv[0].setValue(right, top);
        // Top-right.
        uv[1].setValue(right, bottom);
        // Bottom-right.
        uv[2].setValue(left, bottom);
        // Bottom-left.
        uv[3].setValue(left, top);
      } else {
        // Top-left.
        uv[0].setValue(left, top);
        // Top-right.
        uv[1].setValue(right, top);
        // Bottom-right.
        uv[2].setValue(right, bottom);
        // Bottom-left.
        uv[3].setValue(left, bottom);
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
