import type { WaterOpticalProfileV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import type {
  HeightfieldWaterSpatialFieldConfig,
  HeightfieldWaterSurfaceMotionConfig
} from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { WaterReflectionSamplingSettings } from "../../authoring/optics/WaterReflectionSampling";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../../runtime/optics/WaterOpticalProfile";

export const LAKE_WATER_SURFACE_MOTION: Readonly<HeightfieldWaterSurfaceMotionConfig> = Object.freeze({
  waveStrength: 0,
  shoreDampingWidth: 12
});

export const LAKE_WATER_SPATIAL_FIELD: Readonly<HeightfieldWaterSpatialFieldConfig> = Object.freeze({
  signedDistanceRange: 24
});

export const LAKE_WATER_OPTICAL_PROFILE: Readonly<WaterOpticalProfileV1> = Object.freeze({
  absorptionCoefficient: DEFAULT_WATER_OPTICAL_PROFILE.absorptionCoefficient,
  scatteringColor: DEFAULT_WATER_OPTICAL_PROFILE.scatteringColor,
  scatteringCoefficient: DEFAULT_WATER_OPTICAL_PROFILE.scatteringCoefficient,
  maximumViewDistance: DEFAULT_WATER_OPTICAL_PROFILE.maximumViewDistance,
  indexOfRefraction: 1.333,
  fresnelF0: DEFAULT_WATER_OPTICAL_PROFILE.fresnelF0,
  maximumSurfaceOpticalDistance: DEFAULT_WATER_OPTICAL_PROFILE.maximumSurfaceOpticalDistance ?? 4,
  // Refraction Factor 1 is multiplied by 0.1 in the source shader.
  refractionStrength: 0.05,
  // Resolved ripple normals own the visible slope field; this fallback represents only unresolved microfacets.
  roughness: 0.02,
  reflectionIntensity: 1
});

export const LAKE_WATER_REFLECTION_SAMPLING: Readonly<WaterReflectionSamplingSettings> = Object.freeze({
  screenSpaceCompositeIntensity: 1,
  // Physical baseline: exposure, IBL intensity, roughness, and DFG own the energy.
  environmentFallbackIntensity: 1,
  distortionStrength: 0.09,
  maximumDistortionPixels: 32,
  edgeFadeTexels: 23,
  minimumClipW: 0.001,
  roughnessFootprintTexels: 3,
  highFilterSampleCount: 1
});
