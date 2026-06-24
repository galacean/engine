import { Rand, Vector2, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderMacro } from "../../shader";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Velocity over lifetime module.
 */
export class VelocityOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _constantModeMacro = ShaderMacro.getByName("RENDERER_VOL_CONSTANT_MODE");
  static readonly _curveModeMacro = ShaderMacro.getByName("RENDERER_VOL_CURVE_MODE");
  static readonly _isRandomMacro = ShaderMacro.getByName("RENDERER_VOL_IS_RANDOM_TWO");

  static readonly _minConstantProperty = ShaderProperty.getByName("renderer_VOLMinConst");
  static readonly _maxConstantProperty = ShaderProperty.getByName("renderer_VOLMaxConst");
  static readonly _minGradientXProperty = ShaderProperty.getByName("renderer_VOLMinGradientX");
  static readonly _minGradientYProperty = ShaderProperty.getByName("renderer_VOLMinGradientY");
  static readonly _minGradientZProperty = ShaderProperty.getByName("renderer_VOLMinGradientZ");
  static readonly _maxGradientXProperty = ShaderProperty.getByName("renderer_VOLMaxGradientX");
  static readonly _maxGradientYProperty = ShaderProperty.getByName("renderer_VOLMaxGradientY");
  static readonly _maxGradientZProperty = ShaderProperty.getByName("renderer_VOLMaxGradientZ");
  static readonly _spaceProperty = ShaderProperty.getByName("renderer_VOLSpace");

  // Orbital / Radial (transform-feedback only, require WebGL2). Phase 1 supports Constant and Curve modes.
  static readonly _orbitalConstantModeMacro = ShaderMacro.getByName("RENDERER_VOL_ORBITAL_CONSTANT_MODE");
  static readonly _orbitalCurveModeMacro = ShaderMacro.getByName("RENDERER_VOL_ORBITAL_CURVE_MODE");
  static readonly _radialConstantModeMacro = ShaderMacro.getByName("RENDERER_VOL_RADIAL_CONSTANT_MODE");
  static readonly _radialCurveModeMacro = ShaderMacro.getByName("RENDERER_VOL_RADIAL_CURVE_MODE");

  static readonly _orbitalConstantProperty = ShaderProperty.getByName("renderer_VOLOrbitalConst");
  static readonly _orbitalCurveXProperty = ShaderProperty.getByName("renderer_VOLOrbitalCurveX");
  static readonly _orbitalCurveYProperty = ShaderProperty.getByName("renderer_VOLOrbitalCurveY");
  static readonly _orbitalCurveZProperty = ShaderProperty.getByName("renderer_VOLOrbitalCurveZ");
  static readonly _radialConstantProperty = ShaderProperty.getByName("renderer_VOLRadialConst");
  static readonly _radialCurveProperty = ShaderProperty.getByName("renderer_VOLRadialCurve");
  static readonly _offsetProperty = ShaderProperty.getByName("renderer_VOLOffset");

  private static _tempMinMax = new Vector2();

  /** @internal */
  @ignoreClone
  _velocityRand = new Rand(0, ParticleRandomSubSeeds.VelocityOverLifetime);

  @ignoreClone
  private _velocityMinConstant = new Vector3();
  @ignoreClone
  private _velocityMaxConstant = new Vector3();
  @ignoreClone
  private _velocityMacro: ShaderMacro;
  @ignoreClone
  private _randomModeMacro: ShaderMacro;
  @ignoreClone
  private _orbitalConstant = new Vector3();
  @ignoreClone
  private _orbitalConstantCurveX = new Float32Array(8);
  @ignoreClone
  private _orbitalConstantCurveY = new Float32Array(8);
  @ignoreClone
  private _orbitalConstantCurveZ = new Float32Array(8);
  @ignoreClone
  private _orbitalMacro: ShaderMacro;
  @ignoreClone
  private _radialMacro: ShaderMacro;
  @ignoreClone
  private readonly _onTransformFeedbackDirty = (): void => {
    this._generator._setTransformFeedback();
  };

  @deepClone
  private _velocityX: ParticleCompositeCurve;
  @deepClone
  private _velocityY: ParticleCompositeCurve;
  @deepClone
  private _velocityZ: ParticleCompositeCurve;
  @deepClone
  private _orbitalX: ParticleCompositeCurve;
  @deepClone
  private _orbitalY: ParticleCompositeCurve;
  @deepClone
  private _orbitalZ: ParticleCompositeCurve;
  @deepClone
  private _radial: ParticleCompositeCurve;
  @deepClone
  private _offset = new Vector3();
  private _space = ParticleSimulationSpace.Local;

  /**
   * Velocity over lifetime for x axis.
   */
  get velocityX(): ParticleCompositeCurve {
    return this._velocityX;
  }

  set velocityX(value: ParticleCompositeCurve) {
    const lastValue = this._velocityX;
    if (value !== lastValue) {
      this._velocityX = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Velocity over lifetime for y axis.
   */
  get velocityY(): ParticleCompositeCurve {
    return this._velocityY;
  }

  set velocityY(value: ParticleCompositeCurve) {
    const lastValue = this._velocityY;
    if (value !== lastValue) {
      this._velocityY = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Velocity over lifetime for z axis.
   */
  get velocityZ(): ParticleCompositeCurve {
    return this._velocityZ;
  }

  set velocityZ(value: ParticleCompositeCurve) {
    const lastValue = this._velocityZ;
    if (value !== lastValue) {
      this._velocityZ = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Orbital velocity (radians/second) around the x axis of the system.
   * @remarks Requires WebGL2; takes effect together with `offset` as the center of orbit.
   */
  get orbitalX(): ParticleCompositeCurve {
    return this._orbitalX;
  }

  set orbitalX(value: ParticleCompositeCurve) {
    const lastValue = this._orbitalX;
    if (value !== lastValue) {
      this._orbitalX = value;
      this._onOrbitalRadialChange(lastValue, value);
    }
  }

  /**
   * Orbital velocity (radians/second) around the y axis of the system.
   * @remarks Requires WebGL2; takes effect together with `offset` as the center of orbit.
   */
  get orbitalY(): ParticleCompositeCurve {
    return this._orbitalY;
  }

  set orbitalY(value: ParticleCompositeCurve) {
    const lastValue = this._orbitalY;
    if (value !== lastValue) {
      this._orbitalY = value;
      this._onOrbitalRadialChange(lastValue, value);
    }
  }

  /**
   * Orbital velocity (radians/second) around the z axis of the system.
   * @remarks Requires WebGL2; takes effect together with `offset` as the center of orbit.
   */
  get orbitalZ(): ParticleCompositeCurve {
    return this._orbitalZ;
  }

  set orbitalZ(value: ParticleCompositeCurve) {
    const lastValue = this._orbitalZ;
    if (value !== lastValue) {
      this._orbitalZ = value;
      this._onOrbitalRadialChange(lastValue, value);
    }
  }

  /**
   * Radial velocity moving particles away from (or towards) the center.
   * @remarks Requires WebGL2; the center is given by `offset`.
   */
  get radial(): ParticleCompositeCurve {
    return this._radial;
  }

  set radial(value: ParticleCompositeCurve) {
    const lastValue = this._radial;
    if (value !== lastValue) {
      this._radial = value;
      this._onOrbitalRadialChange(lastValue, value);
    }
  }

  /**
   * The center of orbit for orbital/radial velocity, in the system's local space.
   */
  get offset(): Vector3 {
    return this._offset;
  }

  set offset(value: Vector3) {
    const offset = this._offset;
    if (value !== offset) {
      offset.copyFrom(value);
    }
    this._generator._renderer._onGeneratorParamsChanged();
  }

  /**
   * Velocity space.
   */
  get space(): ParticleSimulationSpace {
    return this._space;
  }

  set space(value: ParticleSimulationSpace) {
    if (value !== this._space) {
      this._space = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  override get enabled(): boolean {
    return this._enabled;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      this._generator._setTransformFeedback();
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  constructor(generator: ParticleGenerator) {
    super(generator);

    this.velocityX = new ParticleCompositeCurve(0);
    this.velocityY = new ParticleCompositeCurve(0);
    this.velocityZ = new ParticleCompositeCurve(0);

    this.orbitalX = new ParticleCompositeCurve(0);
    this.orbitalY = new ParticleCompositeCurve(0);
    this.orbitalZ = new ParticleCompositeCurve(0);
    this.radial = new ParticleCompositeCurve(0);
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let velocityMacro = <ShaderMacro>null;
    let isRandomModeMacro = <ShaderMacro>null;
    let orbitalMacro = <ShaderMacro>null;
    let radialMacro = <ShaderMacro>null;

    if (this.enabled) {
      const velocityX = this.velocityX;
      const velocityY = this.velocityY;
      const velocityZ = this.velocityZ;

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
        velocityMacro = VelocityOverLifetimeModule._curveModeMacro;
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
          isRandomModeMacro = VelocityOverLifetimeModule._isRandomMacro;
        }
      } else {
        const constantMax = this._velocityMaxConstant;
        constantMax.set(velocityX.constantMax, velocityY.constantMax, velocityZ.constantMax);
        shaderData.setVector3(VelocityOverLifetimeModule._maxConstantProperty, constantMax);
        velocityMacro = VelocityOverLifetimeModule._constantModeMacro;
        if (
          velocityX.mode === ParticleCurveMode.TwoConstants &&
          velocityY.mode === ParticleCurveMode.TwoConstants &&
          velocityZ.mode === ParticleCurveMode.TwoConstants
        ) {
          const constantMin = this._velocityMinConstant;
          constantMin.set(velocityX.constantMin, velocityY.constantMin, velocityZ.constantMin);
          shaderData.setVector3(VelocityOverLifetimeModule._minConstantProperty, constantMin);
          isRandomModeMacro = VelocityOverLifetimeModule._isRandomMacro;
        }
      }

      shaderData.setInt(VelocityOverLifetimeModule._spaceProperty, this.space);

      // Orbital / Radial run only in the transform-feedback path (WebGL2).
      const orbitalActive = this._isOrbitalActive();
      const radialActive = this._isRadialActive();

      if (orbitalActive) {
        const orbitalX = this._orbitalX;
        const orbitalY = this._orbitalY;
        const orbitalZ = this._orbitalZ;
        if (this._isCurveMode(orbitalX) || this._isCurveMode(orbitalY) || this._isCurveMode(orbitalZ)) {
          shaderData.setFloatArray(
            VelocityOverLifetimeModule._orbitalCurveXProperty,
            this._getCurveMaxTypeArray(orbitalX, this._orbitalConstantCurveX)
          );
          shaderData.setFloatArray(
            VelocityOverLifetimeModule._orbitalCurveYProperty,
            this._getCurveMaxTypeArray(orbitalY, this._orbitalConstantCurveY)
          );
          shaderData.setFloatArray(
            VelocityOverLifetimeModule._orbitalCurveZProperty,
            this._getCurveMaxTypeArray(orbitalZ, this._orbitalConstantCurveZ)
          );
          orbitalMacro = VelocityOverLifetimeModule._orbitalCurveModeMacro;
        } else {
          this._orbitalConstant.set(orbitalX.constant, orbitalY.constant, orbitalZ.constant);
          shaderData.setVector3(VelocityOverLifetimeModule._orbitalConstantProperty, this._orbitalConstant);
          orbitalMacro = VelocityOverLifetimeModule._orbitalConstantModeMacro;
        }
      }

      if (radialActive) {
        const radial = this._radial;
        if (this._isCurveMode(radial)) {
          shaderData.setFloatArray(VelocityOverLifetimeModule._radialCurveProperty, radial.curveMax._getTypeArray());
          radialMacro = VelocityOverLifetimeModule._radialCurveModeMacro;
        } else {
          shaderData.setFloat(VelocityOverLifetimeModule._radialConstantProperty, radial.constant);
          radialMacro = VelocityOverLifetimeModule._radialConstantModeMacro;
        }
      }

      if (orbitalActive || radialActive) {
        shaderData.setVector3(VelocityOverLifetimeModule._offsetProperty, this._offset);
      }
    }
    this._velocityMacro = this._enableMacro(shaderData, this._velocityMacro, velocityMacro);
    this._randomModeMacro = this._enableMacro(shaderData, this._randomModeMacro, isRandomModeMacro);
    this._orbitalMacro = this._enableMacro(shaderData, this._orbitalMacro, orbitalMacro);
    this._radialMacro = this._enableMacro(shaderData, this._radialMacro, radialMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._velocityRand.reset(seed, ParticleRandomSubSeeds.VelocityOverLifetime);
  }

  /**
   * @internal
   * Orbital and radial velocities are position-dependent and only run in the transform-feedback path.
   */
  _needTransformFeedback(): boolean {
    if (!this._enabled || !this._generator._renderer.engine._hardwareRenderer.isWebGL2) {
      return false;
    }
    return this._isOrbitalActive() || this._isRadialActive();
  }

  /**
   * @internal
   */
  _isOrbitalActive(): boolean {
    return (
      this._isCompositeCurveActive(this._orbitalX) ||
      this._isCompositeCurveActive(this._orbitalY) ||
      this._isCompositeCurveActive(this._orbitalZ)
    );
  }

  /**
   * @internal
   */
  _isRadialActive(): boolean {
    return this._isCompositeCurveActive(this._radial);
  }

  private _isCompositeCurveActive(curve: ParticleCompositeCurve): boolean {
    const minMax = VelocityOverLifetimeModule._tempMinMax;
    curve._getMinMax(minMax);
    return minMax.x !== 0 || minMax.y !== 0;
  }

  private _isCurveMode(curve: ParticleCompositeCurve): boolean {
    return curve.mode === ParticleCurveMode.Curve || curve.mode === ParticleCurveMode.TwoCurves;
  }

  private _getCurveMaxTypeArray(curve: ParticleCompositeCurve, constantArray: Float32Array): Float32Array {
    if (this._isCurveMode(curve)) {
      return curve.curveMax._getTypeArray();
    }

    const value = curve.constantMax;
    constantArray[0] = 0;
    constantArray[1] = value;
    constantArray[2] = 1;
    constantArray[3] = value;
    constantArray[4] = 0;
    constantArray[5] = 0;
    constantArray[6] = 0;
    constantArray[7] = 0;
    return constantArray;
  }

  private _onOrbitalRadialChange(lastValue: ParticleCompositeCurve, value: ParticleCompositeCurve): void {
    lastValue?._unRegisterOnValueChanged(this._onTransformFeedbackDirty);
    value?._registerOnValueChanged(this._onTransformFeedbackDirty);
    this._onCompositeCurveChange(lastValue, value);
    this._generator._setTransformFeedback();
  }
}
