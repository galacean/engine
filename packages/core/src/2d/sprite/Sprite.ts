import { Rect, Vector2 } from "@oasis-engine/math";
import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";

export class Sprite extends RefObject {
  private static _tempVec2: Vector2 = new Vector2();

  /** The array containing sprite mesh triangles. */
  public triangles: number[] = [];
  /** The base texture coordinates of the sprite mesh. */
  public uv: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];
  /** The array containing sprite mesh vertex positions. */
  public vertices: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];

  /** The reference to the used texture. */
  private _texture: Texture2D = null;
  /** The rectangle this sprite uses on its texture. */
  private _textureRect: Rect = new Rect();
  /** Location of the sprite's center point in the rect on the original texture, specified in pixels. */
  private _pivot: Vector2 = new Vector2();
  /** Location of the sprite on the original texture, specified in pixels. */
  private _rect: Rect = new Rect();
  /** The number of pixels in the sprite that correspond to one unit in world space. */
  private _pixelsPerUnit: number = 100;
  /** The dirty flag to determine whether refresh buffer. */
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
   * The rectangle this sprite uses on its texture.
   */
  get textureRect(): Rect {
    return this._textureRect;
  }

  set textureRect(value: Rect) {
    if (this._textureRect !== value) {
      this._textureRect.x = value.x;
      this._textureRect.y = value.y;
      this._textureRect.width = value.width;
      this._textureRect.height = value.width;
    }
  }

  /**
   * Location of the sprite's center point in the rect on the original texture, specified in pixels.
   */
  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(value: Vector2) {
    if (this._pivot !== value) {
      value.cloneTo(this._pivot);
      this._setDirtyFlagTrue(DirtyFlag.vertices);
    }
  }

  /**
   * Location of the sprite on the original texture, specified in pixels.
   */
  get rect(): Rect {
    return this._rect;
  }

  set rect(value: Rect) {
    if (this._rect !== value) {
      this._rect.x = value.x;
      this._rect.y = value.y;
      this._rect.width = value.width;
      this._rect.height = value.width;
      this._setDirtyFlagTrue(DirtyFlag.vertices);
    }
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
   * Constructor a sprite.
   * @param engine - Engine to which the sprite belongs
   * @param texture - Texture from which to obtain the sprite
   * @param rect - Rectangular section of the texture to use for the sprite
   * @param pivot - Sprite's pivot point relative to its graphic rectangle
   * @param pixelsPerUnit - The number of pixels in the sprite that correspond to one unit in world space
   */
  constructor(
    engine: Engine,
    texture: Texture2D,
    rect: Rect = null,
    pivot: Vector2 = null,
    pixelsPerUnit: number = 100
  ) {
    super(engine);

    if (!rect) {
      rect = new Rect(0, 0, texture.width, texture.height);
    }
    if (!pivot) {
      pivot = new Vector2(0.5, 0.5);
    }

    if (rect.x + rect.width > texture.width || rect.y + rect.height > texture.height) {
      throw new Error("rect out of range");
    }

    // Init.
    this.texture = texture;
    this.rect = rect;
    this.textureRect = rect;
    this.pivot.setValue(pivot.x * rect.width, pivot.y * rect.height);
    this.pixelsPerUnit = pixelsPerUnit;
  }

  /**
   * @override
   */
  _onDestroy() {
    // TODO
    if (this._texture) {
      this._texture = null;
    }
  }

  /**
   * Update mesh.
   */
  private _updateMesh() {
    const { _pixelsPerUnit, _pivot, vertices, uv, triangles } = this;
    const { _tempVec2 } = Sprite;

    // Update vertices.
    if (this._isContainDirtyFlag(DirtyFlag.vertices)) {
      const { width, height } = this._rect;

      // Get the pivot coordinate in 3D space.
      Vector2.scale(_pivot, 1.0 / _pixelsPerUnit, _tempVec2);
      // Get the width and height in 3D space.
      const realWidth = width / _pixelsPerUnit;
      const realHeight = height / _pixelsPerUnit;

      // Top-left.
      vertices[0].setValue(-_tempVec2.x, realHeight - _tempVec2.y);
      // Top-right.
      vertices[1].setValue(realWidth - _tempVec2.x, realWidth - _tempVec2.y);
      // Bottom-right.
      vertices[2].setValue(realWidth - _tempVec2.x, -_tempVec2.y);
      // Bottom-left.
      vertices[3].setValue(-_tempVec2.x, -_tempVec2.y);
    }

    // Update uvs.
    if (this._isContainDirtyFlag(DirtyFlag.uv)) {
      // Top-left.
      uv[0].setValue(0, 0);
      // Top-right.
      uv[1].setValue(1, 0);
      // Bottom-right.
      uv[2].setValue(1, 1);
      // Bottom-left.
      uv[3].setValue(0, 1);
    }

    // Update triangles.
    if (this._isContainDirtyFlag(DirtyFlag.triangles)) {
      triangles[0] = 0;
      triangles[1] = 2;
      triangles[2] = 1;
      triangles[3] = 2;
      triangles[4] = 0;
      triangles[5] = 3;
    }
  }

  /**
   * Update mesh data of the sprite.
   * @internal
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

  private _setDirtyFlagTrue(type: number) {
    this._dirtyFlag |= type;
  }

  private _setDirtyFlagFalse(type: number) {
    this._dirtyFlag &= ~type;
  }
}

enum DirtyFlag {
  vertices = 0x1,
  uv = 0x2,
  triangles = 0x4,
  all = 0x7
}
