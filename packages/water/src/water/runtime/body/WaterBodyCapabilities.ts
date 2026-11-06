/** Diagnostic capability snapshots derived from the providers a runtime actually owns. */
import type { WaterBodySourceKind } from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterBodyKind, WaterRepresentationV1 } from "../../authoring/body/WaterBodyRepresentation";
import { WaterLocalModifierChannel, type WaterLocalFieldProvider } from "../interaction/WaterLocalFieldProvider";
import type { BatchWaterSurfaceProvider, WaterSurfaceProvider } from "../query/WaterSurfaceProvider";
import { WaterSpatialFieldChannel, type WaterSpatialFieldProvider } from "../spatial/WaterSpatialFieldProvider";
import type { WaterVolumeProvider } from "./WaterVolumeProvider";

export interface WaterSurfaceProviderFeatures {
  readonly velocity: boolean;
  readonly deformation: boolean;
  readonly latencyFrames: 0 | 1 | 2;
}

export interface WaterSimulationHandle {
  readonly kind: string;
  readonly features: readonly ("deformation" | "temporal-foam")[];
}

/** Read-only observability; never accepted as a second source of runtime truth. */
export interface WaterBodyCapabilitySnapshot {
  readonly finalSurfaceQuery: boolean;
  readonly batchQuery: boolean;
  readonly spatialField: boolean;
  readonly localBathymetry: boolean;
  readonly shoreSdf: boolean;
  readonly surfaceVelocity: boolean;
  readonly localCurrent: boolean;
  readonly deformation: boolean;
  readonly temporalFoam: boolean;
  readonly underwaterVolume: boolean;
  readonly queryLatencyFrames: 0 | 1 | 2;
}

export interface WaterBodyCapabilitySource {
  readonly surface?: WaterSurfaceProvider;
  readonly surfaceFeatures: WaterSurfaceProviderFeatures;
  readonly spatialField?: WaterSpatialFieldProvider;
  readonly localField?: WaterLocalFieldProvider;
  readonly volume?: WaterVolumeProvider;
  readonly simulation?: WaterSimulationHandle;
}

export interface WaterSurfaceLayerDescription {
  readonly baseSurface: string;
  readonly visibleMacroSurface: string;
  readonly microNormal: string;
}

export interface WaterBodyCapabilityEntry {
  readonly id: string;
  readonly resolvedBackendId: string;
  readonly kind: WaterBodyKind;
  readonly representation: WaterRepresentationV1;
  readonly sourceKind: WaterBodySourceKind;
  readonly capabilities: WaterBodyCapabilitySnapshot;
}

export const DEFAULT_WATER_SURFACE_PROVIDER_FEATURES: WaterSurfaceProviderFeatures = Object.freeze({
  velocity: false,
  deformation: false,
  latencyFrames: 0
});

export function isBatchWaterSurfaceProvider(provider: WaterSurfaceProvider): provider is BatchWaterSurfaceProvider {
  return "sampleSurfaceBatch" in provider && typeof provider.sampleSurfaceBatch === "function";
}

export function createWaterBodyCapabilitySnapshot(source: WaterBodyCapabilitySource): WaterBodyCapabilitySnapshot {
  const spatialChannels = source.spatialField?.metadata.channels ?? WaterSpatialFieldChannel.None;
  const localChannels = source.localField?.channels ?? WaterLocalModifierChannel.None;
  const simulationFeatures = source.simulation?.features ?? [];
  return Object.freeze({
    finalSurfaceQuery: source.surface !== undefined,
    batchQuery: source.surface !== undefined && isBatchWaterSurfaceProvider(source.surface),
    spatialField: source.spatialField !== undefined,
    localBathymetry: (spatialChannels & WaterSpatialFieldChannel.Bathymetry) !== 0,
    shoreSdf: (spatialChannels & WaterSpatialFieldChannel.ShoreSignedDistance) !== 0,
    surfaceVelocity: source.surface !== undefined && source.surfaceFeatures.velocity,
    localCurrent:
      (spatialChannels & WaterSpatialFieldChannel.Current) !== 0 ||
      (localChannels & (WaterLocalModifierChannel.CurrentLarge | WaterLocalModifierChannel.CurrentRipple)) !== 0,
    deformation:
      source.surfaceFeatures.deformation ||
      (localChannels & (WaterLocalModifierChannel.DisplacementY | WaterLocalModifierChannel.DisplacementXZ)) !== 0 ||
      simulationFeatures.includes("deformation"),
    temporalFoam: simulationFeatures.includes("temporal-foam"),
    underwaterVolume: source.volume !== undefined,
    queryLatencyFrames: source.surface === undefined ? 0 : source.surfaceFeatures.latencyFrames
  });
}
