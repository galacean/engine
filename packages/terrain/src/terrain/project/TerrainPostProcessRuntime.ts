import {
  BloomDownScaleMode,
  BloomEffect,
  Camera,
  Color,
  ColorAdjustmentsEffect,
  PostProcess,
  Script,
  SunLensFlareEffect,
  TonemappingEffect,
  TonemappingMode,
  Vector3,
  VolumetricLightEffect,
  VolumetricLightQuality
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
  /** Mutable procedural sun lens flare and ghosting controls. */
  readonly sunLensFlare: {
    readonly enabled: boolean;
    readonly depthOcclusion: boolean;
    readonly temporalSmoothing: number;
    readonly intensity: number;
    readonly glareIntensity: number;
    readonly ghostIntensity: number;
    readonly ghostSpread: number;
    readonly ghostChromaticity: number;
    readonly tintR: number;
    readonly tintG: number;
    readonly tintB: number;
  };
  /** Mutable engine-native Uber-pass volumetric light shaft controls. */
  readonly volumetricLight: {
    readonly enabled: boolean;
    readonly quality: VolumetricLightQuality;
    readonly intensity: number;
    readonly threshold: number;
    readonly density: number;
    readonly decay: number;
    readonly softKnee: number;
    readonly skyDepthThreshold: number;
    readonly anisotropy: number;
    readonly extinction: number;
    readonly maxDistance: number;
    readonly heightFalloff: number;
    readonly baseHeight: number;
    readonly bilateralSharpness: number;
  };
}

/** Detached state of this profile's native effects, independent of shared pass material caches. */
export interface TerrainPostProcessShaderWarmupState {
  readonly enabled: boolean;
  readonly bloom: boolean;
  readonly bloomHighQuality: boolean;
  readonly bloomDirt: boolean;
  readonly colorAdjustments: boolean;
  readonly sunLensFlare: boolean;
  readonly sunDirectionOverride?: readonly [x: number, y: number, z: number];
  readonly volumetricLight?: boolean;
  readonly volumetricLightQuality?: VolumetricLightQuality;
  readonly volumetricLightHeightFog?: boolean;
  readonly tonemappingMode?: number;
}

/** Owns the engine-native Uber effects used by the Terrain demo. */
export class TerrainPostProcessRuntime extends Script {
  private _config: TerrainPostProcessRuntimeConfig | null = null;
  private _postProcess: PostProcess | null = null;
  private _colorAdjustments: ColorAdjustmentsEffect | null = null;
  private _tonemapping: TonemappingEffect | null = null;
  private _bloom: BloomEffect | null = null;
  private _sunLensFlare: SunLensFlareEffect | null = null;
  private _volumetricLight: VolumetricLightEffect | null = null;
  private _profileEnabled = true;
  private _colorAdjustmentsEnabled = true;
  private _tonemappingEnabled = true;
  private _tonemappingMode = TonemappingMode.ACES;
  private _bloomEnabled = true;
  private readonly _bloomTint = new Color(1, 1, 1, 1);
  private _sunLensFlareEnabled = true;
  private _sunLensFlareDepthOcclusion = true;
  private _sunLensFlareTemporalSmoothing = 0.08;
  private _sunLensFlareIntensity = 0.85;
  private _sunLensFlareGlareIntensity = 0.75;
  private _sunLensFlareGhostIntensity = 1.2;
  private _sunLensFlareGhostSpread = 1;
  private _sunLensFlareGhostChromaticity = 0.8;
  private readonly _sunLensFlareTint = new Color(1, 0.94, 0.84, 1);
  private readonly _sunLensFlareSolarDirection = new Vector3(0, 0, 0);
  private _sunLensFlareSolarAttenuation = 1;
  private readonly _sunLensFlareSolarColor = new Color(1, 1, 1, 1);
  private _volumetricLightEnabled = false;
  private _volumetricLightQuality: VolumetricLightQuality = VolumetricLightQuality.Low;
  private _volumetricLightIntensity = 0.6;
  private _volumetricLightThreshold = 0.18;
  private _volumetricLightDensity = 0.72;
  private _volumetricLightDecay = 0.93;
  private _volumetricLightSoftKnee = 0.6;
  private _volumetricLightSkyDepthThreshold = 0.9997;
  private _volumetricLightAnisotropy = 0.72;
  private _volumetricLightExtinction = 0.035;
  private _volumetricLightMaxDistance = 80;
  private _volumetricLightHeightFalloff = 0;
  private _volumetricLightBaseHeight = 0;
  private _volumetricLightBilateralSharpness = 12;
  private readonly _volumetricLightSolarDirection = new Vector3(0, 0, 0);
  private _volumetricLightSolarVisibility = 1;
  private _manualOverrides: TerrainPostProcessManualOverrides = {};

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
    bloom.maxIterations.value = 4;
    bloom.threshold.value = config.bloomThreshold;
    bloom.intensity.value = config.bloomIntensity;
    bloom.scatter.value = config.bloomScatter;
    bloom.tint.value.copyFrom(this._bloomTint);

    const sunLensFlare = postProcess.addEffect(SunLensFlareEffect)!;
    sunLensFlare.intensity.value = this._sunLensFlareIntensity * this._sunLensFlareSolarAttenuation;
    sunLensFlare.glareIntensity.value = this._sunLensFlareGlareIntensity;
    sunLensFlare.ghostIntensity.value = this._sunLensFlareGhostIntensity;
    sunLensFlare.ghostSpread.value = this._sunLensFlareGhostSpread;
    sunLensFlare.ghostChromaticity.value = this._sunLensFlareGhostChromaticity;
    sunLensFlare.depthOcclusion.value = this._sunLensFlareDepthOcclusion;
    sunLensFlare.temporalSmoothing.value = this._sunLensFlareTemporalSmoothing;
    sunLensFlare.sunDirectionOverride.value.copyFrom(this._sunLensFlareSolarDirection);

    const volumetricLight = postProcess.addEffect(VolumetricLightEffect)!;
    volumetricLight.enabled = this._profileEnabled && this._volumetricLightEnabled;
    volumetricLight.sunDirectionOverride.value.copyFrom(this._volumetricLightSolarDirection);
    volumetricLight.solarVisibility.value = this._volumetricLightSolarVisibility;

    this._postProcess = postProcess;
    this._colorAdjustments = colorAdjustments;
    this._tonemapping = tonemapping;
    this._bloom = bloom;
    this._sunLensFlare = sunLensFlare;
    this._volumetricLight = volumetricLight;
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

  /** Enables or disables the procedural sun lens flare and ghosting effect. */
  setSunLensFlareEnabled(enabled: boolean): void {
    this._sunLensFlareEnabled = enabled;
    this._applySunLensFlare();
  }

  /** Enables or disables camera-depth occlusion for the procedural sun lens flare. */
  setSunLensFlareDepthOcclusion(enabled: boolean): void {
    this._sunLensFlareDepthOcclusion = enabled;
    this._applySunLensFlare();
  }

  /** Sets the GPU 1x1 temporal smoothing time constant in seconds for occlusion visibility. */
  setSunLensFlareTemporalSmoothing(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 0.5) {
      throw new RangeError("Terrain sun lens flare temporal smoothing must be finite and in [0, 0.5]");
    }
    this._sunLensFlareTemporalSmoothing = seconds;
    this._applySunLensFlare();
  }

  /** Sets the base linear HDR intensity of the sun lens flare before weather/day-night attenuation. */
  setSunLensFlareIntensity(intensity: number): void {
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 4) {
      throw new RangeError("Terrain sun lens flare intensity must be finite and in [0, 4]");
    }
    this._sunLensFlareIntensity = intensity;
    this._applySunLensFlare();
  }

  /** Sets the sun core glow and starburst frills multiplier. */
  setSunLensFlareGlareIntensity(intensity: number): void {
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 4) {
      throw new RangeError("Terrain sun lens flare glare intensity must be finite and in [0, 4]");
    }
    this._sunLensFlareGlareIntensity = intensity;
    this._applySunLensFlare();
  }

  /** Sets the circular and hexagonal ghost chain multiplier. */
  setSunLensFlareGhostIntensity(intensity: number): void {
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 4) {
      throw new RangeError("Terrain sun lens flare ghost intensity must be finite and in [0, 4]");
    }
    this._sunLensFlareGhostIntensity = intensity;
    this._applySunLensFlare();
  }

  /** Sets the ghost spread scale along the optical axis. */
  setSunLensFlareGhostSpread(spread: number): void {
    if (!Number.isFinite(spread) || spread < 0.25 || spread > 2.5) {
      throw new RangeError("Terrain sun lens flare ghost spread must be finite and in [0.25, 2.5]");
    }
    this._sunLensFlareGhostSpread = spread;
    this._applySunLensFlare();
  }

  /** Sets the spectral rainbow dispersion saturation on ghosts. */
  setSunLensFlareGhostChromaticity(chromaticity: number): void {
    if (!Number.isFinite(chromaticity) || chromaticity < 0 || chromaticity > 1) {
      throw new RangeError("Terrain sun lens flare ghost chromaticity must be finite and in [0, 1]");
    }
    this._sunLensFlareGhostChromaticity = chromaticity;
    this._applySunLensFlare();
  }

  /** Sets the authored linear RGB tint of the sun lens flare. */
  setSunLensFlareTint(red: number, green: number, blue: number): void {
    for (const [name, value] of Object.entries({ red, green, blue })) {
      if (!Number.isFinite(value) || value < 0 || value > 4) {
        throw new RangeError(`Terrain sun lens flare tint ${name} must be finite and in [0, 4]`);
      }
    }
    this._sunLensFlareTint.set(red, green, blue, 1);
    this._applySunLensFlare();
  }

  /**
   * Synchronizes the astronomical sun direction, day/weather attenuation, and atmospheric sun tint
   * from the lighting runtime without overriding the artist-facing intensity controls.
   */
  setSunLensFlareSolarState(
    sunDirection: Readonly<Vector3>,
    attenuation: number,
    colorR: number,
    colorG: number,
    colorB: number
  ): void {
    if (!Number.isFinite(attenuation) || attenuation < 0) {
      throw new RangeError("Terrain sun lens flare solar attenuation must be finite and non-negative");
    }
    this._sunLensFlareSolarDirection.set(sunDirection.x, sunDirection.y, sunDirection.z);
    this._sunLensFlareSolarAttenuation = Math.min(Math.max(attenuation, 0), 1);
    this._sunLensFlareSolarColor.set(Math.max(0, colorR), Math.max(0, colorG), Math.max(0, colorB), 1);
    this._applySunLensFlare();
  }

  /** Native Uber-pass volumetric light effect instance owned by this post-process profile. */
  get volumetricLightEffect(): VolumetricLightEffect | null {
    return this._volumetricLight;
  }

  /** Enables or disables the engine-native Uber-pass volumetric light effect. */
  setVolumetricLightEnabled(enabled: boolean): void {
    this._volumetricLightEnabled = enabled;
    this._applyVolumetricLight();
  }

  /** Sets the volumetric light quality tier (`Low`, `Medium`, or `High`). */
  setVolumetricLightQuality(quality: VolumetricLightQuality): void {
    if (
      quality !== VolumetricLightQuality.Low &&
      quality !== VolumetricLightQuality.Medium &&
      quality !== VolumetricLightQuality.High
    ) {
      throw new RangeError("Terrain volumetric light quality must be Low, Medium, or High");
    }
    this._volumetricLightQuality = quality;
    this._applyVolumetricLight();
  }

  /** Sets Cornette-Shanks forward scattering anisotropy `g` (`-0.9..0.95`, Medium/High). */
  setVolumetricLightAnisotropy(anisotropy: number): void {
    if (!Number.isFinite(anisotropy) || anisotropy < -0.9 || anisotropy > 0.95) {
      throw new RangeError("Terrain volumetric light anisotropy must be finite and in [-0.9, 0.95]");
    }
    this._volumetricLightAnisotropy = anisotropy;
    this._applyVolumetricLight();
  }

  /** Sets atmospheric extinction / scattering density (`0.001..0.25`, Medium/High). */
  setVolumetricLightExtinction(extinction: number): void {
    if (!Number.isFinite(extinction) || extinction < 0.001 || extinction > 0.25) {
      throw new RangeError("Terrain volumetric light extinction must be finite and in [0.001, 0.25]");
    }
    this._volumetricLightExtinction = extinction;
    this._applyVolumetricLight();
  }

  /** Sets max 3D raymarching distance in meters (`5..500`, Medium/High). */
  setVolumetricLightMaxDistance(maxDistance: number): void {
    if (!Number.isFinite(maxDistance) || maxDistance < 5 || maxDistance > 500) {
      throw new RangeError("Terrain volumetric light maxDistance must be finite and in [5, 500]");
    }
    this._volumetricLightMaxDistance = maxDistance;
    this._applyVolumetricLight();
  }

  /** Sets exponential altitude falloff (`0..1`, Medium/High). */
  setVolumetricLightHeightFalloff(heightFalloff: number): void {
    if (!Number.isFinite(heightFalloff) || heightFalloff < 0 || heightFalloff > 1) {
      throw new RangeError("Terrain volumetric light heightFalloff must be finite and in [0, 1]");
    }
    this._volumetricLightHeightFalloff = heightFalloff;
    this._applyVolumetricLight();
  }

  /** Sets base world-space altitude for exponential height falloff (`-500..500`, Medium/High). */
  setVolumetricLightBaseHeight(baseHeight: number): void {
    if (!Number.isFinite(baseHeight) || baseHeight < -500 || baseHeight > 500) {
      throw new RangeError("Terrain volumetric light baseHeight must be finite and in [-500, 500]");
    }
    this._volumetricLightBaseHeight = baseHeight;
    this._applyVolumetricLight();
  }

  /** Sets depth-edge sharpness for bilateral blur & upsample (`0.5..64`, Medium/High). */
  setVolumetricLightBilateralSharpness(sharpness: number): void {
    if (!Number.isFinite(sharpness) || sharpness < 0.5 || sharpness > 64) {
      throw new RangeError("Terrain volumetric light bilateralSharpness must be finite and in [0.5, 64]");
    }
    this._volumetricLightBilateralSharpness = sharpness;
    this._applyVolumetricLight();
  }

  /** Sets overall linear intensity of volumetric light shafts (`0..2.5`). */
  setVolumetricLightIntensity(intensity: number): void {
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 2.5) {
      throw new RangeError("Terrain volumetric light intensity must be finite and in [0, 2.5]");
    }
    this._volumetricLightIntensity = intensity;
    this._applyVolumetricLight();
  }

  /** Sets soft-knee luminance extraction threshold (`0..4`, Low mode). */
  setVolumetricLightThreshold(threshold: number): void {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 4) {
      throw new RangeError("Terrain volumetric light threshold must be finite and in [0, 4]");
    }
    this._volumetricLightThreshold = threshold;
    this._applyVolumetricLight();
  }

  /** Sets radial ray march density span (`0.2..1.5`). */
  setVolumetricLightDensity(density: number): void {
    if (!Number.isFinite(density) || density < 0.2 || density > 1.5) {
      throw new RangeError("Terrain volumetric light density must be finite and in [0.2, 1.5]");
    }
    this._volumetricLightDensity = density;
    this._applyVolumetricLight();
  }

  /** Sets per-step exponential retention decay (`0.75..0.99`). */
  setVolumetricLightDecay(decay: number): void {
    if (!Number.isFinite(decay) || decay < 0.75 || decay > 0.99) {
      throw new RangeError("Terrain volumetric light decay must be finite and in [0.75, 0.99]");
    }
    this._volumetricLightDecay = decay;
    this._applyVolumetricLight();
  }

  /** Sets soft highlight roll-off (`0..1`). */
  setVolumetricLightSoftKnee(softKnee: number): void {
    if (!Number.isFinite(softKnee) || softKnee < 0 || softKnee > 1) {
      throw new RangeError("Terrain volumetric light softKnee must be finite and in [0, 1]");
    }
    this._volumetricLightSoftKnee = softKnee;
    this._applyVolumetricLight();
  }

  /** Sets depth threshold separating unoccluded sky gaps from foreground geometry (`0.9..0.99998`). */
  setVolumetricLightSkyDepthThreshold(threshold: number): void {
    if (!Number.isFinite(threshold) || threshold < 0.9 || threshold > 0.99998) {
      throw new RangeError("Terrain volumetric light skyDepthThreshold must be finite and in [0.9, 0.99998]");
    }
    this._volumetricLightSkyDepthThreshold = threshold;
    this._applyVolumetricLight();
  }

  /** Synchronizes the astronomical sun direction and day/weather visibility gate for volumetric light shafts. */
  setVolumetricLightSolarState(sunDirection: Readonly<Vector3>, solarVisibility: number): void {
    if (!Number.isFinite(solarVisibility) || solarVisibility < 0) {
      throw new RangeError("Terrain volumetric light solar visibility must be finite and non-negative");
    }
    this._volumetricLightSolarDirection.set(sunDirection.x, sunDirection.y, sunDirection.z);
    this._volumetricLightSolarVisibility = Math.min(Math.max(solarVisibility, 0), 1);
    this._applyVolumetricLight();
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
    if (!this._postProcess || !this._bloom || !this._tonemapping || !this._colorAdjustments || !this._sunLensFlare) {
      return undefined;
    }
    const enabled = this._profileEnabled && this._postProcess.enabled;
    const bloom = enabled && this._bloom.isValid();
    const volumetricLight = enabled && Boolean(this._volumetricLight?.isValid());
    const overrideDir =
      this._sunLensFlare.sunDirectionOverride.value.lengthSquared() > 1e-6
        ? this._sunLensFlare.sunDirectionOverride.value
        : this._volumetricLight?.sunDirectionOverride.value;
    const sunDirectionOverride =
      overrideDir && overrideDir.lengthSquared() > 1e-6
        ? Object.freeze([overrideDir.x, overrideDir.y, overrideDir.z] as const)
        : undefined;
    return Object.freeze({
      enabled,
      bloom,
      bloomHighQuality: bloom && this._bloom.highQualityFiltering.value,
      bloomDirt: bloom && Boolean(this._bloom.dirtTexture.value),
      colorAdjustments: enabled && this._colorAdjustments.isValid(),
      sunLensFlare: enabled && this._sunLensFlare.isValid(),
      ...(sunDirectionOverride ? { sunDirectionOverride } : {}),
      volumetricLight,
      ...(volumetricLight
        ? {
            volumetricLightQuality: this._volumetricLight!.quality.value,
            volumetricLightHeightFog: this._volumetricLight!.heightFalloff.value > 1e-4
          }
        : {}),
      tonemappingMode: enabled && this._tonemapping.isValid() ? this._tonemapping.mode.value : undefined
    });
  }

  /** Captures the current profile and which values follow the weather presets. */
  captureDebugReset(): () => void {
    const initial = this.getDebugSnapshot();
    const overrides = { ...this._manualOverrides };
    return () => {
      const { colorAdjustments: color, bloom, sunLensFlare, volumetricLight } = initial;
      this.setProfileEnabled(initial.enabled);
      this.setColorAdjustmentsEnabled(color.enabled);
      this.setPostExposure(color.postExposure);
      this.setTemperature(color.temperature);
      this.setTint(color.tint);
      this.setContrast(color.contrast);
      this.setSaturation(color.saturation);
      this.setTonemappingMode(initial.tonemappingMode);
      this.setTonemappingEnabled(initial.tonemapping);
      this.setBloomEnabled(bloom.enabled);
      this.setBloomTint(bloom.tintR, bloom.tintG, bloom.tintB);
      this.setBloomThreshold(bloom.threshold);
      this.setBloomIntensity(bloom.intensity);
      this.setBloomScatter(bloom.scatter);
      this.setSunLensFlareEnabled(sunLensFlare.enabled);
      this.setSunLensFlareDepthOcclusion(sunLensFlare.depthOcclusion);
      this.setSunLensFlareTemporalSmoothing(sunLensFlare.temporalSmoothing);
      this.setSunLensFlareIntensity(sunLensFlare.intensity);
      this.setSunLensFlareGlareIntensity(sunLensFlare.glareIntensity);
      this.setSunLensFlareGhostIntensity(sunLensFlare.ghostIntensity);
      this.setSunLensFlareGhostSpread(sunLensFlare.ghostSpread);
      this.setSunLensFlareGhostChromaticity(sunLensFlare.ghostChromaticity);
      this.setSunLensFlareTint(sunLensFlare.tintR, sunLensFlare.tintG, sunLensFlare.tintB);
      this.setVolumetricLightEnabled(volumetricLight.enabled);
      this.setVolumetricLightQuality(volumetricLight.quality);
      this.setVolumetricLightIntensity(volumetricLight.intensity);
      this.setVolumetricLightThreshold(volumetricLight.threshold);
      this.setVolumetricLightDensity(volumetricLight.density);
      this.setVolumetricLightDecay(volumetricLight.decay);
      this.setVolumetricLightSoftKnee(volumetricLight.softKnee);
      this.setVolumetricLightSkyDepthThreshold(volumetricLight.skyDepthThreshold);
      this.setVolumetricLightAnisotropy(volumetricLight.anisotropy);
      this.setVolumetricLightExtinction(volumetricLight.extinction);
      this.setVolumetricLightMaxDistance(volumetricLight.maxDistance);
      this.setVolumetricLightHeightFalloff(volumetricLight.heightFalloff);
      this.setVolumetricLightBaseHeight(volumetricLight.baseHeight);
      this.setVolumetricLightBilateralSharpness(volumetricLight.bilateralSharpness);
      this._manualOverrides = { ...overrides };
    };
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
      },
      sunLensFlare: {
        enabled: this._sunLensFlareEnabled,
        depthOcclusion: this._sunLensFlareDepthOcclusion,
        temporalSmoothing: this._sunLensFlareTemporalSmoothing,
        intensity: this._sunLensFlareIntensity,
        glareIntensity: this._sunLensFlareGlareIntensity,
        ghostIntensity: this._sunLensFlareGhostIntensity,
        ghostSpread: this._sunLensFlareGhostSpread,
        ghostChromaticity: this._sunLensFlareGhostChromaticity,
        tintR: this._sunLensFlareTint.r,
        tintG: this._sunLensFlareTint.g,
        tintB: this._sunLensFlareTint.b
      },
      volumetricLight: {
        enabled: this._volumetricLightEnabled,
        quality: this._volumetricLightQuality,
        intensity: this._volumetricLightIntensity,
        threshold: this._volumetricLightThreshold,
        density: this._volumetricLightDensity,
        decay: this._volumetricLightDecay,
        softKnee: this._volumetricLightSoftKnee,
        skyDepthThreshold: this._volumetricLightSkyDepthThreshold,
        anisotropy: this._volumetricLightAnisotropy,
        extinction: this._volumetricLightExtinction,
        maxDistance: this._volumetricLightMaxDistance,
        heightFalloff: this._volumetricLightHeightFalloff,
        baseHeight: this._volumetricLightBaseHeight,
        bilateralSharpness: this._volumetricLightBilateralSharpness
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
    this._sunLensFlare = null;
    this._volumetricLight = null;
  }

  private _applyProfileEnabled(): void {
    this._applyColorAdjustments();
    this._applyTonemapping();
    this._applyBloom();
    this._applySunLensFlare();
    this._applyVolumetricLight();
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

  private _applySunLensFlare(): void {
    const sunLensFlare = this._sunLensFlare;
    if (!sunLensFlare) return;
    sunLensFlare.enabled = this._profileEnabled && this._sunLensFlareEnabled;
    sunLensFlare.intensity.value = this._sunLensFlareIntensity * this._sunLensFlareSolarAttenuation;
    sunLensFlare.glareIntensity.value = this._sunLensFlareGlareIntensity;
    sunLensFlare.ghostIntensity.value = this._sunLensFlareGhostIntensity;
    sunLensFlare.ghostSpread.value = this._sunLensFlareGhostSpread;
    sunLensFlare.ghostChromaticity.value = this._sunLensFlareGhostChromaticity;
    sunLensFlare.depthOcclusion.value = this._sunLensFlareDepthOcclusion;
    sunLensFlare.temporalSmoothing.value = this._sunLensFlareTemporalSmoothing;
    sunLensFlare.sunDirectionOverride.value.copyFrom(this._sunLensFlareSolarDirection);
    sunLensFlare.tint.value.set(
      this._sunLensFlareTint.r * this._sunLensFlareSolarColor.r,
      this._sunLensFlareTint.g * this._sunLensFlareSolarColor.g,
      this._sunLensFlareTint.b * this._sunLensFlareSolarColor.b,
      1
    );
  }

  private _applyVolumetricLight(): void {
    const volumetricLight = this._volumetricLight;
    if (!volumetricLight) return;
    volumetricLight.enabled = this._profileEnabled && this._volumetricLightEnabled;
    volumetricLight.quality.value = this._volumetricLightQuality;
    volumetricLight.intensity.value = this._volumetricLightIntensity;
    volumetricLight.threshold.value = this._volumetricLightThreshold;
    volumetricLight.density.value = this._volumetricLightDensity;
    volumetricLight.decay.value = this._volumetricLightDecay;
    volumetricLight.softKnee.value = this._volumetricLightSoftKnee;
    volumetricLight.skyDepthThreshold.value = this._volumetricLightSkyDepthThreshold;
    volumetricLight.anisotropy.value = this._volumetricLightAnisotropy;
    volumetricLight.extinction.value = this._volumetricLightExtinction;
    volumetricLight.maxDistance.value = this._volumetricLightMaxDistance;
    volumetricLight.heightFalloff.value = this._volumetricLightHeightFalloff;
    volumetricLight.baseHeight.value = this._volumetricLightBaseHeight;
    volumetricLight.bilateralSharpness.value = this._volumetricLightBilateralSharpness;
    volumetricLight.sunDirectionOverride.value.copyFrom(this._volumetricLightSolarDirection);
    volumetricLight.solarVisibility.value = this._volumetricLightSolarVisibility;
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
