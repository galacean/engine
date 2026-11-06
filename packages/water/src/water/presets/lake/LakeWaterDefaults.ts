import type { WaterOpticalProfileV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import type {
  HeightfieldWaterSpatialFieldConfig,
  HeightfieldWaterSurfaceMotionConfig
} from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { HeightfieldWaterReflectionSamplingSettings } from "../../runtime/heightfield/HeightfieldWaterReflectionSampling";
import { LAKE_SHOWCASE_OPTICAL_PROFILE } from "./LakeShowcaseOpticalProfile";

export const LAKE_WATER_SURFACE_MOTION: Readonly<HeightfieldWaterSurfaceMotionConfig> = Object.freeze({
  waveStrength: 0,
  shoreDampingWidth: 12
});

export const LAKE_WATER_SPATIAL_FIELD: Readonly<HeightfieldWaterSpatialFieldConfig> = Object.freeze({
  signedDistanceRange: 24
});

export const LAKE_WATER_OPTICAL_PROFILE: Readonly<WaterOpticalProfileV1> = Object.freeze({
  absorptionCoefficient: LAKE_SHOWCASE_OPTICAL_PROFILE.absorptionCoefficient,
  scatteringColor: LAKE_SHOWCASE_OPTICAL_PROFILE.scatteringColor,
  scatteringCoefficient: LAKE_SHOWCASE_OPTICAL_PROFILE.scatteringCoefficient,
  maximumViewDistance: LAKE_SHOWCASE_OPTICAL_PROFILE.maximumViewDistance,
  indexOfRefraction: LAKE_SHOWCASE_OPTICAL_PROFILE.indexOfRefraction ?? 1.333,
  fresnelF0: LAKE_SHOWCASE_OPTICAL_PROFILE.fresnelF0,
  maximumSurfaceOpticalDistance: LAKE_SHOWCASE_OPTICAL_PROFILE.maximumSurfaceOpticalDistance ?? 4,
  // Refraction Factor 1 is multiplied by 0.1 in the source shader.
  refractionStrength: LAKE_SHOWCASE_OPTICAL_PROFILE.refractionStrength ?? 0.1,
  // Resolved ripple normals own the visible slope field; this fallback represents only unresolved microfacets.
  roughness: LAKE_SHOWCASE_OPTICAL_PROFILE.roughness ?? 0.06,
  reflectionIntensity: LAKE_SHOWCASE_OPTICAL_PROFILE.reflectionIntensity ?? 0.85
});

export const LAKE_WATER_REFLECTION_SAMPLING: Readonly<HeightfieldWaterReflectionSamplingSettings> = Object.freeze({
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
