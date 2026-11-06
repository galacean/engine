/** Sampling-safe, continuous limits for finite Ocean vertex displacement. */
import { OCEAN_WAVE_KERNEL } from "../../authoring/ocean/presets/OceanLook";

const TWO_PI = Math.PI * 2;

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

export interface OceanGeometryWaveBandlimitInput {
  readonly angularFrequency: number;
  readonly samplingCellSizeMetres: number;
  readonly viewDistanceMetres: number;
  readonly viewportHeightPixels: number;
  readonly verticalProjectionScale: number;
  /** Absolute dot product between the horizontal wave direction and the normalized view ray. */
  readonly waveViewAlignment: number;
  /** Absolute vertical component of the normalized view ray. */
  readonly grazingSine: number;
  readonly orthographic?: boolean;
}

export interface OceanGeometryWaveBandlimitResult {
  readonly wavelengthMetres: number;
  readonly samplesPerWavelength: number;
  readonly projectedPixelsPerWavelength: number;
  readonly viewDistanceWavelengths: number;
  readonly gridWeight: number;
  readonly projectedPixelWeight: number;
  readonly distanceWeight: number;
  readonly grazingWeight: number;
  readonly weight: number;
}

/** Resolves the exact four angular frequencies used by one live-tuned geometry-wave group. */
export function resolveOceanGeometryWaveAngularFrequencies(
  waveDistance: number,
  groupIndex: number
): readonly number[] {
  if (!Number.isFinite(waveDistance) || waveDistance < 0 || waveDistance >= 1) {
    throw new RangeError("Ocean geometry wave distance must be finite and in [0, 1).");
  }
  if (
    !Number.isInteger(groupIndex) ||
    groupIndex < 0 ||
    groupIndex >= OCEAN_WAVE_KERNEL.cumulativeFrequencyScales.length
  ) {
    throw new RangeError("Ocean geometry wave group index is out of range.");
  }
  const distanceScale = Math.max(1 - waveDistance, 0.001);
  const groupScale = OCEAN_WAVE_KERNEL.cumulativeFrequencyScales[groupIndex]!;
  return Object.freeze(
    OCEAN_WAVE_KERNEL.baseFrequencies.map((frequency) => frequency * 3 * distanceScale * groupScale)
  );
}

/** Converts the live-tuned angular frequencies for one group into spatial wavelengths. */
export function resolveOceanGeometryWaveWavelengths(waveDistance: number, groupIndex: number): readonly number[] {
  return Object.freeze(
    resolveOceanGeometryWaveAngularFrequencies(waveDistance, groupIndex).map((frequency) => TWO_PI / frequency)
  );
}

/** Mirrors the vertex shader's continuous grid, projection, distance, and grazing filters. */
export function resolveOceanGeometryWaveBandlimitWeight(
  input: Readonly<OceanGeometryWaveBandlimitInput>
): Readonly<OceanGeometryWaveBandlimitResult> {
  const values = [
    input.angularFrequency,
    input.samplingCellSizeMetres,
    input.viewDistanceMetres,
    input.viewportHeightPixels,
    input.verticalProjectionScale,
    input.waveViewAlignment,
    input.grazingSine
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Ocean geometry wave bandlimit inputs must be finite.");
  }
  if (
    input.angularFrequency <= 0 ||
    input.samplingCellSizeMetres <= 0 ||
    input.viewDistanceMetres < 0 ||
    input.viewportHeightPixels <= 0 ||
    input.verticalProjectionScale <= 0 ||
    input.waveViewAlignment < 0 ||
    input.waveViewAlignment > 1 ||
    input.grazingSine < 0 ||
    input.grazingSine > 1
  ) {
    throw new RangeError("Ocean geometry wave bandlimit inputs are outside their valid ranges.");
  }

  const limits = OCEAN_GEOMETRY_WAVE_BANDLIMIT;
  const wavelengthMetres = TWO_PI / input.angularFrequency;
  const samplesPerWavelength = wavelengthMetres / input.samplingCellSizeMetres;
  const projectedDirectionScale = Math.sqrt(Math.max(1 - input.waveViewAlignment ** 2, 0));
  const pixelsPerMetre =
    (0.5 * input.viewportHeightPixels * Math.abs(input.verticalProjectionScale)) /
    (input.orthographic ? 1 : Math.max(input.viewDistanceMetres, 0.001));
  const projectedPixelsPerWavelength = wavelengthMetres * pixelsPerMetre * projectedDirectionScale;
  const viewDistanceWavelengths = input.viewDistanceMetres / wavelengthMetres;
  const gridWeight = smoothstep(
    limits.minimumSamplesPerWavelength,
    limits.fullSamplesPerWavelength,
    samplesPerWavelength
  );
  const projectedPixelWeight = smoothstep(
    limits.minimumProjectedPixelsPerWavelength,
    limits.fullProjectedPixelsPerWavelength,
    projectedPixelsPerWavelength
  );
  const distanceWeight =
    1 - smoothstep(limits.distanceFadeStartWavelengths, limits.distanceFadeEndWavelengths, viewDistanceWavelengths);
  const grazingWeight = smoothstep(limits.grazingFadeStartSine, limits.grazingFadeEndSine, input.grazingSine);
  return Object.freeze({
    wavelengthMetres,
    samplesPerWavelength,
    projectedPixelsPerWavelength,
    viewDistanceWavelengths,
    gridWeight,
    projectedPixelWeight,
    distanceWeight,
    grazingWeight,
    weight: gridWeight * projectedPixelWeight * distanceWeight * grazingWeight
  });
}

function smoothstep(lower: number, upper: number, value: number): number {
  const normalized = Math.max(0, Math.min(1, (value - lower) / (upper - lower)));
  return normalized * normalized * (3 - 2 * normalized);
}
