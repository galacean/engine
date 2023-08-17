import { Color } from "@galacean/engine-math";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";

/**
 * Rotate particles throughout their lifetime.
 */
export class ColorOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _gradientMacro = ShaderMacro.getByName("RENDERER_COL_GRADIENT");
  static readonly _randomGradientsMacro = ShaderMacro.getByName("RENDERER_COL_RANDOM_GRADIENTS");

  static readonly _minGradientColor = ShaderProperty.getByName("renderer_COLMinGradientColor");
  static readonly _minGradientAlpha = ShaderProperty.getByName("renderer_COLMinGradientAlpha");
  static readonly _maxGradientColor = ShaderProperty.getByName("renderer_COLMaxGradientColor");
  static readonly _maxGradientAlpha = ShaderProperty.getByName("renderer_COLMaxGradientAlpha");

  /** Specifies whether the rotation is separate on each axis, when disabled only x axis is used and applied to all axes. */
  separateAxes: boolean = false;

  /** Rotation over lifetime for z axis. */
  color: ParticleCompositeGradient = new ParticleCompositeGradient(new Color(1, 1, 1, 1));

  /**
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: ColorOverLifetimeModule): void {}

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {}
}
