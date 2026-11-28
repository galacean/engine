/** Sampling-safe, continuous limits for finite Ocean vertex displacement. */
export const OCEAN_GEOMETRY_WAVE_BANDLIMIT = Object.freeze({
  minimumSamplesPerWavelength: 2,
  fullSamplesPerWavelength: 4,
  minimumProjectedPixelsPerWavelength: 2,
  fullProjectedPixelsPerWavelength: 6,
  distanceFadeStartWavelengths: 12,
  distanceFadeEndWavelengths: 48,
  grazingFadeStartSine: 0.035,
  grazingFadeEndSine: 0.14,
  minimumDisplacementAmplitudeMetres: 0.0001
});
