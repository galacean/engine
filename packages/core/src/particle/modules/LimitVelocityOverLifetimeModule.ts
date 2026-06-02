import { Rand, Vector2, Vector3 } from "@galacean/engine-math";
import { property } from "../../clone/CloneManager";
import { ShaderData, ShaderMacro } from "../../shader";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Limit velocity over lifetime module.
 */
export class LimitVelocityOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _enabledMacro = ShaderMacro.getByName("RENDERER_LVL_MODULE_ENABLED");
  static readonly _separateAxesMacro = ShaderMacro.getByName("RENDERER_LVL_SEPARATE_AXES");
  static readonly _speedConstantModeMacro = ShaderMacro.getByName("RENDERER_LVL_SPEED_CONSTANT_MODE");
  static readonly _speedCurveModeMacro = ShaderMacro.getByName("RENDERER_LVL_SPEED_CURVE_MODE");
  static readonly _speedIsRandomMacro = ShaderMacro.getByName("RENDERER_LVL_SPEED_IS_RANDOM_TWO");
  static readonly _dragCurveModeMacro = ShaderMacro.getByName("RENDERER_LVL_DRAG_CURVE_MODE");
  static readonly _dragIsRandomMacro = ShaderMacro.getByName("RENDERER_LVL_DRAG_IS_RANDOM_TWO");
  static readonly _multiplyDragBySizeMacro = ShaderMacro.getByName("RENDERER_LVL_DRAG_MULTIPLY_SIZE");
  static readonly _multiplyDragByVelocityMacro = ShaderMacro.getByName("RENDERER_LVL_DRAG_MULTIPLY_VELOCITY");

  static readonly _speedMaxConstProperty = ShaderProperty.getByName("renderer_LVLSpeedMaxConst");
  static readonly _speedMinConstProperty = ShaderProperty.getByName("renderer_LVLSpeedMinConst");
  static readonly _speedMaxCurveProperty = ShaderProperty.getByName("renderer_LVLSpeedMaxCurve");
  static readonly _speedMinCurveProperty = ShaderProperty.getByName("renderer_LVLSpeedMinCurve");
  static readonly _speedMaxConstVecProperty = ShaderProperty.getByName("renderer_LVLSpeedMaxConstVector");
  static readonly _speedMinConstVecProperty = ShaderProperty.getByName("renderer_LVLSpeedMinConstVector");
  static readonly _speedXMaxCurveProperty = ShaderProperty.getByName("renderer_LVLSpeedXMaxCurve");
  static readonly _speedXMinCurveProperty = ShaderProperty.getByName("renderer_LVLSpeedXMinCurve");
  static readonly _speedYMaxCurveProperty = ShaderProperty.getByName("renderer_LVLSpeedYMaxCurve");
  static readonly _speedYMinCurveProperty = ShaderProperty.getByName("renderer_LVLSpeedYMinCurve");
  static readonly _speedZMaxCurveProperty = ShaderProperty.getByName("renderer_LVLSpeedZMaxCurve");
  static readonly _speedZMinCurveProperty = ShaderProperty.getByName("renderer_LVLSpeedZMinCurve");
  static readonly _dampenProperty = ShaderProperty.getByName("renderer_LVLDampen");
  static readonly _dragConstantProperty = ShaderProperty.getByName("renderer_LVLDragConstant");
  static readonly _dragMaxCurveProperty = ShaderProperty.getByName("renderer_LVLDragMaxCurve");
  static readonly _dragMinCurveProperty = ShaderProperty.getByName("renderer_LVLDragMinCurve");
  static readonly _spaceProperty = ShaderProperty.getByName("renderer_LVLSpace");

  /** @internal */
  _speedRand = new Rand(0, ParticleRandomSubSeeds.LimitVelocityOverLifetime);

  private _speedMinConstantVec = new Vector3();
  private _speedMaxConstantVec = new Vector3();
  private _dragConstantVec = new Vector2();

  private _enabledModuleMacro: ShaderMacro;
  private _separateAxesCachedMacro: ShaderMacro;
  private _speedModeMacro: ShaderMacro;
  private _speedRandomMacro: ShaderMacro;
  private _dragCurveCachedMacro: ShaderMacro;
  private _dragRandomCachedMacro: ShaderMacro;
  private _dragSizeMacro: ShaderMacro;
  private _dragVelocityMacro: ShaderMacro;

  @property
  private _separateAxes = false;
  @property
  private _speedX: ParticleCompositeCurve;
  @property
  private _speedY: ParticleCompositeCurve;
  @property
  private _speedZ: ParticleCompositeCurve;
  @property
  private _dampen: number = 0;
  @property
  private _drag: ParticleCompositeCurve;
  @property
  private _multiplyDragByParticleSize = false;
  @property
  private _multiplyDragByParticleVelocity = false;
  @property
  private _space = ParticleSimulationSpace.Local;

  /**
   * Whether to limit velocity on each axis separately.
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
   * Speed limit when separateAxes is false.
   */
  get speed(): ParticleCompositeCurve {
    return this._speedX;
  }

  set speed(value: ParticleCompositeCurve) {
    this.speedX = value;
  }

  /**
   * Speed limit for the x-axis (or overall limit when separateAxes is false).
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
   * Speed limit for the y-axis.
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
   * Speed limit for the z-axis.
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

  /**
   * Controls how much the velocity is dampened when it exceeds the limit.
   * @remarks Value is clamped to [0, 1]. 0 means no damping, 1 means full damping.
   */
  get dampen(): number {
    return this._dampen;
  }

  set dampen(value: number) {
    value = Math.max(0, Math.min(1, value));
    if (value !== this._dampen) {
      this._dampen = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Controls the amount of drag applied to particle velocities.
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
   * Adjust the amount of drag based on particle sizes.
   */
  get multiplyDragByParticleSize(): boolean {
    return this._multiplyDragByParticleSize;
  }

  set multiplyDragByParticleSize(value: boolean) {
    if (value !== this._multiplyDragByParticleSize) {
      this._multiplyDragByParticleSize = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Adjust the amount of drag based on particle speeds.
   */
  get multiplyDragByParticleVelocity(): boolean {
    return this._multiplyDragByParticleVelocity;
  }

  set multiplyDragByParticleVelocity(value: boolean) {
    if (value !== this._multiplyDragByParticleVelocity) {
      this._multiplyDragByParticleVelocity = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Specifies if the velocity limits are in local space or world space.
   * @remarks Only takes effect when 'separateAxes' is enabled.
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

  /**
   * Specifies whether the module is enabled.
   * @remarks This module requires WebGL2, On WebGL1, enabling will be silently ignored.
   */
  override get enabled(): boolean {
    return this._enabled;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      if (value && !this._generator._renderer.engine._hardwareRenderer.isWebGL2) {
        return;
      }
      this._enabled = value;
      this._generator._setTransformFeedback();
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  constructor(generator: ParticleGenerator) {
    super(generator);

    this.speedX = new ParticleCompositeCurve(1);
    this.speedY = new ParticleCompositeCurve(1);
    this.speedZ = new ParticleCompositeCurve(1);
    this.drag = new ParticleCompositeCurve(0);
  }

  /**
   * @internal
   */
  _isDragRandomMode(): boolean {
    return this._drag.mode === ParticleCurveMode.TwoConstants || this._drag.mode === ParticleCurveMode.TwoCurves;
  }

  /**
   * @internal
   */
  _isSpeedRandomMode(): boolean {
    if (this._separateAxes) {
      return (
        (this._speedX.mode === ParticleCurveMode.TwoConstants || this._speedX.mode === ParticleCurveMode.TwoCurves) &&
        (this._speedY.mode === ParticleCurveMode.TwoConstants || this._speedY.mode === ParticleCurveMode.TwoCurves) &&
        (this._speedZ.mode === ParticleCurveMode.TwoConstants || this._speedZ.mode === ParticleCurveMode.TwoCurves)
      );
    }
    return this._speedX.mode === ParticleCurveMode.TwoConstants || this._speedX.mode === ParticleCurveMode.TwoCurves;
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let enabledModuleMacro = <ShaderMacro>null;
    let separateAxesMacro = <ShaderMacro>null;
    let speedModeMacro = <ShaderMacro>null;
    let speedRandomMacro = <ShaderMacro>null;
    let dragCurveMacro = <ShaderMacro>null;
    let dragRandomMacro = <ShaderMacro>null;
    let dragSizeMacro = <ShaderMacro>null;
    let dragVelocityMacro = <ShaderMacro>null;

    if (this.enabled) {
      enabledModuleMacro = LimitVelocityOverLifetimeModule._enabledMacro;

      // Dampen
      shaderData.setFloat(LimitVelocityOverLifetimeModule._dampenProperty, this._dampen);

      // Space
      shaderData.setInt(LimitVelocityOverLifetimeModule._spaceProperty, this._space);

      // Limit speed
      if (this._separateAxes) {
        separateAxesMacro = LimitVelocityOverLifetimeModule._separateAxesMacro;
        const result = this._uploadSeparateAxisSpeeds(shaderData);
        speedModeMacro = result.modeMacro;
        speedRandomMacro = result.randomMacro;
      } else {
        const result = this._uploadScalarSpeed(shaderData);
        speedModeMacro = result.modeMacro;
        speedRandomMacro = result.randomMacro;
      }

      // Drag
      const dragResult = this._uploadDrag(shaderData);
      dragCurveMacro = dragResult.curveMacro;
      dragRandomMacro = dragResult.randomMacro;

      // Drag modifiers
      if (this._multiplyDragByParticleSize) {
        dragSizeMacro = LimitVelocityOverLifetimeModule._multiplyDragBySizeMacro;
      }
      if (this._multiplyDragByParticleVelocity) {
        dragVelocityMacro = LimitVelocityOverLifetimeModule._multiplyDragByVelocityMacro;
      }
    }

    this._enabledModuleMacro = this._enableMacro(shaderData, this._enabledModuleMacro, enabledModuleMacro);
    this._separateAxesCachedMacro = this._enableMacro(shaderData, this._separateAxesCachedMacro, separateAxesMacro);
    this._speedModeMacro = this._enableMacro(shaderData, this._speedModeMacro, speedModeMacro);
    this._speedRandomMacro = this._enableMacro(shaderData, this._speedRandomMacro, speedRandomMacro);
    this._dragCurveCachedMacro = this._enableMacro(shaderData, this._dragCurveCachedMacro, dragCurveMacro);
    this._dragRandomCachedMacro = this._enableMacro(shaderData, this._dragRandomCachedMacro, dragRandomMacro);
    this._dragSizeMacro = this._enableMacro(shaderData, this._dragSizeMacro, dragSizeMacro);
    this._dragVelocityMacro = this._enableMacro(shaderData, this._dragVelocityMacro, dragVelocityMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._speedRand.reset(seed, ParticleRandomSubSeeds.LimitVelocityOverLifetime);
  }

  private _uploadScalarSpeed(shaderData: ShaderData): { modeMacro: ShaderMacro; randomMacro: ShaderMacro } {
    const speedX = this._speedX;
    let modeMacro: ShaderMacro = null;
    let randomMacro: ShaderMacro = null;

    const isRandomCurveMode = speedX.mode === ParticleCurveMode.TwoCurves;
    if (isRandomCurveMode || speedX.mode === ParticleCurveMode.Curve) {
      shaderData.setFloatArray(LimitVelocityOverLifetimeModule._speedMaxCurveProperty, speedX.curveMax._getTypeArray());
      modeMacro = LimitVelocityOverLifetimeModule._speedCurveModeMacro;
      if (isRandomCurveMode) {
        shaderData.setFloatArray(
          LimitVelocityOverLifetimeModule._speedMinCurveProperty,
          speedX.curveMin._getTypeArray()
        );
        randomMacro = LimitVelocityOverLifetimeModule._speedIsRandomMacro;
      }
    } else {
      shaderData.setFloat(LimitVelocityOverLifetimeModule._speedMaxConstProperty, speedX.constantMax);
      modeMacro = LimitVelocityOverLifetimeModule._speedConstantModeMacro;
      if (speedX.mode === ParticleCurveMode.TwoConstants) {
        shaderData.setFloat(LimitVelocityOverLifetimeModule._speedMinConstProperty, speedX.constantMin);
        randomMacro = LimitVelocityOverLifetimeModule._speedIsRandomMacro;
      }
    }

    return { modeMacro, randomMacro };
  }

  private _uploadSeparateAxisSpeeds(shaderData: ShaderData): { modeMacro: ShaderMacro; randomMacro: ShaderMacro } {
    const speedX = this._speedX;
    const speedY = this._speedY;
    const speedZ = this._speedZ;
    let modeMacro: ShaderMacro = null;
    let randomMacro: ShaderMacro = null;

    const isRandomCurveMode =
      speedX.mode === ParticleCurveMode.TwoCurves &&
      speedY.mode === ParticleCurveMode.TwoCurves &&
      speedZ.mode === ParticleCurveMode.TwoCurves;

    if (
      isRandomCurveMode ||
      (speedX.mode === ParticleCurveMode.Curve &&
        speedY.mode === ParticleCurveMode.Curve &&
        speedZ.mode === ParticleCurveMode.Curve)
    ) {
      shaderData.setFloatArray(
        LimitVelocityOverLifetimeModule._speedXMaxCurveProperty,
        speedX.curveMax._getTypeArray()
      );
      shaderData.setFloatArray(
        LimitVelocityOverLifetimeModule._speedYMaxCurveProperty,
        speedY.curveMax._getTypeArray()
      );
      shaderData.setFloatArray(
        LimitVelocityOverLifetimeModule._speedZMaxCurveProperty,
        speedZ.curveMax._getTypeArray()
      );
      modeMacro = LimitVelocityOverLifetimeModule._speedCurveModeMacro;
      if (isRandomCurveMode) {
        shaderData.setFloatArray(
          LimitVelocityOverLifetimeModule._speedXMinCurveProperty,
          speedX.curveMin._getTypeArray()
        );
        shaderData.setFloatArray(
          LimitVelocityOverLifetimeModule._speedYMinCurveProperty,
          speedY.curveMin._getTypeArray()
        );
        shaderData.setFloatArray(
          LimitVelocityOverLifetimeModule._speedZMinCurveProperty,
          speedZ.curveMin._getTypeArray()
        );
        randomMacro = LimitVelocityOverLifetimeModule._speedIsRandomMacro;
      }
    } else {
      const constantMax = this._speedMaxConstantVec;
      constantMax.set(speedX.constantMax, speedY.constantMax, speedZ.constantMax);
      shaderData.setVector3(LimitVelocityOverLifetimeModule._speedMaxConstVecProperty, constantMax);
      modeMacro = LimitVelocityOverLifetimeModule._speedConstantModeMacro;

      if (
        speedX.mode === ParticleCurveMode.TwoConstants &&
        speedY.mode === ParticleCurveMode.TwoConstants &&
        speedZ.mode === ParticleCurveMode.TwoConstants
      ) {
        const constantMin = this._speedMinConstantVec;
        constantMin.set(speedX.constantMin, speedY.constantMin, speedZ.constantMin);
        shaderData.setVector3(LimitVelocityOverLifetimeModule._speedMinConstVecProperty, constantMin);
        randomMacro = LimitVelocityOverLifetimeModule._speedIsRandomMacro;
      }
    }

    return { modeMacro, randomMacro };
  }

  private _uploadDrag(shaderData: ShaderData): { curveMacro: ShaderMacro; randomMacro: ShaderMacro } {
    const drag = this._drag;
    let curveMacro: ShaderMacro = null;
    let randomMacro: ShaderMacro = null;

    const isRandomCurveMode = drag.mode === ParticleCurveMode.TwoCurves;
    if (isRandomCurveMode || drag.mode === ParticleCurveMode.Curve) {
      shaderData.setFloatArray(LimitVelocityOverLifetimeModule._dragMaxCurveProperty, drag.curveMax._getTypeArray());
      curveMacro = LimitVelocityOverLifetimeModule._dragCurveModeMacro;
      if (isRandomCurveMode) {
        shaderData.setFloatArray(LimitVelocityOverLifetimeModule._dragMinCurveProperty, drag.curveMin._getTypeArray());
        randomMacro = LimitVelocityOverLifetimeModule._dragIsRandomMacro;
      }
    } else {
      const dragVec = this._dragConstantVec;
      if (drag.mode === ParticleCurveMode.TwoConstants) {
        dragVec.set(drag.constantMin, drag.constantMax);
      } else {
        dragVec.set(drag.constantMax, drag.constantMax);
      }
      shaderData.setVector2(LimitVelocityOverLifetimeModule._dragConstantProperty, dragVec);
    }

    return { curveMacro, randomMacro };
  }
}
