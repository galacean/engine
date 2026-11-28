/** Public Water entry. Internal modules retain direct imports. */
export { LAKE_DROP_LOOK } from "./LakeDropLook";
export { LAKE_COMPILED_SURFACE_APPEARANCE_V2, LAKE_SURFACE_APPEARANCE_V2_ASSET } from "./LakeSurfaceAppearanceV2";
export { LAKE_SURFACE_FIELD_DEPENDENCIES_V2 } from "./LakeSurfaceFieldDependencies";
export {
  LAKE_WATER_OPTICAL_PROFILE,
  LAKE_WATER_REFLECTION_SAMPLING,
  LAKE_WATER_SPATIAL_FIELD,
  LAKE_WATER_SURFACE_MOTION
} from "./LakeWaterDefaults";
export {
  LAKE_HYBRID_APPEARANCE_PRESET_ID,
  LAKE_SCENE_REFLECTION_POLICY,
  LAKE_WATER_LOOK_PRESET_ID,
  LAKE_WATER_REFLECTION_POLICY_PRESET_ID,
  LAKE_WATER_RENDER_STATE_PRESET_ID,
  createLakeSpatialFieldBudget,
  registerLakeWaterLook
} from "./LakeWaterLook";
