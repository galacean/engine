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
   *  Bounding volume of the sprite.
   *  @remarks The returned bounds should be considered deep-read-only.
   */
  get bounds(): Readonly<BoundingBox> {
    if (this._isContainDirtyFlag(DirtyFlag.positions)) {
      this._updatePositionsAndBounds();
      this._setDirtyFlagTrue(DirtyFlag.positions);
    }
    return this._bounds;
  }

  /**
   * The rectangle region of the original texture on its atlas texture, specified in normalized.
   */
  get atlasRegion(): Rect {
    return this._atlasRegion;
  }

  set atlasRegion(value: Rect) {
    const atlasRegion = this._atlasRegion;
    atlasRegion.setValue(
      MathUtil.clamp(value.x, 0, 1),
      MathUtil.clamp(value.y, 0, 1),
      MathUtil.clamp(value.width, 0, 1 - value.x),
      MathUtil.clamp(value.height, 0, 1 - value.y)
    );
    this._setDirtyFlagTrue(DirtyFlag.positions);
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
    region.setValue(
      MathUtil.clamp(value.x, 0, 1),
      MathUtil.clamp(value.y, 0, 1),
      MathUtil.clamp(value.width, 0, 1 - value.x),
      MathUtil.clamp(value.height, 0, 1 - value.y)
    );
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
    const { texture, _bounds: bounds } = this;
    if (texture) {
      const { _atlasRegionOffset: atlasRegionOffset, _atlasRegion: atlasRegion, _region: region, _pivot: pivot } = this;
      const pixelsPerUnitReciprocal = 1.0 / this._pixelsPerUnit;

      // Get the width and height in 3D space.
      const unitWidth = atlasRegion.width * region.width * texture.width * pixelsPerUnitReciprocal;
      const unitHeight = atlasRegion.height * region.height * texture.height * pixelsPerUnitReciprocal;

      // Get the distance between the anchor point and the four sides.
      const lx = (-pivot.x + atlasRegionOffset.x) * unitWidth;
      const by = (-pivot.y + atlasRegionOffset.y) * unitHeight;
      const rx = unitWidth + lx;
      const ty = unitHeight + by;

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
      const { _region: region, _atlasRegion: atlasRegion, _uv: uv } = this;
      const realWidth = atlasRegion.width * region.width;
      const realHeight = atlasRegion.height * region.height;
      const left = atlasRegion.x + atlasRegion.width * region.x;
      const top = atlasRegion.y + atlasRegion.height * region.y;
      const right = left + realWidth;
      const bottom = top + realHeight;

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
