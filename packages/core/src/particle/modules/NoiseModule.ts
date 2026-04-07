import { Vector3 } from "@galacean/engine-math";
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

  static readonly _strengthProperty = ShaderProperty.getByName("renderer_NoiseStrength");
  static readonly _frequencyProperty = ShaderProperty.getByName("renderer_NoiseFrequency");
  static readonly _scrollSpeedProperty = ShaderProperty.getByName("renderer_NoiseScrollSpeed");
  static readonly _octaveInfoProperty = ShaderProperty.getByName("renderer_NoiseOctaveInfo");

  @ignoreClone
  private _enabledModuleMacro: ShaderMacro;

  @ignoreClone
  private _strengthVec = new Vector3();
  @ignoreClone
  private _octaveInfoVec = new Vector3();

  @deepClone
  private _strengthX: ParticleCompositeCurve;
  @deepClone
  private _strengthY: ParticleCompositeCurve;
  @deepClone
  private _strengthZ: ParticleCompositeCurve;
  @deepClone
  private _scrollSpeed: ParticleCompositeCurve;
  private _frequency: number = 0.5;
  private _octaves: number = 1;
  private _octaveMultiplier: number = 0.5;
  private _octaveScale: number = 2.0;

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
   * Number of noise octaves (1-3).
   */
  get octaves(): number {
    return this._octaves;
  }

  set octaves(value: number) {
    value = Math.max(1, Math.min(3, Math.floor(value)));
    if (value !== this._octaves) {
      this._octaves = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Amplitude decay factor per octave.
   */
  get octaveMultiplier(): number {
    return this._octaveMultiplier;
  }

  set octaveMultiplier(value: number) {
    if (value !== this._octaveMultiplier) {
      this._octaveMultiplier = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Frequency increase factor per octave.
   */
  get octaveScale(): number {
    return this._octaveScale;
  }

  set octaveScale(value: number) {
    if (value !== this._octaveScale) {
      this._octaveScale = value;
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

      // Bake strength / frequency on CPU to keep parameters orthogonal:
      // frequency controls spatial detail, strength controls displacement amplitude.
      const invFreq = 1.0 / this._frequency;
      const strength = this._strengthVec;
      strength.set(
        this._strengthX.constantMax * invFreq,
        this._strengthY.constantMax * invFreq,
        this._strengthZ.constantMax * invFreq
      );
      shaderData.setVector3(NoiseModule._strengthProperty, strength);

      shaderData.setFloat(NoiseModule._frequencyProperty, this._frequency);
      shaderData.setFloat(NoiseModule._scrollSpeedProperty, this._scrollSpeed.constantMax);

      const octaveInfo = this._octaveInfoVec;
      octaveInfo.set(this._octaves, this._octaveMultiplier, this._octaveScale);
      shaderData.setVector3(NoiseModule._octaveInfoProperty, octaveInfo);
    }

    this._enabledModuleMacro = this._enableMacro(shaderData, this._enabledModuleMacro, enabledMacro);
  }
}
