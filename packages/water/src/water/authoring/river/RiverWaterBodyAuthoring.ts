/** Shared WaterBody authoring used by River gallery consumers. */
import { RIVER_DEFAULT_DROP_LOOK, registerRiverDropResources } from "./FarmlandsDropLook";
import { createWaterBodyAsset } from "../body/WaterBodyAsset";
import { createWaterBodyInstance, type WaterBodyInstance } from "../body/WaterBodyInstance";
import {
  WaterBodyPresetSchemaVersion,
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion
} from "../body/WaterBodyAuthoringTypes";
import { createWaterReflectionPolicyPresetV1 } from "../optics/WaterReflectionPolicyPreset";
import { createWaterQualityPlanV2 } from "../quality/WaterQualityPlan";
import { createWaterLookPresetV1, DEFAULT_WATER_LOOK_RUNTIME_INPUT } from "../surface/WaterLookPreset";
import { createWaterRenderStatePresetV1 } from "../surface/WaterRenderStatePreset";
import { RiverNetworkSchemaVersion, RiverQualityLevel } from "./RiverAuthoringEnums";
import type {
  RiverNetworkDescriptor,
  RiverWaterBodyRepresentationDataV1,
  RiverWaterBodySourceDescriptorV2
} from "./RiverDescriptor";
import {
  WaterRefractionNormalSourceV2,
  WaterRefractionValidationModeV2,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseModelV2,
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
  type WaterSurfaceFieldDependencyAssetV2
} from "../surface/WaterSurfaceFieldTypes";
import { WaterSurfaceDepthSource } from "../surface/enums/WaterSurfaceDepthSource";
import { WaterQualityTier } from "../wave/enums/WaterQualityTier";
import { WaterBodyAssetRegistry } from "../../runtime/body/WaterBodyAssetRegistry";
import { hashRiverStableValue } from "../../compiler/shared/determinism";

export { computeRiverPhysicalSourceHash } from "./RiverPhysicalSourceIdentity";

export const RIVER_WATER_BODY_ASSET_ID = "water-pcg-river-asset";

const RIVER_LOCAL_OPTICS_PRESET_ID = "water-pcg-river-local-optics-v1";
const RIVER_SCENE_DEPTH_OPTICS_PRESET_ID = "water-pcg-river-scene-depth-optics-v1";
const RIVER_LOCAL_APPEARANCE_PRESET_ID = "water-pcg-physical-local-appearance-v2";
const RIVER_SCENE_APPEARANCE_PRESET_ID = "water-pcg-physical-scene-appearance-v2";
export const RIVER_LOCAL_LOOK_PRESET_ID = "water-pcg-physical-local-look-v2";
export const RIVER_CANONICAL_LOOK_PRESET_ID = "water-pcg-physical-scene-look-v2";
const RIVER_LOCAL_REFLECTION_POLICY_PRESET_ID = "water-pcg-river-analytic-reflection-v2";
const RIVER_SCENE_REFLECTION_POLICY_PRESET_ID = "water-pcg-river-ssr-reflection-v2";
const RIVER_RENDER_STATE_PRESET_ID = "water-pcg-river-transparent-render-state-v2";
const RIVER_FORMAL_REFLECTION_POLICY = Object.freeze({
  preferred: "ssr" as const,
  fallbacks: Object.freeze(["environment", "analytic"] as const)
});

const OPTICAL_PROFILE = Object.freeze({
  absorptionCoefficient: [0.16, 0.07, 0.035] as const,
  scatteringColor: [0.08, 0.32, 0.48] as const,
  scatteringCoefficient: 0.12,
  maximumViewDistance: 120,
  indexOfRefraction: 1.333,
  maximumSurfaceOpticalDistance: 40,
  refractionStrength: 1,
  roughness: 0.12,
  reflectionIntensity: 1
});

export function riverQualityPlanIdForQuality(quality: RiverQualityLevel): string {
  return `water-pcg-river-${quality}-quality-v2`;
}

const RIVER_LOCAL_PHYSICAL_APPEARANCE: WaterSurfaceAppearanceAssetV2 = Object.freeze({
  schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2,
  id: RIVER_LOCAL_APPEARANCE_PRESET_ID,
  primaryColorClosure: WaterSurfacePrimaryColorClosure.PhysicalVolume,
  detailLayers: Object.freeze([]),
  depthResponse: Object.freeze({
    model: WaterSurfaceDepthResponseModelV2.BeerLambert,
    field: WaterFieldSemantic.OpticalPath
  }),
  boundaryEffects: Object.freeze([]),
  refraction: Object.freeze({
    enabled: false,
    uvScale: 0,
    normalSource: WaterRefractionNormalSourceV2.ViewSpaceDelta,
    validation: WaterRefractionValidationModeV2.LocalOnlySafe
  }),
  composition: WaterSurfaceCompositionV2.AlphaBlend
});

const RIVER_SCENE_PHYSICAL_APPEARANCE: WaterSurfaceAppearanceAssetV2 = Object.freeze({
  ...RIVER_LOCAL_PHYSICAL_APPEARANCE,
  id: RIVER_SCENE_APPEARANCE_PRESET_ID,
  refraction: Object.freeze({
    enabled: true,
    uvScale: 0.01,
    normalSource: WaterRefractionNormalSourceV2.ViewSpaceDelta,
    validation: WaterRefractionValidationModeV2.ShiftedSceneDepth
  }),
  composition: WaterSurfaceCompositionV2.PrecomposedReplace
});

function createRiverFieldDependencies(id: string, sceneFields: boolean): Readonly<WaterSurfaceFieldDependencyAssetV2> {
  const requiredCompiled = (consumerId: string, semantic: WaterFieldSemantic, unit: WaterFieldUnit) =>
    Object.freeze({
      consumerId,
      semantic,
      providers: Object.freeze([WaterFieldProviderKind.CompiledSpatialField]),
      activation: WaterFieldConsumerActivation.Always,
      requirement: WaterFieldRequirement.Required,
      fallback: WaterFieldFallback.FailActivation,
      unit
    });
  return Object.freeze({
    schemaVersion: WaterSurfaceFieldSchemaVersion.V2,
    id,
    bindings: Object.freeze([
      requiredCompiled("surface-coverage", WaterFieldSemantic.Coverage, WaterFieldUnit.Normalized),
      requiredCompiled("water-column-depth", WaterFieldSemantic.VerticalDepth, WaterFieldUnit.Meter),
      requiredCompiled("shore-safety", WaterFieldSemantic.HorizontalShoreDistance, WaterFieldUnit.Meter),
      requiredCompiled("surface-flow", WaterFieldSemantic.Flow, WaterFieldUnit.MeterPerSecond),
      ...(sceneFields
        ? [
            Object.freeze({
              consumerId: "scene-ray-depth",
              semantic: WaterFieldSemantic.SceneRayDepth,
              providers: Object.freeze([WaterFieldProviderKind.CameraDepth]),
              activation: WaterFieldConsumerActivation.Always,
              requirement: WaterFieldRequirement.Required,
              fallback: WaterFieldFallback.FailActivation,
              unit: WaterFieldUnit.Meter
            }),
            Object.freeze({
              consumerId: "scene-composition-color",
              semantic: WaterFieldSemantic.SceneColor,
              providers: Object.freeze([WaterFieldProviderKind.CameraOpaqueColor]),
              activation: WaterFieldConsumerActivation.Always,
              requirement: WaterFieldRequirement.Required,
              fallback: WaterFieldFallback.FailActivation,
              unit: WaterFieldUnit.LinearRgb
            })
          ]
        : []),
      Object.freeze({
        consumerId: "optical-path",
        semantic: WaterFieldSemantic.OpticalPath,
        providers: Object.freeze([WaterFieldProviderKind.Derived]),
        activation: WaterFieldConsumerActivation.Always,
        requirement: WaterFieldRequirement.Required,
        fallback: WaterFieldFallback.FailActivation,
        unit: WaterFieldUnit.Meter
      })
    ])
  });
}

const RIVER_LOCAL_FIELDS = createRiverFieldDependencies("water-pcg-river-local-fields-v2", false);
const RIVER_SCENE_FIELDS = createRiverFieldDependencies("water-pcg-river-scene-fields-v2", true);

/** Registers reusable Look and Quality Plan identities; geometry remains per River asset. */
export function registerRiverWaterBodyPresets(registry: WaterBodyAssetRegistry): void {
  registerRiverDropResources(registry);
  registry.registerAppearancePreset({
    schemaVersion: WaterBodyPresetSchemaVersion.V1,
    id: RIVER_LOCAL_APPEARANCE_PRESET_ID,
    appearance: RIVER_LOCAL_PHYSICAL_APPEARANCE,
    fieldDependencies: RIVER_LOCAL_FIELDS,
    featureFlags: {
      externalNormal: false,
      depthTint: true,
      coastalAlpha: false,
      contactFoam: false,
      directSpecular: true
    }
  });
  registry.registerAppearancePreset({
    schemaVersion: WaterBodyPresetSchemaVersion.V1,
    id: RIVER_SCENE_APPEARANCE_PRESET_ID,
    appearance: RIVER_SCENE_PHYSICAL_APPEARANCE,
    fieldDependencies: RIVER_SCENE_FIELDS,
    featureFlags: {
      externalNormal: false,
      depthTint: true,
      coastalAlpha: false,
      contactFoam: false,
      directSpecular: true
    }
  });
  registry.registerOpticsPreset({
    schemaVersion: WaterBodyPresetSchemaVersion.V1,
    id: RIVER_LOCAL_OPTICS_PRESET_ID,
    depthSource: WaterSurfaceDepthSource.LocalBathymetry,
    profile: OPTICAL_PROFILE,
    refractionEnabled: false,
    caustics: false
  });
  registry.registerOpticsPreset({
    schemaVersion: WaterBodyPresetSchemaVersion.V1,
    id: RIVER_SCENE_DEPTH_OPTICS_PRESET_ID,
    depthSource: WaterSurfaceDepthSource.SceneDepth,
    profile: OPTICAL_PROFILE,
    refractionEnabled: true,
    caustics: false
  });
  registry.registerReflectionPolicyPreset(
    createWaterReflectionPolicyPresetV1(RIVER_LOCAL_REFLECTION_POLICY_PRESET_ID, {
      preferred: "analytic",
      fallbacks: Object.freeze([])
    })
  );
  registry.registerReflectionPolicyPreset(
    createWaterReflectionPolicyPresetV1(RIVER_SCENE_REFLECTION_POLICY_PRESET_ID, RIVER_FORMAL_REFLECTION_POLICY)
  );
  registry.registerRenderStatePreset(
    createWaterRenderStatePresetV1({
      id: RIVER_RENDER_STATE_PRESET_ID,
      depthWriteEnabled: false,
      queue: "transparent",
      priorityOffset: 0,
      cullMode: "off",
      blendMode: "alpha"
    })
  );
  registry.registerLookPreset(
    createWaterLookPresetV1({
      ...DEFAULT_WATER_LOOK_RUNTIME_INPUT,
      // All River Looks inherit the same textured drop contract; no legacy shader fallback.
      riverDrops: RIVER_DEFAULT_DROP_LOOK,
      foam: Object.freeze({ enabled: true, intensity: 0.9, color: "#eaf8f7" }),
      id: RIVER_LOCAL_LOOK_PRESET_ID,
      appearanceAssetId: RIVER_LOCAL_PHYSICAL_APPEARANCE.id,
      opticalProfileId: RIVER_LOCAL_OPTICS_PRESET_ID,
      reflectionPolicyId: RIVER_LOCAL_REFLECTION_POLICY_PRESET_ID,
      renderStatePresetId: RIVER_RENDER_STATE_PRESET_ID
    })
  );
  registry.registerLookPreset(
    createWaterLookPresetV1({
      ...DEFAULT_WATER_LOOK_RUNTIME_INPUT,
      // All River Looks inherit the same textured drop contract; no legacy shader fallback.
      riverDrops: RIVER_DEFAULT_DROP_LOOK,
      foam: Object.freeze({ enabled: true, intensity: 0.9, color: "#eaf8f7" }),
      id: RIVER_CANONICAL_LOOK_PRESET_ID,
      appearanceAssetId: RIVER_SCENE_PHYSICAL_APPEARANCE.id,
      opticalProfileId: RIVER_SCENE_DEPTH_OPTICS_PRESET_ID,
      reflectionPolicyId: RIVER_SCENE_REFLECTION_POLICY_PRESET_ID,
      renderStatePresetId: RIVER_RENDER_STATE_PRESET_ID
    })
  );
  const quality = RiverQualityLevel.High;
  const tier = WaterQualityTier.High;
  const planId = riverQualityPlanIdForQuality(quality);
  registry.registerQualityPlan(
    createWaterQualityPlanV2({
      id: planId,
      geometry: tier,
      surfaceShading: tier,
      // River has one High rendering contract.
      sceneFields: "scene-color-depth",
      opaqueDownsampling: "none",
      reflectionBudget: { environment: true, screenSpace: true },
      query: "dense",
      spatialField: {
        maximumHorizontalError: 0.25,
        maximumDepthError: 0,
        maximumGpuDepthDecodeError: 0,
        maximumGpuShoreDecodeError: 0,
        maximumAtlasPixels: Number.MAX_SAFE_INTEGER
      }
    })
  );
  registry.registerRuntimeVariant(RIVER_WATER_BODY_ASSET_ID, {
    id: `water-pcg-river-${tier}-v2`,
    label: "High",
    tier,
    qualityPlanId: planId
  });
}

/** Canonical River source; geometry/flow stay backend-owned while Look is selected by the instance. */
export function createRiverWaterBodyAsset(
  descriptor: RiverNetworkDescriptor,
  assetId: string = RIVER_WATER_BODY_ASSET_ID
) {
  const waterBodyDescriptor: Readonly<RiverWaterBodySourceDescriptorV2> = Object.freeze({
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: descriptor.id,
    surfaceAuthority: descriptor.surfaceAuthority,
    terrain: descriptor.terrain,
    ...(descriptor.connections ? { connections: descriptor.connections } : {}),
    ...(descriptor.drops ? { drops: descriptor.drops } : {}),
    derivation: descriptor.derivation,
    nodes: descriptor.nodes,
    segments: Object.freeze(
      descriptor.segments.map((segment) =>
        Object.freeze({
          id: segment.id,
          from: segment.from,
          to: segment.to,
          order: segment.order,
          curve: Object.freeze({
            mode: segment.curve.mode,
            semantics: segment.curve.semantics,
            points: Object.freeze(
              segment.curve.points.map(({ bankFeather: _visualBankFeather, ...point }) => Object.freeze(point))
            )
          }),
          shape: segment.shape ? Object.freeze({ width: segment.shape.width, depth: segment.shape.depth }) : undefined,
          flow: segment.flow
        })
      )
    ),
    defaults: Object.freeze({
      shape: Object.freeze({
        width: descriptor.defaults.shape.width,
        depth: descriptor.defaults.shape.depth
      }),
      flow: descriptor.defaults.flow,
      surfaceMotion: descriptor.defaults.surfaceMotion
    }),
    disturbances: descriptor.disturbances
  });
  const representationData: Readonly<RiverWaterBodyRepresentationDataV1> = Object.freeze({
    schemaVersion: 1,
    kind: "river-surface-representation",
    defaultBankFeather: descriptor.defaults.shape.bankFeather,
    sampling: Object.freeze({
      maxChordError: descriptor.defaults.quality.geometry.maxChordError,
      maxSegmentCount: descriptor.defaults.quality.geometry.maxSegmentCount,
      budget: descriptor.budget ? Object.freeze({ ...descriptor.budget }) : undefined,
      segments: Object.freeze(
        descriptor.segments.map((segment) =>
          Object.freeze({
            id: segment.id,
            segmentLength: segment.curve.segmentLength
          })
        )
      )
    }),
    segments: Object.freeze(
      descriptor.segments.map((segment) =>
        Object.freeze({
          id: segment.id,
          bankFeather: segment.shape?.bankFeather,
          pointBankFeathers: Object.freeze(
            segment.curve.points.flatMap((point) =>
              point.bankFeather === undefined ? [] : [Object.freeze({ id: point.id, bankFeather: point.bankFeather })]
            )
          )
        })
      )
    )
  });
  const source = Object.freeze({
    schemaVersion: WaterBodySourceSchemaVersion.V1,
    kind: WaterBodySourceKind.SplineProfile,
    capabilities: Object.freeze({
      localBathymetry: true,
      shoreSdf: true,
      current: true
    }),
    descriptor: waterBodyDescriptor
  });
  return createWaterBodyAsset({
    id: assetId,
    kind: "river",
    representation: Object.freeze({ domain: "spline-network", macroSurface: "flow-deformed" }),
    representationData,
    representationDataHash: hashRiverStableValue(representationData),
    sourceHash: hashRiverStableValue(source),
    source
  });
}

export interface RiverWaterBodyInstanceOptions {
  readonly id: string;
  readonly assetId?: string;
  readonly lookPresetId: string;
  readonly qualityPlanId: string;
  readonly visible: boolean;
  readonly priority?: number;
}

/** River instance with no backend-private presentation values. */
export function createRiverWaterBodyInstance(
  options: Readonly<RiverWaterBodyInstanceOptions>
): Readonly<WaterBodyInstance> {
  return createWaterBodyInstance({
    id: options.id,
    assetId: options.assetId ?? RIVER_WATER_BODY_ASSET_ID,
    lookPresetId: options.lookPresetId,
    qualityPlanId: options.qualityPlanId,
    transform: Object.freeze({
      position: Object.freeze([0, 0, 0] as const),
      yawDegrees: 0,
      scaleXZ: Object.freeze([1, 1] as const)
    }),
    visible: options.visible,
    priority: options.priority ?? 10,
    interaction: Object.freeze({ query: true, buoyancy: true, wake: false })
  });
}
