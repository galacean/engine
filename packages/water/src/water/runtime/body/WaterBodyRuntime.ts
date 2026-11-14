/** Backend-neutral runtime interfaces published by every active Water body. */
import type { WaterBodySourceKind } from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterBodyKind, WaterRepresentationV1 } from "../../authoring/body/WaterBodyRepresentation";
import type { WaterLocalFieldProvider } from "../interaction/WaterLocalFieldProvider";
import type { WaterSurfaceInteractionSink } from "../interaction/WaterSurfaceInteractionSink";
import type { WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import type { WaterSurfaceProvider } from "../query/WaterSurfaceProvider";
import type { WaterSpatialFieldProvider } from "../spatial/WaterSpatialFieldProvider";
import {
  createWaterBodyCapabilitySnapshot,
  DEFAULT_WATER_SURFACE_PROVIDER_FEATURES,
  type WaterBodyCapabilitySnapshot,
  type WaterSimulationHandle,
  type WaterSurfaceProviderFeatures
} from "./WaterBodyCapabilities";
import type { WaterVolumeProvider } from "./WaterVolumeProvider";

export interface WaterBoundsXZ {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

export interface WaterBodyRuntime {
  readonly id: string;
  readonly resolvedBackendId: string;
  readonly kind: WaterBodyKind;
  readonly representation: WaterRepresentationV1;
  readonly sourceKind: WaterBodySourceKind;
  /** Derived readback; providers below remain the only capability truth. */
  readonly capabilities: WaterBodyCapabilitySnapshot;
  readonly surface?: WaterSurfaceProvider;
  readonly surfaceFeatures: WaterSurfaceProviderFeatures;
  readonly spatialField?: WaterSpatialFieldProvider;
  readonly localField?: WaterLocalFieldProvider;
  readonly volume?: WaterVolumeProvider;
  readonly simulation?: WaterSimulationHandle;
  /**
   * Optional body-owned receiver for contact-driven deformation, wake, or
   * bounded foam input. General surface queries never imply that this sink
   * exists.
   */
  readonly interactionSink?: WaterSurfaceInteractionSink;
  readonly opticalProfile?: WaterOpticalProfile;
  readonly bounds: WaterBoundsXZ;
  readonly exclusionBounds: readonly WaterBoundsXZ[];
  readonly priority: number;
  enabled: boolean;
}

export interface WaterBodyRuntimeConfig
  extends Omit<WaterBodyRuntime, "enabled" | "exclusionBounds" | "capabilities" | "surfaceFeatures"> {
  readonly enabled?: boolean;
  readonly exclusionBounds?: readonly WaterBoundsXZ[];
  readonly surfaceFeatures?: Partial<WaterSurfaceProviderFeatures>;
}

export class WaterBodyRuntimeAdapter implements WaterBodyRuntime {
  readonly id: string;
  readonly resolvedBackendId: string;
  readonly kind: WaterBodyKind;
  readonly representation: WaterRepresentationV1;
  readonly sourceKind: WaterBodySourceKind;
  readonly capabilities: WaterBodyCapabilitySnapshot;
  readonly surface?: WaterSurfaceProvider;
  readonly surfaceFeatures: WaterSurfaceProviderFeatures;
  readonly spatialField?: WaterSpatialFieldProvider;
  readonly localField?: WaterLocalFieldProvider;
  readonly volume?: WaterVolumeProvider;
  readonly simulation?: WaterSimulationHandle;
  readonly interactionSink?: WaterSurfaceInteractionSink;
  private _opticalProfile?: WaterOpticalProfile;
  readonly bounds: WaterBoundsXZ;
  readonly exclusionBounds: readonly WaterBoundsXZ[];
  readonly priority: number;
  enabled: boolean;

  constructor(config: WaterBodyRuntimeConfig) {
    this.id = config.id;
    this.resolvedBackendId = config.resolvedBackendId;
    this.kind = config.kind;
    this.representation = config.representation;
    this.sourceKind = config.sourceKind;
    this.surface = config.surface;
    this.surfaceFeatures = Object.freeze({
      velocity: config.surfaceFeatures?.velocity ?? DEFAULT_WATER_SURFACE_PROVIDER_FEATURES.velocity,
      deformation: config.surfaceFeatures?.deformation ?? DEFAULT_WATER_SURFACE_PROVIDER_FEATURES.deformation,
      latencyFrames: config.surfaceFeatures?.latencyFrames ?? DEFAULT_WATER_SURFACE_PROVIDER_FEATURES.latencyFrames
    });
    this.spatialField = config.spatialField;
    this.localField = config.localField;
    this.volume = config.volume;
    this.simulation = config.simulation;
    this.interactionSink = config.interactionSink;
    this._opticalProfile = config.opticalProfile;
    this.bounds = config.bounds;
    this.exclusionBounds = config.exclusionBounds ?? Object.freeze([]);
    this.priority = config.priority;
    this.enabled = config.enabled ?? true;
    this.capabilities = createWaterBodyCapabilitySnapshot(this);
  }

  get opticalProfile(): WaterOpticalProfile | undefined {
    return this._opticalProfile;
  }

  /** Updates derived Optics readback without replacing geometry or providers. */
  setOpticalProfile(profile: WaterOpticalProfile | undefined): void {
    this._opticalProfile = profile;
  }
}

export function containsWaterBounds(bounds: WaterBoundsXZ, worldX: number, worldZ: number): boolean {
  return worldX >= bounds.minX && worldX <= bounds.maxX && worldZ >= bounds.minZ && worldZ <= bounds.maxZ;
}
