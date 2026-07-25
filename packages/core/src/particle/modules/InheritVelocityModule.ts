import { MathUtil, Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import { ParticleInheritVelocityMode } from "../enums/ParticleInheritVelocityMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/** Adds the particle system Entity's velocity to its particles. */
export class InheritVelocityModule extends ParticleGeneratorModule {
  private static readonly _currentMacro = ShaderMacro.getByName("RENDERER_INHERIT_VELOCITY_CURRENT");
  private static readonly _constantModeMacro = ShaderMacro.getByName("RENDERER_INHERIT_VELOCITY_CONSTANT_MODE");
  private static readonly _curveModeMacro = ShaderMacro.getByName("RENDERER_INHERIT_VELOCITY_CURVE_MODE");
  private static readonly _randomModeMacro = ShaderMacro.getByName("RENDERER_INHERIT_VELOCITY_RANDOM");
  private static readonly _velocityProperty = ShaderProperty.getByName("renderer_InheritVelocity");
  private static readonly _minConstantProperty = ShaderProperty.getByName("renderer_InheritVelocityMinConst");
  private static readonly _maxConstantProperty = ShaderProperty.getByName("renderer_InheritVelocityMaxConst");
  private static readonly _minCurveProperty = ShaderProperty.getByName("renderer_InheritVelocityMinCurve");
  private static readonly _maxCurveProperty = ShaderProperty.getByName("renderer_InheritVelocityMaxCurve");

  @ignoreClone
  private _emitterVelocity = new Vector3();
  @ignoreClone
  private _previousWorldPosition = new Vector3();
  @ignoreClone
  private _hasPreviousWorldPosition = false;
  @ignoreClone
  private _currentMacro: ShaderMacro;
  @ignoreClone
  private _curveMacro: ShaderMacro;
  @ignoreClone
  private _randomMacro: ShaderMacro;
  private _mode = ParticleInheritVelocityMode.Initial;

  /** Whether to capture the Entity velocity at birth or follow it while the particle is alive. */
  get mode(): ParticleInheritVelocityMode {
    return this._mode;
  }

  set mode(value: ParticleInheritVelocityMode) {
    if (value !== this._mode) {
      this._mode = value;
      this._resyncEmitterVelocity();
      this._generator._setTransformFeedback();
    }
  }

  /** Scale applied to the inherited velocity. */
  @deepClone
  curve = new ParticleCompositeCurve(0);

  /** @internal */
  @ignoreClone
  readonly _curveRand = new Rand(0, ParticleRandomSubSeeds.InheritVelocity);

  override get enabled(): boolean {
    return this._enabled;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      this._resyncEmitterVelocity();
      this._generator._setTransformFeedback();
    }
  }

  /** @internal */
  _updateEmitterVelocity(elapsedTime: number): void {
    if (!this._usesEmitterVelocity()) {
      this._emitterVelocity.set(0, 0, 0);
      this._hasPreviousWorldPosition = false;
      return;
    }

    const worldPosition = this._generator._renderer.entity.transform.worldPosition;
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

  /** @internal */
  _resyncEmitterVelocity(): void {
    this._emitterVelocity.set(0, 0, 0);
    this._hasPreviousWorldPosition = false;
  }

  /** @internal */
  _getInitialVelocity(normalizedAge: number, out: Vector3): boolean {
    if (
      !this._enabled ||
      this._mode !== ParticleInheritVelocityMode.Initial ||
      this._generator.main.simulationSpace !== ParticleSimulationSpace.World
    ) {
      out.set(0, 0, 0);
      return false;
    }

    const factor = this.curve.evaluate(normalizedAge, this._curveRand.random());
    const velocity = this._emitterVelocity;
    out.set(velocity.x * factor, velocity.y * factor, velocity.z * factor);
    return factor !== 0 && (velocity.x !== 0 || velocity.y !== 0 || velocity.z !== 0);
  }

  /** @internal */
  _updateShaderData(shaderData: ShaderData): void {
    let currentMacro: ShaderMacro = null;
    let curveMacro: ShaderMacro = null;
    let randomMacro: ShaderMacro = null;

    if (this._needTransformFeedback()) {
      const curve = this.curve;
      currentMacro = InheritVelocityModule._currentMacro;
      shaderData.setVector3(InheritVelocityModule._velocityProperty, this._emitterVelocity);
      if (curve.mode === ParticleCurveMode.Curve || curve.mode === ParticleCurveMode.TwoCurves) {
        curveMacro = InheritVelocityModule._curveModeMacro;
        shaderData.setFloatArray(InheritVelocityModule._maxCurveProperty, curve.curveMax._getTypeArray());
        if (curve.mode === ParticleCurveMode.TwoCurves) {
          randomMacro = InheritVelocityModule._randomModeMacro;
          shaderData.setFloatArray(InheritVelocityModule._minCurveProperty, curve.curveMin._getTypeArray());
        }
      } else {
        curveMacro = InheritVelocityModule._constantModeMacro;
        shaderData.setFloat(InheritVelocityModule._maxConstantProperty, curve.constantMax);
        if (curve.mode === ParticleCurveMode.TwoConstants) {
          randomMacro = InheritVelocityModule._randomModeMacro;
          shaderData.setFloat(InheritVelocityModule._minConstantProperty, curve.constantMin);
        }
      }
    }

    this._currentMacro = this._enableMacro(shaderData, this._currentMacro, currentMacro);
    this._curveMacro = this._enableMacro(shaderData, this._curveMacro, curveMacro);
    this._randomMacro = this._enableMacro(shaderData, this._randomMacro, randomMacro);
  }

  /** @internal */
  _needTransformFeedback(): boolean {
    return (
      this._enabled &&
      this._mode === ParticleInheritVelocityMode.Current &&
      this._generator.main.simulationSpace === ParticleSimulationSpace.World &&
      this._generator._renderer.engine._hardwareRenderer.isWebGL2
    );
  }

  /** @internal */
  _isCurrentRandom(): boolean {
    return this._needTransformFeedback() && this.curve._isRandomMode();
  }

  /** @internal */
  _resetRandomSeed(seed: number): void {
    this._curveRand.reset(seed, ParticleRandomSubSeeds.InheritVelocity);
  }

  private _usesEmitterVelocity(): boolean {
    return (
      this._enabled &&
      this._generator.main.simulationSpace === ParticleSimulationSpace.World &&
      (this._mode === ParticleInheritVelocityMode.Initial ||
        this._generator._renderer.engine._hardwareRenderer.isWebGL2)
    );
  }
}
