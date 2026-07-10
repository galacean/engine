import { Rand, Vector3 } from "@galacean/engine-math";
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

  static readonly _orbitalConstantModeMacro = ShaderMacro.getByName("RENDERER_VOL_ORBITAL_CONSTANT_MODE");
  static readonly _orbitalCurveModeMacro = ShaderMacro.getByName("RENDERER_VOL_ORBITAL_CURVE_MODE");
  static readonly _orbitalRandomModeMacro = ShaderMacro.getByName("RENDERER_VOL_ORBITAL_IS_RANDOM_TWO");
  static readonly _radialConstantModeMacro = ShaderMacro.getByName("RENDERER_VOL_RADIAL_CONSTANT_MODE");
  static readonly _radialCurveModeMacro = ShaderMacro.getByName("RENDERER_VOL_RADIAL_CURVE_MODE");
  static readonly _radialRandomModeMacro = ShaderMacro.getByName("RENDERER_VOL_RADIAL_IS_RANDOM_TWO");

  static readonly _orbitalMinConstantProperty = ShaderProperty.getByName("renderer_VOLOrbitalMinConst");
  static readonly _orbitalMaxConstantProperty = ShaderProperty.getByName("renderer_VOLOrbitalMaxConst");
  static readonly _orbitalMinCurveXProperty = ShaderProperty.getByName("renderer_VOLOrbitalMinCurveX");
  static readonly _orbitalMinCurveYProperty = ShaderProperty.getByName("renderer_VOLOrbitalMinCurveY");
  static readonly _orbitalMinCurveZProperty = ShaderProperty.getByName("renderer_VOLOrbitalMinCurveZ");
  static readonly _orbitalMaxCurveXProperty = ShaderProperty.getByName("renderer_VOLOrbitalMaxCurveX");
  static readonly _orbitalMaxCurveYProperty = ShaderProperty.getByName("renderer_VOLOrbitalMaxCurveY");
  static readonly _orbitalMaxCurveZProperty = ShaderProperty.getByName("renderer_VOLOrbitalMaxCurveZ");
  static readonly _radialMinConstantProperty = ShaderProperty.getByName("renderer_VOLRadialMinConst");
  static readonly _radialMaxConstantProperty = ShaderProperty.getByName("renderer_VOLRadialMaxConst");
  static readonly _radialMinCurveProperty = ShaderProperty.getByName("renderer_VOLRadialMinCurve");
  static readonly _radialMaxCurveProperty = ShaderProperty.getByName("renderer_VOLRadialMaxCurve");
  static readonly _offsetProperty = ShaderProperty.getByName("renderer_VOLOffset");

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
  private _orbitalMinConstant = new Vector3();
  @ignoreClone
  private _orbitalConstant = new Vector3();
  @ignoreClone
  private _orbitalMacro: ShaderMacro;
  @ignoreClone
  private _orbitalRandomModeMacro: ShaderMacro;
  @ignoreClone
  private _radialMacro: ShaderMacro;
  @ignoreClone
  private _radialRandomModeMacro: ShaderMacro;

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

  @ignoreClone
  private readonly _onTransformFeedbackDirty = (): void => this._generator._setTransformFeedback();

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
   * @remarks Requires WebGL2 and transform feedback. Switching orbital/radial values between zero and non-zero
   * restarts the simulation. LimitVelocityOverLifetime does not clamp orbital/radial motion.
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
   * @remarks Requires WebGL2 and transform feedback. Switching orbital/radial values between zero and non-zero
   * restarts the simulation. LimitVelocityOverLifetime does not clamp orbital/radial motion.
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
   * @remarks Requires WebGL2 and transform feedback. Switching orbital/radial values between zero and non-zero
   * restarts the simulation. LimitVelocityOverLifetime does not clamp orbital/radial motion.
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
   * @remarks Requires WebGL2 and transform feedback. The center is given by `centerOffset`.
   * Switching orbital/radial values between zero and non-zero restarts the simulation.
   * LimitVelocityOverLifetime does not clamp orbital/radial motion.
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
   * The center offset of orbital/radial velocity from the particle system origin, in the system's local space.
   * @remarks In world simulation space, this local offset is transformed by the simulation transform captured when
   * each particle is born, so particles emitted from a moving emitter keep orbiting their own birth-frame center.
   */
  get centerOffset(): Vector3 {
    return this._offset;
  }

  set centerOffset(value: Vector3) {
    const offset = this._offset;
    if (value !== offset) {
      offset.copyFrom(value);
    }
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
    // @ts-ignore
    this._offset._onValueChanged = () => this._generator._renderer._onGeneratorParamsChanged();
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let velocityMacro = <ShaderMacro>null;
    let isRandomModeMacro = <ShaderMacro>null;
    let orbitalMacro = <ShaderMacro>null;
    let orbitalRandomModeMacro = <ShaderMacro>null;
    let radialMacro = <ShaderMacro>null;
    let radialRandomModeMacro = <ShaderMacro>null;

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

      const needTransformFeedback = this._needTransformFeedback();
      const orbitalActive = needTransformFeedback && this._isOrbitalActive();
      const radialActive = needTransformFeedback && this._isRadialActive();

      if (orbitalActive) {
        const orbitalX = this._orbitalX;
        const orbitalY = this._orbitalY;
        const orbitalZ = this._orbitalZ;
        const isOrbitalRandomCurveMode =
          orbitalX.mode === ParticleCurveMode.TwoCurves &&
          orbitalY.mode === ParticleCurveMode.TwoCurves &&
          orbitalZ.mode === ParticleCurveMode.TwoCurves;

        if (
          isOrbitalRandomCurveMode ||
          (orbitalX.mode === ParticleCurveMode.Curve &&
            orbitalY.mode === ParticleCurveMode.Curve &&
            orbitalZ.mode === ParticleCurveMode.Curve)
        ) {
          shaderData.setFloatArray(
            VelocityOverLifetimeModule._orbitalMaxCurveXProperty,
            orbitalX.curveMax._getTypeArray()
          );
          shaderData.setFloatArray(
            VelocityOverLifetimeModule._orbitalMaxCurveYProperty,
            orbitalY.curveMax._getTypeArray()
          );
          shaderData.setFloatArray(
            VelocityOverLifetimeModule._orbitalMaxCurveZProperty,
            orbitalZ.curveMax._getTypeArray()
          );
          orbitalMacro = VelocityOverLifetimeModule._orbitalCurveModeMacro;
          if (isOrbitalRandomCurveMode) {
            shaderData.setFloatArray(
              VelocityOverLifetimeModule._orbitalMinCurveXProperty,
              orbitalX.curveMin._getTypeArray()
            );
            shaderData.setFloatArray(
              VelocityOverLifetimeModule._orbitalMinCurveYProperty,
              orbitalY.curveMin._getTypeArray()
            );
            shaderData.setFloatArray(
              VelocityOverLifetimeModule._orbitalMinCurveZProperty,
              orbitalZ.curveMin._getTypeArray()
            );
            orbitalRandomModeMacro = VelocityOverLifetimeModule._orbitalRandomModeMacro;
          }
        } else {
          this._orbitalConstant.set(orbitalX.constantMax, orbitalY.constantMax, orbitalZ.constantMax);
          shaderData.setVector3(VelocityOverLifetimeModule._orbitalMaxConstantProperty, this._orbitalConstant);
          orbitalMacro = VelocityOverLifetimeModule._orbitalConstantModeMacro;
          if (
            orbitalX.mode === ParticleCurveMode.TwoConstants &&
            orbitalY.mode === ParticleCurveMode.TwoConstants &&
            orbitalZ.mode === ParticleCurveMode.TwoConstants
          ) {
            this._orbitalMinConstant.set(orbitalX.constantMin, orbitalY.constantMin, orbitalZ.constantMin);
            shaderData.setVector3(VelocityOverLifetimeModule._orbitalMinConstantProperty, this._orbitalMinConstant);
            orbitalRandomModeMacro = VelocityOverLifetimeModule._orbitalRandomModeMacro;
          }
        }
      }

      if (radialActive) {
        const radial = this._radial;
        const isRadialRandomMode = radial._isRandomMode();
        if (radial._isCurveMode()) {
          shaderData.setFloatArray(VelocityOverLifetimeModule._radialMaxCurveProperty, radial.curveMax._getTypeArray());
          radialMacro = VelocityOverLifetimeModule._radialCurveModeMacro;
          if (isRadialRandomMode) {
            shaderData.setFloatArray(
              VelocityOverLifetimeModule._radialMinCurveProperty,
              radial.curveMin._getTypeArray()
            );
            radialRandomModeMacro = VelocityOverLifetimeModule._radialRandomModeMacro;
          }
        } else {
          shaderData.setFloat(VelocityOverLifetimeModule._radialMaxConstantProperty, radial.constantMax);
          radialMacro = VelocityOverLifetimeModule._radialConstantModeMacro;
          if (isRadialRandomMode) {
            shaderData.setFloat(VelocityOverLifetimeModule._radialMinConstantProperty, radial.constantMin);
            radialRandomModeMacro = VelocityOverLifetimeModule._radialRandomModeMacro;
          }
        }
      }

      if (orbitalActive || radialActive) {
        shaderData.setVector3(VelocityOverLifetimeModule._offsetProperty, this._offset);
      }
    }
    this._velocityMacro = this._enableMacro(shaderData, this._velocityMacro, velocityMacro);
    this._randomModeMacro = this._enableMacro(shaderData, this._randomModeMacro, isRandomModeMacro);
    this._orbitalMacro = this._enableMacro(shaderData, this._orbitalMacro, orbitalMacro);
    this._orbitalRandomModeMacro = this._enableMacro(shaderData, this._orbitalRandomModeMacro, orbitalRandomModeMacro);
    this._radialMacro = this._enableMacro(shaderData, this._radialMacro, radialMacro);
    this._radialRandomModeMacro = this._enableMacro(shaderData, this._radialRandomModeMacro, radialRandomModeMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._velocityRand.reset(seed, ParticleRandomSubSeeds.VelocityOverLifetime);
  }

  /**
   * @internal
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
    return !(this._orbitalX._isZero() && this._orbitalY._isZero() && this._orbitalZ._isZero());
  }

  /**
   * @internal
   */
  _isRadialActive(): boolean {
    return !this._radial._isZero();
  }

  /**
   * @internal
   */
  _isRandomMode(): boolean {
    const velocityX = this.velocityX;
    const velocityY = this.velocityY;
    const velocityZ = this.velocityZ;
    const isLinearRandomMode =
      (velocityX.mode === ParticleCurveMode.TwoConstants &&
        velocityY.mode === ParticleCurveMode.TwoConstants &&
        velocityZ.mode === ParticleCurveMode.TwoConstants) ||
      (velocityX.mode === ParticleCurveMode.TwoCurves &&
        velocityY.mode === ParticleCurveMode.TwoCurves &&
        velocityZ.mode === ParticleCurveMode.TwoCurves);
    if (!this._needTransformFeedback()) {
      return isLinearRandomMode;
    }

    const orbitalX = this._orbitalX;
    const orbitalY = this._orbitalY;
    const orbitalZ = this._orbitalZ;
    const isOrbitalRandomMode =
      (orbitalX.mode === ParticleCurveMode.TwoConstants &&
        orbitalY.mode === ParticleCurveMode.TwoConstants &&
        orbitalZ.mode === ParticleCurveMode.TwoConstants) ||
      (orbitalX.mode === ParticleCurveMode.TwoCurves &&
        orbitalY.mode === ParticleCurveMode.TwoCurves &&
        orbitalZ.mode === ParticleCurveMode.TwoCurves);

    return isLinearRandomMode || isOrbitalRandomMode || this._radial._isRandomMode();
  }

  private _onOrbitalRadialChange(lastValue: ParticleCompositeCurve, value: ParticleCompositeCurve): void {
    this._onCompositeCurveChange(lastValue, value);
    lastValue?._unRegisterOnValueChanged(this._onTransformFeedbackDirty);
    value?._registerOnValueChanged(this._onTransformFeedbackDirty);
    this._generator._setTransformFeedback();
  }
}
