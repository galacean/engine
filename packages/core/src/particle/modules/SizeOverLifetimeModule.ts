import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { Key, ParticleCurve } from "./ParticleCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Size over lifetime module.
 */
export class SizeOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _curveMacro = ShaderMacro.getByName("RENDERER_SOL_CURVE");
  static readonly _curveSeparateMacro = ShaderMacro.getByName("RENDERER_SOL_CURVE_SEPARATE");
  static readonly _randomCurvesMacro = ShaderMacro.getByName("RENDERER_SOL_RANDOM_CURVES");
  static readonly _randomCurvesSeparateMacro = ShaderMacro.getByName("RENDERER_SOL_RANDOM_CURVES_SEPARATE");

  static readonly _minCurveXProperty = ShaderProperty.getByName("renderer_SOLMinCurveX");
  static readonly _minCurveYProperty = ShaderProperty.getByName("renderer_SOLMinCurveY");
  static readonly _minCurveZProperty = ShaderProperty.getByName("renderer_SOLMinCurveZ");
  static readonly _maxCurveXProperty = ShaderProperty.getByName("renderer_SOLMaxCurveX");
  static readonly _maxCurveYProperty = ShaderProperty.getByName("renderer_SOLMaxCurveY");
  static readonly _maxCurveZProperty = ShaderProperty.getByName("renderer_SOLMaxCurveZ");

  /** Specifies whether the Size is separate on each axis. */
  separateAxes = false;
  /** Size curve over lifetime for x axis. */
  sizeX = new ParticleCompositeCurve(new ParticleCurve(new Key(0, 0), new Key(1, 1)));
  /** Size curve over lifetime for y axis. */
  sizeY = new ParticleCompositeCurve(new ParticleCurve(new Key(0, 0), new Key(1, 1)));
  /** Size curve over lifetime for z axis. */
  sizeZ = new ParticleCompositeCurve(new ParticleCurve(new Key(0, 0), new Key(1, 1)));

  /**
   * Size curve over lifetime.
   */
  get size(): ParticleCompositeCurve {
    return this.sizeX;
  }

  set size(value: ParticleCompositeCurve) {
    this.sizeX = value;
  }

  /**
   * @inheritDoc
   */
  cloneTo(dest: SizeOverLifetimeModule): void {}

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let sizeMacro = <ShaderMacro>null;
    if (this.enabled) {
      const sizeX = this.sizeX;
      const sizeY = this.sizeY;
      const sizeZ = this.sizeZ;

      const separateAxes = this.separateAxes;
      const canSeparateCurveSingleMode =
        sizeX.mode === ParticleCurveMode.Curve &&
        sizeY.mode === ParticleCurveMode.Curve &&
        sizeZ.mode === ParticleCurveMode.Curve;
      const canSeparateRandomCurveMode =
        sizeX.mode === ParticleCurveMode.TwoCurves &&
        sizeY.mode === ParticleCurveMode.TwoCurves &&
        sizeZ.mode === ParticleCurveMode.TwoCurves;
      const separateCurveMode = separateAxes && (canSeparateCurveSingleMode || canSeparateRandomCurveMode);

      if (
        separateCurveMode ||
        (!separateAxes && (sizeX.mode === ParticleCurveMode.Curve || sizeX.mode === ParticleCurveMode.TwoCurves))
      ) {
        shaderData.setFloatArray(SizeOverLifetimeModule._maxCurveXProperty, sizeX.curveMax._getTypeArray());
        if (
          (!separateAxes && sizeX.mode == ParticleCurveMode.TwoCurves) ||
          (separateAxes && canSeparateRandomCurveMode)
        ) {
          shaderData.setFloatArray(SizeOverLifetimeModule._minCurveXProperty, sizeX.curveMin._getTypeArray());
        }

        if (separateCurveMode) {
          shaderData.setFloatArray(SizeOverLifetimeModule._maxCurveYProperty, sizeY.curveMax._getTypeArray());
          shaderData.setFloatArray(SizeOverLifetimeModule._maxCurveZProperty, sizeZ.curveMax._getTypeArray());

          if (canSeparateCurveSingleMode) {
            sizeMacro = SizeOverLifetimeModule._randomCurvesSeparateMacro;
          } else {
            shaderData.setFloatArray(SizeOverLifetimeModule._minCurveYProperty, sizeY.curveMin._getTypeArray());
            shaderData.setFloatArray(SizeOverLifetimeModule._minCurveZProperty, sizeZ.curveMin._getTypeArray());
            sizeMacro = SizeOverLifetimeModule._curveSeparateMacro;
          }
        } else {
          if (sizeX.mode === ParticleCurveMode.Curve) {
            sizeMacro = SizeOverLifetimeModule._curveMacro;
          } else {
            sizeMacro = SizeOverLifetimeModule._randomCurvesMacro;
          }
        }
      }
    }

    this._enableModuleMacro(shaderData, sizeMacro);
  }
}
