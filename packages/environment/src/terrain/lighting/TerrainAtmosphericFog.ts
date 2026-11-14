import { Color, type SphericalHarmonics3 } from "@galacean/engine-math";
import type { Scene } from "@galacean/engine-core";

const DIRECTIONAL_SKY_MACRO = "SCENE_FOG_DIRECTIONAL_SKY";
const SKY_RADIANCE_PROPERTY = "scene_FogSkySH";
const FOG_TINT_PROPERTY = "scene_FogTint";
const SH_ZERO_BAND_BASIS = 0.282095;

/** Artist-authored fog color source and distance metric, independent of extinction density. */
export interface TerrainFogAppearance {
  readonly skyDriven: boolean;
  readonly color: readonly [number, number, number];
  /** Camera-space depth matches the URP distance-fog projection. */
  readonly cameraDepth: boolean;
}

/** Binds fog aerial perspective to the same directional sky radiance used by realtime IBL. */
export class TerrainAtmosphericFog {
  private readonly _sphericalMean = new Color();
  private readonly _tint = new Color(1, 1, 1, 1);
  private readonly _effectiveTint = new Color(1, 1, 1, 1);
  private _radianceIntensity = 1;
  private _destroyed = false;
  private _appearance: TerrainFogAppearance = {
    skyDriven: true,
    color: [0.5309734, 0.53028953, 0.6132076],
    cameraDepth: false
  };

  /** Returns detached authoring state for the fog controls. */
  getAppearance(): TerrainFogAppearance {
    return { ...this._appearance, color: [...this._appearance.color] };
  }

  /** Selects shader variants without changing the sky or environment lighting. */
  setAppearance(values: Partial<TerrainFogAppearance>): void {
    const next = { ...this._appearance, ...values };
    if (next.color.length !== 3 || next.color.some((v) => !Number.isFinite(v) || v < 0))
      throw new RangeError("Fog color must contain three non-negative finite channels");
    this._appearance = { ...next, color: [...next.color] };
    const data = this._scene.shaderData;
    if (next.skyDriven) data.enableMacro(DIRECTIONAL_SKY_MACRO);
    else {
      data.disableMacro(DIRECTIONAL_SKY_MACRO);
      this._scene.fogColor.set(...next.color, 1);
    }
    if (next.cameraDepth) data.enableMacro("SCENE_FOG_CAMERA_DEPTH");
    else data.disableMacro("SCENE_FOG_CAMERA_DEPTH");
  }

  /** Enables the directional fog shader path owned by this Scene runtime. */
  constructor(private readonly _scene: Scene) {
    _scene.shaderData.enableMacro(DIRECTIONAL_SKY_MACRO);
    _scene.shaderData.setColor(FOG_TINT_PROPERTY, this._tint);
  }

  /** Linear RGB multiplier applied only to directional fog radiance. */
  get tint(): Readonly<Color> {
    return this._tint;
  }

  /** Scalar exposure applied to environment-lit fog radiance before the RGB tint. */
  get radianceIntensity(): number {
    return this._radianceIntensity;
  }

  /** Updates the environment-radiance exposure without replacing the procedural-sky source. */
  setRadianceIntensity(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError("Terrain atmospheric fog radiance intensity must be finite and non-negative");
    }
    this._radianceIntensity = value;
    this._publishEffectiveTint();
  }

  /** Updates the artist-authored directional fog tint without modifying ambient-light SH. */
  setTint(red: number, green: number, blue: number): void {
    if (![red, green, blue].every(Number.isFinite) || red < 0 || green < 0 || blue < 0) {
      throw new RangeError("Terrain atmospheric fog tint must contain finite non-negative channels");
    }
    this._tint.set(red, green, blue, 1);
    this._publishEffectiveTint();
  }

  /** Publishes raw sky-radiance SH without adding time keys, tints, or disk radiance. */
  update(environment: SphericalHarmonics3): Color;
  update(environment: undefined): undefined;
  update(environment: SphericalHarmonics3 | undefined): Color | undefined {
    // Project loading intentionally leaves AmbientLight without a file-backed SH.
    // The realtime baker publishes the first runtime-owned value on its first update.
    if (!environment) {
      return undefined;
    }
    const scene = this._scene;
    const coefficients = environment.coefficients;
    const tint = this._tint;
    scene.shaderData.setFloatArray(SKY_RADIANCE_PROPERTY, coefficients);

    const mean = this._sphericalMean;
    mean.set(
      Math.max(0, coefficients[0] * SH_ZERO_BAND_BASIS * tint.r * this._radianceIntensity),
      Math.max(0, coefficients[1] * SH_ZERO_BAND_BASIS * tint.g * this._radianceIntensity),
      Math.max(0, coefficients[2] * SH_ZERO_BAND_BASIS * tint.b * this._radianceIntensity),
      1
    );
    if (this._appearance.skyDriven) scene.fogColor.copyFrom(mean);
    scene.background.solidColor.copyFrom(mean);
    return mean;
  }

  /** Restores the standard direction-independent Scene fog shader path. */
  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._scene.shaderData.disableMacro(DIRECTIONAL_SKY_MACRO);
    this._scene.shaderData.disableMacro("SCENE_FOG_CAMERA_DEPTH");
    this._destroyed = true;
  }

  private _publishEffectiveTint(): void {
    const intensity = this._radianceIntensity;
    const tint = this._tint;
    this._effectiveTint.set(tint.r * intensity, tint.g * intensity, tint.b * intensity, 1);
    this._scene.shaderData.setColor(FOG_TINT_PROPERTY, this._effectiveTint);
  }
}
