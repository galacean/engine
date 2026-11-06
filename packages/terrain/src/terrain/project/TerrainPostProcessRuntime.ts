import {
  BloomDownScaleMode,
  BloomEffect,
  Camera,
  Color,
  ColorAdjustmentsEffect,
  PostProcess,
  Script,
  TonemappingEffect,
  TonemappingMode
} from "@galacean/engine";

/** Serializable post-processing profile used by the authored terrain Scene. */
export interface TerrainPostProcessRuntimeConfig {
  /** Scene camera that renders the post-processed result. */
  camera: Camera;
  /** Exposure compensation in EV stops. */
  postExposure: number;
  /** White-balance temperature in the artist-facing range. */
  temperature: number;
  /** White-balance green or magenta tint in the artist-facing range. */
  tint: number;
  /** Contrast adjustment in the artist-facing range. */
  contrast: number;
  /** Saturation adjustment in the artist-facing range. */
  saturation: number;
  /** Bloom threshold in linear color space. */
  bloomThreshold: number;
  /** Bloom contribution strength. */
  bloomIntensity: number;
  /** Bloom diffusion radius in the normalized effect range. */
  bloomScatter: number;
}

/** Complete numeric post-processing preset that can be blended without rebuilding the Uber pipeline. */
export interface TerrainPostProcessPreset {
  readonly postExposure: number;
  readonly temperature: number;
  readonly tint: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly bloomTint: readonly [red: number, green: number, blue: number];
  readonly bloomThreshold: number;
  readonly bloomIntensity: number;
  readonly bloomScatter: number;
}

/** Serializable profile values excluding the Scene-owned Camera reference. */
export type TerrainPostProcessProfile = Omit<TerrainPostProcessRuntimeConfig, "camera">;

type TerrainPostProcessManualOverrides = Partial<{
  -readonly [Key in keyof Omit<TerrainPostProcessPreset, "bloomTint">]: TerrainPostProcessPreset[Key];
}> & {
  bloomTint?: readonly [red: number, green: number, blue: number];
};

/** Mutable post-processing values exposed by the terrain demo inspector. */
export interface TerrainPostProcessDebugSnapshot {
  /** Whether the complete authored profile contributes. */
  readonly enabled: boolean;
  /** Mutable engine-native color-adjustment controls. */
  readonly colorAdjustments: {
    readonly enabled: boolean;
    readonly postExposure: number;
    readonly temperature: number;
    readonly tint: number;
    readonly contrast: number;
    readonly saturation: number;
  };
  /** Whether tonemapping contributes in the engine Uber pass. */
  readonly tonemapping: boolean;
  /** Active neutral or ACES tonemapping operator. */
  readonly tonemappingMode: TonemappingMode;
  /** Mutable Bloom controls. */
  readonly bloom: {
    readonly enabled: boolean;
    readonly threshold: number;
    readonly intensity: number;
    readonly scatter: number;
    readonly tintR: number;
    readonly tintG: number;
    readonly tintB: number;
  };
}

/** Detached state of this profile's native effects, independent of shared pass material caches. */
export interface TerrainPostProcessShaderWarmupState {
  readonly enabled: boolean;
  readonly bloom: boolean;
  readonly bloomHighQuality: boolean;
  readonly bloomDirt: boolean;
  readonly colorAdjustments: boolean;
  readonly tonemappingMode?: number;
}

/** Owns the engine-native Uber effects used by the Terrain demo. */
export class TerrainPostProcessRuntime extends Script {
  private _config: TerrainPostProcessRuntimeConfig | null = null;
  private _postProcess: PostProcess | null = null;
  private _colorAdjustments: ColorAdjustmentsEffect | null = null;
  private _tonemapping: TonemappingEffect | null = null;
  private _bloom: BloomEffect | null = null;
  private _profileEnabled = true;
  private _colorAdjustmentsEnabled = true;
  private _tonemappingEnabled = true;
  private _tonemappingMode = TonemappingMode.ACES;
  private _bloomEnabled = true;
  private readonly _bloomTint = new Color(1, 1, 1, 1);
  private readonly _manualOverrides: TerrainPostProcessManualOverrides = {};

  /** @returns Whether the authored effects currently contribute while the camera pipeline remains resident. */
  get profileEnabled(): boolean {
    return this._profileEnabled;
  }

  /** Stores serialized values without mutating Scene state during deserialization. */
  initialize(config: TerrainPostProcessRuntimeConfig): void {
    if (!config || typeof config !== "object") {
      throw new Error("Terrain post-processing configuration must be an object");
    }
    if (!(config.camera instanceof Camera)) {
      throw new Error("Terrain post-processing configuration did not resolve its Scene Camera reference");
    }
    const contrast = config.contrast ?? 0;
    const saturation = config.saturation ?? 0;
    for (const [name, value] of Object.entries({
      postExposure: config.postExposure,
      temperature: config.temperature,
      tint: config.tint,
      contrast,
      saturation,
      bloomThreshold: config.bloomThreshold,
      bloomIntensity: config.bloomIntensity,
      bloomScatter: config.bloomScatter
    })) {
      if (!Number.isFinite(value)) throw new Error(`Terrain post-processing ${name} must be finite`);
    }
    if (config.bloomThreshold < 0 || config.bloomIntensity < 0) {
      throw new Error("Terrain post-processing bloom threshold and intensity must be non-negative");
    }
    if (config.bloomScatter < 0 || config.bloomScatter > 1) {
      throw new Error("Terrain post-processing bloom scatter must be in [0, 1]");
    }
    validateColorAdjustmentRange(config.temperature, "temperature");
    validateColorAdjustmentRange(config.tint, "tint");
    validateColorAdjustmentRange(contrast, "contrast");
    validateColorAdjustmentRange(saturation, "saturation");
    this._config = { ...config, contrast, saturation, postExposure: clampPostExposure(config.postExposure) };
  }

  /** Replaces serialized authoring values before the first frame while retaining resolved Scene references. */
  applyAuthoringProfile(profile: Readonly<TerrainPostProcessProfile>): void {
    const config = this._config;
    if (!config) throw new Error("Terrain post-processing profile requires initialized Scene references");
    if (this._postProcess) {
      throw new Error("Terrain post-processing authoring profile must be applied before the first rendered frame");
    }
    this.initialize({ camera: config.camera, ...profile });
  }

  /** Creates and applies the configured global profile before the first rendered frame. */
  override onStart(): void {
    const config = this._config;
    if (!config) throw new Error("Terrain post-processing runtime was started before initialization");
    if (config.camera.scene !== this.scene) {
      throw new Error("Terrain post-processing Camera must belong to the same Scene");
    }

    config.camera.enableHDR = true;
    config.camera.enablePostProcess = true;
    const postProcess = this.entity.addComponent(PostProcess);
    postProcess.isGlobal = true;

    const colorAdjustments = postProcess.addEffect(ColorAdjustmentsEffect)!;
    colorAdjustments.postExposure.value = config.postExposure;
    colorAdjustments.temperature.value = config.temperature;
    colorAdjustments.tint.value = config.tint;
    colorAdjustments.contrast.value = config.contrast;
    colorAdjustments.saturation.value = config.saturation;

    const tonemapping = postProcess.addEffect(TonemappingEffect)!;
    tonemapping.mode.value = this._tonemappingMode;

    const bloom = postProcess.addEffect(BloomEffect)!;
    bloom.downScale.value = BloomDownScaleMode.Quarter;
    bloom.threshold.value = config.bloomThreshold;
    bloom.intensity.value = config.bloomIntensity;
    bloom.scatter.value = config.bloomScatter;
    bloom.tint.value.copyFrom(this._bloomTint);

    this._postProcess = postProcess;
    this._colorAdjustments = colorAdjustments;
    this._tonemapping = tonemapping;
    this._bloom = bloom;
    this._applyProfileEnabled();
  }

  /** Includes or bypasses the native Uber effects without rebuilding the profile. */
  setProfileEnabled(enabled: boolean): void {
    if (enabled === this._profileEnabled) return;
    this._profileEnabled = enabled;
    this._applyProfileEnabled();
  }

  /** Enables or disables the engine-native tonemapping effect. */
  setTonemappingEnabled(enabled: boolean): void {
    this._tonemappingEnabled = enabled;
    this._applyTonemapping();
  }

  /** Enables or disables the engine-native color-adjustment effect. */
  setColorAdjustmentsEnabled(enabled: boolean): void {
    this._colorAdjustmentsEnabled = enabled;
    this._applyColorAdjustments();
  }

  /** Selects the engine-native Neutral or ACES tonemapping operator. */
  setTonemappingMode(mode: TonemappingMode): void {
    if (mode !== TonemappingMode.Neutral && mode !== TonemappingMode.ACES) {
      throw new RangeError("Terrain post-processing tonemapping mode is unsupported");
    }
    this._tonemappingMode = mode;
    this._applyTonemapping();
  }

  /** Enables or disables Bloom without discarding its authored values. */
  setBloomEnabled(enabled: boolean): void {
    this._bloomEnabled = enabled;
    this._applyBloom();
  }

  /** Overrides the weather-authored linear HDR threshold used by Bloom. */
  setBloomThreshold(threshold: number): void {
    this._setBloomThreshold(threshold);
    this._manualOverrides.bloomThreshold = threshold;
    this._applyBloom();
  }

  /** Overrides the weather-authored Bloom contribution strength. */
  setBloomIntensity(intensity: number): void {
    this._setBloomIntensity(intensity);
    this._manualOverrides.bloomIntensity = intensity;
    this._applyBloom();
  }

  /** Overrides the weather-authored normalized Bloom diffusion. */
  setBloomScatter(scatter: number): void {
    this._setBloomScatter(scatter);
    this._manualOverrides.bloomScatter = scatter;
    this._applyBloom();
  }

  /** Overrides the weather-authored linear RGB multiplier applied to Bloom in the engine Uber pass. */
  setBloomTint(red: number, green: number, blue: number): void {
    this._setBloomTint(red, green, blue);
    this._manualOverrides.bloomTint = [red, green, blue];
    this._applyBloom();
  }

  /** Overrides weather-authored native Uber exposure compensation in EV stops. */
  setPostExposure(postExposure: number): void {
    const clampedExposure = clampPostExposure(postExposure);
    this._manualOverrides.postExposure = clampedExposure;
    this._setColorAdjustment("postExposure", clampedExposure);
    this._applyColorAdjustments();
  }

  /** Overrides weather-authored native Uber white-balance temperature. */
  setTemperature(temperature: number): void {
    this._setColorAdjustment("temperature", temperature);
    this._manualOverrides.temperature = temperature;
    this._applyColorAdjustments();
  }

  /** Overrides weather-authored native Uber white-balance green/magenta tint. */
  setTint(tint: number): void {
    this._setColorAdjustment("tint", tint);
    this._manualOverrides.tint = tint;
    this._applyColorAdjustments();
  }

  /** Overrides weather-authored native Uber contrast around linear middle gray. */
  setContrast(contrast: number): void {
    this._setColorAdjustment("contrast", contrast);
    this._manualOverrides.contrast = contrast;
    this._applyColorAdjustments();
  }

  /** Overrides weather-authored native Uber luminance-preserving saturation. */
  setSaturation(saturation: number): void {
    this._setColorAdjustment("saturation", saturation);
    this._manualOverrides.saturation = saturation;
    this._applyColorAdjustments();
  }

  /** Blends two resident Uber presets and applies an optional weather exposure offset. */
  applyBlendedPreset(
    first: Readonly<TerrainPostProcessPreset>,
    second: Readonly<TerrainPostProcessPreset>,
    blend: number,
    postExposureOffset = 0
  ): void {
    if (!Number.isFinite(blend) || blend < 0 || blend > 1) {
      throw new RangeError("Terrain post-processing preset blend must be finite and in [0, 1]");
    }
    if (!Number.isFinite(postExposureOffset)) {
      throw new RangeError("Terrain post-processing exposure offset must be finite");
    }
    const interpolate = (firstValue: number, secondValue: number): number =>
      firstValue + (secondValue - firstValue) * blend;
    const overrides = this._manualOverrides;
    this._setColorAdjustment(
      "postExposure",
      overrides.postExposure ?? interpolate(first.postExposure, second.postExposure) + postExposureOffset
    );
    this._setColorAdjustment(
      "temperature",
      overrides.temperature ?? interpolate(first.temperature, second.temperature)
    );
    this._setColorAdjustment("tint", overrides.tint ?? interpolate(first.tint, second.tint));
    this._setColorAdjustment("contrast", overrides.contrast ?? interpolate(first.contrast, second.contrast));
    this._setColorAdjustment("saturation", overrides.saturation ?? interpolate(first.saturation, second.saturation));
    const bloomTint = overrides.bloomTint;
    this._setBloomTint(
      bloomTint?.[0] ?? interpolate(first.bloomTint[0], second.bloomTint[0]),
      bloomTint?.[1] ?? interpolate(first.bloomTint[1], second.bloomTint[1]),
      bloomTint?.[2] ?? interpolate(first.bloomTint[2], second.bloomTint[2])
    );
    this._setBloomThreshold(overrides.bloomThreshold ?? interpolate(first.bloomThreshold, second.bloomThreshold));
    this._setBloomIntensity(overrides.bloomIntensity ?? interpolate(first.bloomIntensity, second.bloomIntensity));
    this._setBloomScatter(overrides.bloomScatter ?? interpolate(first.bloomScatter, second.bloomScatter));
    this._applyColorAdjustments();
    this._applyBloom();
  }

  /** Returns detached values for dat.gui and browser assertions. */
  getShaderWarmupState(): TerrainPostProcessShaderWarmupState | undefined {
    if (!this._postProcess || !this._bloom || !this._tonemapping || !this._colorAdjustments) return undefined;
    const enabled = this._profileEnabled && this._postProcess.enabled;
    const bloom = enabled && this._bloom.isValid();
    return Object.freeze({
      enabled,
      bloom,
      bloomHighQuality: bloom && this._bloom.highQualityFiltering.value,
      bloomDirt: bloom && Boolean(this._bloom.dirtTexture.value),
      colorAdjustments: enabled && this._colorAdjustments.isValid(),
      tonemappingMode: enabled && this._tonemapping.isValid() ? this._tonemapping.mode.value : undefined
    });
  }

  getDebugSnapshot(): TerrainPostProcessDebugSnapshot {
    const config = this._config;
    return {
      enabled: this._profileEnabled,
      colorAdjustments: {
        enabled: this._colorAdjustmentsEnabled,
        postExposure: config?.postExposure ?? 0,
        temperature: config?.temperature ?? 0,
        tint: config?.tint ?? 0,
        contrast: config?.contrast ?? 0,
        saturation: config?.saturation ?? 0
      },
      tonemapping: this._tonemappingEnabled,
      tonemappingMode: this._tonemappingMode,
      bloom: {
        enabled: this._bloomEnabled,
        threshold: config?.bloomThreshold ?? 0,
        intensity: config?.bloomIntensity ?? 0,
        scatter: config?.bloomScatter ?? 0,
        tintR: this._bloomTint.r,
        tintG: this._bloomTint.g,
        tintB: this._bloomTint.b
      }
    };
  }

  /** Restores the owned global profile after this runtime is re-enabled. */
  override onEnable(): void {
    this.setProfileEnabled(true);
  }

  /** Temporarily removes the owned global profile without destroying its parameters. */
  override onDisable(): void {
    this.setProfileEnabled(false);
  }

  /** Releases the runtime-owned global profile. */
  override onDestroy(): void {
    this._postProcess?.destroy();
    this._postProcess = null;
    this._colorAdjustments = null;
    this._tonemapping = null;
    this._bloom = null;
  }

  private _applyProfileEnabled(): void {
    this._applyColorAdjustments();
    this._applyTonemapping();
    this._applyBloom();
  }

  private _setColorAdjustment(
    key: "postExposure" | "temperature" | "tint" | "contrast" | "saturation",
    value: number
  ): void {
    if (key === "postExposure") value = clampPostExposure(value);
    else validateColorAdjustmentRange(value, key);
    if (this._config) this._config[key] = value;
  }

  private _setBloomThreshold(threshold: number): void {
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new RangeError("Terrain Bloom threshold must be finite and non-negative");
    }
    if (this._config) this._config.bloomThreshold = threshold;
  }

  private _setBloomIntensity(intensity: number): void {
    if (!Number.isFinite(intensity) || intensity < 0) {
      throw new RangeError("Terrain Bloom intensity must be finite and non-negative");
    }
    if (this._config) this._config.bloomIntensity = intensity;
  }

  private _setBloomScatter(scatter: number): void {
    if (!Number.isFinite(scatter) || scatter < 0 || scatter > 1) {
      throw new RangeError("Terrain Bloom scatter must be finite and in [0, 1]");
    }
    if (this._config) this._config.bloomScatter = scatter;
  }

  private _setBloomTint(red: number, green: number, blue: number): void {
    for (const [name, value] of Object.entries({ red, green, blue })) {
      if (!Number.isFinite(value) || value < 0 || value > 4) {
        throw new RangeError(`Terrain Bloom tint ${name} must be finite and in [0, 4]`);
      }
    }
    this._bloomTint.set(red, green, blue, 1);
  }

  private _applyColorAdjustments(): void {
    const colorAdjustments = this._colorAdjustments;
    const config = this._config;
    if (!colorAdjustments || !config) return;
    colorAdjustments.enabled = this._profileEnabled && this._colorAdjustmentsEnabled;
    colorAdjustments.postExposure.value = config.postExposure;
    colorAdjustments.temperature.value = config.temperature;
    colorAdjustments.tint.value = config.tint;
    colorAdjustments.contrast.value = config.contrast;
    colorAdjustments.saturation.value = config.saturation;
  }

  private _applyTonemapping(): void {
    const tonemapping = this._tonemapping;
    if (!tonemapping) return;
    tonemapping.enabled = this._profileEnabled && this._tonemappingEnabled;
    tonemapping.mode.value = this._tonemappingMode;
  }

  private _applyBloom(): void {
    const bloom = this._bloom;
    const config = this._config;
    if (!bloom || !config) return;
    bloom.enabled = this._profileEnabled && this._bloomEnabled;
    bloom.threshold.value = config.bloomThreshold;
    bloom.intensity.value = config.bloomIntensity;
    bloom.scatter.value = config.bloomScatter;
    bloom.tint.value.copyFrom(this._bloomTint);
  }
}

function clampPostExposure(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Terrain post-processing exposure must be finite");
  }
  return Math.min(Math.max(value, -10), 10);
}

function validateColorAdjustmentRange(value: number, name: "temperature" | "tint" | "contrast" | "saturation"): void {
  if (!Number.isFinite(value) || value < -100 || value > 100) {
    throw new RangeError(`Terrain post-processing ${name} must be finite and in [-100, 100]`);
  }
}
