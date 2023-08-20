import { ShaderMacro } from "../../shader";
import { ShaderData } from "../../shader/ShaderData";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { ShaderProperty } from "../../shader/ShaderProperty";

/**
 * Rotate particles throughout their lifetime.
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
  static readonly _spaceTypeProperty = ShaderProperty.getByName("renderer_VOLSpaceType");

  /** Rotation over lifetime for z axis. */
  x: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Rotation over lifetime for z axis. */
  y: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Rotation over lifetime for z axis. */
  z: ParticleCompositeCurve = new ParticleCompositeCurve(45);

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: VelocityOverLifetimeModule): void {}

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {}
}
