import { SizeGradient } from "./SizeGradient";
import { IClone } from "@oasis-engine/design";
import { ParticleCurveMode } from "../enum";

/**
 * This module controls the size of particles throughout their lifetime.
 */
export class SizeOverLifetimeModule implements IClone {
  /** Curve to control particle size based on lifetime. */
  size: SizeGradient;

  /** Specifies whether the SizeOverLifetimeModule is enabled or disabled. */
  enable: boolean;

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destSizeOverLifetime: SizeOverLifetimeModule): void {
    this.size.cloneTo(destSizeOverLifetime.size);
    destSizeOverLifetime.enable = this.enable;
  }

  /**
   * @override
   * @inheritDoc
   */
  clone(): SizeOverLifetimeModule {
    let destSize: SizeGradient;
    switch (this.size.mode) {
      case ParticleCurveMode.Curve:
        if (this.size.separateAxes)
          destSize = SizeGradient.createByGradientSeparate(
            this.size.gradientX.clone(),
            this.size.gradientY.clone(),
            this.size.gradientZ.clone()
          );
        else destSize = SizeGradient.createByGradient(this.size.gradient.clone());
        break;
      case ParticleCurveMode.TwoConstants:
        if (this.size.separateAxes)
          destSize = SizeGradient.createByRandomTwoConstantSeparate(
            this.size.constantMinSeparate.clone(),
            this.size.constantMaxSeparate.clone()
          );
        else destSize = SizeGradient.createByRandomTwoConstant(this.size.constantMin, this.size.constantMax);
        break;
      case ParticleCurveMode.TwoCurves:
        if (this.size.separateAxes)
          destSize = SizeGradient.createByRandomTwoGradientSeparate(
            this.size.gradientXMin.clone(),
            this.size.gradientYMin.clone(),
            this.size.gradientZMin.clone(),
            this.size.gradientXMax.clone(),
            this.size.gradientYMax.clone(),
            this.size.gradientZMax.clone()
          );
        else
          destSize = SizeGradient.createByRandomTwoGradient(
            this.size.gradientMin.clone(),
            this.size.gradientMax.clone()
          );
        break;
    }

    const destSizeOverLifetime = new SizeOverLifetimeModule();
    destSizeOverLifetime.size = destSize;
    destSizeOverLifetime.enable = this.enable;
    return destSizeOverLifetime;
  }
}
