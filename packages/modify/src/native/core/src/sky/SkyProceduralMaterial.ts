import { Color, Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import type { RenderContext } from "../RenderPipeline/RenderContext";
import { Material } from "../material/Material";
import { Shader, ShaderMacro } from "../shader";
import type { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";

/**
 * Sun mode.
 */
export enum SunMode {
  /** None */
  None,
  /** Simple sun. */
  Simple,
  /** High quality sun. */
  HighQuality
}

/** Direction-cache cloud composition consumed by {@link SkyProceduralMaterial}. @internal */
interface SkyProceduralVolumetricCloudComposition {
  /** Updates the shared cache and publishes its immutable composition inputs to the sky material. @internal */
  _prepareSkyComposition(context: RenderContext, target: ShaderData): void;
  /** Releases composition bindings owned by this source without destroying the sky material. @internal */
  _detachSkyComposition(target: ShaderData): void;
}

/** Frozen direction-cache composition retained for one progressive environment capture. @internal */
export interface SkyProceduralVolumetricCloudSnapshot extends SkyProceduralVolumetricCloudComposition {
  /** Stable signature of the captured cache and all decode inputs. @internal */
  readonly signature: string;
  /** Releases the cache lease after every cubemap face has consumed this snapshot. @internal */
  release(): void;
}

/** Direction-cache cloud source composited by {@link SkyProceduralMaterial}. @internal */
export interface SkyProceduralVolumetricClouds extends SkyProceduralVolumetricCloudComposition {
  /** Signature used to coalesce equivalent environment bake requests. @internal */
  readonly _skyCompositionSignature: string;
  /** Retains one immutable cache generation for a progressive environment capture. @internal */
  _acquireSkyCompositionSnapshot(): SkyProceduralVolumetricCloudSnapshot | null;
}

/**
 * Sky procedural material.
 */
export class SkyProceduralMaterial extends Material {
  private static _sunSizeProp: ShaderProperty = ShaderProperty.getByName("material_SunSize");
  private static _sunSizeConvergenceProp: ShaderProperty = ShaderProperty.getByName("material_SunSizeConvergence");
  private static _sunDirectionProp: ShaderProperty = ShaderProperty.getByName("material_SunDirection");
  private static _sunAtmosphereColorProp: ShaderProperty = ShaderProperty.getByName("material_SunAtmosphereColor");
  private static _atmosphereThicknessProp: ShaderProperty = ShaderProperty.getByName("material_AtmosphereThickness");
  private static _atmosphereHeightProp: ShaderProperty = ShaderProperty.getByName("material_AtmosphereHeight");
  private static _observerHeightProp: ShaderProperty = ShaderProperty.getByName("material_ObserverHeight");
  private static _rayleighScatteringProp: ShaderProperty = ShaderProperty.getByName("material_RayleighScattering");
  private static _rayleighScaleHeightProp: ShaderProperty = ShaderProperty.getByName("material_RayleighScaleHeight");
  private static _mieScatteringProp: ShaderProperty = ShaderProperty.getByName("material_MieScattering");
  private static _mieScaleHeightProp: ShaderProperty = ShaderProperty.getByName("material_MieScaleHeight");
  private static _mieAnisotropyProp: ShaderProperty = ShaderProperty.getByName("material_MieAnisotropy");
  private static _scatteringIntensityProp: ShaderProperty = ShaderProperty.getByName("material_ScatteringIntensity");
  private static _horizonHazeProp: ShaderProperty = ShaderProperty.getByName("material_HorizonHaze");
  private static _atmosphereSampleCountProp: ShaderProperty = ShaderProperty.getByName(
    "material_AtmosphereSampleCount"
  );
  private static _skyTintProp: ShaderProperty = ShaderProperty.getByName("material_SkyTint");
  private static _groundTintProp: ShaderProperty = ShaderProperty.getByName("material_GroundTint");
  private static _customSkyTintStrengthProp: ShaderProperty = ShaderProperty.getByName(
    "material_CustomSkyTintStrength"
  );
  private static _customSkyZenithTintProp: ShaderProperty = ShaderProperty.getByName("material_CustomSkyZenithTint");
  private static _customSkyHorizonTintProp: ShaderProperty = ShaderProperty.getByName("material_CustomSkyHorizonTint");
  private static _exposureProp: ShaderProperty = ShaderProperty.getByName("material_Exposure");
  private static _twilightIntensityProp: ShaderProperty = ShaderProperty.getByName("material_TwilightIntensity");
  private static _starIntensityProp: ShaderProperty = ShaderProperty.getByName("material_StarIntensity");
  private static _starSizeProp: ShaderProperty = ShaderProperty.getByName("material_StarSize");
  private static _starCountProp: ShaderProperty = ShaderProperty.getByName("material_StarCount");
  private static _starTwinkleIntensityProp: ShaderProperty = ShaderProperty.getByName("material_StarTwinkleIntensity");
  private static _starTwinkleSpeedProp: ShaderProperty = ShaderProperty.getByName("material_StarTwinkleSpeed");
  private static _airglowIntensityProp: ShaderProperty = ShaderProperty.getByName("material_AirglowIntensity");
  private static _starAxisProp: ShaderProperty = ShaderProperty.getByName("material_StarAxis");
  private static _starRotationProp: ShaderProperty = ShaderProperty.getByName("material_StarRotation");
  private static _moonDirectionProp: ShaderProperty = ShaderProperty.getByName("material_MoonDirection");
  private static _moonColorProp: ShaderProperty = ShaderProperty.getByName("material_MoonColor");
  private static _moonDiskIntensityProp: ShaderProperty = ShaderProperty.getByName("material_MoonDiskIntensity");
  private static _moonAtmosphereIntensityProp: ShaderProperty = ShaderProperty.getByName(
    "material_MoonAtmosphereIntensity"
  );
  private static _moonAngularRadiusProp: ShaderProperty = ShaderProperty.getByName("material_MoonAngularRadius");

  private static _sunHighQualityMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_SUN_HIGH_QUALITY");
  private static _sunSimpleMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_SUN_SIMPLE");
  private static _starPixelFootprintFilterMacro: ShaderMacro = ShaderMacro.getByName(
    "MATERIAL_STAR_PIXEL_FOOTPRINT_FILTER"
  );
  private static _volumetricCloudsMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_VOLUMETRIC_CLOUDS");

  private _sunDisk: SunMode;
  private _volumetricClouds: SkyProceduralVolumetricClouds | null = null;
  private _volumetricCloudSnapshot: SkyProceduralVolumetricCloudSnapshot | null = null;

  /**
   * Optional direction-cache clouds composited after the atmosphere and celestial bodies.
   *
   * @remarks
   * The sky borrows this source. Resource lifetime remains owned by the cloud system.
   */
  get volumetricClouds(): SkyProceduralVolumetricClouds | null {
    return this._volumetricClouds;
  }

  set volumetricClouds(value: SkyProceduralVolumetricClouds | null) {
    if (this._volumetricClouds === value) return;
    this._activeVolumetricCloudComposition?._detachSkyComposition(this.shaderData);
    this._volumetricCloudSnapshot = null;
    this._volumetricClouds = value;
    this._updateVolumetricCloudMacro();
  }

  /**
   * Sun mode.
   */
  get sunMode(): SunMode {
    return this._sunDisk;
  }

  set sunMode(value: SunMode) {
    const shaderData = this.shaderData;
    switch (value) {
      case SunMode.HighQuality:
        shaderData.disableMacro(SkyProceduralMaterial._sunSimpleMacro);
        shaderData.enableMacro(SkyProceduralMaterial._sunHighQualityMacro);
        break;
      case SunMode.Simple:
        shaderData.disableMacro(SkyProceduralMaterial._sunHighQualityMacro);
        shaderData.enableMacro(SkyProceduralMaterial._sunSimpleMacro);
        break;
      case SunMode.None:
        shaderData.disableMacro(SkyProceduralMaterial._sunHighQualityMacro);
        shaderData.disableMacro(SkyProceduralMaterial._sunSimpleMacro);
        break;
      default:
        throw "SkyBoxProceduralMaterial: unknown sun value.";
    }
    this._sunDisk = value;
  }

  /**
   * Sun size, range is 0 to 1.
   */
  get sunSize(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._sunSizeProp);
  }

  set sunSize(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._sunSizeProp, Math.min(Math.max(0.0, value), 1.0));
  }

  /**
   * Sun size convergence, range is 0 to 20.
   */
  get sunSizeConvergence(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._sunSizeConvergenceProp);
  }

  set sunSizeConvergence(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._sunSizeConvergenceProp, Math.min(Math.max(0.0, value), 20.0));
  }

  /** World-space incoming solar-light direction, independent from the Scene shadow light. */
  get sunDirection(): Vector3 {
    return this.shaderData.getVector3(SkyProceduralMaterial._sunDirectionProp);
  }

  set sunDirection(value: Vector3) {
    this.shaderData.setVector3(SkyProceduralMaterial._sunDirectionProp, value);
  }

  /** Extraterrestrial solar irradiance used by the atmosphere independently from the ground DirectLight. */
  get sunAtmosphereColor(): Color {
    return this.shaderData.getColor(SkyProceduralMaterial._sunAtmosphereColorProp);
  }

  set sunAtmosphereColor(value: Color) {
    this.shaderData.setColor(SkyProceduralMaterial._sunAtmosphereColorProp, value);
  }

  /**
   * Atmosphere thickness, range is 0 to 5.
   */
  get atmosphereThickness(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._atmosphereThicknessProp);
  }

  set atmosphereThickness(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._atmosphereThicknessProp, Math.min(Math.max(0.0, value), 5.0));
  }

  /** Atmosphere-shell height in normalized planet radii, range is 0.005 to 0.1. */
  get atmosphereHeight(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._atmosphereHeightProp);
  }

  set atmosphereHeight(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._atmosphereHeightProp, Math.min(Math.max(0.005, value), 0.1));
  }

  /** Observer altitude above the normalized planet surface, range is 0.000001 to 0.01. */
  get observerHeight(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._observerHeightProp);
  }

  set observerHeight(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._observerHeightProp, Math.min(Math.max(0.000001, value), 0.01));
  }

  /** Rayleigh scattering coefficient, range is 0 to 0.02. */
  get rayleighScattering(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._rayleighScatteringProp);
  }

  set rayleighScattering(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._rayleighScatteringProp, Math.min(Math.max(0, value), 0.02));
  }

  /** Rayleigh density scale height in normalized planet radii, range is 0.0001 to 0.05. */
  get rayleighScaleHeight(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._rayleighScaleHeightProp);
  }

  set rayleighScaleHeight(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._rayleighScaleHeightProp, Math.min(Math.max(0.0001, value), 0.05));
  }

  /** Mie scattering coefficient, range is 0 to 0.02. */
  get mieScattering(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._mieScatteringProp);
  }

  set mieScattering(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._mieScatteringProp, Math.min(Math.max(0, value), 0.02));
  }

  /** Mie density scale height in normalized planet radii, range is 0.00005 to 0.02. */
  get mieScaleHeight(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._mieScaleHeightProp);
  }

  set mieScaleHeight(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._mieScaleHeightProp, Math.min(Math.max(0.00005, value), 0.02));
  }

  /** Mie forward-scattering anisotropy, range is 0 to 0.99. */
  get mieAnisotropy(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._mieAnisotropyProp);
  }

  set mieAnisotropy(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._mieAnisotropyProp, Math.min(Math.max(0, value), 0.99));
  }

  /** Solar single-scattering radiance multiplier, range is 0 to 100. */
  get scatteringIntensity(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._scatteringIntensityProp);
  }

  set scatteringIntensity(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._scatteringIntensityProp, Math.min(Math.max(0, value), 100));
  }

  /** Aerosol-derived apparent-horizon transition multiplier, range is 0 to 4. */
  get horizonHaze(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._horizonHazeProp);
  }

  set horizonHaze(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._horizonHazeProp, Math.min(Math.max(0, value), 4));
  }

  /** View-ray single-scattering sample count, rounded and clamped to 2 through 8. */
  get atmosphereSampleCount(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._atmosphereSampleCountProp);
  }

  set atmosphereSampleCount(value: number) {
    this.shaderData.setFloat(
      SkyProceduralMaterial._atmosphereSampleCountProp,
      Math.min(Math.max(2, Math.round(value)), 8)
    );
  }

  /**
   * Sky tint.
   */
  get skyTint(): Color {
    return this.shaderData.getColor(SkyProceduralMaterial._skyTintProp);
  }

  set skyTint(value: Color) {
    this.shaderData.setColor(SkyProceduralMaterial._skyTintProp, value);
  }

  /**
   * Ground tint.
   */
  get groundTint(): Color {
    return this.shaderData.getColor(SkyProceduralMaterial._groundTintProp);
  }

  set groundTint(value: Color) {
    this.shaderData.setColor(SkyProceduralMaterial._groundTintProp, value);
  }

  /** Strength of the artistic upper-sky tint gradient, range is 0 to 1. */
  get customSkyTintStrength(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._customSkyTintStrengthProp);
  }

  set customSkyTintStrength(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._customSkyTintStrengthProp, Math.min(Math.max(0.0, value), 1.0));
  }

  /** Linear multiplier applied to atmospheric radiance at the zenith. */
  get customSkyZenithTint(): Color {
    return this.shaderData.getColor(SkyProceduralMaterial._customSkyZenithTintProp);
  }

  set customSkyZenithTint(value: Color) {
    this.shaderData.setColor(SkyProceduralMaterial._customSkyZenithTintProp, value);
  }

  /** Linear multiplier applied to atmospheric radiance at the horizon. */
  get customSkyHorizonTint(): Color {
    return this.shaderData.getColor(SkyProceduralMaterial._customSkyHorizonTintProp);
  }

  set customSkyHorizonTint(value: Color) {
    this.shaderData.setColor(SkyProceduralMaterial._customSkyHorizonTintProp, value);
  }

  /**
   * Exposure, range is 0 to 8.
   */
  get exposure(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._exposureProp);
  }

  set exposure(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._exposureProp, Math.min(Math.max(0.0, value), 8.0));
  }

  /**
   * Twilight radiance multiplier, range is 0 to 8.
   */
  get twilightIntensity(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._twilightIntensityProp);
  }

  set twilightIntensity(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._twilightIntensityProp, Math.min(Math.max(0.0, value), 8.0));
  }

  /**
   * Procedural star radiance multiplier, range is 0 to 8.
   */
  get starIntensity(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._starIntensityProp);
  }

  set starIntensity(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._starIntensityProp, Math.min(Math.max(0.0, value), 8.0));
  }

  /**
   * Apparent procedural-star radius multiplier, range is 0 to 4.
   */
  get starSize(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._starSizeProp);
  }

  set starSize(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._starSizeProp, Math.min(Math.max(0.0, value), 4.0));
  }

  /**
   * Deterministic procedural-star population multiplier, range is 0 to 4.
   */
  get starCount(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._starCountProp);
  }

  set starCount(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._starCountProp, Math.min(Math.max(0.0, value), 4.0));
  }

  /**
   * Per-star scintillation strength, range is 0 to 1.
   */
  get starTwinkleIntensity(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._starTwinkleIntensityProp);
  }

  set starTwinkleIntensity(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._starTwinkleIntensityProp, Math.min(Math.max(0.0, value), 1.0));
  }

  /**
   * Per-star scintillation speed multiplier, range is 0 to 4.
   */
  get starTwinkleSpeed(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._starTwinkleSpeedProp);
  }

  set starTwinkleSpeed(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._starTwinkleSpeedProp, Math.min(Math.max(0.0, value), 4.0));
  }

  /**
   * Night-sky airglow radiance multiplier, range is 0 to 8.
   */
  get airglowIntensity(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._airglowIntensityProp);
  }

  set airglowIntensity(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._airglowIntensityProp, Math.min(Math.max(0.0, value), 8.0));
  }

  /**
   * World-space celestial pole used by the procedural star field.
   */
  get starAxis(): Vector3 {
    return this.shaderData.getVector3(SkyProceduralMaterial._starAxisProp);
  }

  set starAxis(value: Vector3) {
    this.shaderData.setVector3(SkyProceduralMaterial._starAxisProp, value);
  }

  /**
   * Star-field rotation around {@link starAxis}, in radians.
   */
  get starRotation(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._starRotationProp);
  }

  set starRotation(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._starRotationProp, value);
  }

  /**
   * World-space direction from the observer toward the Moon.
   */
  get moonDirection(): Vector3 {
    return this.shaderData.getVector3(SkyProceduralMaterial._moonDirectionProp);
  }

  set moonDirection(value: Vector3) {
    this.shaderData.setVector3(SkyProceduralMaterial._moonDirectionProp, value);
  }

  /**
   * Linear-space lunar radiance color after direct atmospheric extinction.
   */
  get moonColor(): Color {
    return this.shaderData.getColor(SkyProceduralMaterial._moonColorProp);
  }

  set moonColor(value: Color) {
    this.shaderData.setColor(SkyProceduralMaterial._moonColorProp, value);
  }

  /**
   * Visible lunar-disk radiance multiplier, range is 0 to 8.
   */
  get moonDiskIntensity(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._moonDiskIntensityProp);
  }

  set moonDiskIntensity(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._moonDiskIntensityProp, Math.min(Math.max(0.0, value), 8.0));
  }

  /**
   * Lunar atmospheric-scattering multiplier, range is 0 to 8.
   */
  get moonAtmosphereIntensity(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._moonAtmosphereIntensityProp);
  }

  set moonAtmosphereIntensity(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._moonAtmosphereIntensityProp, Math.min(Math.max(0.0, value), 8.0));
  }

  /**
   * Apparent lunar angular radius in radians, range is 0 to 0.02.
   */
  get moonAngularRadius(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._moonAngularRadiusProp);
  }

  set moonAngularRadius(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._moonAngularRadiusProp, Math.min(Math.max(0.0, value), 0.02));
  }

  /**
   * Constructor a SkyBoxProceduralMaterial instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("Sky/SkyProcedural"));
    this.sunMode = SunMode.HighQuality;
    this.sunSize = 0.04;
    this.sunSizeConvergence = 5;
    this.sunDirection = new Vector3(0, -1, 0);
    this.sunAtmosphereColor = new Color(1, 1, 1, 1);
    this.atmosphereThickness = 1.0;
    this.atmosphereHeight = 0.025;
    this.observerHeight = 0.000001;
    this.rayleighScattering = 0.0025;
    this.rayleighScaleHeight = 0.00625;
    this.mieScattering = 0.001;
    this.mieScaleHeight = 0.00125;
    this.mieAnisotropy = 0.76;
    this.scatteringIntensity = 20;
    this.horizonHaze = 1;
    this.atmosphereSampleCount = 6;
    this.skyTint = new Color(0.21404114048223255, 0.21404114048223255, 0.21404114048223255, 1.0);
    this.groundTint = new Color(0.11216882039252905, 0.09988709277986121, 0.09520561068319185, 1.0);
    this.customSkyTintStrength = 0;
    this.customSkyZenithTint = new Color(1, 1, 1, 1);
    this.customSkyHorizonTint = new Color(1, 1, 1, 1);
    this.exposure = 1.3;
    this.twilightIntensity = 1;
    this.starIntensity = 1;
    this.starSize = 1;
    this.starCount = 1;
    this.starTwinkleIntensity = 0;
    this.starTwinkleSpeed = 1;
    this.airglowIntensity = 1;
    this.starAxis = new Vector3(0, 1, 0);
    this.starRotation = 0;
    this.moonDirection = new Vector3(0, -1, 0);
    this.moonColor = new Color(1, 1, 1, 1);
    this.moonDiskIntensity = 0;
    this.moonAtmosphereIntensity = 0;
    this.moonAngularRadius = 0.00465;
  }

  /** Updates optional material-owned sky prepasses before the visible target is bound. @internal */
  _prepareSkyRender(context: RenderContext): void {
    this._activeVolumetricCloudComposition?._prepareSkyComposition(context, this.shaderData);
  }

  /** Signature of the live cloud source sampled by a new IBL request. @internal */
  get _volumetricCloudsSignature(): string {
    return this._volumetricClouds?._skyCompositionSignature ?? "none";
  }

  /** Acquire one stable cache generation from the live cloud source. @internal */
  _acquireVolumetricCloudSnapshot(): SkyProceduralVolumetricCloudSnapshot | null {
    return this._volumetricClouds?._acquireSkyCompositionSnapshot() ?? null;
  }

  /** Install a frozen cloud cache without exposing it as the material's live source. @internal */
  _setVolumetricCloudSnapshot(snapshot: SkyProceduralVolumetricCloudSnapshot | null): void {
    if (this._volumetricCloudSnapshot === snapshot) return;
    this._activeVolumetricCloudComposition?._detachSkyComposition(this.shaderData);
    this._volumetricCloudSnapshot = snapshot;
    this._updateVolumetricCloudMacro();
  }

  /** Enables an energy-preserving pixel-footprint convolution for sub-pixel procedural stars. @internal */
  _setStarPixelFootprintFilterEnabled(enabled: boolean): void {
    if (enabled) {
      this.shaderData.enableMacro(SkyProceduralMaterial._starPixelFootprintFilterMacro);
    } else {
      this.shaderData.disableMacro(SkyProceduralMaterial._starPixelFootprintFilterMacro);
    }
  }

  private get _activeVolumetricCloudComposition(): SkyProceduralVolumetricCloudComposition | null {
    return this._volumetricCloudSnapshot ?? this._volumetricClouds;
  }

  private _updateVolumetricCloudMacro(): void {
    if (this._activeVolumetricCloudComposition) {
      this.shaderData.enableMacro(SkyProceduralMaterial._volumetricCloudsMacro);
    } else {
      this.shaderData.disableMacro(SkyProceduralMaterial._volumetricCloudsMacro);
    }
  }

  /**
   * @inheritDoc
   */
  override clone(): SkyProceduralMaterial {
    const dest = new SkyProceduralMaterial(this._engine);
    this._cloneToAndModifyName(dest);
    dest.volumetricClouds = this._volumetricClouds;
    return dest;
  }
}
