import { BoundingBox, MathUtil, Rect, Vector2 } from "@oasis-engine/math";
import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";

/**
 * 2D sprite.
 */
export class Sprite extends RefObject {
  /** @internal */
  _triangles: number[] = [];
  /** @internal */
  _uv: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];
  /** @internal */
  _positions: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];
  /** @internal */
  _bounds: BoundingBox = new BoundingBox();

  private _texture: Texture2D = null;
  private _atlasRegion: Rect = new Rect(0, 0, 1, 1);
  private _region: Rect = new Rect(0, 0, 1, 1);
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  private _pixelsPerUnit: number;
  private _dirtyFlag: number = DirtyFlag.all;
  // If and only if the type is Rect and trimmed.
  private _offset: Vector2 = new Vector2(0, 0);

  /**
   * The reference to the used texture.
   */
  get texture(): Texture2D {
    return this._texture;
  }

  set texture(value: Texture2D) {
    if (this._texture !== value) {
      this._texture = value;
      this._setDirtyFlagTrue(DirtyFlag.vertices);
    }
  }

  /**
   *  Bounding volume of the sprite.
   *  @remarks The returned bounds should be considered deep-read-only.
   */
  get bounds(): Readonly<BoundingBox> {
    if (this._isContainDirtyFlag(DirtyFlag.vertices)) {
      this._updatePositionsAndBounds();
      this._setDirtyFlagTrue(DirtyFlag.vertices);
    }
    return this._bounds;
  }

  /**
   * The rectangle region of the original texture on its atlas texture.
   */
  get atlasRegion(): Rect {
    return this._atlasRegion;
  }

  set atlasRegion(value: Rect) {
    const atlasRegion = this._atlasRegion;
    atlasRegion.x = MathUtil.clamp(value.x, 0, 1);
    atlasRegion.y = MathUtil.clamp(value.y, 0, 1);
    atlasRegion.width = MathUtil.clamp(value.width, 0, 1.0 - atlasRegion.x);
    atlasRegion.height = MathUtil.clamp(value.height, 0, 1.0 - atlasRegion.y);
    this._setDirtyFlagTrue(DirtyFlag.vertices | DirtyFlag.uv);
  }

  /**
   * Location of the sprite's center point in the rectangle region on the original texture, specified in normalized.
   */
  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(value: Vector2) {
    const pivot = this._pivot;
    pivot.x = MathUtil.clamp(value.x, 0, 1);
    pivot.y = MathUtil.clamp(value.y, 0, 1);
    this._setDirtyFlagTrue(DirtyFlag.vertices);
  }

  /**
   * The rectangle region of the sprite on the original texture, specified in normalized.
   */
  get region(): Rect {
    return this._region;
  }

  set region(value: Rect) {
    const region = this._region;
    region.x = MathUtil.clamp(value.x, 0, 1);
    region.y = MathUtil.clamp(value.y, 0, 1);
    region.width = MathUtil.clamp(value.width, 0, 1.0 - region.x);
    region.height = MathUtil.clamp(value.height, 0, 1.0 - region.y);
    this._setDirtyFlagTrue(DirtyFlag.vertices | DirtyFlag.uv);
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
      this._setDirtyFlagTrue(DirtyFlag.vertices);
    }
  }

  /**
   * Only used in the atlas!!!
   * The number of pixels in the sprite that correspond to one unit in world space.
   */
  get offset(): Vector2 {
    return this._offset;
  }

  set offset(value: Vector2) {
    this._offset = value;
    this._setDirtyFlagTrue(DirtyFlag.vertices);
  }

  /**
   * Constructor a sprite.
   * @param engine - Engine to which the sprite belongs
   * @param texture - Texture from which to obtain the sprite
   * @param region - Rectangle region of the texture to use for the sprite, specified in normalized
   * @param pivot - Sprite's pivot point relative to its graphic rectangle, specified in normalized
   * @param pixelsPerUnit - The number of pixels in the sprite that correspond to one unit in world space
   */
  constructor(
    engine: Engine,
    texture: Texture2D = null,
    region: Rect = null,
    pivot: Vector2 = null,
    pixelsPerUnit: number = 128
  ) {
    super(engine);

    if (texture) {
      this.texture = texture;
    }

    if (region) {
      this.region = region;
    }

    if (pivot) {
      this.pivot = pivot;
    }

    this.pixelsPerUnit = pixelsPerUnit;
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
    const { texture } = this;
    if (!texture) {
      return;
    }

    const { _region, _atlasRegion, _pixelsPerUnit, _offset, _pivot } = this;
    const { width, height } = texture;
    const { width: regionWidth, height: regionHeight } = _region;
    const { width: atlasRegionWidth, height: atlasRegionHeight } = _atlasRegion;
    const pixelsPerUnitReciprocal = 1.0 / _pixelsPerUnit;

    // Get the width and height in 3D space.
    const unitWidth = atlasRegionWidth * regionWidth * width * pixelsPerUnitReciprocal;
    const unitHeight = atlasRegionHeight * regionHeight * height * pixelsPerUnitReciprocal;

    // Get the distance between the anchor point and the four sides.
    const { x: px, y: py } = _pivot;
    const offsetX = _offset.x * pixelsPerUnitReciprocal;
    const offsetY = _offset.y * pixelsPerUnitReciprocal;
    const lx = -px * unitWidth + offsetX;
    const ty = -py * unitHeight + offsetY;
    const rx = (1 - px) * unitWidth + offsetX;
    const by = (1 - py) * unitHeight + offsetY;

    // Assign values ​​to _positions
    const positions = this._positions;
    // Top-left.
    positions[0].setValue(lx, by);
    // Top-right.
    positions[1].setValue(rx, by);
    // Bottom-right.
    positions[2].setValue(rx, ty);
    // Bottom-left.
    positions[3].setValue(lx, ty);

    // Update bounds.
    const { min, max } = this._bounds;
    min.setValue(lx, ty, 0);
    max.setValue(rx, by, 0);
  }

  /**
   * Update mesh.
   */
  private _updateMesh(): void {
    if (this._isContainDirtyFlag(DirtyFlag.vertices)) {
      this._updatePositionsAndBounds();
    }

    if (this._isContainDirtyFlag(DirtyFlag.uv)) {
      const uv = this._uv;
      const {
        x: atlasRegionX,
        y: atlasRegionY,
        width: atlasRegionWidth,
        height: atlasRegionHeight
      } = this._atlasRegion;
      const { x: regionX, y: regionY, width: regionWidth, height: regionHeight } = this._region;
      const realWidth = atlasRegionWidth * regionWidth;
      const realheight = atlasRegionHeight * regionHeight;
      const left = atlasRegionX + realWidth * regionX;
      const right = left + realWidth;
      const top = atlasRegionY + realheight * regionY;
      const bottom = top + realheight;

      // Top-left.
      uv[0].setValue(left, top);
      // Top-right.
      uv[1].setValue(right, top);
      // Bottom-right.
      uv[2].setValue(right, bottom);
      // Bottom-left.
      uv[3].setValue(left, bottom);
    }

    if (this._isContainDirtyFlag(DirtyFlag.triangles)) {
      const triangles = this._triangles;
      triangles[0] = 0;
      triangles[1] = 2;
      triangles[2] = 1;
      triangles[3] = 2;
      triangles[4] = 0;
      triangles[5] = 3;
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
  vertices = 0x1,
  uv = 0x2,
  triangles = 0x4,
  all = 0x7
}
