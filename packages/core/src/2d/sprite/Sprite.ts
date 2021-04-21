import { MathUtil, Rect, Vector2 } from "@oasis-engine/math";
import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";

/**
 * 2D sprite.
 */
export class Sprite extends RefObject {
  private static _tempVec2: Vector2 = new Vector2();

  /** @internal */
  _triangles: number[] = [];
  /** @internal */
  _uv: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];
  /** @internal */
  _positions: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];

  private _texture: Texture2D = null;
  private _atlasRegion: Rect = new Rect(0, 0, 1, 1);
  private _region: Rect = new Rect(0, 0, 1, 1);
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  private _pixelsPerUnit: number;
  private _dirtyFlag: number = DirtyFlag.all;

  /**
   * The reference to the used texture.
   */
  get texture(): Texture2D {
    return this._texture;
  }

  set texture(value: Texture2D) {
    if (this._texture !== value) {
      this._texture = value;
    }
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
    region.x = MathUtil.clamp(value.x, 0, 1);
    region.y = MathUtil.clamp(value.y, 0, 1);
    region.width = MathUtil.clamp(value.width, 0, 1.0 - region.x);
    region.height = MathUtil.clamp(value.height, 0, 1.0 - region.y);
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
      this.atlasRegion = region;
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
   * Update mesh.
   */
  private _updateMesh(): void {
    if (this._isContainDirtyFlag(DirtyFlag.positions)) {
      const positions = this._positions;
      const { width, height } = this.texture;
      const { width: rWidth, height: rHeight } = this.region;
      const pivot = this.pivot;
      const unitPivot = Sprite._tempVec2;

      const pixelsPerUnitReciprocal = 1.0 / this._pixelsPerUnit;
      // Get the width and height in 3D space.
      const unitWidth = rWidth * width * pixelsPerUnitReciprocal;
      const unitHeight = rHeight * height * pixelsPerUnitReciprocal;
      // Get the pivot coordinate in 3D space.
      unitPivot.x = pivot.x * unitWidth;
      unitPivot.y = pivot.y * unitHeight;

      // Top-left.
      positions[0].setValue(-unitPivot.x, unitHeight - unitPivot.y);
      // Top-right.
      positions[1].setValue(unitWidth - unitPivot.x, unitHeight - unitPivot.y);
      // Bottom-right.
      positions[2].setValue(unitWidth - unitPivot.x, -unitPivot.y);
      // Bottom-left.
      positions[3].setValue(-unitPivot.x, -unitPivot.y);
    }

    if (this._isContainDirtyFlag(DirtyFlag.uv)) {
      const uv = this._uv;
      const { x, y, width, height } = this.region;
      const rightX = x + width;
      const bottomY = y + height;

      // Top-left.
      uv[0].setValue(x, y);
      // Top-right.
      uv[1].setValue(rightX, y);
      // Bottom-right.
      uv[2].setValue(rightX, bottomY);
      // Bottom-left.
      uv[3].setValue(x, bottomY);
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
  positions = 0x1,
  uv = 0x2,
  triangles = 0x4,
  all = 0x7
}
