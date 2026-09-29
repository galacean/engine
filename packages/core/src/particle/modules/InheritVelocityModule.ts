import { MathUtil, Rand, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneDecorators";
import { ShaderMacro, ShaderProperty } from "../../shader";
import type { ShaderData } from "../../shader";
import type { ParticleGenerator } from "../ParticleGenerator";
import { ParticleInheritVelocityMode } from "../enums/ParticleInheritVelocityMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Controls how emitter velocity is applied to particles.
 */
export class InheritVelocityModule extends ParticleGeneratorModule {
  private static readonly _currentMacro = ShaderMacro.getByName("RENDERER_INHERIT_VELOCITY_CURRENT");
  private static readonly _initialCurveMacro = ShaderMacro.getByName("RENDERER_INHERIT_VELOCITY_INITIAL_CURVE");
  private static readonly _constantModeMacro = ShaderMacro.getByName("RENDERER_INHERIT_VELOCITY_CONSTANT_MODE");
  private static readonly _curveModeMacro = ShaderMacro.getByName("RENDERER_INHERIT_VELOCITY_CURVE_MODE");
  private static readonly _randomModeMacro = ShaderMacro.getByName("RENDERER_INHERIT_VELOCITY_RANDOM");
  private static readonly _velocityProperty = ShaderProperty.getByName("renderer_InheritVelocity");
  private static readonly _minConstantProperty = ShaderProperty.getByName("renderer_InheritVelocityMinConst");
  private static readonly _maxConstantProperty = ShaderProperty.getByName("renderer_InheritVelocityMaxConst");
  private static readonly _minCurveProperty = ShaderProperty.getByName("renderer_InheritVelocityMinCurve");
  private static readonly _maxCurveProperty = ShaderProperty.getByName("renderer_InheritVelocityMaxCurve");

  /** @internal */
  @ignoreClone
  readonly _curveRand = new Rand(0, ParticleRandomSubSeeds.InheritVelocity);

  private _mode = ParticleInheritVelocityMode.Initial;
  private _curve: ParticleCompositeCurve;
  @ignoreClone
  private readonly _emitterVelocity = new Vector3();
  @ignoreClone
  private readonly _previousWorldPosition = new Vector3();
  @ignoreClone
  private _hasPreviousWorldPosition = false;
  @ignoreClone
  private _applicationMacro: ShaderMacro;
  @ignoreClone
  private _curveMacro: ShaderMacro;
  @ignoreClone
  private _randomMacro: ShaderMacro;

  /**
   * @inheritdoc
   */
  override get enabled(): boolean {
    return this._enabled;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      this._resyncEmitterVelocity();
      this._generator._setTransformFeedback();
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Whether to capture the emitter velocity at birth or follow it while the particle is alive.
   */
  get mode(): ParticleInheritVelocityMode {
    return this._mode;
  }

  set mode(value: ParticleInheritVelocityMode) {
    if (value !== this._mode) {
      this._mode = value;
      this._resyncEmitterVelocity();
      this._generator._setTransformFeedback();
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Scale applied to the inherited velocity over each particle's lifetime.
   */
  get curve(): ParticleCompositeCurve {
    return this._curve;
  }

  set curve(value: ParticleCompositeCurve) {
    const lastValue = this._curve;
    if (value !== lastValue) {
      this._curve = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * @internal
   */
  constructor(generator: ParticleGenerator) {
    super(generator);
    this.curve = new ParticleCompositeCurve(0);
  }

  /**
   * @internal
   */
  _updateEmitterVelocity(elapsedTime: number): void {
    const renderer = this._generator._renderer;
    if (
      this._generator.main.simulationSpace !== ParticleSimulationSpace.World ||
      (this._mode !== ParticleInheritVelocityMode.Initial && !renderer.engine._hardwareRenderer.isWebGL2)
    ) {
      this._resyncEmitterVelocity();
      return;
    }

    const worldPosition = renderer.entity.transform.worldPosition;
    if (this._hasPreviousWorldPosition && elapsedTime > MathUtil.zeroTolerance) {
      const previous = this._previousWorldPosition;
      this._emitterVelocity.set(
        (worldPosition.x - previous.x) / elapsedTime,
        (worldPosition.y - previous.y) / elapsedTime,
        (worldPosition.z - previous.z) / elapsedTime
      );
    } else {
      this._emitterVelocity.set(0, 0, 0);
    }
    this._previousWorldPosition.copyFrom(worldPosition);
    this._hasPreviousWorldPosition = true;
  }

  /**
   * @internal
   */
  _resyncEmitterVelocity(): void {
    if (this._hasPreviousWorldPosition) {
      this._emitterVelocity.set(0, 0, 0);
      this._hasPreviousWorldPosition = false;
    }
  }

  /**
   * @internal
   */
  _getInitialVelocity(out: Vector3): boolean {
    if (!this._enabled || this._mode !== ParticleInheritVelocityMode.Initial) {
      out.set(0, 0, 0);
      return false;
    }

    const curve = this.curve;
    if (this._generator.main.simulationSpace !== ParticleSimulationSpace.World) {
      out.set(0, 0, 0);
      return false;
    }

    const velocity = this._emitterVelocity;
    if (curve._isCurveMode()) {
      out.copyFrom(velocity);
      return velocity.x !== 0 || velocity.y !== 0 || velocity.z !== 0;
    }

    const factor = curve.evaluate(undefined, this._curveRand.random());
    out.set(velocity.x * factor, velocity.y * factor, velocity.z * factor);
    return factor !== 0 && (velocity.x !== 0 || velocity.y !== 0 || velocity.z !== 0);
  }

  /**
   * @internal
   */
  _getTrajectoryInitialFactor(): number {
    if (!this._enabled || this._mode !== ParticleInheritVelocityMode.Initial || this.curve._isCurveMode()) {
      return 0;
    }
    return this.curve.evaluate(undefined, this._curveRand.random());
  }

  /**
   * @internal
   */
  _getCurrentBoundsVelocity(out: Vector3): boolean {
    if (!this._needTransformFeedback()) {
      return false;
    }
    const factor = this.curve._getMaxMagnitude();
    const velocity = this._emitterVelocity;
    if (factor === 0 || (velocity.x === 0 && velocity.y === 0 && velocity.z === 0)) {
      return false;
    }
    out.set(Math.abs(velocity.x) * factor, Math.abs(velocity.y) * factor, Math.abs(velocity.z) * factor);
    return true;
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData, hasSubEmitterParticles: boolean): void {
    let applicationMacro: ShaderMacro = null;
    let curveMacro: ShaderMacro = null;
    let randomMacro: ShaderMacro = null;

    const usesCurrentVelocity = this._needTransformFeedback();
    if (usesCurrentVelocity || this._usesInitialCurve(hasSubEmitterParticles)) {
      const curve = this.curve;
      applicationMacro = usesCurrentVelocity
        ? InheritVelocityModule._currentMacro
        : InheritVelocityModule._initialCurveMacro;
      if (usesCurrentVelocity) {
        shaderData.setVector3(InheritVelocityModule._velocityProperty, this._emitterVelocity);
      }
      const isRandomMode = curve._isRandomMode();
      randomMacro = isRandomMode ? InheritVelocityModule._randomModeMacro : null;
      if (curve._isCurveMode()) {
        curveMacro = InheritVelocityModule._curveModeMacro;
        shaderData.setFloatArray(InheritVelocityModule._maxCurveProperty, curve.curveMax._getTypeArray());
        if (isRandomMode) {
          shaderData.setFloatArray(InheritVelocityModule._minCurveProperty, curve.curveMin._getTypeArray());
        }
      } else {
        curveMacro = InheritVelocityModule._constantModeMacro;
        shaderData.setFloat(InheritVelocityModule._maxConstantProperty, curve.constantMax);
        if (isRandomMode) {
          shaderData.setFloat(InheritVelocityModule._minConstantProperty, curve.constantMin);
        }
      }
    }

    this._applicationMacro = this._enableMacro(shaderData, this._applicationMacro, applicationMacro);
    this._curveMacro = this._enableMacro(shaderData, this._curveMacro, curveMacro);
    this._randomMacro = this._enableMacro(shaderData, this._randomMacro, randomMacro);
  }

  /**
   * @internal
   */
  _needTransformFeedback(): boolean {
    return (
      this._enabled &&
      this._mode === ParticleInheritVelocityMode.Current &&
      this._generator.main.simulationSpace === ParticleSimulationSpace.World &&
      this._generator._renderer.engine._hardwareRenderer.isWebGL2
    );
  }

  /**
   * @internal
   */
  _usesInitialCurve(isSubEmitterSpawned: boolean): boolean {
    return (
      this._enabled &&
      this._mode === ParticleInheritVelocityMode.Initial &&
      this.curve._isCurveMode() &&
      (isSubEmitterSpawned || this._generator.main.simulationSpace === ParticleSimulationSpace.World)
    );
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._curveRand.reset(seed, ParticleRandomSubSeeds.InheritVelocity);
  }
}
