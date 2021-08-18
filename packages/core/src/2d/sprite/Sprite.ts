import { BoundingBox, MathUtil, Rect, Vector2, Vector4 } from "@oasis-engine/math";
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
  private _atlasRotated: boolean = false;
  private _region: Rect = new Rect(0, 0, 1, 1);
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  private _atlasRegion: Rect = new Rect(0, 0, 1, 1);
  private _atlasRegionOffset: Vector4 = new Vector4(0, 0, 0, 0);
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
    this._atlasRegion.setValue(x, y, MathUtil.clamp(value.width, 0, 1 - x), MathUtil.clamp(value.height, 0, 1 - y));
    this._setDirtyFlagTrue(DirtyFlag.uv);
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
    this._setDirtyFlagTrue(DirtyFlag.positions | DirtyFlag.uv);
  }

  /**
   * Location of the sprite's center point in the rectangle region on the original sprite, specified in normalized.
   */
  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(value: Vector2) {
    this._pivot.setValue(MathUtil.clamp(value.x, 0, 1), MathUtil.clamp(value.y, 0, 1));
    this._setDirtyFlagTrue(DirtyFlag.positions);
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
    const { _texture: texture, _bounds: bounds } = this;
    if (texture) {
      const { _atlasRegion: atlasRegion, _pivot: pivot, _atlasRegionOffset: atlasRegionOffset } = this;
      const { x: regionX, y: regionY, width: regionW, height: regionH } = this._region;
      const pPUReciprocal = 1.0 / this._pixelsPerUnit;
      // Coordinates of the four boundaries.
      let lx: number, ty: number, rx: number, by: number;
      // TextureSize
      let textureW: number, textureH: number;
      if (this._atlasRotated) {
        textureW = texture.height * atlasRegion.height * pPUReciprocal;
        textureH = texture.width * atlasRegion.width * pPUReciprocal;
      } else {
        textureW = texture.width * atlasRegion.width * pPUReciprocal;
        textureH = texture.height * atlasRegion.height * pPUReciprocal;
      }
      // Determine whether it has been trimmed.
      if (
        atlasRegionOffset.x == 0 &&
        atlasRegionOffset.y == 0 &&
        atlasRegionOffset.z == 0 &&
        atlasRegionOffset.w == 0
      ) {
        // Real rendering size.
        const realRenderW = textureW * regionW;
        const realRenderH = textureH * regionH;
        lx = -pivot.x * realRenderW;
        by = -pivot.y * realRenderH;
        rx = realRenderW + lx;
        ty = realRenderH + by;
      } else {
        const { x: blankLeft, y: blankTop, z: blankRight, w: blankBottom } = atlasRegionOffset;
        const oriWidth = textureW / (1 - blankRight - blankLeft);
        const oriHeight = textureH / (1 - blankBottom - blankTop);
        // The size of the real rendering.
        lx = (-pivot.x * regionW + Math.max(blankLeft, regionX) - regionX) * oriWidth;
        ty = (pivot.y * regionH - Math.max(blankTop, regionY) + regionY) * oriHeight;
        rx = (-pivot.x * regionW + Math.min(1 - blankRight, regionX + regionW) - regionX) * oriWidth;
        by = (pivot.y * regionH - Math.min(1 - blankBottom, regionY + regionH) + regionY) * oriHeight;
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
      const { _atlasRegion, _uv: uv, _region: region, _atlasRotated, _atlasRegionOffset: atlasRegionOffset } = this;
      let left: number, top: number, right: number, bottom: number;
      // Determine whether it has been trimmed.
      if (
        atlasRegionOffset.x == 0 &&
        atlasRegionOffset.y == 0 &&
        atlasRegionOffset.z == 0 &&
        atlasRegionOffset.w == 0
      ) {
        const { width: atlasRegionW, height: atlasRegionH } = _atlasRegion;
        if (_atlasRotated) {
          left = atlasRegionW * (1 - region.y - region.height) + _atlasRegion.x;
          top = atlasRegionH * region.x + _atlasRegion.y;
          right = atlasRegionW * region.height + left;
          bottom = atlasRegionH * region.width + top;
        } else {
          left = atlasRegionW * region.x + _atlasRegion.x;
          top = atlasRegionH * region.y + _atlasRegion.y;
          right = atlasRegionW * region.width + left;
          bottom = atlasRegionH * region.height + top;
        }
      } else {
        const { x: regionX, y: regionY } = region;
        const { x: atlasRegionX, y: atlasRegionY } = _atlasRegion;
        const { x: blankLeft, y: blankTop, z: blankRight, w: blankBottom } = atlasRegionOffset;
        // Proportion of the original sprite size in the atlas.
        let textureW: number, textureH: number;
        if (_atlasRotated) {
          textureW = _atlasRegion.width / (1 - blankBottom - blankTop);
          textureH = _atlasRegion.height / (1 - blankRight - blankLeft);
          left = (Math.max(blankBottom, 1 - regionY - region.height) - blankBottom) * textureW + atlasRegionX;
          top = (Math.max(blankLeft, regionX) - blankLeft) * textureH + atlasRegionY;
          right = (Math.min(1 - blankTop, 1 - regionY) - blankBottom) * textureW + atlasRegionX;
          bottom = (Math.min(1 - blankRight, regionX + region.width) - blankLeft) * textureH + atlasRegionY;
        } else {
          textureW = _atlasRegion.width / (1 - blankRight - blankLeft);
          textureH = _atlasRegion.height / (1 - blankBottom - blankTop);
          left = (Math.max(blankLeft, regionX) - blankLeft) * textureW + atlasRegionX;
          top = (Math.max(blankTop, regionY) - blankTop) * textureH + atlasRegionY;
          right = (Math.min(1 - blankRight, regionX + region.width) - blankLeft) * textureW + atlasRegionX;
          bottom = (Math.min(1 - blankBottom, regionY + region.height) - blankTop) * textureH + atlasRegionY;
        }
      }

      if (_atlasRotated) {
        // If it is rotated, we need to rotate the UV 90 degrees counterclockwise to correct it.
        // Top-right.
        uv[0].setValue(right, top);
        // Bottom-right.
        uv[1].setValue(right, bottom);
        // Bottom-left.
        uv[2].setValue(left, bottom);
        // Top-left.
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
