/**
 * Authoritative render-only Ocean Look shared by authoring, runtime uniforms,
 * diagnostics, and visual-regression assertions. Runtime identity deliberately
 * excludes source-tool metadata; provenance stays under
 * `third_party/ocean-assets`.
 */

export const OCEAN_LOOK_ID = "ocean-look";

export const OCEAN_LOOK = Object.freeze({
  id: OCEAN_LOOK_ID,
  wave: Object.freeze({
    count: 2,
    height: 0.15,
    distance: 0.775,
    speed: 2.3999996,
    steepness: 5,
    normalStrength: 0.16,
    fadeStartMetres: 25,
    fadeEndMetres: 286.97916,
    direction: Object.freeze([-1, -1, -1, -1] as const),
    animationSpeed: 1
  }),
  normal: Object.freeze({
    strength: 0.202,
    tiling: Object.freeze([0.5, 0.5] as const),
    subTiling: 0.5,
    speed: 0.8,
    subSpeed: -0.8,
    distanceTiling: 0.25,
    distanceFadeStartMetres: 0,
    distanceFadeEndMetres: 80
  }),
  color: Object.freeze({
    deep: Object.freeze([0, 0.16451614, 0.34, 0.98039216] as const),
    shallow: Object.freeze([0, 1, 0.98136926, 0.3764706] as const),
    horizon: Object.freeze([0.68, 1, 0.99, 0.15] as const)
  }),
  depth: Object.freeze({
    horizontal: 1.7,
    vertical: 4,
    exponent: 1
  }),
  reflection: Object.freeze({
    source: "environment" as const,
    strength: 1,
    distortion: 0.09,
    fresnelExponent: 10,
    blur: 0,
    lighting: 0,
    screenSpaceEnabled: false,
    sunStrength: 5,
    sunSize: 0.932,
    sunDistortion: 0.702
  }),
  refraction: Object.freeze({
    enabled: true,
    strength: 0.172
  }),
  surfaceFoam: Object.freeze({
    enabled: true,
    color: Object.freeze([1, 1, 1, 0.12156863] as const),
    baseAmount: 0.373,
    tiling: Object.freeze([0.1, 0.1] as const),
    subTiling: 0.5,
    speed: 0.050000012,
    subSpeed: -0.18999995,
    distortion: 0.1,
    clipping: 0,
    waveAmount: 0
  }),
  intersection: Object.freeze({
    enabled: true,
    color: Object.freeze([1, 1, 1, 1] as const),
    lengthMetres: 3.04,
    falloff: 0.816,
    tiling: 0.13999975,
    speed: 0.06999999,
    clipping: 0.605,
    distortion: 0.2,
    rippleDistance: 32,
    rippleStrength: 0.547,
    size: 0.944
  }),
  caustics: Object.freeze({
    enabled: true,
    brightness: 4,
    chromance: 1,
    distortion: 0.151,
    speed: 0.075,
    tiling: 0.15
  }),
  translucency: Object.freeze({
    enabled: true,
    strength: 1,
    directStrength: 0.05,
    exponent: 3,
    curvatureMask: 0.25
  }),
  renderState: Object.freeze({
    transparent: true,
    depthWrite: false,
    cullBackFaces: true
  })
});

export type OceanLook = typeof OCEAN_LOOK;

/**
 * Ocean displacement constants that are not serialized as material
 * properties. The shader and its conservative mesh bounds both consume this
 * object so their formula cannot drift independently.
 */
export const OCEAN_WAVE_KERNEL = Object.freeze({
  amplitudes: Object.freeze([0.3, 0.35, 0.25, 0.25] as const),
  baseFrequencies: Object.freeze([1.3, 1.35, 1.25, 1.25] as const),
  phaseRates: Object.freeze([1.2, 1.375, 1.1, 1] as const),
  directions: Object.freeze([
    Object.freeze([-0.3, -0.85] as const),
    Object.freeze([-0.85, -0.25] as const),
    Object.freeze([-0.1, -0.9] as const),
    Object.freeze([0.5, 0.5] as const)
  ] as const),
  /** Frequency grows by x1.5 and then x2 across the inclusive wave loop. */
  cumulativeFrequencyScales: Object.freeze([1, 1.5, 3] as const),
  steepnessMultiplier: 12 * 3,
  horizontalScalePerWaveHeight: 0.01
});

export interface OceanWaveDisplacementEnvelope {
  readonly maximumXMetres: number;
  readonly maximumYMetres: number;
  readonly maximumZMetres: number;
  readonly maximumHorizontalMagnitudeMetres: number;
}

/** Triangle-inequality envelope for every phase, position, time, and clamped fade value. */
export function deriveOceanWaveDisplacementEnvelope(
  look: OceanLook = OCEAN_LOOK
): Readonly<OceanWaveDisplacementEnvelope> {
  const kernel = OCEAN_WAVE_KERNEL;
  const groupCount = look.wave.count + 1;
  if (!Number.isInteger(look.wave.count) || look.wave.count <= 0) {
    throw new RangeError("Ocean WaveCount must be a positive integer.");
  }
  if (kernel.cumulativeFrequencyScales.length !== groupCount) {
    throw new RangeError("Ocean wave kernel must match the inclusive WaveCount loop.");
  }
  const amplitudes = kernel.amplitudes;
  const directions = kernel.directions;
  const amplitudeSum = amplitudes.reduce((sum, amplitude) => sum + Math.abs(amplitude), 0);
  const xContribution = amplitudes.reduce(
    (sum, amplitude, index) => sum + Math.abs(amplitude * directions[index]![0]),
    0
  );
  const zContribution = amplitudes.reduce(
    (sum, amplitude, index) => sum + Math.abs(amplitude * directions[index]![1]),
    0
  );
  const horizontalScale = Math.abs(
    kernel.steepnessMultiplier * look.wave.steepness * kernel.horizontalScalePerWaveHeight * look.wave.height
  );
  const maximumXMetres = groupCount * horizontalScale * xContribution;
  const maximumZMetres = groupCount * horizontalScale * zContribution;
  const maximumYMetres = groupCount * amplitudeSum * Math.abs(look.wave.height / look.wave.count);
  return Object.freeze({
    maximumXMetres,
    maximumYMetres,
    maximumZMetres,
    maximumHorizontalMagnitudeMetres: Math.hypot(maximumXMetres, maximumZMetres)
  });
}

export const OCEAN_WAVE_DISPLACEMENT_ENVELOPE = deriveOceanWaveDisplacementEnvelope();

/** Fixed render budget. This is not a selectable quality tier. */
export const OCEAN_RENDER_BUDGET = Object.freeze({
  gpuBudgetBasis: "geometry+nearshore-atlas+ocean-textures" as const,
  /** Camera-following high-detail square. Its boundary stays beyond the macro-wave fade. */
  nearFieldWindowSizeMetres: 640,
  nearFieldCellSizeMetres: 2,
  /** Keeps the complete camera-relative topology on a stable world lattice. */
  nearFieldSnapSizeMetres: 64,
  /** Four 320m quadrants keep every near-field Mesh on Uint16 indices. */
  nearFieldMeshAxisCount: 2,
  /** Detailed shading converges to the shared far closure before the nearest possible moving-grid edge. */
  farFieldClosureTransitionStartMetres: 160,
  farFieldClosureTransitionEndMetres: 288,
  /** One Nearshore coverage lookup plus one borrowed distant-environment lookup. */
  farFieldMaximumTextureSampleCount: 2,
  /**
   * One immutable camera-relative square-ring mesh. The last marker loop is projected by the vertex shader;
   * every preceding loop keeps real world depth so terrain and fog remain continuous.
   */
  farFieldRingHalfExtentsMetres: Object.freeze([
    320, 512, 768, 1_024, 1_536, 2_048, 3_072, 4_096, 6_144, 8_192, 16_384
  ] as const),
  /** 8m segments at the 320m join align exactly to every fourth 2m near-field vertex. */
  farFieldRingSegmentsPerEdge: 80,
  farFieldMaximumDrawCount: 1,
  farFieldMaximumResidentTriangleCount: 6_400,
  farFieldMaximumResidentVertexCount: 3_520,
  /** A planar center fill replaces the detailed grid only after the far-only proof succeeds. */
  farOnlyFillMaximumDrawCount: 1,
  farOnlyFillMaximumResidentTriangleCount: 2,
  farOnlyFillMaximumResidentVertexCount: 4,
  /** The outer projected loop must remain within half a vertical pixel of the mathematical horizon. */
  farFieldMaximumProjectionErrorPixels: 0.5,
  /** The projected loop may never resolve closer than its immutable local marker extent. */
  farFieldMinimumProjectionDistanceMetres: 16_384,
  /** Precision guard for unusually elevated cameras; ordinary Seed World views resolve below this ceiling. */
  farFieldMaximumProjectionDistanceMetres: 10_000_000,
  /** Detailed submits five draws, far-only submits two, and three draws remain as conservative headroom. */
  maximumDrawCount: 8,
  /** Four near quadrants, one graded far field, one far-only fill, and two spare resident meshes. */
  maximumResidentMeshCount: 8,
  maximumResidentTriangleCount: 230_000,
  maximumResidentVertexCount: 130_000,
  maximumGeometryBytes: 4 * 1024 * 1024,
  // 48 MiB is the measured fixed ceiling for the 4096m presentation envelope,
  // authoritative atlas, and all five licensed mipmapped Ocean textures together.
  maximumOwnedGpuBytes: 48 * 1024 * 1024
});
