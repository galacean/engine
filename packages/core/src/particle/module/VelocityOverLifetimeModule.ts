import { VelocityGradient } from "./VelocityGradient";
import { IClone } from "@galacean/engine-design";
import { ParticleCurveMode, ParticleSimulationSpace } from "../enum";

/**
 * This module sets the velocity of particles during their lifetime.
 */
export class VelocityOverLifetimeModule implements IClone {
  /** Get Gradient Velocity。 */
  velocity: VelocityGradient = null;
  /** Specifies whether the VelocityOverLifetimeModule is enabled or disabled. */
  enable: boolean = false;
  /** Specifies if the velocities are in local space (rotated with the transform) or world space. */
  space = ParticleSimulationSpace.Local;

  /**
   * @override
   */
  cloneTo(destVelocityOverLifetime: VelocityOverLifetimeModule): void {
    destVelocityOverLifetime.velocity = this.velocity;
    destVelocityOverLifetime.enable = this.enable;
    destVelocityOverLifetime.space = this.space;
  }

  /**
   * @override
   */
  clone(): VelocityOverLifetimeModule {
    let destVelocity: VelocityGradient;
    switch (this.velocity.mode) {
      case ParticleCurveMode.Constant:
        destVelocity = VelocityGradient.createByConstant(this.velocity.constant.clone());
        break;
      case ParticleCurveMode.Curve:
        destVelocity = VelocityGradient.createByGradient(
          this.velocity.gradientX.clone(),
          this.velocity.gradientY.clone(),
          this.velocity.gradientZ.clone()
        );
        break;
      case ParticleCurveMode.TwoConstants:
        destVelocity = VelocityGradient.createByRandomTwoConstant(
          this.velocity.constantMin.clone(),
          this.velocity.constantMax.clone()
        );
        break;
      case ParticleCurveMode.TwoCurves:
        destVelocity = VelocityGradient.createByRandomTwoGradient(
          this.velocity.gradientXMin.clone(),
          this.velocity.gradientXMax.clone(),
          this.velocity.gradientYMin.clone(),
          this.velocity.gradientYMax.clone(),
          this.velocity.gradientZMin.clone(),
          this.velocity.gradientZMax.clone()
        );
        break;
    }
    const destVelocityOverLifetime = new VelocityOverLifetimeModule();
    destVelocityOverLifetime.velocity = destVelocity;
    destVelocityOverLifetime.enable = this.enable;
    destVelocityOverLifetime.space = this.space;
    return destVelocityOverLifetime;
  }
}
