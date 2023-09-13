import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { CurveKey, ParticleCurve } from "./ParticleCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Size over lifetime module.
 */
export class SizeOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _curveModeMacro = ShaderMacro.getByName("RENDERER_SOL_CURVE_MODE");
  static readonly _isSeparateMacro = ShaderMacro.getByName("RENDERER_SOL_IS_SEPARATE");
  static readonly _isRandomTwoMacro = ShaderMacro.getByName("RENDERER_SOL_IS_RANDOM_TWO");

  static readonly _minCurveXProperty = ShaderProperty.getByName("renderer_SOLMinCurveX");
  static readonly _minCurveYProperty = ShaderProperty.getByName("renderer_SOLMinCurveY");
  static readonly _minCurveZProperty = ShaderProperty.getByName("renderer_SOLMinCurveZ");
  static readonly _maxCurveXProperty = ShaderProperty.getByName("renderer_SOLMaxCurveX");
  static readonly _maxCurveYProperty = ShaderProperty.getByName("renderer_SOLMaxCurveY");
  static readonly _maxCurveZProperty = ShaderProperty.getByName("renderer_SOLMaxCurveZ");

  /** Specifies whether the Size is separate on each axis. */
  separateAxes = false;
  /** Size curve over lifetime for x axis. */
  @deepClone
  sizeX = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));
  /** Size curve over lifetime for y axis. */
  @deepClone
  sizeY = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));
  /** Size curve over lifetime for z axis. */
  @deepClone
  sizeZ = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));

  @ignoreClone
  private _enableSeparateMacro: ShaderMacro;
  @ignoreClone
  private _isCurveMacro: ShaderMacro;
  @ignoreClone
  private _isRandomTwoMacro: ShaderMacro;

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
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let enableSeparateMacro = <ShaderMacro>null;
    let isCurveMacro = <ShaderMacro>null;
    let isRandomTwoMacro = <ShaderMacro>null;

    if (this.enabled) {
      const sizeX = this.sizeX;
      const sizeY = this.sizeY;
      const sizeZ = this.sizeZ;

      const separateAxes = this.separateAxes;
      const isRandomCurveMode = separateAxes
        ? sizeX.mode === ParticleCurveMode.TwoCurves &&
          sizeY.mode === ParticleCurveMode.TwoCurves &&
          sizeZ.mode === ParticleCurveMode.TwoCurves
        : sizeX.mode === ParticleCurveMode.TwoCurves;

      const isCurveMode =
        isRandomCurveMode || separateAxes
          ? sizeX.mode === ParticleCurveMode.Curve &&
            sizeY.mode === ParticleCurveMode.Curve &&
            sizeZ.mode === ParticleCurveMode.Curve
          : sizeX.mode === ParticleCurveMode.Curve;

      if (isCurveMode) {
        shaderData.setFloatArray(SizeOverLifetimeModule._maxCurveXProperty, sizeX.curveMax._getTypeArray());
        if (separateAxes) {
          shaderData.setFloatArray(SizeOverLifetimeModule._maxCurveYProperty, sizeY.curveMax._getTypeArray());
          shaderData.setFloatArray(SizeOverLifetimeModule._maxCurveZProperty, sizeZ.curveMax._getTypeArray());
        }
        if (isRandomCurveMode) {
          shaderData.setFloatArray(SizeOverLifetimeModule._minCurveXProperty, sizeX.curveMin._getTypeArray());
          if (separateAxes) {
            shaderData.setFloatArray(SizeOverLifetimeModule._minCurveYProperty, sizeY.curveMin._getTypeArray());
            shaderData.setFloatArray(SizeOverLifetimeModule._minCurveZProperty, sizeZ.curveMin._getTypeArray());
          }
          isRandomTwoMacro = SizeOverLifetimeModule._isRandomTwoMacro;
        }
        isCurveMacro = SizeOverLifetimeModule._curveModeMacro;
      }

      if (separateAxes) {
        enableSeparateMacro = SizeOverLifetimeModule._isSeparateMacro;
      }
    }

    this._enableSeparateMacro = this._enableMacro(shaderData, this._enableSeparateMacro, enableSeparateMacro);
    this._isCurveMacro = this._enableMacro(shaderData, this._isCurveMacro, isCurveMacro);
    this._isRandomTwoMacro = this._enableMacro(shaderData, this._isRandomTwoMacro, isRandomTwoMacro);
  }
}
