import { Vector3 } from "@galacean/engine-math";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Rotate particles throughout their lifetime.
 */
export class RotationOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _uniformMacro = ShaderMacro.getByName("renderer_ROL_ENABLE_UNIFORM");
  static readonly _separateMacro = ShaderMacro.getByName("renderer_ROL_ENABLE_SEPARATE");
  static readonly _constantMacro = ShaderMacro.getByName("renderer_ROL_CONSTANT");
  static readonly _curveMacro = ShaderMacro.getByName("renderer_ROL_CURVE");
  static readonly _randomConstantMacro = ShaderMacro.getByName("renderer_ROL_ENABLE_RANDOM_TWO");

  static readonly _minConstantProperty = ShaderProperty.getByName("renderer_ROLMinConst");
  static readonly _minCurveXProperty = ShaderProperty.getByName("renderer_ROLMinCurveX");
  static readonly _minCurveYProperty = ShaderProperty.getByName("renderer_ROLMinCurveY");
  static readonly _minCurveZProperty = ShaderProperty.getByName("renderer_ROLMinCurveZ");
  static readonly _maxConstantProperty = ShaderProperty.getByName("renderer_ROLMaxConst");
  static readonly _maxCurveXProperty = ShaderProperty.getByName("renderer_ROLMaxCurveX");
  static readonly _maxCurveYProperty = ShaderProperty.getByName("renderer_ROLMaxCurveY");
  static readonly _maxCurveZProperty = ShaderProperty.getByName("renderer_ROLMaxCurveZ");
  static readonly _maxCurveWProperty = ShaderProperty.getByName("renderer_ROLMaxCurveW");

  /** Specifies whether the rotation is separate on each axis, when disabled only z axis is used. */
  separateAxes: boolean = false;

  /** Rotation over lifetime for z axis. */
  x: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Rotation over lifetime for z axis. */
  y: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Rotation over lifetime for z axis. */
  z: ParticleCompositeCurve = new ParticleCompositeCurve(45);

  private _rotationMinConstant = new Vector3();
  private _rotationMaxConstant = new Vector3();
  private _enableSeparateMacro: ShaderMacro;
  private _isCurveMacro: ShaderMacro;
  private _isRandomTwoMacro: ShaderMacro;

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: RotationOverLifetimeModule): void {}

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let enableSeparateMacro = <ShaderMacro>null;
    let isCurveMacro = <ShaderMacro>null;
    let isRandomTwoMacro = <ShaderMacro>null;
    if (this.enabled) {
      const rotationX = this.x;
      const rotationY = this.y;
      const rotationZ = this.z;

      const isRandomCurveMode =
        rotationX.mode === ParticleCurveMode.TwoCurves &&
        rotationY.mode === ParticleCurveMode.TwoCurves &&
        rotationZ.mode === ParticleCurveMode.TwoCurves;

      const isCurveMode =
        isRandomCurveMode ||
        (rotationX.mode === ParticleCurveMode.Curve &&
          rotationY.mode === ParticleCurveMode.Curve &&
          rotationZ.mode === ParticleCurveMode.Curve);
      if (isCurveMode) {
        shaderData.setFloatArray(RotationOverLifetimeModule._maxCurveZProperty, rotationZ.curveMax._getTypeArray());
        if (this.separateAxes) {
          shaderData.setFloatArray(RotationOverLifetimeModule._maxCurveXProperty, rotationX.curveMax._getTypeArray());
          shaderData.setFloatArray(RotationOverLifetimeModule._maxCurveYProperty, rotationY.curveMax._getTypeArray());
        }
        if (isRandomCurveMode) {
          shaderData.setFloatArray(RotationOverLifetimeModule._minCurveZProperty, rotationZ.curveMin._getTypeArray());
          if (this.separateAxes) {
            shaderData.setFloatArray(RotationOverLifetimeModule._minCurveXProperty, rotationX.curveMin._getTypeArray());
            shaderData.setFloatArray(RotationOverLifetimeModule._minCurveYProperty, rotationY.curveMin._getTypeArray());
          }
        }
      } else {
        const constantMax = this._rotationMaxConstant;
        constantMax.set(rotationX.constantMax, rotationY.constantMax, rotationZ.constantMax);
        shaderData.setVector3(RotationOverLifetimeModule._maxConstantProperty, constantMax);

        if (
          rotationX.mode === ParticleCurveMode.TwoConstants &&
          rotationY.mode === ParticleCurveMode.TwoConstants &&
          rotationZ.mode === ParticleCurveMode.TwoConstants
        ) {
          const constantMin = this._rotationMinConstant;
          constantMin.set(rotationX.constantMin, rotationY.constantMin, rotationZ.constantMin);
          shaderData.setVector3(RotationOverLifetimeModule._minConstantProperty, constantMin);
          isRandomTwoMacro = RotationOverLifetimeModule._randomConstantMacro;
        }
      }

      enableSeparateMacro = this.separateAxes
        ? RotationOverLifetimeModule._separateMacro
        : RotationOverLifetimeModule._uniformMacro;
      isCurveMacro = isCurveMode ? RotationOverLifetimeModule._curveMacro : RotationOverLifetimeModule._constantMacro;
    }
    this._enableSeparateMacro = this._enableModuleMacroX(shaderData, this._enableSeparateMacro, enableSeparateMacro);
    this._isCurveMacro = this._enableModuleMacroX(shaderData, this._isCurveMacro, isCurveMacro);
    this._isRandomTwoMacro = this._enableModuleMacroX(shaderData, this._isRandomTwoMacro, isRandomTwoMacro);
  }
}
