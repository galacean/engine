import { Color, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { FogMode } from "../../enums/FogMode";
import { TextureCube } from "../../texture";

/**
 * Preset weather labels used by environment lighting.
 */
export type EnvironmentWeather = "clear" | "cloudy" | "rain" | "fog" | "storm";

/**
 * Describes the scene-level lighting state that can be authored or driven at runtime.
 */
export interface EnvironmentState {
  /** Normalized time of day in [0, 1). */
  timeOfDay: number;
  /** Weather preset that influences generated sky light. */
  weather: EnvironmentWeather;

  /** Direction the sun light points to in world space. */
  sunDirection: Vector3;
  /** Sun light color. */
  sunColor: Color;
  /** Sun light intensity multiplier. */
  sunIntensity: number;
  /** Directional shadow strength. */
  shadowStrength: number;

  /** Procedural sky tint. */
  skyTint: Color;
  /** Procedural ground tint. */
  groundTint: Color;
  /** Procedural sky exposure. */
  skyExposure: number;
  /** Procedural atmosphere thickness. */
  atmosphereThickness: number;

  /** Optional authored diffuse SH. If omitted, EnvironmentLighting generates one from state. */
  ambientSH?: SphericalHarmonics3;
  /** Diffuse environment intensity. */
  ambientIntensity: number;

  /** Optional specular IBL texture. */
  iblTexture?: TextureCube;
  /** Specular IBL intensity. */
  iblIntensity: number;

  /** Fog mode. */
  fogMode: FogMode;
  /** Fog color. */
  fogColor: Color;
  /** Fog density for exponential fog modes. */
  fogDensity: number;

  /** Whether screen-space ambient occlusion is enabled. */
  aoEnabled: boolean;
  /** Screen-space ambient occlusion intensity. */
  aoIntensity: number;
  /** Screen-space ambient occlusion radius. */
  aoRadius: number;
  /** Screen-space ambient occlusion power. */
  aoPower: number;
}
