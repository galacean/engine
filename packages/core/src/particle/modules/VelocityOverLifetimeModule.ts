import { Vector3 } from "@galacean/engine-math";
import { ShaderMacro } from "../../shader";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";

/**
 * Velocity over lifetime module.
 */
export class VelocityOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _constantMacro = ShaderMacro.getByName("RENDERER_VOL_CONSTANT");
  static readonly _curveMacro = ShaderMacro.getByName("RENDERER_VOL_CURVE");
  static readonly _randomConstantMacro = ShaderMacro.getByName("RENDERER_VOL_RANDOM_CONSTANT");
  static readonly _randomCurveMacro = ShaderMacro.getByName("RENDERER_VOL_RANDOM_CURVE");

  static readonly _minConstantProperty = ShaderProperty.getByName("renderer_VOLMinConst");
  static readonly _maxConstantProperty = ShaderProperty.getByName("renderer_VOLMaxConst");
  static readonly _minGradientXProperty = ShaderProperty.getByName("renderer_VOLMinGradientX");
  static readonly _minGradientYProperty = ShaderProperty.getByName("renderer_VOLMinGradientY");
  static readonly _minGradientZProperty = ShaderProperty.getByName("renderer_VOLMinGradientZ");
  static readonly _maxGradientXProperty = ShaderProperty.getByName("renderer_VOLMaxGradientX");
  static readonly _maxGradientYProperty = ShaderProperty.getByName("renderer_VOLMaxGradientY");
  static readonly _maxGradientZProperty = ShaderProperty.getByName("renderer_VOLMaxGradientZ");
  static readonly _spaceProperty = ShaderProperty.getByName("renderer_VOLSpace");

  /** Velocity over lifetime for x axis. */
  x: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Velocity over lifetime for z axis. */
  y: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Velocity over lifetime for z axis. */
  z: ParticleCompositeCurve = new ParticleCompositeCurve(0);

  /** Velocity space. */
  space = ParticleSimulationSpace.Local;

  private _velocityMinConstant = new Vector3();
  private _velocityMaxConstant = new Vector3();

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: VelocityOverLifetimeModule): void {}

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let velocityMacro = <ShaderMacro>null;
    if (this.enabled) {
      const velocityX = this.x;
      const velocityY = this.y;
      const velocityZ = this.z;

      const isRandomCurveMode =
        velocityX.mode === ParticleCurveMode.TwoCurves &&
        velocityY.mode === ParticleCurveMode.TwoCurves &&
        velocityZ.mode === ParticleCurveMode.TwoCurves;

      if (
        isRandomCurveMode ||
        (velocityX.mode === ParticleCurveMode.Curve &&
          velocityY.mode === ParticleCurveMode.Curve &&
          velocityZ.mode === ParticleCurveMode.Curve)
      ) {
        shaderData.setFloatArray(VelocityOverLifetimeModule._maxGradientXProperty, velocityX.curveMax._getTypeArray());
        shaderData.setFloatArray(VelocityOverLifetimeModule._maxGradientYProperty, velocityY.curveMax._getTypeArray());
        shaderData.setFloatArray(VelocityOverLifetimeModule._maxGradientZProperty, velocityZ.curveMax._getTypeArray());
        if (isRandomCurveMode) {
          shaderData.setFloatArray(
            VelocityOverLifetimeModule._minGradientXProperty,
            velocityX.curveMin._getTypeArray()
          );
          shaderData.setFloatArray(
            VelocityOverLifetimeModule._minGradientYProperty,
            velocityY.curveMin._getTypeArray()
          );
          shaderData.setFloatArray(
            VelocityOverLifetimeModule._minGradientZProperty,
            velocityZ.curveMin._getTypeArray()
          );
          velocityMacro = VelocityOverLifetimeModule._randomCurveMacro;
        } else {
          velocityMacro = VelocityOverLifetimeModule._curveMacro;
        }
      } else {
        const constantMax = this._velocityMaxConstant;
        constantMax.set(velocityX.constantMax, velocityY.constantMax, velocityZ.constantMax);
        shaderData.setVector3(VelocityOverLifetimeModule._maxConstantProperty, constantMax);
        if (
          velocityX.mode === ParticleCurveMode.TwoConstants &&
          velocityY.mode === ParticleCurveMode.TwoConstants &&
          velocityZ.mode === ParticleCurveMode.TwoConstants
        ) {
          const constantMin = this._velocityMinConstant;
          constantMin.set(velocityX.constantMin, velocityY.constantMin, velocityZ.constantMin);
          shaderData.setVector3(VelocityOverLifetimeModule._minConstantProperty, constantMin);
          velocityMacro = VelocityOverLifetimeModule._randomConstantMacro;
        } else {
          velocityMacro = VelocityOverLifetimeModule._constantMacro;
        }
      }
      this._enableModuleMacro(shaderData, velocityMacro);
      shaderData.setInt(VelocityOverLifetimeModule._spaceProperty, this.space);
    }
  }
}
