/** Opt-in single-scattering water surface, in linear RGB and inverse metres. */
export interface WaterSurfaceScattering {
  readonly coefficientPerMeter: readonly [number, number, number];
  readonly phaseG: number;
}
