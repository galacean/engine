import { Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";

/**
 * Force over lifetime module.
 */
export class ForceOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _modeConstantMacro = ShaderMacro.getByName("RENDERER_FOL_CONSTANT_MODE");
  static readonly _modeCurveMacro = ShaderMacro.getByName("RENDERER_FOL_CURVE_MODE");
  static readonly _modeRandomMacro = ShaderMacro.getByName("RENDERER_FOL_IS_RANDOM_TWO");

  static readonly _minConstantProperty = ShaderProperty.getByName("renderer_FOLMinConst");
  static readonly _maxConstantProperty = ShaderProperty.getByName("renderer_FOLMaxConst");
  static readonly _minGradientXProperty = ShaderProperty.getByName("renderer_FOLMinGradientX");
  static readonly _minGradientYProperty = ShaderProperty.getByName("renderer_FOLMinGradientY");
  static readonly _minGradientZProperty = ShaderProperty.getByName("renderer_FOLMinGradientZ");
  static readonly _maxGradientXProperty = ShaderProperty.getByName("renderer_FOLMaxGradientX");
  static readonly _maxGradientYProperty = ShaderProperty.getByName("renderer_FOLMaxGradientY");
  static readonly _maxGradientZProperty = ShaderProperty.getByName("renderer_FOLMaxGradientZ");
  static readonly _spaceProperty = ShaderProperty.getByName("renderer_FOLSpace");

  /** @internal */
  @ignoreClone
  _forceRand = new Rand(0, ParticleRandomSubSeeds.ForceOverLifetime);

  @ignoreClone
  private _forceMinConstant = new Vector3();
  @ignoreClone
  private _forceMaxConstant = new Vector3();
  @ignoreClone
  private _forceMacro: ShaderMacro;
  @ignoreClone
  private _randomModeMacro: ShaderMacro;

  @deepClone
  private _forceX: ParticleCompositeCurve;
  @deepClone
  private _forceY: ParticleCompositeCurve;
  @deepClone
  private _forceZ: ParticleCompositeCurve;
  private _space = ParticleSimulationSpace.Local;

  /**
   * Force over lifetime for x axis.
   */
  get forceX(): ParticleCompositeCurve {
    return this._forceX;
  }

  set forceX(value: ParticleCompositeCurve) {
    const lastValue = this._forceX;
    if (value !== lastValue) {
      this._forceX = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Force over lifetime for y axis.
   */
  get forceY(): ParticleCompositeCurve {
    return this._forceY;
  }

  set forceY(value: ParticleCompositeCurve) {
    const lastValue = this._forceY;
    if (value !== lastValue) {
      this._forceY = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Force over lifetime for z axis.
   */
  get forceZ(): ParticleCompositeCurve {
    return this._forceZ;
  }

  set forceZ(value: ParticleCompositeCurve) {
    const lastValue = this._forceZ;
    if (value !== lastValue) {
      this._forceZ = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Force space.
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

  constructor(generator: ParticleGenerator) {
    super(generator);

    this.forceX = new ParticleCompositeCurve(0);
    this.forceY = new ParticleCompositeCurve(0);
    this.forceZ = new ParticleCompositeCurve(0);
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let forceModeMacro = <ShaderMacro>null;
    let isRandomModeMacro = <ShaderMacro>null;

    if (this.enabled) {
      const forceX = this._forceX;
      const forceY = this._forceY;
      const forceZ = this._forceZ;

      const isRandomCurveMode =
        forceX.mode === ParticleCurveMode.TwoCurves &&
        forceY.mode === ParticleCurveMode.TwoCurves &&
        forceZ.mode === ParticleCurveMode.TwoCurves;

      if (
        isRandomCurveMode ||
        (forceX.mode === ParticleCurveMode.Curve &&
          forceY.mode === ParticleCurveMode.Curve &&
          forceZ.mode === ParticleCurveMode.Curve)
      ) {
        shaderData.setFloatArray(ForceOverLifetimeModule._maxGradientXProperty, forceX.curveMax._getTypeArray());
        shaderData.setFloatArray(ForceOverLifetimeModule._maxGradientYProperty, forceY.curveMax._getTypeArray());
        shaderData.setFloatArray(ForceOverLifetimeModule._maxGradientZProperty, forceZ.curveMax._getTypeArray());
        forceModeMacro = ForceOverLifetimeModule._modeCurveMacro;
        if (isRandomCurveMode) {
          shaderData.setFloatArray(ForceOverLifetimeModule._minGradientXProperty, forceX.curveMin._getTypeArray());
          shaderData.setFloatArray(ForceOverLifetimeModule._minGradientYProperty, forceY.curveMin._getTypeArray());
          shaderData.setFloatArray(ForceOverLifetimeModule._minGradientZProperty, forceZ.curveMin._getTypeArray());
          isRandomModeMacro = ForceOverLifetimeModule._modeRandomMacro;
        }
      } else {
        const constantMax = this._forceMaxConstant;
        constantMax.set(forceX.constantMax, forceY.constantMax, forceZ.constantMax);
        shaderData.setVector3(ForceOverLifetimeModule._maxConstantProperty, constantMax);
        forceModeMacro = ForceOverLifetimeModule._modeConstantMacro;
        if (
          forceX.mode === ParticleCurveMode.TwoConstants &&
          forceY.mode === ParticleCurveMode.TwoConstants &&
          forceZ.mode === ParticleCurveMode.TwoConstants
        ) {
          const constantMin = this._forceMinConstant;
          constantMin.set(forceX.constantMin, forceY.constantMin, forceZ.constantMin);
          shaderData.setVector3(ForceOverLifetimeModule._minConstantProperty, constantMin);
          isRandomModeMacro = ForceOverLifetimeModule._modeRandomMacro;
        }
      }

      shaderData.setInt(ForceOverLifetimeModule._spaceProperty, this._space);
    }
    const { _enableMacro: enableMacro } = this;
    this._forceMacro = enableMacro(shaderData, this._forceMacro, forceModeMacro);
    this._randomModeMacro = enableMacro(shaderData, this._randomModeMacro, isRandomModeMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._forceRand.reset(seed, ParticleRandomSubSeeds.ForceOverLifetime);
  }

  /**
   * @internal
   */
  _isRandomMode(): boolean {
    const { forceX, forceY, forceZ } = this;
    return (
      (forceX.mode === ParticleCurveMode.TwoCurves &&
        forceY.mode === ParticleCurveMode.TwoCurves &&
        forceZ.mode === ParticleCurveMode.TwoCurves) ||
      (forceX.mode === ParticleCurveMode.TwoConstants &&
        forceY.mode === ParticleCurveMode.TwoConstants &&
        forceZ.mode === ParticleCurveMode.TwoConstants)
    );
  }
}
