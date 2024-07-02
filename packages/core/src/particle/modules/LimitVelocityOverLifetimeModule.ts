import { MathUtil, Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderMacro } from "../../shader";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { ParticleGenerator } from "../ParticleGenerator";

/**
 * Limit velocity over lifetime module.
 */
export class LimitVelocityOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _constantMacro = ShaderMacro.getByName("RENDERER_LIMIT_VOL_CONSTANT");
  static readonly _curveMacro = ShaderMacro.getByName("RENDERER_LIMIT_VOL_CURVE");
  static readonly _randomConstantMacro = ShaderMacro.getByName("RENDERER_LIMIT_VOL_RANDOM_CONSTANT");
  static readonly _randomCurveMacro = ShaderMacro.getByName("RENDERER_LIMIT_VOL_RANDOM_CURVE");

  static readonly _minConstantProperty = ShaderProperty.getByName("renderer_Limit_VOLMinConst");
  static readonly _maxConstantProperty = ShaderProperty.getByName("renderer_Limit_VOLMaxConst");
  static readonly _minGradientXProperty = ShaderProperty.getByName("renderer_Limit_VOLMinGradientX");
  static readonly _minGradientYProperty = ShaderProperty.getByName("renderer_Limit_VOLMinGradientY");
  static readonly _minGradientZProperty = ShaderProperty.getByName("renderer_Limit_VOLMinGradientZ");
  static readonly _maxGradientXProperty = ShaderProperty.getByName("renderer_Limit_VOLMaxGradientX");
  static readonly _maxGradientYProperty = ShaderProperty.getByName("renderer_Limit_VOLMaxGradientY");
  static readonly _maxGradientZProperty = ShaderProperty.getByName("renderer_Limit_VOLMaxGradientZ");

  private static readonly _drag = ShaderProperty.getByName("renderer_Drag");
  private static readonly _dampen = ShaderProperty.getByName("renderer_Dampen");

  /** @internal */
  @ignoreClone
  _speedRand = new Rand(0, ParticleRandomSubSeeds.LimitVelocityOverLifetime);
  @ignoreClone
  readonly _dragRand = new Rand(0, ParticleRandomSubSeeds.Drag);

  @ignoreClone
  private _speedMinConstant = new Vector3();
  @ignoreClone
  private _speedMaxConstant = new Vector3();
  @ignoreClone
  private _speedMacro: ShaderMacro;

  @deepClone
  private _speedX: ParticleCompositeCurve;
  @deepClone
  private _speedY: ParticleCompositeCurve;
  @deepClone
  private _speedZ: ParticleCompositeCurve;
  private _separateAxes = false;
  private _dampen = 0;

  @deepClone
  private _drag: ParticleCompositeCurve;

  /**
   * Applies linear drag to the particle velocities.
   * Must be positive value.
   */
  get drag(): ParticleCompositeCurve {
    return this._drag;
  }

  set drag(value: ParticleCompositeCurve) {
    const lastValue = this._drag;
    if (value !== lastValue) {
      this._drag = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * The fraction by which a particle’s speed is reduced when it exceeds the speed limit.
   * Between 0 and 1.
   */
  get dampen(): number {
    return this._dampen;
  }

  set dampen(value: number) {
    const lastValue = this._dampen;
    if (value !== lastValue) {
      this._dampen = MathUtil.clamp(value, 0, 1);
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Specifies whether the Speed is separate on each axis.
   */
  get separateAxes(): boolean {
    return this._separateAxes;
  }

  set separateAxes(value: boolean) {
    if (value !== this._separateAxes) {
      this._separateAxes = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Speed limit of the particles.
   * Positive value.
   */
  get speed(): ParticleCompositeCurve {
    return this.speedX;
  }

  set speed(value: ParticleCompositeCurve) {
    this.speedX = value;
  }

  /**
   * Speed limit of the particles for x axis.
   */
  get speedX(): ParticleCompositeCurve {
    return this._speedX;
  }

  set speedX(value: ParticleCompositeCurve) {
    const lastValue = this._speedX;
    if (value !== lastValue) {
      this._speedX = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Speed limit of the particles for y axis.
   * Positive value.
   */
  get speedY(): ParticleCompositeCurve {
    return this._speedY;
  }

  set speedY(value: ParticleCompositeCurve) {
    const lastValue = this._speedY;
    if (value !== lastValue) {
      this._speedY = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Speed limit of the particles for z axis.
   * Positive value.
   */
  get speedZ(): ParticleCompositeCurve {
    return this._speedZ;
  }

  set speedZ(value: ParticleCompositeCurve) {
    const lastValue = this._speedZ;
    if (value !== lastValue) {
      this._speedZ = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  override get enabled(): boolean {
    return this._enabled;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  constructor(generator: ParticleGenerator) {
    super(generator);
    this._drag = new ParticleCompositeCurve(0);
    this._dampen = 0;

    this._speedX = new ParticleCompositeCurve(0);
    this._speedY = new ParticleCompositeCurve(0);
    this._speedZ = new ParticleCompositeCurve(0);
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let limitVelocityMacro = <ShaderMacro>null;
    if (this.enabled) {
      const speedX = this.speedX;
      const speedY = this.speedY;
      const speedZ = this.speedZ;
      const separateAxes = this.separateAxes;
      const dampen = this.dampen;

      // Drag
      const drag = this.drag.evaluate(undefined, this._dragRand.random());
      shaderData.setFloat(LimitVelocityOverLifetimeModule._drag, Math.max(0, drag));

      // Speed and Dampen
      const isRandomCurveMode = separateAxes
        ? speedX.mode === ParticleCurveMode.TwoCurves &&
          speedY.mode === ParticleCurveMode.TwoCurves &&
          speedZ.mode === ParticleCurveMode.TwoCurves
        : speedX.mode === ParticleCurveMode.TwoCurves;

      const isCurveMode =
        isRandomCurveMode || separateAxes
          ? speedX.mode === ParticleCurveMode.Curve &&
            speedY.mode === ParticleCurveMode.Curve &&
            speedZ.mode === ParticleCurveMode.Curve
          : speedX.mode === ParticleCurveMode.Curve;

      if (isCurveMode) {
        const curveMax = speedX.curveMax._getTypeArray();
        shaderData.setFloatArray(LimitVelocityOverLifetimeModule._maxGradientXProperty, curveMax);
        if (separateAxes) {
          shaderData.setFloatArray(
            LimitVelocityOverLifetimeModule._maxGradientYProperty,
            speedY.curveMax._getTypeArray()
          );
          shaderData.setFloatArray(
            LimitVelocityOverLifetimeModule._maxGradientZProperty,
            speedZ.curveMax._getTypeArray()
          );
        } else {
          shaderData.setFloatArray(LimitVelocityOverLifetimeModule._maxGradientYProperty, curveMax);
          shaderData.setFloatArray(LimitVelocityOverLifetimeModule._maxGradientZProperty, curveMax);
        }

        if (isRandomCurveMode) {
          const curveMin = speedX.curveMin._getTypeArray();
          shaderData.setFloatArray(LimitVelocityOverLifetimeModule._minGradientXProperty, curveMin);
          if (separateAxes) {
            shaderData.setFloatArray(
              LimitVelocityOverLifetimeModule._minGradientYProperty,
              speedY.curveMin._getTypeArray()
            );
            shaderData.setFloatArray(
              LimitVelocityOverLifetimeModule._minGradientZProperty,
              speedZ.curveMin._getTypeArray()
            );
          } else {
            shaderData.setFloatArray(LimitVelocityOverLifetimeModule._minGradientYProperty, curveMin);
            shaderData.setFloatArray(LimitVelocityOverLifetimeModule._minGradientZProperty, curveMin);
          }

          limitVelocityMacro = LimitVelocityOverLifetimeModule._randomCurveMacro;
        } else {
          limitVelocityMacro = LimitVelocityOverLifetimeModule._curveMacro;
        }
      } else {
        const constantMax = this._speedMaxConstant;

        if (separateAxes) {
          constantMax.set(speedX.constantMax, speedY.constantMax, speedZ.constantMax);
        } else {
          constantMax.set(speedX.constantMax, speedX.constantMax, speedX.constantMax);
        }
        shaderData.setVector3(LimitVelocityOverLifetimeModule._maxConstantProperty, constantMax);

        if (
          speedX.mode === ParticleCurveMode.TwoConstants &&
          speedY.mode === ParticleCurveMode.TwoConstants &&
          speedZ.mode === ParticleCurveMode.TwoConstants
        ) {
          const constantMin = this._speedMinConstant;
          if (separateAxes) {
            constantMin.set(speedX.constantMin, speedY.constantMin, speedZ.constantMin);
          } else {
            constantMin.set(speedX.constantMin, speedX.constantMin, speedX.constantMin);
          }

          shaderData.setVector3(LimitVelocityOverLifetimeModule._minConstantProperty, constantMin);
          limitVelocityMacro = LimitVelocityOverLifetimeModule._randomConstantMacro;
        } else {
          limitVelocityMacro = LimitVelocityOverLifetimeModule._constantMacro;
        }
      }

      shaderData.setFloat(LimitVelocityOverLifetimeModule._dampen, dampen);
    }
    this._speedMacro = this._enableMacro(shaderData, this._speedMacro, limitVelocityMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._speedRand.reset(seed, ParticleRandomSubSeeds.LimitVelocityOverLifetime);
    this._dragRand.reset(seed, ParticleRandomSubSeeds.Drag);
  }

  private _onCompositeCurveChange(lastValue: ParticleCompositeCurve, value: ParticleCompositeCurve): void {
    const renderer = this._generator._renderer;
    lastValue?._unRegisterOnValueChanged(renderer._onGeneratorParamsChanged);
    value?._registerOnValueChanged(renderer._onGeneratorParamsChanged);
    renderer._onGeneratorParamsChanged();
  }
}
