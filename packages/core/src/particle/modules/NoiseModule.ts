import { Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneManager";
import { ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Noise module for particle system.
 * Adds simplex noise-based turbulence displacement to particles.
 */
export class NoiseModule extends ParticleGeneratorModule {
  static readonly _enabledMacro = ShaderMacro.getByName("RENDERER_NOISE_MODULE_ENABLED");
  static readonly _dampingMacro = ShaderMacro.getByName("RENDERER_NOISE_DAMPING");

  static readonly _strengthProperty = ShaderProperty.getByName("renderer_NoiseStrength");
  static readonly _frequencyProperty = ShaderProperty.getByName("renderer_NoiseFrequency");
  static readonly _scrollSpeedProperty = ShaderProperty.getByName("renderer_NoiseScrollSpeed");
  static readonly _octaveInfoProperty = ShaderProperty.getByName("renderer_NoiseOctaveInfo");

  @ignoreClone
  private _enabledModuleMacro: ShaderMacro;
  @ignoreClone
  private _dampingModuleMacro: ShaderMacro;

  @ignoreClone
  private _strengthVec = new Vector3();
  @ignoreClone
  private _octaveInfoVec = new Vector3();

  private _strengthX: number = 1.0;
  private _strengthY: number = 1.0;
  private _strengthZ: number = 1.0;
  private _frequency: number = 0.5;
  private _scrollSpeed: number = 0.0;
  private _damping: boolean = true;
  private _octaves: number = 1;
  private _octaveMultiplier: number = 0.5;
  private _octaveScale: number = 2.0;

  /**
   * Noise strength for x axis.
   */
  get strengthX(): number {
    return this._strengthX;
  }

  set strengthX(value: number) {
    if (value !== this._strengthX) {
      this._strengthX = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Noise strength for y axis.
   */
  get strengthY(): number {
    return this._strengthY;
  }

  set strengthY(value: number) {
    if (value !== this._strengthY) {
      this._strengthY = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Noise strength for z axis.
   */
  get strengthZ(): number {
    return this._strengthZ;
  }

  set strengthZ(value: number) {
    if (value !== this._strengthZ) {
      this._strengthZ = value;
      this._generator._renderer._onGeneratorParamsChanged();
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
  get scrollSpeed(): number {
    return this._scrollSpeed;
  }

  set scrollSpeed(value: number) {
    if (value !== this._scrollSpeed) {
      this._scrollSpeed = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Whether noise strength diminishes with particle age.
   */
  get damping(): boolean {
    return this._damping;
  }

  set damping(value: boolean) {
    if (value !== this._damping) {
      this._damping = value;
      this._generator._renderer._onGeneratorParamsChanged();
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
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let enabledMacro = <ShaderMacro>null;
    let dampingMacro = <ShaderMacro>null;

    if (this.enabled) {
      enabledMacro = NoiseModule._enabledMacro;

      const strength = this._strengthVec;
      strength.set(this._strengthX, this._strengthY, this._strengthZ);
      shaderData.setVector3(NoiseModule._strengthProperty, strength);

      shaderData.setFloat(NoiseModule._frequencyProperty, this._frequency);
      shaderData.setFloat(NoiseModule._scrollSpeedProperty, this._scrollSpeed);

      const octaveInfo = this._octaveInfoVec;
      octaveInfo.set(this._octaves, this._octaveMultiplier, this._octaveScale);
      shaderData.setVector3(NoiseModule._octaveInfoProperty, octaveInfo);

      if (this._damping) {
        dampingMacro = NoiseModule._dampingMacro;
      }
    }

    this._enabledModuleMacro = this._enableMacro(shaderData, this._enabledModuleMacro, enabledMacro);
    this._dampingModuleMacro = this._enableMacro(shaderData, this._dampingModuleMacro, dampingMacro);
  }
}
