import { Rand, Vector2, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
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
  static readonly _limitConstantModeMacro = ShaderMacro.getByName("RENDERER_LVL_LIMIT_CONSTANT_MODE");
  static readonly _limitCurveModeMacro = ShaderMacro.getByName("RENDERER_LVL_LIMIT_CURVE_MODE");
  static readonly _limitIsRandomMacro = ShaderMacro.getByName("RENDERER_LVL_LIMIT_IS_RANDOM_TWO");
  static readonly _dragCurveModeMacro = ShaderMacro.getByName("RENDERER_LVL_DRAG_CURVE_MODE");
  static readonly _multiplyDragBySizeMacro = ShaderMacro.getByName("RENDERER_LVL_DRAG_MULTIPLY_SIZE");
  static readonly _multiplyDragByVelocityMacro = ShaderMacro.getByName("RENDERER_LVL_DRAG_MULTIPLY_VELOCITY");

  static readonly _limitMaxConstProperty = ShaderProperty.getByName("renderer_LVLLimitMaxConst");
  static readonly _limitMinConstProperty = ShaderProperty.getByName("renderer_LVLLimitMinConst");
  static readonly _limitMaxCurveProperty = ShaderProperty.getByName("renderer_LVLLimitMaxCurve");
  static readonly _limitMinCurveProperty = ShaderProperty.getByName("renderer_LVLLimitMinCurve");
  static readonly _limitMaxConstVecProperty = ShaderProperty.getByName("renderer_LVLLimitMaxConstVec");
  static readonly _limitMinConstVecProperty = ShaderProperty.getByName("renderer_LVLLimitMinConstVec");
  static readonly _limitXMaxCurveProperty = ShaderProperty.getByName("renderer_LVLLimitXMaxCurve");
  static readonly _limitXMinCurveProperty = ShaderProperty.getByName("renderer_LVLLimitXMinCurve");
  static readonly _limitYMaxCurveProperty = ShaderProperty.getByName("renderer_LVLLimitYMaxCurve");
  static readonly _limitYMinCurveProperty = ShaderProperty.getByName("renderer_LVLLimitYMinCurve");
  static readonly _limitZMaxCurveProperty = ShaderProperty.getByName("renderer_LVLLimitZMaxCurve");
  static readonly _limitZMinCurveProperty = ShaderProperty.getByName("renderer_LVLLimitZMinCurve");
  static readonly _dampenProperty = ShaderProperty.getByName("renderer_LVLDampen");
  static readonly _dragConstantProperty = ShaderProperty.getByName("renderer_LVLDragConstant");
  static readonly _dragMaxCurveProperty = ShaderProperty.getByName("renderer_LVLDragMaxCurve");
  static readonly _dragMinCurveProperty = ShaderProperty.getByName("renderer_LVLDragMinCurve");
  static readonly _spaceProperty = ShaderProperty.getByName("renderer_LVLSpace");

  /** @internal */
  @ignoreClone
  _limitRand = new Rand(0, ParticleRandomSubSeeds.LimitVelocityOverLifetime);

  @ignoreClone
  private _limitMinConstantVec = new Vector3();
  @ignoreClone
  private _limitMaxConstantVec = new Vector3();
  @ignoreClone
  private _dragConstantVec = new Vector2();

  @ignoreClone
  private _enabledModuleMacro: ShaderMacro;
  @ignoreClone
  private _separateAxesCachedMacro: ShaderMacro;
  @ignoreClone
  private _limitModeMacro: ShaderMacro;
  @ignoreClone
  private _limitRandomMacro: ShaderMacro;
  @ignoreClone
  private _dragCurveCachedMacro: ShaderMacro;
  @ignoreClone
  private _dragSizeMacro: ShaderMacro;
  @ignoreClone
  private _dragVelocityMacro: ShaderMacro;

  private _separateAxes = false;
  @deepClone
  private _limitX: ParticleCompositeCurve;
  @deepClone
  private _limitY: ParticleCompositeCurve;
  @deepClone
  private _limitZ: ParticleCompositeCurve;
  private _dampen: number = 1;
  @deepClone
  private _drag: ParticleCompositeCurve;
  private _multiplyDragByParticleSize = false;
  private _multiplyDragByParticleVelocity = false;
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
  get limit(): ParticleCompositeCurve {
    return this._limitX;
  }

  set limit(value: ParticleCompositeCurve) {
    this.limitX = value;
  }

  /**
   * Speed limit for the x-axis (or overall limit when separateAxes is false).
   */
  get limitX(): ParticleCompositeCurve {
    return this._limitX;
  }

  set limitX(value: ParticleCompositeCurve) {
    const lastValue = this._limitX;
    if (value !== lastValue) {
      this._limitX = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Speed limit for the y-axis.
   */
  get limitY(): ParticleCompositeCurve {
    return this._limitY;
  }

  set limitY(value: ParticleCompositeCurve) {
    const lastValue = this._limitY;
    if (value !== lastValue) {
      this._limitY = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Speed limit for the z-axis.
   */
  get limitZ(): ParticleCompositeCurve {
    return this._limitZ;
  }

  set limitZ(value: ParticleCompositeCurve) {
    const lastValue = this._limitZ;
    if (value !== lastValue) {
      this._limitZ = value;
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
      // Auto-switch to Transform Feedback mode for accurate per-frame dampen simulation
      this._generator._setTFMode(value);
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  constructor(generator: ParticleGenerator) {
    super(generator);

    this.limitX = new ParticleCompositeCurve(1);
    this.limitY = new ParticleCompositeCurve(1);
    this.limitZ = new ParticleCompositeCurve(1);
    this.drag = new ParticleCompositeCurve(0);
  }

  /**
   * @internal
   */
  _isRandomMode(): boolean {
    if (this._separateAxes) {
      return (
        (this._limitX.mode === ParticleCurveMode.TwoConstants || this._limitX.mode === ParticleCurveMode.TwoCurves) &&
        (this._limitY.mode === ParticleCurveMode.TwoConstants || this._limitY.mode === ParticleCurveMode.TwoCurves) &&
        (this._limitZ.mode === ParticleCurveMode.TwoConstants || this._limitZ.mode === ParticleCurveMode.TwoCurves)
      );
    }
    return this._limitX.mode === ParticleCurveMode.TwoConstants || this._limitX.mode === ParticleCurveMode.TwoCurves;
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let enabledModuleMacro = <ShaderMacro>null;
    let separateAxesMacro = <ShaderMacro>null;
    let limitModeMacro = <ShaderMacro>null;
    let limitRandomMacro = <ShaderMacro>null;
    let dragCurveMacro = <ShaderMacro>null;
    let dragSizeMacro = <ShaderMacro>null;
    let dragVelocityMacro = <ShaderMacro>null;

    if (this.enabled) {
      enabledModuleMacro = LimitVelocityOverLifetimeModule._enabledMacro;

      // Dampen
      shaderData.setFloat(LimitVelocityOverLifetimeModule._dampenProperty, this._dampen);

      // Space
      shaderData.setInt(LimitVelocityOverLifetimeModule._spaceProperty, this._space);

      // Limit
      if (this._separateAxes) {
        separateAxesMacro = LimitVelocityOverLifetimeModule._separateAxesMacro;
        const result = this._uploadSeparateAxisLimits(shaderData);
        limitModeMacro = result.modeMacro;
        limitRandomMacro = result.randomMacro;
      } else {
        const result = this._uploadScalarLimit(shaderData);
        limitModeMacro = result.modeMacro;
        limitRandomMacro = result.randomMacro;
      }

      // Drag
      dragCurveMacro = this._uploadDrag(shaderData);

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
    this._limitModeMacro = this._enableMacro(shaderData, this._limitModeMacro, limitModeMacro);
    this._limitRandomMacro = this._enableMacro(shaderData, this._limitRandomMacro, limitRandomMacro);
    this._dragCurveCachedMacro = this._enableMacro(shaderData, this._dragCurveCachedMacro, dragCurveMacro);
    this._dragSizeMacro = this._enableMacro(shaderData, this._dragSizeMacro, dragSizeMacro);
    this._dragVelocityMacro = this._enableMacro(shaderData, this._dragVelocityMacro, dragVelocityMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._limitRand.reset(seed, ParticleRandomSubSeeds.LimitVelocityOverLifetime);
  }

  private _uploadScalarLimit(shaderData: ShaderData): { modeMacro: ShaderMacro; randomMacro: ShaderMacro } {
    const limitX = this._limitX;
    let modeMacro: ShaderMacro = null;
    let randomMacro: ShaderMacro = null;

    const isRandomCurveMode = limitX.mode === ParticleCurveMode.TwoCurves;
    if (isRandomCurveMode || limitX.mode === ParticleCurveMode.Curve) {
      shaderData.setFloatArray(LimitVelocityOverLifetimeModule._limitMaxCurveProperty, limitX.curveMax._getTypeArray());
      modeMacro = LimitVelocityOverLifetimeModule._limitCurveModeMacro;
      if (isRandomCurveMode) {
        shaderData.setFloatArray(
          LimitVelocityOverLifetimeModule._limitMinCurveProperty,
          limitX.curveMin._getTypeArray()
        );
        randomMacro = LimitVelocityOverLifetimeModule._limitIsRandomMacro;
      }
    } else {
      shaderData.setFloat(LimitVelocityOverLifetimeModule._limitMaxConstProperty, limitX.constantMax);
      modeMacro = LimitVelocityOverLifetimeModule._limitConstantModeMacro;
      if (limitX.mode === ParticleCurveMode.TwoConstants) {
        shaderData.setFloat(LimitVelocityOverLifetimeModule._limitMinConstProperty, limitX.constantMin);
        randomMacro = LimitVelocityOverLifetimeModule._limitIsRandomMacro;
      }
    }

    return { modeMacro, randomMacro };
  }

  private _uploadSeparateAxisLimits(shaderData: ShaderData): { modeMacro: ShaderMacro; randomMacro: ShaderMacro } {
    const limitX = this._limitX;
    const limitY = this._limitY;
    const limitZ = this._limitZ;
    let modeMacro: ShaderMacro = null;
    let randomMacro: ShaderMacro = null;

    const isRandomCurveMode =
      limitX.mode === ParticleCurveMode.TwoCurves &&
      limitY.mode === ParticleCurveMode.TwoCurves &&
      limitZ.mode === ParticleCurveMode.TwoCurves;

    if (
      isRandomCurveMode ||
      (limitX.mode === ParticleCurveMode.Curve &&
        limitY.mode === ParticleCurveMode.Curve &&
        limitZ.mode === ParticleCurveMode.Curve)
    ) {
      shaderData.setFloatArray(
        LimitVelocityOverLifetimeModule._limitXMaxCurveProperty,
        limitX.curveMax._getTypeArray()
      );
      shaderData.setFloatArray(
        LimitVelocityOverLifetimeModule._limitYMaxCurveProperty,
        limitY.curveMax._getTypeArray()
      );
      shaderData.setFloatArray(
        LimitVelocityOverLifetimeModule._limitZMaxCurveProperty,
        limitZ.curveMax._getTypeArray()
      );
      modeMacro = LimitVelocityOverLifetimeModule._limitCurveModeMacro;
      if (isRandomCurveMode) {
        shaderData.setFloatArray(
          LimitVelocityOverLifetimeModule._limitXMinCurveProperty,
          limitX.curveMin._getTypeArray()
        );
        shaderData.setFloatArray(
          LimitVelocityOverLifetimeModule._limitYMinCurveProperty,
          limitY.curveMin._getTypeArray()
        );
        shaderData.setFloatArray(
          LimitVelocityOverLifetimeModule._limitZMinCurveProperty,
          limitZ.curveMin._getTypeArray()
        );
        randomMacro = LimitVelocityOverLifetimeModule._limitIsRandomMacro;
      }
    } else {
      const constantMax = this._limitMaxConstantVec;
      constantMax.set(limitX.constantMax, limitY.constantMax, limitZ.constantMax);
      shaderData.setVector3(LimitVelocityOverLifetimeModule._limitMaxConstVecProperty, constantMax);
      modeMacro = LimitVelocityOverLifetimeModule._limitConstantModeMacro;

      if (
        limitX.mode === ParticleCurveMode.TwoConstants &&
        limitY.mode === ParticleCurveMode.TwoConstants &&
        limitZ.mode === ParticleCurveMode.TwoConstants
      ) {
        const constantMin = this._limitMinConstantVec;
        constantMin.set(limitX.constantMin, limitY.constantMin, limitZ.constantMin);
        shaderData.setVector3(LimitVelocityOverLifetimeModule._limitMinConstVecProperty, constantMin);
        randomMacro = LimitVelocityOverLifetimeModule._limitIsRandomMacro;
      }
    }

    return { modeMacro, randomMacro };
  }

  private _uploadDrag(shaderData: ShaderData): ShaderMacro {
    const drag = this._drag;
    let dragCurveMacro: ShaderMacro = null;

    const isRandomCurveMode = drag.mode === ParticleCurveMode.TwoCurves;
    if (isRandomCurveMode || drag.mode === ParticleCurveMode.Curve) {
      shaderData.setFloatArray(LimitVelocityOverLifetimeModule._dragMaxCurveProperty, drag.curveMax._getTypeArray());
      dragCurveMacro = LimitVelocityOverLifetimeModule._dragCurveModeMacro;
      if (isRandomCurveMode) {
        shaderData.setFloatArray(LimitVelocityOverLifetimeModule._dragMinCurveProperty, drag.curveMin._getTypeArray());
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

    return dragCurveMacro;
  }
}
