/** Authoring bridge for the one fixed Ocean Look. */
import { WaterBodyPresetSchemaVersion, type WaterSpatialFieldQualityBudgetV1 } from "../body/WaterBodyAuthoringTypes";
import { createWaterReflectionPolicyPresetV1 } from "../optics/WaterReflectionPolicyPreset";
import { createWaterQualityPlanV2 } from "../quality/WaterQualityPlan";
import { createWaterLookPresetV1, DEFAULT_WATER_LOOK_RUNTIME_INPUT } from "../surface/WaterLookPreset";
import { createWaterRenderStatePresetV1 } from "../surface/WaterRenderStatePreset";
import {
  WaterDepthResponseCombineV2,
  WaterBoundaryResponseV2,
  WaterRefractionNormalSourceV2,
  WaterRefractionValidationModeV2,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfaceDirectionalHighlightModelV2,
  WaterSurfacePrimaryColorClosure,
  type WaterSurfaceAppearanceAssetV2
} from "../surface/WaterSurfaceAppearanceTypes";
import {
  WaterFieldConsumerActivation,
  WaterFieldFallback,
  WaterFieldProviderKind,
  WaterFieldRequirement,
  WaterFieldSemantic,
  WaterFieldUnit,
  WaterSurfaceFieldSchemaVersion,
  type WaterSurfaceFieldDependencyAssetV2,
  type WaterSurfaceFieldDependencyV2
} from "../surface/WaterSurfaceFieldTypes";
import { WaterSurfaceDepthSource } from "../surface/enums/WaterSurfaceDepthSource";
import { hashStableValue } from "../../compiler/shared/determinism";
import type { WaterBodyAssetRegistry } from "../../runtime/body/WaterBodyAssetRegistry";
import type { OceanWaterSourceConfig } from "../../runtime/ocean/OceanWaterRuntimeTypes";
import { OCEAN_LOOK, OCEAN_LOOK_ID } from "./presets/OceanLook";

export const OCEAN_APPEARANCE_PRESET_ID = "ocean-appearance";
export const OCEAN_APPEARANCE_ASSET_ID = "ocean-surface";
export const OCEAN_OPTICS_PRESET_ID = "ocean-optics";
export const OCEAN_REFLECTION_PRESET_ID = "ocean-environment-reflection";
export const OCEAN_RENDER_STATE_PRESET_ID = "ocean-render-state";
export const OCEAN_FIXED_QUALITY_PLAN_PREFIX = "ocean-fixed-budget";

function createAppearance(): Readonly<WaterSurfaceAppearanceAssetV2> {
  const look = OCEAN_LOOK;
  const sunExponent = 8196 * (1 - look.reflection.sunSize) + 64 * look.reflection.sunSize;
  return Object.freeze({
    schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2,
    id: OCEAN_APPEARANCE_ASSET_ID,
    primaryColorClosure: WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp,
    macroNormalStrength: look.wave.normalStrength,
    directionalHighlight: Object.freeze({
      model: WaterSurfaceDirectionalHighlightModelV2.BlinnPhongPerturbed,
      strength: look.reflection.sunStrength,
      exponent: sunExponent,
      distortion: look.reflection.sunDistortion,
      sharp: false
    }),
    detailLayers: Object.freeze([]),
    depthResponse: Object.freeze({
      model: WaterSurfaceDepthResponseModelV2.CompositeExponential,
      terms: Object.freeze([
        Object.freeze({
          field: WaterFieldSemantic.SceneEyeDepth,
          coefficientPerMeter: look.depth.horizontal * 0.1
        }),
        Object.freeze({
          field: WaterFieldSemantic.SurfaceNormalDepth,
          coefficientPerMeter: look.depth.vertical
        })
      ] as const),
      combine: WaterDepthResponseCombineV2.Maximum,
      shallowColor: look.color.shallow,
      deepColor: look.color.deep
    }),
    boundaryEffects: Object.freeze([
      Object.freeze({
        id: "ocean-intersection-foam",
        field: WaterFieldSemantic.HorizontalShoreDistance,
        response: WaterBoundaryResponseV2.Smoothstep,
        rangeMeters: look.intersection.lengthMetres,
        invert: true,
        outputs: Object.freeze({
          refractionSuppression: 1
        })
      })
    ]),
    refraction: Object.freeze({
      enabled: true,
      uvScale: look.refraction.strength,
      normalSource: WaterRefractionNormalSourceV2.ViewSpaceDelta,
      validation: WaterRefractionValidationModeV2.FullSceneDepth
    }),
    composition: WaterSurfaceCompositionV2.PrecomposedReplace
  });
}

function createFieldDependencies(): Readonly<WaterSurfaceFieldDependencyAssetV2> {
  const required = WaterFieldRequirement.Required;
  const fail = WaterFieldFallback.FailActivation;
  const always = WaterFieldConsumerActivation.Always;
  const bindings: WaterSurfaceFieldDependencyV2[] = [
    {
      consumerId: "ocean-coverage",
      semantic: WaterFieldSemantic.Coverage,
      providers: [WaterFieldProviderKind.CompiledSpatialField],
      activation: always,
      requirement: required,
      fallback: fail,
      unit: WaterFieldUnit.Normalized
    },
    {
      consumerId: "ocean-local-depth",
      semantic: WaterFieldSemantic.VerticalDepth,
      providers: [WaterFieldProviderKind.CompiledSpatialField],
      activation: always,
      requirement: required,
      fallback: fail,
      unit: WaterFieldUnit.Meter
    },
    {
      consumerId: "ocean-shore-sdf",
      semantic: WaterFieldSemantic.HorizontalShoreDistance,
      providers: [WaterFieldProviderKind.CompiledSpatialField],
      activation: always,
      requirement: required,
      fallback: fail,
      unit: WaterFieldUnit.Meter
    },
    {
      consumerId: "ocean-scene-ray-depth",
      semantic: WaterFieldSemantic.SceneEyeDepth,
      providers: [WaterFieldProviderKind.CameraDepth],
      activation: always,
      requirement: required,
      fallback: fail,
      unit: WaterFieldUnit.Meter
    },
    {
      consumerId: "ocean-physical-ray-depth",
      semantic: WaterFieldSemantic.SceneRayDepth,
      providers: [WaterFieldProviderKind.CameraDepth],
      activation: always,
      requirement: required,
      fallback: fail,
      unit: WaterFieldUnit.Meter
    },
    {
      consumerId: "ocean-surface-normal-depth",
      semantic: WaterFieldSemantic.SurfaceNormalDepth,
      providers: [WaterFieldProviderKind.CameraDepth],
      activation: always,
      requirement: required,
      fallback: fail,
      unit: WaterFieldUnit.Meter
    },
    {
      consumerId: "ocean-scene-color",
      semantic: WaterFieldSemantic.SceneColor,
      providers: [WaterFieldProviderKind.CameraOpaqueColor],
      activation: WaterFieldConsumerActivation.RefractionEnabled,
      requirement: required,
      fallback: fail,
      unit: WaterFieldUnit.LinearRgb
    }
  ];
  return Object.freeze({
    schemaVersion: WaterSurfaceFieldSchemaVersion.V2,
    id: "ocean-fields",
    bindings: Object.freeze(
      bindings.map((binding) => Object.freeze({ ...binding, providers: Object.freeze(binding.providers) }))
    )
  });
}

export function createOceanSpatialBudget(
  config: Readonly<Pick<OceanWaterSourceConfig, "nearshoreDescriptor">>
): Readonly<WaterSpatialFieldQualityBudgetV1> {
  const descriptor = config.nearshoreDescriptor;
  const { grid } = descriptor;
  let maximumDepth = 0;
  let maximumShoreDistance = Math.min(grid.cellSizeXZ[0], grid.cellSizeXZ[1]) * 0.5;
  for (let index = 0; index < descriptor.bedHeights.length; index++) {
    maximumDepth = Math.max(maximumDepth, descriptor.waterLevel - descriptor.bedHeights[index]!);
    maximumShoreDistance = Math.max(maximumShoreDistance, Math.abs(descriptor.signedShoreDistances?.[index] ?? 0));
  }
  maximumShoreDistance = Math.min(64, maximumShoreDistance);
  return Object.freeze({
    maximumHorizontalError: Math.hypot(grid.cellSizeXZ[0], grid.cellSizeXZ[1]) * 0.5 + 1e-6,
    maximumDepthError: 0,
    maximumGpuDepthDecodeError: Math.max(0.0001, maximumDepth) / 510 + 1e-6,
    maximumGpuShoreDecodeError: maximumShoreDistance / 254 + 1e-6,
    maximumAtlasPixels: grid.width * grid.height
  });
}

function fixedQualityPlanId(spatial: Readonly<WaterSpatialFieldQualityBudgetV1>): string {
  return `${OCEAN_FIXED_QUALITY_PLAN_PREFIX}:${hashStableValue({ spatial, query: "dense" })}`;
}

export interface RegisteredOceanAuthoring {
  readonly lookPresetId: typeof OCEAN_LOOK_ID;
  readonly qualityPlanId: string;
}

/** Registers one immutable Look and one non-selectable implementation budget. */
export function registerOceanAuthoring(
  registry: WaterBodyAssetRegistry,
  config: Readonly<OceanWaterSourceConfig>
): Readonly<RegisteredOceanAuthoring> {
  registerOceanLook(registry);

  const spatial = createOceanSpatialBudget(config);
  const qualityPlanId = fixedQualityPlanId(spatial);
  if (!registry.getQualityPlan(qualityPlanId)) {
    registry.registerQualityPlan(
      createWaterQualityPlanV2({
        id: qualityPlanId,
        geometry: "high",
        surfaceShading: "high",
        sceneFields: "scene-color-depth",
        opaqueDownsampling: "2x",
        reflectionBudget: { environment: true, screenSpace: false },
        surfaceEffectBudget: { caustics: true },
        query: "dense",
        spatialField: spatial
      })
    );
  }
  return Object.freeze({
    lookPresetId: OCEAN_LOOK_ID,
    qualityPlanId
  });
}

/** Registers the canonical visual contract independently of a particular coastline. */
export function registerOceanLook(registry: WaterBodyAssetRegistry): void {
  if (!registry.getLookAuthoringSnapshot(OCEAN_LOOK_ID)) {
    const appearance = createAppearance();
    registry.registerAppearancePreset({
      schemaVersion: WaterBodyPresetSchemaVersion.V1,
      id: OCEAN_APPEARANCE_PRESET_ID,
      appearance,
      fieldDependencies: createFieldDependencies(),
      featureFlags: {
        externalNormal: true,
        depthTint: true,
        coastalAlpha: true,
        contactFoam: false,
        directSpecular: true
      }
    });
    const look = OCEAN_LOOK;
    registry.registerOpticsPreset({
      schemaVersion: WaterBodyPresetSchemaVersion.V1,
      id: OCEAN_OPTICS_PRESET_ID,
      depthSource: WaterSurfaceDepthSource.SceneDepth,
      profile: {
        absorptionCoefficient: [0, 0, 0],
        scatteringColor: [0, 0, 0],
        scatteringCoefficient: 0,
        maximumViewDistance: 500,
        indexOfRefraction: 1.333,
        maximumSurfaceOpticalDistance: 500,
        refractionStrength: look.refraction.strength,
        roughness: look.reflection.blur,
        reflectionIntensity: look.reflection.strength
      },
      refractionEnabled: true,
      caustics: true
    });
    registry.registerReflectionPolicyPreset(
      createWaterReflectionPolicyPresetV1(OCEAN_REFLECTION_PRESET_ID, {
        preferred: "environment",
        fallbacks: ["analytic"]
      })
    );
    registry.registerRenderStatePreset(
      createWaterRenderStatePresetV1({
        id: OCEAN_RENDER_STATE_PRESET_ID,
        depthWriteEnabled: false,
        queue: "transparent",
        priorityOffset: 0,
        cullMode: "back",
        blendMode: "alpha"
      })
    );
    registry.registerLookPreset(
      createWaterLookPresetV1({
        ...DEFAULT_WATER_LOOK_RUNTIME_INPUT,
        id: OCEAN_LOOK_ID,
        appearanceAssetId: appearance.id,
        opticalProfileId: OCEAN_OPTICS_PRESET_ID,
        reflectionPolicyId: OCEAN_REFLECTION_PRESET_ID,
        renderStatePresetId: OCEAN_RENDER_STATE_PRESET_ID,
        oceanResponse: {
          timeScale: look.wave.animationSpeed,
          microDetailResponse: [
            { speedMetresPerSecond: 0, strengthRatio: 1, speedRatio: 1 },
            { speedMetresPerSecond: 100, strengthRatio: 1, speedRatio: 1 }
          ]
        },
        foam: {
          enabled: true,
          intensity: look.surfaceFoam.baseAmount,
          color: "#ffffff"
        }
      })
    );
  }
}
