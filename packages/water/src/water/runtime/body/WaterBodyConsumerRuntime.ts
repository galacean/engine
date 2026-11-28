/** Consumer-facing capability negotiation for one resolved WaterBody instance. */
import type { WaterBodyCapabilityRequirementsV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import {
  WaterLocalModifierChannel,
  type WaterLocalFieldProvider,
  type WaterLocalFieldSample
} from "../interaction/WaterLocalFieldProvider";
import {
  WaterSpatialFieldChannel,
  waterSpatialFieldSnapshot,
  type WaterSpatialFieldGpuBinding,
  type WaterSpatialFieldProvider,
  type WaterSpatialFieldSample
} from "../spatial/WaterSpatialFieldProvider";
import {
  createWaterBodyCapabilitySnapshot,
  type WaterBodyCapabilitySnapshot,
  type WaterSurfaceProviderFeatures
} from "./WaterBodyCapabilities";
import type { WaterBodyRuntime } from "./WaterBodyRuntime";

const CURRENT_LOCAL_CHANNELS = WaterLocalModifierChannel.CurrentLarge | WaterLocalModifierChannel.CurrentRipple;
const SHORE_SPATIAL_CHANNELS = WaterSpatialFieldChannel.ShoreSignedDistance | WaterSpatialFieldChannel.ShoreNormal;

export interface WaterBodyCapabilityNegotiation {
  /** Immutable load-time policy. Required/optional validation belongs to WaterBodyLoader. */
  readonly requirements: WaterBodyCapabilityRequirementsV1;
  /** Raw backend capability snapshot before any instance-level consumer masking. */
  readonly available: WaterBodyCapabilitySnapshot;
  /**
   * Capability snapshot derived from the gameplay-facing view. V1 requirements
   * only mask independently addressable spatial/local fields; final surface
   * velocity, deformation, simulation, and render-facing runtime data remain
   * available.
   */
  readonly enabled: WaterBodyCapabilitySnapshot;
  /** True only when an actually available field was hidden by this instance. */
  readonly disabledByInstance: Readonly<{
    localBathymetry: boolean;
    shoreSdf: boolean;
    current: boolean;
  }>;
}

export interface NegotiatedWaterBodyRuntime {
  readonly body: WaterBodyRuntime;
  readonly negotiation: WaterBodyCapabilityNegotiation;
}

function createLocalFieldProvider(
  source: WaterLocalFieldProvider | undefined,
  currentEnabled: boolean
): WaterLocalFieldProvider | undefined {
  if (!source || currentEnabled) return source;
  const channels = source.channels & ~CURRENT_LOCAL_CHANNELS;
  if (channels === WaterLocalModifierChannel.None) return undefined;
  return Object.freeze({
    channels,
    sampleLocalField(worldX: number, worldZ: number, outSample: WaterLocalFieldSample): boolean {
      const hit = source.sampleLocalField(worldX, worldZ, outSample);
      outSample.currentLargeX = 0;
      outSample.currentLargeZ = 0;
      outSample.currentRippleX = 0;
      outSample.currentRippleZ = 0;
      return hit;
    }
  });
}

function createGpuBinding(
  source: WaterSpatialFieldGpuBinding | undefined,
  channels: number
): WaterSpatialFieldGpuBinding | undefined {
  if (!source) return undefined;
  const enabledChannels = source.channels & channels;
  if (enabledChannels === WaterSpatialFieldChannel.None) {
    return undefined;
  }
  return Object.freeze({
    ...source,
    channels: enabledChannels
  });
}

function maskSpatialSample(
  sample: WaterSpatialFieldSample,
  bathymetryEnabled: boolean,
  shoreEnabled: boolean,
  currentEnabled: boolean
): void {
  if (!bathymetryEnabled) {
    sample.validChannels &= ~WaterSpatialFieldChannel.Bathymetry;
    sample.surfaceHeight = Number.NaN;
    sample.bedHeight = Number.NaN;
    sample.waterDepth = 0;
  }
  if (!shoreEnabled) {
    sample.validChannels &= ~SHORE_SPATIAL_CHANNELS;
    sample.shoreSignedDistance = Number.NaN;
    sample.shoreNormalX = 0;
    sample.shoreNormalZ = 0;
  }
  if (!currentEnabled) {
    sample.validChannels &= ~WaterSpatialFieldChannel.Current;
    sample.currentX = 0;
    sample.currentZ = 0;
  }
}

function createSpatialFieldProvider(
  source: WaterSpatialFieldProvider | undefined,
  requirements: WaterBodyCapabilityRequirementsV1
): WaterSpatialFieldProvider | undefined {
  if (!source) return undefined;
  const bathymetryEnabled = requirements.localBathymetry !== "disabled";
  const shoreEnabled = requirements.shoreSdf !== "disabled";
  const currentEnabled = requirements.current !== "disabled";
  if (bathymetryEnabled && shoreEnabled && currentEnabled) {
    return source;
  }
  let channels = source.metadata.channels;
  if (!bathymetryEnabled) {
    channels &= ~WaterSpatialFieldChannel.Bathymetry;
  }
  if (!shoreEnabled) channels &= ~SHORE_SPATIAL_CHANNELS;
  if (!currentEnabled) {
    channels &= ~WaterSpatialFieldChannel.Current;
  }
  if (channels === WaterSpatialFieldChannel.None) return undefined;
  const metadata = Object.freeze({
    ...source.metadata,
    channels
  });
  const gpuBinding = createGpuBinding(source.gpuBinding, channels);
  return Object.freeze({
    metadata,
    gpuBinding,
    ...(bathymetryEnabled && shoreEnabled && source.nearShore && { nearShore: source.nearShore }),
    ...(bathymetryEnabled &&
      source.maximumSurfaceHeightInBounds && {
        maximumSurfaceHeightInBounds: (
          bounds: Parameters<NonNullable<WaterSpatialFieldProvider["maximumSurfaceHeightInBounds"]>>[0]
        ) => source.maximumSurfaceHeightInBounds!(bounds)
      }),
    ...(source.capture
      ? {
          capture: () => {
            const captured = createSpatialFieldProvider(source.capture!(), requirements);
            if (!captured) throw new Error("Captured Water Spatial Field has no negotiated channels.");
            return waterSpatialFieldSnapshot(captured);
          }
        }
      : {}),
    sampleSpatialField(worldX: number, worldZ: number, outSample: WaterSpatialFieldSample): boolean {
      const resolved = source.sampleSpatialField(worldX, worldZ, outSample);
      maskSpatialSample(outSample, bathymetryEnabled, shoreEnabled, currentEnabled);
      return resolved;
    }
  });
}

class ConsumerWaterBodyRuntime implements WaterBodyRuntime {
  readonly id;
  readonly resolvedBackendId;
  readonly kind;
  readonly representation;
  readonly sourceKind;
  readonly capabilities: WaterBodyCapabilitySnapshot;
  readonly surface;
  readonly surfaceFeatures: WaterSurfaceProviderFeatures;
  readonly spatialField;
  readonly localField;
  readonly volume;
  readonly simulation;
  readonly interactionSink;
  readonly bounds;
  readonly exclusionBounds;
  readonly priority;

  constructor(
    private readonly _source: WaterBodyRuntime,
    requirements: WaterBodyCapabilityRequirementsV1
  ) {
    const currentEnabled = requirements.current !== "disabled";
    this.id = _source.id;
    this.resolvedBackendId = _source.resolvedBackendId;
    this.kind = _source.kind;
    this.representation = _source.representation;
    this.sourceKind = _source.sourceKind;
    /*
     * `WaterSurfaceSample.waterVelocity` is the velocity of the final visible
     * surface. It may combine waves, deformation, and current, and V1 exposes
     * no provenance with which to subtract only current. Keep it intact and
     * mask only the explicit Spatial/Local current channels below.
     */
    this.surface = _source.surface;
    this.surfaceFeatures = _source.surfaceFeatures;
    this.spatialField = createSpatialFieldProvider(_source.spatialField, requirements);
    this.localField = createLocalFieldProvider(_source.localField, currentEnabled);
    this.volume = _source.volume;
    this.simulation = _source.simulation;
    this.interactionSink = _source.interactionSink;
    this.bounds = _source.bounds;
    this.exclusionBounds = _source.exclusionBounds;
    this.priority = _source.priority;
    this.capabilities = createWaterBodyCapabilitySnapshot(this);
  }

  get enabled(): boolean {
    return this._source.enabled;
  }

  get opticalProfile() {
    return this._source.opticalProfile;
  }

  set enabled(value: boolean) {
    this._source.enabled = value;
  }
}

export function createNegotiatedWaterBodyRuntime(
  source: WaterBodyRuntime,
  requirements: WaterBodyCapabilityRequirementsV1
): NegotiatedWaterBodyRuntime {
  const frozenRequirements = Object.freeze({
    localBathymetry: requirements.localBathymetry,
    shoreSdf: requirements.shoreSdf,
    current: requirements.current
  });
  const body = new ConsumerWaterBodyRuntime(source, frozenRequirements);
  return Object.freeze({
    body,
    negotiation: Object.freeze({
      requirements: frozenRequirements,
      available: source.capabilities,
      enabled: body.capabilities,
      disabledByInstance: Object.freeze({
        localBathymetry: frozenRequirements.localBathymetry === "disabled" && source.capabilities.localBathymetry,
        shoreSdf: frozenRequirements.shoreSdf === "disabled" && source.capabilities.shoreSdf,
        current: frozenRequirements.current === "disabled" && source.capabilities.localCurrent
      })
    })
  });
}
