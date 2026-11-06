import {
  assertRiverResourceTransferVersion,
  restoreRiverCompiledTransfer,
  type RiverResourceTransfer
} from "../../compiler/river/RiverResourceTransfer";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import {
  deserializeRiverResource,
  createRiverResourceMetadata,
  encodeRiverResource,
  type RiverResourceMetadata
} from "../../compiler/river/RiverResourceSerializer";
import type { RiverCompiledData } from "../../compiler/river/types";
import {
  WaterReferenceCountedCompiledResource,
  type WaterCompiledBackendRouteIdentity,
  type WaterCompiledSpatialFieldIdentity
} from "../../compiler/body/WaterCompiledResource";
import { WaterBodySourceKind } from "../../authoring/body/WaterBodyAuthoringTypes";
import { createPhysicalSurfaceIdentity } from "../../authoring/body/PhysicalSurfaceIdentity";
import { hashStableValue } from "../../compiler/shared/determinism";
import { createWaterRepresentationV1 } from "../../authoring/body/WaterBodyRepresentation";
import { createWaterResourceMemoryMetrics, measureWaterOwnedCpuBytes } from "../resources/WaterResourceMetrics";
import { WaterBufferOwnership } from "../../compiler/shared/WaterBufferOwnership";

export class RiverResource extends WaterReferenceCountedCompiledResource<RiverCompiledData> {
  readonly metadata: RiverResourceMetadata;
  readonly spatialFieldIdentity: WaterCompiledSpatialFieldIdentity;

  private constructor(
    metadata: RiverResourceMetadata,
    data: RiverCompiledData,
    route: Readonly<WaterCompiledBackendRouteIdentity>,
    physicalSourceHash?: string
  ) {
    super(
      Object.freeze({
        ...route,
        sourceId: data.sourceId,
        sourceHash: metadata.descriptorHash,
        physicalSurfaceHash: createPhysicalSurfaceIdentity({
          sourceHash: physicalSourceHash ?? metadata.descriptorHash,
          physicalWaveHash: hashStableValue({
            model: "river-flow-surface",
            physicalSourceHash: physicalSourceHash ?? metadata.descriptorHash
          })
        }).contentHash,
        compiledHash: metadata.compiledHash,
        schemaVersion: data.schemaVersion
      }),
      data,
      createWaterResourceMemoryMetrics({
        cpuStaticBytes: measureWaterOwnedCpuBytes(data)
      })
    );
    this.metadata = metadata;
    this.spatialFieldIdentity = Object.freeze({
      sourceSchemaVersion: data.schemaVersion,
      sourceHash: metadata.descriptorHash,
      compiledHash: metadata.compiledHash
    });
  }

  static create(
    descriptor: RiverNetworkDescriptor,
    data: RiverCompiledData,
    route: Readonly<WaterCompiledBackendRouteIdentity> = Object.freeze({
      resolvedBackendId: "river",
      representation: createWaterRepresentationV1({ domain: "spline-network", macroSurface: "flow-deformed" }),
      sourceKind: WaterBodySourceKind.SplineProfile
    }),
    physicalSourceHash?: string
  ): RiverResource {
    return new RiverResource(createRiverResourceMetadata(descriptor, data), data, route, physicalSourceHash);
  }

  static deserialize(
    bytes: Uint8Array,
    _ownership = WaterBufferOwnership.Copy,
    route: Readonly<WaterCompiledBackendRouteIdentity> = Object.freeze({
      resolvedBackendId: "river",
      representation: createWaterRepresentationV1({ domain: "spline-network", macroSurface: "flow-deformed" }),
      sourceKind: WaterBodySourceKind.SplineProfile
    }),
    physicalSourceHash?: string
  ): RiverResource {
    // Binary decoding owns the reconstructed data; neither ownership mode retains input bytes.
    const deserialized = deserializeRiverResource(bytes);
    return new RiverResource(deserialized.metadata, deserialized.data, route, physicalSourceHash);
  }

  /** Trusted same-build Worker result: metadata was computed before transferring ownership. */
  static fromWorkerTransfer(transfer: RiverResourceTransfer, physicalSourceHash?: string): RiverResource {
    assertRiverResourceTransferVersion(transfer);
    return new RiverResource(
      Object.freeze(transfer.metadata),
      restoreRiverCompiledTransfer(transfer.data),
      Object.freeze({
        resolvedBackendId: "river",
        representation: createWaterRepresentationV1({ domain: "spline-network", macroSurface: "flow-deformed" }),
        sourceKind: WaterBodySourceKind.SplineProfile
      }),
      physicalSourceHash
    );
  }

  get byteLength(): number {
    return this.memory.totalBytes;
  }

  serialize(): Uint8Array {
    if (this.isDisposed) throw new Error("River resource has been disposed.");
    return encodeRiverResource(this.data, this.metadata);
  }
}
