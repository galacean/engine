/** Public Water entry. Internal modules retain direct imports. */
export { RIVER_MATERIAL_PRESET_CONFIG } from "../../authoring/river/RiverAuthoringLimits";
export {
  RIVER_CANONICAL_LOOK_PRESET_ID,
  registerRiverWaterBodyPresets,
  riverQualityPlanIdForQuality
} from "../../authoring/river/RiverWaterBodyAuthoring";
export { RIVER_HIGH_LOOK_ID, registerRiverHighLook } from "../../authoring/river/RiverHighLook";
export {
  PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1,
  PROMPT_NOISE_MOUNTAIN_RIVER_HIGH_PROFILE_V1,
  RIVER_WATER_PROFILE_SCHEMA_VERSION,
  hashRiverWaterProfile,
  requireRiverWaterProfile
} from "../../authoring/river/RiverWaterProfile";
export type { RiverWaterFeatureRequirementsV1, RiverWaterProfileV1 } from "../../authoring/river/RiverWaterProfile";
export {
  STYLIZED_RIVER_DEEP_OPACITY,
  STYLIZED_RIVER_DEPTH_COEFFICIENTS,
  STYLIZED_RIVER_LOOK_ID,
  registerStylizedRiverLook
} from "../../authoring/river/StylizedRiverLook";

export {
  RIVER_VALLEY_LOOK_ID,
  RIVER_VALLEY_CONTACT_EFFECTS_LOOK,
  registerRiverValleyLook
} from "../../authoring/river/RiverValleyLook";

export { FARMLANDS_RIVER_LOOK_ID, registerFarmlandsRiverLook } from "../../authoring/river/FarmlandsRiverLook";

export { RIVER_DEFAULT_DROP_LOOK } from "../../authoring/river/FarmlandsDropLook";
