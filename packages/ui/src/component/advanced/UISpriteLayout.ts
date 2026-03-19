import { Vector2 } from "@galacean/engine";
import type { ISpriteLayout } from "@galacean/engine";
import { UICanvas } from "../UICanvas";
import { UITransform } from "../UITransform";

/**
 * Layout for UI-space sprite renderers (Image, UI Mask).
 * Reads size/pivot from UITransform and referenceResolutionPerUnit from UICanvas.
 */
export class UISpriteLayout implements ISpriteLayout {
  private _transformGetter: () => UITransform;
  private _canvasGetter: () => UICanvas | null;

  constructor(transformGetter: () => UITransform, canvasGetter: () => UICanvas | null) {
    this._transformGetter = transformGetter;
    this._canvasGetter = canvasGetter;
  }

  get width(): number {
    return this._transformGetter().size.x;
  }

  get height(): number {
    return this._transformGetter().size.y;
  }

  get pivot(): Vector2 {
    return this._transformGetter().pivot;
  }

  get flipX(): boolean {
    return false;
  }

  get flipY(): boolean {
    return false;
  }

  get referenceResolutionPerUnit(): number | undefined {
    return this._canvasGetter()?.referenceResolutionPerUnit;
  }

  onSpriteInstanceChanged(): void {
    // UI sprites don't track automatic size from sprite — size comes from UITransform.
  }

  onSpriteSizeChanged(): number {
    // Sprite.size changes don't affect UI renderers (they use UITransform.size).
    return 0;
  }

  onSpritePivotChanged(): number {
    // Sprite.pivot changes don't affect UI renderers (they use UITransform.pivot).
    return 0;
  }
}
