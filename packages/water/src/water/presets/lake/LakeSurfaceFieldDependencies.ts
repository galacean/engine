import {
  WaterFieldFallback,
  WaterFieldConsumerActivation,
  WaterFieldProviderKind,
  WaterFieldRequirement,
  WaterFieldSemantic,
  WaterFieldUnit,
  WaterSurfaceFieldSchemaVersion,
  type WaterSurfaceFieldDependencyAssetV2
} from "../../authoring/surface/WaterSurfaceFieldTypes";

const REQUIRED = WaterFieldRequirement.Required;
const FAIL = WaterFieldFallback.FailActivation;
const USE_NEXT = WaterFieldFallback.UseNextProvider;
const ALWAYS = WaterFieldConsumerActivation.Always;
const CAMERA_OR_DERIVED_SCENE_RAY_DEPTH = Object.freeze([
  WaterFieldProviderKind.CameraDepth,
  WaterFieldProviderKind.Derived
]);

export const LAKE_SURFACE_FIELD_DEPENDENCIES_V2: WaterSurfaceFieldDependencyAssetV2 = Object.freeze({
  schemaVersion: WaterSurfaceFieldSchemaVersion.V2,
  id: "grasslands-surface-fields-v2",
  bindings: Object.freeze([
    Object.freeze({
      consumerId: "surface-coverage",
      semantic: WaterFieldSemantic.Coverage,
      providers: Object.freeze([WaterFieldProviderKind.CompiledSpatialField]),
      activation: ALWAYS,
      requirement: REQUIRED,
      fallback: FAIL,
      unit: WaterFieldUnit.Normalized
    }),
    Object.freeze({
      consumerId: "water-column-depth",
      semantic: WaterFieldSemantic.VerticalDepth,
      providers: Object.freeze([WaterFieldProviderKind.CompiledSpatialField]),
      activation: ALWAYS,
      requirement: REQUIRED,
      fallback: FAIL,
      unit: WaterFieldUnit.Meter
    }),
    Object.freeze({
      consumerId: "shore-safety",
      semantic: WaterFieldSemantic.HorizontalShoreDistance,
      providers: Object.freeze([WaterFieldProviderKind.CompiledSpatialField]),
      activation: ALWAYS,
      requirement: REQUIRED,
      fallback: FAIL,
      unit: WaterFieldUnit.Meter
    }),
    Object.freeze({
      consumerId: "optical-depth-clamp",
      semantic: WaterFieldSemantic.SceneRayDepth,
      providers: CAMERA_OR_DERIVED_SCENE_RAY_DEPTH,
      activation: ALWAYS,
      requirement: REQUIRED,
      fallback: USE_NEXT,
      unit: WaterFieldUnit.Meter
    }),
    Object.freeze({
      consumerId: "coastal-alpha",
      semantic: WaterFieldSemantic.SceneEyeDepth,
      providers: CAMERA_OR_DERIVED_SCENE_RAY_DEPTH,
      activation: WaterFieldConsumerActivation.CoastalAlphaEnabled,
      requirement: REQUIRED,
      fallback: USE_NEXT,
      unit: WaterFieldUnit.Meter
    }),
    Object.freeze({
      consumerId: "contact-foam",
      semantic: WaterFieldSemantic.ObstacleContact,
      providers: Object.freeze([WaterFieldProviderKind.CameraDepth]),
      activation: WaterFieldConsumerActivation.ContactFoamEnabled,
      requirement: REQUIRED,
      fallback: FAIL,
      unit: WaterFieldUnit.Meter
    }),
    Object.freeze({
      consumerId: "refraction-depth-validity",
      semantic: WaterFieldSemantic.SceneRayDepth,
      providers: CAMERA_OR_DERIVED_SCENE_RAY_DEPTH,
      activation: WaterFieldConsumerActivation.RefractionEnabled,
      requirement: REQUIRED,
      fallback: USE_NEXT,
      unit: WaterFieldUnit.Meter
    }),
    Object.freeze({
      consumerId: "scene-composition-color",
      semantic: WaterFieldSemantic.SceneColor,
      providers: Object.freeze([WaterFieldProviderKind.CameraOpaqueColor]),
      activation: ALWAYS,
      requirement: REQUIRED,
      fallback: FAIL,
      unit: WaterFieldUnit.LinearRgb
    })
  ])
});
