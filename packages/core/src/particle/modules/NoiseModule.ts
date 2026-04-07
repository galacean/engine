import { Vector4 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Noise module for particle system.
 * Adds simplex noise-based turbulence displacement to particles.
 */
export class NoiseModule extends ParticleGeneratorModule {
  static readonly _enabledMacro = ShaderMacro.getByName("RENDERER_NOISE_MODULE_ENABLED");

  static readonly _noiseParamsProperty = ShaderProperty.getByName("renderer_NoiseParams");
  static readonly _noiseOctaveParamsProperty = ShaderProperty.getByName("renderer_NoiseOctaveParams");

  @ignoreClone
  private _enabledModuleMacro: ShaderMacro;

  @ignoreClone
  private _noiseParams = new Vector4();
  @ignoreClone
  private _noiseOctaveParams = new Vector4();

  @deepClone
  private _strengthX: ParticleCompositeCurve;
  @deepClone
  private _strengthY: ParticleCompositeCurve;
  @deepClone
  private _strengthZ: ParticleCompositeCurve;
  @deepClone
  private _scrollSpeed: ParticleCompositeCurve;
  private _frequency: number = 0.5;
  private _octaveCount: number = 1;
  private _octaveIntensityMultiplier: number = 0.5;
  private _octaveFrequencyMultiplier: number = 2.0;

  /**
   * Noise strength for x axis.
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
   * Noise strength for y axis.
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
   * Noise strength for z axis.
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
   * Intensity multiplier for each successive octave.
   * Each layer's contribution is scaled by this factor relative to the previous layer, range [0, 1].
   */
  get octaveIntensityMultiplier(): number {
    return this._octaveIntensityMultiplier;
  }

  set octaveIntensityMultiplier(value: number) {
    value = Math.max(0, Math.min(1, value));
    if (value !== this._octaveIntensityMultiplier) {
      this._octaveIntensityMultiplier = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Frequency multiplier for each successive octave.
   * Each layer samples at this multiple of the previous layer's frequency, range [1, 4].
   */
  get octaveFrequencyMultiplier(): number {
    return this._octaveFrequencyMultiplier;
  }

  set octaveFrequencyMultiplier(value: number) {
    value = Math.max(1, Math.min(4, value));
    if (value !== this._octaveFrequencyMultiplier) {
      this._octaveFrequencyMultiplier = value;
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

    if (this.enabled) {
      enabledMacro = NoiseModule._enabledMacro;

      // Pack into 2 vec4s to reduce uniform slot usage.
      // noiseParams = (strengthX/freq, strengthY/freq, strengthZ/freq, frequency)
      // noiseOctaveParams = (scrollSpeed, octaveCount, octaveIntensityMul, octaveFreqMul)
      const invFreq = 1.0 / this._frequency;
      const noiseParams = this._noiseParams;
      noiseParams.set(
        this._strengthX.constantMax * invFreq,
        this._strengthY.constantMax * invFreq,
        this._strengthZ.constantMax * invFreq,
        this._frequency
      );
      shaderData.setVector4(NoiseModule._noiseParamsProperty, noiseParams);

      const noiseOctaveParams = this._noiseOctaveParams;
      noiseOctaveParams.set(
        this._scrollSpeed.constantMax,
        this._octaveCount,
        this._octaveIntensityMultiplier,
        this._octaveFrequencyMultiplier
      );
      shaderData.setVector4(NoiseModule._noiseOctaveParamsProperty, noiseOctaveParams);
    }

    this._enabledModuleMacro = this._enableMacro(shaderData, this._enabledModuleMacro, enabledMacro);
  }
}
