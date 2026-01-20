import { Color, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";

/**
 * XR light estimation data.
 */
export interface IXRLightEstimate {
  /** Diffuse spherical harmonics. */
  sphericalHarmonics: SphericalHarmonics3;
  /** Main light direction in XR space. */
  primaryLightDirection: Vector3;
  /** Main light intensity (linear RGB). */
  primaryLightIntensity: Color;
}
