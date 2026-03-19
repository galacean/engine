import { Vector2 } from "@galacean/engine-math";
import { ISpriteLayout } from "../sprite/ISpriteLayout";

/**
 * Layout for world-space text renderers (TextRenderer).
 * Provides custom width/height, centered pivot (0.5, 0.5), no flip.
 */
export class WorldTextLayout implements ISpriteLayout {
  private static _defaultPivot = new Vector2(0.5, 0.5);
  private _width: number = 0;
  private _height: number = 0;

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = value;
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = value;
  }

  get pivot(): Vector2 {
    return WorldTextLayout._defaultPivot;
  }

  get flipX(): boolean {
    return false;
  }

  get flipY(): boolean {
    return false;
  }

  get referenceResolutionPerUnit(): number | undefined {
    return undefined;
  }

  onSpriteSizeChanged(): number {
    return 0;
  }

  onSpritePivotChanged(): number {
    return 0;
  }

  onSpriteInstanceChanged(): void {}
}
