/** Reference-counted owner for immutable heightfield-water compiler output. */
import type { HeightfieldWaterCompiledData } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
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
import type { WaterTerrainSnapshot } from "../../authoring/terrain/WaterTerrainSnapshot";

/** Numeric payload accounting, not a JS heap estimate: array/object headers and coordinate tuples are excluded.
 * A resource keeps canonical heights alive even when its immutable authoring source shares those arrays.
 */
function measureCanonicalBedHeightBytes(terrain: WaterTerrainSnapshot): number {
  const arrays = new Set<readonly number[]>();
  let bytes = 0;
  for (const grid of [terrain, ...(terrain.refinements ?? [])]) {
    if (arrays.has(grid.heights)) continue;
    arrays.add(grid.heights);
    bytes += grid.heights.length * Float64Array.BYTES_PER_ELEMENT;
  }
  return bytes;
}

export interface HeightfieldWaterResourceMetadata {
  readonly sourceId: string;
  readonly compiledHash: string;
  readonly chunkCount: number;
}

export interface HeightfieldWaterResourceIdentityOptions {
  readonly physicalSourceHash?: string;
}

export class HeightfieldWaterResource extends WaterReferenceCountedCompiledResource<HeightfieldWaterCompiledData> {
  readonly metadata: HeightfieldWaterResourceMetadata;
  readonly spatialFieldIdentity: WaterCompiledSpatialFieldIdentity;

  private constructor(
    metadata: HeightfieldWaterResourceMetadata,
    data: HeightfieldWaterCompiledData,
    route: Readonly<WaterCompiledBackendRouteIdentity>,
    identityOptions: Readonly<HeightfieldWaterResourceIdentityOptions>
  ) {
    const canonicalBed = data.queryGrid?.bedTerrain;
    // The generic metric counts ArrayBuffers. Keep canonical number[] payload explicit and
    // avoid enumerating every scalar with Object.values only to account it as zero bytes.
    const bufferData = canonicalBed ? { ...data, queryGrid: { ...data.queryGrid!, bedTerrain: undefined } } : data;
    const cpuStaticBytes =
      measureWaterOwnedCpuBytes(bufferData) + (canonicalBed ? measureCanonicalBedHeightBytes(canonicalBed) : 0);
    super(
      Object.freeze({
        ...route,
        sourceId: data.sourceId,
        sourceHash: data.sourceHash,
        physicalSurfaceHash: createPhysicalSurfaceIdentity({
          sourceHash: identityOptions.physicalSourceHash ?? data.sourceHash,
          physicalWaveHash: hashStableValue({
            waveHash: data.waveSet.sourceHash,
            surfaceMotion: data.surfaceMotion
          })
        }).contentHash,
        compiledHash: data.compiledHash,
        schemaVersion: data.schemaVersion
      }),
      data,
      createWaterResourceMemoryMetrics({ cpuStaticBytes })
    );
    this.metadata = metadata;
    this.spatialFieldIdentity = Object.freeze({
      sourceSchemaVersion: data.schemaVersion,
      sourceHash: data.sourceHash,
      compiledHash: data.compiledHash
    });
  }

  static create(
    data: HeightfieldWaterCompiledData,
    route: Readonly<WaterCompiledBackendRouteIdentity> = Object.freeze({
      resolvedBackendId: "heightfield",
      representation: createWaterRepresentationV1({ domain: "bounded-grid", macroSurface: "heightfield" }),
      sourceKind: WaterBodySourceKind.GridMask
    }),
    identityOptions: Readonly<HeightfieldWaterResourceIdentityOptions> = Object.freeze({})
  ): HeightfieldWaterResource {
    return new HeightfieldWaterResource(
      Object.freeze({
        sourceId: data.sourceId,
        compiledHash: data.compiledHash,
        chunkCount: data.chunks.length
      }),
      data,
      route,
      identityOptions
    );
  }

  get byteLength(): number {
    return this.memory.cpuStaticBytes;
  }
}
