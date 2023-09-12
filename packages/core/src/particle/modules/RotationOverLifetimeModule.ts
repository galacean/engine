import { MathUtil, Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Rotate particles throughout their lifetime.
 */
export class RotationOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _constantModeMacro = ShaderMacro.getByName("RENDERER_ROL_CONSTANT_MODE");
  static readonly _curveModeMacro = ShaderMacro.getByName("RENDERER_ROL_CURVE_MODE");
  static readonly _isSeparateMacro = ShaderMacro.getByName("RENDERER_ROL_IS_SEPARATE");
  static readonly _isRandomTwoMacro = ShaderMacro.getByName("RENDERER_ROL_IS_RANDOM_TWO");

  static readonly _minConstantProperty = ShaderProperty.getByName("renderer_ROLMinConst");
  static readonly _minCurveXProperty = ShaderProperty.getByName("renderer_ROLMinCurveX");
  static readonly _minCurveYProperty = ShaderProperty.getByName("renderer_ROLMinCurveY");
  static readonly _minCurveZProperty = ShaderProperty.getByName("renderer_ROLMinCurveZ");
  static readonly _maxConstantProperty = ShaderProperty.getByName("renderer_ROLMaxConst");
  static readonly _maxCurveXProperty = ShaderProperty.getByName("renderer_ROLMaxCurveX");
  static readonly _maxCurveYProperty = ShaderProperty.getByName("renderer_ROLMaxCurveY");
  static readonly _maxCurveZProperty = ShaderProperty.getByName("renderer_ROLMaxCurveZ");

  /** Specifies whether the rotation is separate on each axis, when disabled only z axis is used. */
  separateAxes: boolean = false;

  /** Rotation over lifetime for z axis. */
  @deepClone
  rotationX = new ParticleCompositeCurve(0);
  /** Rotation over lifetime for z axis. */
  @deepClone
  rotationY = new ParticleCompositeCurve(0);
  /** Rotation over lifetime for z axis. */
  @deepClone
  rotationZ = new ParticleCompositeCurve(45);

  /** @internal */
  @ignoreClone
  _rotationRand = new Rand(0, ParticleRandomSubSeeds.RotationOverLifetime);

  @ignoreClone
  private _rotationMinConstant = new Vector3();
  @ignoreClone
  private _rotationMaxConstant = new Vector3();
  @ignoreClone
  private _enableSeparateMacro: ShaderMacro;
  @ignoreClone
  private _isCurveMacro: ShaderMacro;
  @ignoreClone
  private _isRandomTwoMacro: ShaderMacro;

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let enableSeparateMacro = <ShaderMacro>null;
    let isCurveMacro = <ShaderMacro>null;
    let isRandomTwoMacro = <ShaderMacro>null;
    if (this.enabled) {
      const rotationX = this.rotationX;
      const rotationY = this.rotationY;
      const rotationZ = this.rotationZ;
      const separateAxes = this.separateAxes;

      const isRandomCurveMode = separateAxes
        ? rotationX.mode === ParticleCurveMode.TwoCurves &&
          rotationY.mode === ParticleCurveMode.TwoCurves &&
          rotationZ.mode === ParticleCurveMode.TwoCurves
        : rotationZ.mode === ParticleCurveMode.TwoCurves;

      const isCurveMode =
        isRandomCurveMode || separateAxes
          ? rotationX.mode === ParticleCurveMode.Curve &&
            rotationY.mode === ParticleCurveMode.Curve &&
            rotationZ.mode === ParticleCurveMode.Curve
          : rotationZ.mode === ParticleCurveMode.Curve;

      if (isCurveMode) {
        shaderData.setFloatArray(RotationOverLifetimeModule._maxCurveZProperty, rotationZ.curveMax._getTypeArray());
        if (separateAxes) {
          shaderData.setFloatArray(RotationOverLifetimeModule._maxCurveXProperty, rotationX.curveMax._getTypeArray());
          shaderData.setFloatArray(RotationOverLifetimeModule._maxCurveYProperty, rotationY.curveMax._getTypeArray());
        }
        if (isRandomCurveMode) {
          shaderData.setFloatArray(RotationOverLifetimeModule._minCurveZProperty, rotationZ.curveMin._getTypeArray());
          if (separateAxes) {
            shaderData.setFloatArray(RotationOverLifetimeModule._minCurveXProperty, rotationX.curveMin._getTypeArray());
            shaderData.setFloatArray(RotationOverLifetimeModule._minCurveYProperty, rotationY.curveMin._getTypeArray());
          }
          isRandomTwoMacro = RotationOverLifetimeModule._isRandomTwoMacro;
        }
        isCurveMacro = RotationOverLifetimeModule._curveModeMacro;
      } else {
        const constantMax = this._rotationMaxConstant;
        constantMax.set(
          MathUtil.degreeToRadian(rotationX.constantMax),
          MathUtil.degreeToRadian(rotationY.constantMax),
          MathUtil.degreeToRadian(rotationZ.constantMax)
        );
        shaderData.setVector3(RotationOverLifetimeModule._maxConstantProperty, constantMax);

        if (
          separateAxes
            ? rotationX.mode === ParticleCurveMode.TwoConstants &&
              rotationY.mode === ParticleCurveMode.TwoConstants &&
              rotationZ.mode === ParticleCurveMode.TwoConstants
            : rotationZ.mode === ParticleCurveMode.TwoConstants
        ) {
          const constantMin = this._rotationMinConstant;
          constantMin.set(
            MathUtil.degreeToRadian(rotationX.constantMin),
            MathUtil.degreeToRadian(rotationY.constantMin),
            MathUtil.degreeToRadian(rotationZ.constantMin)
          );
          shaderData.setVector3(RotationOverLifetimeModule._minConstantProperty, constantMin);
          isRandomTwoMacro = RotationOverLifetimeModule._isRandomTwoMacro;
        }
        isCurveMacro = RotationOverLifetimeModule._constantModeMacro;
      }

      if (separateAxes) {
        enableSeparateMacro = RotationOverLifetimeModule._isSeparateMacro;
      }
    }
    this._enableSeparateMacro = this._enableMacro(shaderData, this._enableSeparateMacro, enableSeparateMacro);
    this._isCurveMacro = this._enableMacro(shaderData, this._isCurveMacro, isCurveMacro);
    this._isRandomTwoMacro = this._enableMacro(shaderData, this._isRandomTwoMacro, isRandomTwoMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._rotationRand.reset(seed, ParticleRandomSubSeeds.RotationOverLifetime);
  }
}
