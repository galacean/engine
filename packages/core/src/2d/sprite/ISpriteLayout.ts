import { Vector2 } from "@galacean/engine-math";
import { SpriteModifyFlags } from "../enums/SpriteModifyFlags";

/**
 * Provides layout input (width, height, pivot, flip, referenceResolutionPerUnit)
 * for sprite rendering. Different hosts use different layouts:
 *
 * - World-space (SpriteRenderer, SpriteMask): customWidth/automaticWidth, sprite.pivot, flipX/flipY
 * - UI-space (Image, UI Mask): UITransform.size, UITransform.pivot, no flip
 */
export interface ISpriteLayout {
  readonly width: number;
  readonly height: number;
  readonly pivot: Vector2;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly referenceResolutionPerUnit: number | undefined;

  /**
   * Called when sprite property changes. Returns additional dirty flags the host should set.
   * Only called for types that the layout cares about (size, pivot).
   */
  onSpriteSizeChanged(): number;
  onSpritePivotChanged(): number;

  /**
   * Called when the sprite instance is replaced. Layout should reset internal state (e.g. auto-size).
   */
  onSpriteInstanceChanged(): void;
}
