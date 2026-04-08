import { Rand, Vector3, Vector4 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Noise module for particle system.
 * Adds simplex noise-based turbulence displacement to particles.
 */
export class NoiseModule extends ParticleGeneratorModule {
  static readonly _enabledMacro = ShaderMacro.getByName("RENDERER_NOISE_MODULE_ENABLED");
  static readonly _strengthCurveMacro = ShaderMacro.getByName("RENDERER_NOISE_STRENGTH_CURVE");
  static readonly _strengthIsRandomTwoMacro = ShaderMacro.getByName("RENDERER_NOISE_STRENGTH_IS_RANDOM_TWO");
  static readonly _separateAxesMacro = ShaderMacro.getByName("RENDERER_NOISE_IS_SEPARATE");

  static readonly _noiseProperty = ShaderProperty.getByName("renderer_NoiseParams");
  static readonly _noiseOctaveProperty = ShaderProperty.getByName("renderer_NoiseOctaveParams");
  static readonly _strengthMinConstProperty = ShaderProperty.getByName("renderer_NoiseStrengthMinConst");
  static readonly _strengthMaxCurveXProperty = ShaderProperty.getByName("renderer_NoiseStrengthMaxCurveX");
  static readonly _strengthMaxCurveYProperty = ShaderProperty.getByName("renderer_NoiseStrengthMaxCurveY");
  static readonly _strengthMaxCurveZProperty = ShaderProperty.getByName("renderer_NoiseStrengthMaxCurveZ");
  static readonly _strengthMinCurveXProperty = ShaderProperty.getByName("renderer_NoiseStrengthMinCurveX");
  static readonly _strengthMinCurveYProperty = ShaderProperty.getByName("renderer_NoiseStrengthMinCurveY");
  static readonly _strengthMinCurveZProperty = ShaderProperty.getByName("renderer_NoiseStrengthMinCurveZ");

  @ignoreClone
  private _enabledModuleMacro: ShaderMacro;
  @ignoreClone
  private _strengthCurveModeMacro: ShaderMacro;
  @ignoreClone
  private _strengthIsRandomTwoModeMacro: ShaderMacro;
  @ignoreClone
  private _separateAxesModeMacro: ShaderMacro;

  /** @internal */
  @ignoreClone
  _noiseRand = new Rand(0, ParticleRandomSubSeeds.Noise);

  @ignoreClone
  private _noiseParams = new Vector4();
  @ignoreClone
  private _noiseOctaveParams = new Vector4();
  @ignoreClone
  private _strengthMinConst = new Vector3();

  @deepClone
  private _strengthX: ParticleCompositeCurve;
  @deepClone
  private _strengthY: ParticleCompositeCurve;
  @deepClone
  private _strengthZ: ParticleCompositeCurve;
  @deepClone
  private _scrollSpeed: ParticleCompositeCurve;
  private _separateAxes: boolean = false;
  private _frequency: number = 0.5;
  private _octaveCount: number = 1;
  private _octavePersistence: number = 0.5;
  private _octaveLacunarity: number = 2.0;

  /**
   * Specifies whether the strength is separate on each axis, when disabled, only `strength` is used.
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
   * Noise strength. When `separateAxes` is disabled, applies to all axes.
   * When `separateAxes` is enabled, applies only to x axis.
   */
  get strengthX(): ParticleCompositeCurve {
    return this._strengthX;
  }

  set strengthX(value: ParticleCompositeCurve) {
    const lastValue = this._strengthX;
    if (value !== lastValue) {
      this._strengthX = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Noise strength for y axis, used when `separateAxes` is enabled.
   */
  get strengthY(): ParticleCompositeCurve {
    return this._strengthY;
  }

  set strengthY(value: ParticleCompositeCurve) {
    const lastValue = this._strengthY;
    if (value !== lastValue) {
      this._strengthY = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Noise strength for z axis, used when `separateAxes` is enabled.
   */
  get strengthZ(): ParticleCompositeCurve {
    return this._strengthZ;
  }

  set strengthZ(value: ParticleCompositeCurve) {
    const lastValue = this._strengthZ;
    if (value !== lastValue) {
      this._strengthZ = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Noise spatial frequency.
   */
  get frequency(): number {
    return this._frequency;
  }

  set frequency(value: number) {
    value = Math.max(1e-6, value);
    if (value !== this._frequency) {
      this._frequency = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Noise field scroll speed over time.
   */
  get scrollSpeed(): ParticleCompositeCurve {
    return this._scrollSpeed;
  }

  set scrollSpeed(value: ParticleCompositeCurve) {
    const lastValue = this._scrollSpeed;
    if (value !== lastValue) {
      this._scrollSpeed = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * Number of noise octave layers (1-3).
   */
  get octaveCount(): number {
    return this._octaveCount;
  }

  set octaveCount(value: number) {
    value = Math.max(1, Math.min(3, Math.floor(value)));
    if (value !== this._octaveCount) {
      this._octaveCount = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Persistence (amplitude retention) for each successive octave, only effective when `octaveCount` > 1.
   * Each layer retains this fraction of the previous layer's intensity, range [0, 1].
   */
  get octavePersistence(): number {
    return this._octavePersistence;
  }

  set octavePersistence(value: number) {
    value = Math.max(0, Math.min(1, value));
    if (value !== this._octavePersistence) {
      this._octavePersistence = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Lacunarity (frequency scaling) for each successive octave, only effective when `octaveCount` > 1.
   * Each layer samples at this multiple of the previous layer's frequency, range [1, 4].
   */
  get octaveLacunarity(): number {
    return this._octaveLacunarity;
  }

  set octaveLacunarity(value: number) {
    value = Math.max(1, Math.min(4, value));
    if (value !== this._octaveLacunarity) {
      this._octaveLacunarity = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  override get enabled(): boolean {
    return this._enabled;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      if (value && !this._generator._renderer.engine._hardwareRenderer.isWebGL2) {
        return;
      }
      this._enabled = value;
      this._generator._setTransformFeedback(value);
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  constructor(generator: ParticleGenerator) {
    super(generator);

    this.strengthX = new ParticleCompositeCurve(1);
    this.strengthY = new ParticleCompositeCurve(1);
    this.strengthZ = new ParticleCompositeCurve(1);
    this.scrollSpeed = new ParticleCompositeCurve(0);
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let enabledMacro = <ShaderMacro>null;
    let strengthCurveMacro = <ShaderMacro>null;
    let strengthIsRandomTwoMacro = <ShaderMacro>null;
    let separateAxesMacro = <ShaderMacro>null;
    if (this.enabled) {
      enabledMacro = NoiseModule._enabledMacro;

      const strengthX = this._strengthX;
      const strengthY = this._strengthY;
      const strengthZ = this._strengthZ;
      const separateAxes = this._separateAxes;

      // Determine strength curve mode (following SOL pattern)
      const isRandomCurveMode = separateAxes
        ? strengthX.mode === ParticleCurveMode.TwoCurves &&
          strengthY.mode === ParticleCurveMode.TwoCurves &&
          strengthZ.mode === ParticleCurveMode.TwoCurves
        : strengthX.mode === ParticleCurveMode.TwoCurves;

      const isCurveMode =
        isRandomCurveMode ||
        (separateAxes
          ? strengthX.mode === ParticleCurveMode.Curve &&
            strengthY.mode === ParticleCurveMode.Curve &&
            strengthZ.mode === ParticleCurveMode.Curve
          : strengthX.mode === ParticleCurveMode.Curve);

      const isRandomConstMode = separateAxes
        ? strengthX.mode === ParticleCurveMode.TwoConstants &&
          strengthY.mode === ParticleCurveMode.TwoConstants &&
          strengthZ.mode === ParticleCurveMode.TwoConstants
        : strengthX.mode === ParticleCurveMode.TwoConstants;

      // noiseParams.w = frequency (always needed)
      const noiseParams = this._noiseParams;

      if (isCurveMode) {
        // Curve/TwoCurves: encode curve data as float arrays
        shaderData.setFloatArray(NoiseModule._strengthMaxCurveXProperty, strengthX.curveMax._getTypeArray());
        if (separateAxes) {
          shaderData.setFloatArray(NoiseModule._strengthMaxCurveYProperty, strengthY.curveMax._getTypeArray());
          shaderData.setFloatArray(NoiseModule._strengthMaxCurveZProperty, strengthZ.curveMax._getTypeArray());
        }
        if (isRandomCurveMode) {
          shaderData.setFloatArray(NoiseModule._strengthMinCurveXProperty, strengthX.curveMin._getTypeArray());
          if (separateAxes) {
            shaderData.setFloatArray(NoiseModule._strengthMinCurveYProperty, strengthY.curveMin._getTypeArray());
            shaderData.setFloatArray(NoiseModule._strengthMinCurveZProperty, strengthZ.curveMin._getTypeArray());
          }
          strengthIsRandomTwoMacro = NoiseModule._strengthIsRandomTwoMacro;
        }
        strengthCurveMacro = NoiseModule._strengthCurveMacro;

        // xyz unused in curve mode, just set frequency
        noiseParams.set(0, 0, 0, this._frequency);
      } else {
        // Constant/TwoConstants: pack strength into noiseParams.xyz
        if (separateAxes) {
          noiseParams.set(strengthX.constantMax, strengthY.constantMax, strengthZ.constantMax, this._frequency);
        } else {
          const s = strengthX.constantMax;
          noiseParams.set(s, s, s, this._frequency);
        }

        if (isRandomConstMode) {
          const minConst = this._strengthMinConst;
          if (separateAxes) {
            minConst.set(strengthX.constantMin, strengthY.constantMin, strengthZ.constantMin);
          } else {
            const sMin = strengthX.constantMin;
            minConst.set(sMin, sMin, sMin);
          }
          shaderData.setVector3(NoiseModule._strengthMinConstProperty, minConst);
          strengthIsRandomTwoMacro = NoiseModule._strengthIsRandomTwoMacro;
        }
      }
      shaderData.setVector4(NoiseModule._noiseProperty, noiseParams);

      if (separateAxes) {
        separateAxesMacro = NoiseModule._separateAxesMacro;
      }

      const noiseOctaveParams = this._noiseOctaveParams;
      noiseOctaveParams.set(
        this._scrollSpeed.constantMax,
        this._octaveCount,
        this._octavePersistence,
        this._octaveLacunarity
      );
      shaderData.setVector4(NoiseModule._noiseOctaveProperty, noiseOctaveParams);
    }

    this._enabledModuleMacro = this._enableMacro(shaderData, this._enabledModuleMacro, enabledMacro);
    this._strengthCurveModeMacro = this._enableMacro(shaderData, this._strengthCurveModeMacro, strengthCurveMacro);
    this._strengthIsRandomTwoModeMacro = this._enableMacro(
      shaderData,
      this._strengthIsRandomTwoModeMacro,
      strengthIsRandomTwoMacro
    );
    this._separateAxesModeMacro = this._enableMacro(shaderData, this._separateAxesModeMacro, separateAxesMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._noiseRand.reset(seed, ParticleRandomSubSeeds.Noise);
  }
}
