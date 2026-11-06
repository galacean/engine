/** Authoritative, immutable readback builder for one committed Water runtime. */
import type { WaterBodyInstance } from "../../authoring/body/WaterBodyInstance";
import type {
  WaterOpticalProfileV1,
  WaterSpatialFieldQualityBudgetV1
} from "../../authoring/body/WaterBodyAuthoringTypes";
import type {
  WaterBodyKind,
  WaterDomainKind,
  WaterMacroSurfaceKind
} from "../../authoring/body/WaterBodyRepresentation";
import type { WaterQualityPlanV2 } from "../../authoring/quality/WaterQualityPlan";
import type {
  CompiledWaterRenderStateV1,
  CompiledWaterRenderContractV1
} from "../../compiler/surface/CompiledWaterRenderContractTypes";
import type { WaterCompiledResource } from "../../compiler/body/WaterCompiledResource";
import type { WaterResourceMemoryMetrics } from "../resources/WaterResourceMetrics";
import { createWaterResourceMemoryMetrics } from "../resources/WaterResourceMetrics";
import type { WaterCameraFeatureRequestLease } from "../optics/CameraWaterFeatureBroker";
import type { WaterReflectionBindingLifecycleInspection } from "../optics/WaterReflectionBindingLifecycle";
import type { WaterRuntimeResourceLease } from "../resources/WaterRuntimeResourceRegistry";
import type { ResolvedWaterBodyInstance, WaterBackendRuntime, WaterBackendUpdateMode } from "./WaterBackendRegistry";
import type { WaterBodyCapabilityNegotiation } from "./WaterBodyConsumerRuntime";
import type { WaterBodyRuntime } from "./WaterBodyRuntime";
import type { EffectiveWaterRuntimeSnapshot } from "../state/EffectiveWaterRuntimeSnapshot";
import type { WaterWorldInteractionChannels, WaterWorldRegistration } from "./WaterWorld";
import { createWaterResolvedQualityReadback, type WaterResolvedQualityReadback } from "./WaterBodyRuntimeSemantics";

export interface WaterBodySpatialFieldInspection {
  readonly sourceSchemaVersion: number;
  readonly sourceHash: string;
  readonly compiledHash: string;
  readonly gpuBindingPublished: boolean;
}

export interface WaterBodyActivationInspection {
  readonly active: boolean;
  readonly visible: boolean;
  readonly queryEnabled: boolean;
  readonly buoyancyEnabled: boolean;
  readonly wakeEnabled: boolean;
  readonly interaction: WaterWorldInteractionChannels;
  readonly revision: number;
  readonly routeRevision: number;
  readonly lastUpdateMode?: WaterBackendUpdateMode;
  readonly bodyId: string;
  readonly backendId?: string;
  readonly sourceKind?: string;
  /** Authoritative instance. */
  readonly instance?: WaterBodyInstance;
  readonly bodyKind?: WaterBodyKind;
  readonly domain?: WaterDomainKind;
  readonly macroSurface?: WaterMacroSurfaceKind;
  readonly resolvedBackendId?: string;
  readonly lookPresetId?: string;
  readonly lookContentHash?: string;
  readonly effectiveSnapshot?: Readonly<EffectiveWaterRuntimeSnapshot>;
  readonly renderContract?: Readonly<Pick<CompiledWaterRenderContractV1, "contentHash" | "variantKey">>;
  readonly appearanceHash?: string;
  readonly opticsContentHash?: string;
  /** Effective immutable Optics values after the active Look overrides are applied. */
  readonly optics?: WaterOpticalProfileV1;
  readonly renderState?: CompiledWaterRenderStateV1;
  readonly qualityPlan?: WaterQualityPlanV2;
  readonly quality?: Readonly<{
    readonly planId: string;
    readonly tier: WaterResolvedQualityReadback["tier"];
    readonly opaqueDownsampling: WaterResolvedQualityReadback["opaqueDownsampling"];
    readonly spatialField: WaterSpatialFieldQualityBudgetV1;
  }>;
  readonly resourceIdentity?: WaterCompiledResource["identity"];
  readonly resourceMemory: WaterResourceMemoryMetrics;
  readonly resourceReferenceCount: number;
  readonly runtimeResourceLeaseCount: number;
  readonly resources: readonly Readonly<{
    readonly id: string;
    readonly kind: string;
    readonly ownership: string;
    readonly fallbackPolicy: string;
    readonly resolved: boolean;
  }>[];
  readonly runtimeMetrics: WaterBodyRuntime["metrics"];
  readonly spatialFieldIdentity?: Readonly<WaterBodySpatialFieldInspection>;
  readonly cameraConsumerIds: readonly string[];
  readonly cameraConsumerCount: number;
  readonly cameraConsumerId?: string;
  readonly capabilities: WaterBodyRuntime["capabilities"];
  readonly capabilityNegotiation?: WaterBodyCapabilityNegotiation;
  readonly reflection?: Readonly<WaterReflectionBindingLifecycleInspection>;
}

export interface WaterRuntimeInspectionSource {
  readonly active: boolean;
  readonly visible: boolean;
  readonly interaction: WaterWorldInteractionChannels;
  readonly revision: number;
  readonly lastUpdateMode?: WaterBackendUpdateMode;
  readonly body: WaterBodyRuntime;
  readonly registration?: WaterWorldRegistration;
  readonly resolvedInstance?: ResolvedWaterBodyInstance;
  readonly effectiveSnapshot?: Readonly<EffectiveWaterRuntimeSnapshot>;
  readonly resource?: WaterCompiledResource;
  readonly resourceLeases: readonly WaterRuntimeResourceLease[];
  readonly cameraLeases: readonly WaterCameraFeatureRequestLease[];
  readonly runtime?: WaterBackendRuntime;
  readonly capabilityNegotiation?: WaterBodyCapabilityNegotiation;
}

export class WaterRuntimeInspectionStore {
  capture(source: Readonly<WaterRuntimeInspectionSource>): Readonly<WaterBodyActivationInspection> {
    const { body, resolvedInstance: resolved, resource } = source;
    const qualityReadback = resolved ? createWaterResolvedQualityReadback(resolved) : undefined;
    const activeCameraLeases = source.cameraLeases.filter((lease) => lease.active);
    return Object.freeze({
      active: source.active,
      visible: source.visible,
      queryEnabled: source.interaction.query,
      buoyancyEnabled: source.interaction.buoyancy,
      wakeEnabled: source.interaction.wake,
      interaction: source.interaction,
      revision: source.revision,
      routeRevision: source.registration?.routeRevision ?? 0,
      lastUpdateMode: source.lastUpdateMode,
      bodyId: body.id,
      backendId: body.resolvedBackendId,
      sourceKind: resolved?.asset.source.kind,
      instance: resolved?.instance,
      bodyKind: resolved?.asset.kind,
      domain: resolved?.asset.representation.domain,
      macroSurface: resolved?.asset.representation.macroSurface,
      resolvedBackendId: body.resolvedBackendId,
      lookPresetId: resolved?.instance.lookPresetId,
      lookContentHash: resolved?.lookContentHash,
      effectiveSnapshot: source.effectiveSnapshot,
      renderContract: resolved
        ? Object.freeze({
            contentHash: resolved.renderContract.contentHash,
            variantKey: resolved.renderContract.variantKey
          })
        : undefined,
      appearanceHash: resolved?.renderContract.surfaceClosure.appearance.appearanceHash,
      opticsContentHash: resolved?.renderContract.optics.contentHash,
      optics: source.effectiveSnapshot?.optics ?? resolved?.renderContract.optics.profile,
      renderState: resolved?.renderContract.renderState,
      qualityPlan: resolved?.qualityPlan,
      quality: qualityReadback
        ? Object.freeze({
            planId: qualityReadback.planId,
            tier: qualityReadback.tier,
            opaqueDownsampling: qualityReadback.opaqueDownsampling,
            spatialField: qualityReadback.spatialField
          })
        : undefined,
      resourceIdentity: resource?.identity,
      resourceMemory: resource?.memory ?? createWaterResourceMemoryMetrics(),
      resourceReferenceCount: resource?.referenceCount ?? 0,
      runtimeResourceLeaseCount: source.resourceLeases.length,
      resources: Object.freeze(
        (resolved?.resources ?? []).map((descriptor) =>
          Object.freeze({
            id: descriptor.id,
            kind: descriptor.kind,
            ownership: descriptor.ownership,
            fallbackPolicy: descriptor.fallbackPolicy,
            resolved: source.resourceLeases.some((lease) => lease.descriptor.id === descriptor.id)
          })
        )
      ),
      runtimeMetrics: body.metrics,
      spatialFieldIdentity: body.spatialField
        ? Object.freeze({
            sourceSchemaVersion: body.spatialField.metadata.sourceSchemaVersion,
            sourceHash: body.spatialField.metadata.sourceHash,
            compiledHash: body.spatialField.metadata.compiledHash,
            gpuBindingPublished: body.spatialField.gpuBinding !== undefined
          })
        : undefined,
      cameraConsumerIds: Object.freeze(activeCameraLeases.map((lease) => lease.consumerId)),
      cameraConsumerCount: activeCameraLeases.length,
      cameraConsumerId: activeCameraLeases[0]?.consumerId,
      capabilities: body.capabilities,
      capabilityNegotiation: source.capabilityNegotiation,
      reflection: source.runtime?.reflection?.inspection
    });
  }
}
