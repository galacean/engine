import { Vector2 } from "@galacean/engine-math";
import { RendererUpdateFlags } from "../../Renderer";
import { Sprite } from "./Sprite";
import { ISpriteLayout } from "./ISpriteLayout";

/**
 * Layout for world-space sprite renderers (SpriteRenderer, SpriteMask).
 * Provides custom/automatic width-height, flipX/flipY, and sprite.pivot.
 */
export class WorldSpriteLayout implements ISpriteLayout {
  private _customWidth: number = undefined;
  private _customHeight: number = undefined;
  private _automaticWidth: number = 0;
  private _automaticHeight: number = 0;
  private _autoSizeDirty: boolean = true;
  private _flipX: boolean = false;
  private _flipY: boolean = false;
  private _spriteGetter: () => Sprite | null;

  constructor(spriteGetter: () => Sprite | null) {
    this._spriteGetter = spriteGetter;
  }

  // --- Width / Height ---

  get width(): number {
    if (this._customWidth !== undefined) {
      return this._customWidth;
    } else {
      if (this._autoSizeDirty) {
        this._calDefaultSize();
      }
      return this._automaticWidth;
    }
  }

  set width(value: number) {
    this._customWidth = value;
  }

  get height(): number {
    if (this._customHeight !== undefined) {
      return this._customHeight;
    } else {
      if (this._autoSizeDirty) {
        this._calDefaultSize();
      }
      return this._automaticHeight;
    }
  }

  set height(value: number) {
    this._customHeight = value;
  }

  get customWidth(): number {
    return this._customWidth;
  }

  get customHeight(): number {
    return this._customHeight;
  }

  // --- Flip ---

  get flipX(): boolean {
    return this._flipX;
  }

  set flipX(value: boolean) {
    this._flipX = value;
  }

  get flipY(): boolean {
    return this._flipY;
  }

  set flipY(value: boolean) {
    this._flipY = value;
  }

  // --- ISpriteLayout ---

  get pivot(): Vector2 {
    return this._spriteGetter()?.pivot;
  }

  get referenceResolutionPerUnit(): number | undefined {
    return undefined;
  }

  onSpriteInstanceChanged(): void {
    this._autoSizeDirty = true;
  }

  onSpriteSizeChanged(): number {
    this._autoSizeDirty = true;
    if (this._customWidth === undefined || this._customHeight === undefined) {
      return RendererUpdateFlags.WorldVolume;
    }
    return 0;
  }

  onSpritePivotChanged(): number {
    return RendererUpdateFlags.WorldVolume;
  }

  // --- Private ---

  private _calDefaultSize(): void {
    const sprite = this._spriteGetter();
    if (sprite) {
      this._automaticWidth = sprite.width;
      this._automaticHeight = sprite.height;
    } else {
      this._automaticWidth = this._automaticHeight = 0;
    }
    this._autoSizeDirty = false;
  }
}
