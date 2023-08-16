import { IClone } from "@galacean/engine-design";

import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { Vector2 } from "@galacean/engine-math";

/**
 * Texture sheet animation module.
 */
export class TextureSheetAnimationModule extends ParticleGeneratorModule {
  /** Texture sheet animation type. */
  type: TextureSheetAnimationType = TextureSheetAnimationType.WholeSheet;
  /** Cycle count. */
  cycleCount: number = 1;

  /** Tiling of the texture sheet. */
  readonly tiling: Vector2 = new Vector2(1, 1);
  /** Start frame of the texture sheet. */
  readonly startFrame: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Frame over time curve of the texture sheet. */
  readonly frameOverTime: ParticleCompositeCurve = new ParticleCompositeCurve(0);

  /**
   * @inheritDoc
   */
  cloneTo(dest: TextureSheetAnimationModule): void {}
}

/**
 * Texture sheet animation type.
 */
export enum TextureSheetAnimationType {
  /** Animate over the whole texture sheet from left to right, top to bottom. */
  WholeSheet,
  /** Animate a single row in the sheet from left to right. */
  SingleRow
}
