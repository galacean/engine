import { RotationVelocityGradient } from "./RotationVelocityGradient";
import { IClone } from "@oasis-engine/design";
import { ParticleCurveMode } from "../enum";

/**
 * Rotate particles throughout their lifetime.
 */
export class RotationOverLifetimeModule implements IClone {
  /** Curve to control particle angular velocity based on lifetime. */
  angularVelocity: RotationVelocityGradient = null;
  /** Specifies whether the RotationOverLifetimeModule is enabled or disabled. */
  enable: boolean;

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: RotationOverLifetimeModule): void {
    destRotationOverLifetime.angularVelocity = this.angularVelocity;
    destRotationOverLifetime.enable = this.enable;
  }

  /**
   * @override
   * @inheritDoc
   */
  clone(): RotationOverLifetimeModule {
    let destAngularVelocity: RotationVelocityGradient;
    switch (this.angularVelocity.mode) {
      case ParticleCurveMode.Constant:
        if (this.angularVelocity.separateAxes)
          destAngularVelocity = RotationVelocityGradient.createByConstantSeparate(
            this.angularVelocity.constantSeparate.clone()
          );
        else destAngularVelocity = RotationVelocityGradient.createByConstant(this.angularVelocity.constant);
        break;
      case ParticleCurveMode.Curve:
        if (this.angularVelocity.separateAxes)
          destAngularVelocity = RotationVelocityGradient.createByGradientSeparate(
            this.angularVelocity.gradientX.clone(),
            this.angularVelocity.gradientY.clone(),
            this.angularVelocity.gradientZ.clone()
          );
        else destAngularVelocity = RotationVelocityGradient.createByGradient(this.angularVelocity.gradient.clone());
        break;
      case ParticleCurveMode.TwoConstants:
        if (this.angularVelocity.separateAxes)
          destAngularVelocity = RotationVelocityGradient.createByRandomTwoConstantSeparate(
            this.angularVelocity.constantMinSeparate.clone(),
            this.angularVelocity.constantMaxSeparate.clone()
          );
        else
          destAngularVelocity = RotationVelocityGradient.createByRandomTwoConstant(
            this.angularVelocity.constantMin,
            this.angularVelocity.constantMax
          );
        break;
      case ParticleCurveMode.TwoCurves:
        if (this.angularVelocity.separateAxes)
          destAngularVelocity = RotationVelocityGradient.createByRandomTwoGradientSeparate(
            this.angularVelocity.gradientXMin.clone(),
            this.angularVelocity.gradientYMin.clone(),
            this.angularVelocity.gradientZMin.clone(),
            this.angularVelocity.gradientWMin.clone(),
            this.angularVelocity.gradientXMax.clone(),
            this.angularVelocity.gradientYMax.clone(),
            this.angularVelocity.gradientZMax.clone(),
            this.angularVelocity.gradientWMax.clone()
          );
        else
          destAngularVelocity = RotationVelocityGradient.createByRandomTwoGradient(
            this.angularVelocity.gradientMin.clone(),
            this.angularVelocity.gradientMax.clone()
          );
        break;
    }

    const destRotationOverLifetime = new RotationOverLifetimeModule();
    destRotationOverLifetime.angularVelocity = destAngularVelocity;
    destRotationOverLifetime.enable = this.enable;
    return destRotationOverLifetime;
  }
}
