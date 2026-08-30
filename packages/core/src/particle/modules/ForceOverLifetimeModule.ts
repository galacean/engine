import { Rand, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneDecorators";
import { ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Force over lifetime module.
 */
export class ForceOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _constantModeMacro = ShaderMacro.getByName("RENDERER_FOL_CONSTANT_MODE");
  static readonly _curveModeMacro = ShaderMacro.getByName("RENDERER_FOL_CURVE_MODE");
  static readonly _isRandomMacro = ShaderMacro.getByName("RENDERER_FOL_IS_RANDOM_TWO");

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
  private _forceMinGradientX = new Float32Array(8);
  @ignoreClone
  private _forceMinGradientY = new Float32Array(8);
  @ignoreClone
  private _forceMinGradientZ = new Float32Array(8);
  @ignoreClone
  private _forceMaxGradientX = new Float32Array(8);
  @ignoreClone
  private _forceMaxGradientY = new Float32Array(8);
  @ignoreClone
  private _forceMaxGradientZ = new Float32Array(8);
  @ignoreClone
  private _forceMacro: ShaderMacro;
  @ignoreClone
  private _randomModeMacro: ShaderMacro;

  private _forceX: ParticleCompositeCurve;
  private _forceY: ParticleCompositeCurve;
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

      const isCurveMode = forceX._isCurveMode() || forceY._isCurveMode() || forceZ._isCurveMode();
      const isRandomMode = forceX._isRandomMode() || forceY._isRandomMode() || forceZ._isRandomMode();

      if (isCurveMode) {
        shaderData.setFloatArray(
          ForceOverLifetimeModule._maxGradientXProperty,
          this._getCurveData(forceX, this._forceMaxGradientX, false)
        );
        shaderData.setFloatArray(
          ForceOverLifetimeModule._maxGradientYProperty,
          this._getCurveData(forceY, this._forceMaxGradientY, false)
        );
        shaderData.setFloatArray(
          ForceOverLifetimeModule._maxGradientZProperty,
          this._getCurveData(forceZ, this._forceMaxGradientZ, false)
        );
        forceModeMacro = ForceOverLifetimeModule._curveModeMacro;
        if (isRandomMode) {
          shaderData.setFloatArray(
            ForceOverLifetimeModule._minGradientXProperty,
            this._getCurveData(forceX, this._forceMinGradientX, true)
          );
          shaderData.setFloatArray(
            ForceOverLifetimeModule._minGradientYProperty,
            this._getCurveData(forceY, this._forceMinGradientY, true)
          );
          shaderData.setFloatArray(
            ForceOverLifetimeModule._minGradientZProperty,
            this._getCurveData(forceZ, this._forceMinGradientZ, true)
          );
          isRandomModeMacro = ForceOverLifetimeModule._isRandomMacro;
        }
      } else {
        const constantMax = this._forceMaxConstant;
        constantMax.set(forceX.constantMax, forceY.constantMax, forceZ.constantMax);
        shaderData.setVector3(ForceOverLifetimeModule._maxConstantProperty, constantMax);
        forceModeMacro = ForceOverLifetimeModule._constantModeMacro;
        if (isRandomMode) {
          const constantMin = this._forceMinConstant;
          constantMin.set(
            forceX.mode === ParticleCurveMode.TwoConstants ? forceX.constantMin : forceX.constantMax,
            forceY.mode === ParticleCurveMode.TwoConstants ? forceY.constantMin : forceY.constantMax,
            forceZ.mode === ParticleCurveMode.TwoConstants ? forceZ.constantMin : forceZ.constantMax
          );
          shaderData.setVector3(ForceOverLifetimeModule._minConstantProperty, constantMin);
          isRandomModeMacro = ForceOverLifetimeModule._isRandomMacro;
        }
      }

      shaderData.setInt(ForceOverLifetimeModule._spaceProperty, this._space);
    }
    this._forceMacro = this._enableMacro(shaderData, this._forceMacro, forceModeMacro);
    this._randomModeMacro = this._enableMacro(shaderData, this._randomModeMacro, isRandomModeMacro);
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
    return this.forceX._isRandomMode() || this.forceY._isRandomMode() || this.forceZ._isRandomMode();
  }

  private _getCurveData(curve: ParticleCompositeCurve, out: Float32Array, useMin: boolean): Float32Array {
    switch (curve.mode) {
      case ParticleCurveMode.TwoCurves:
        return (useMin ? curve.curveMin : curve.curveMax)._getTypeArray();
      case ParticleCurveMode.Curve:
        return curve.curveMax._getTypeArray();
      default: {
        const value = useMin && curve.mode === ParticleCurveMode.TwoConstants ? curve.constantMin : curve.constantMax;
        out[0] = 0;
        out[1] = value;
        out[2] = 1 / 3;
        out[3] = value;
        out[4] = 2 / 3;
        out[5] = value;
        out[6] = 1;
        out[7] = value;
        return out;
      }
    }
  }
}
