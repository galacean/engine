/**
 * Diffuse mode.
 */
export enum DiffuseMode {
  /** Solid color mode. */
  SolidColor,

  /**
   * SH mode
   * @remarks
   * Use SH3 to represent irradiance environment maps efficiently, allowing for interactive rendering of diffuse objects under distant illumination.
   */
  SphericalHarmonics
}
