/** Reference-counted owner of the immutable Ocean render atlas. */
import type {
  OceanNearshoreCompiledData,
  OceanNearshoreStaticAtlas
} from "../../compiler/ocean/OceanNearshoreCompiledTypes";
import {
  WaterReferenceCountedCompiledResource,
  type WaterCompiledBackendRouteIdentity
} from "../../compiler/body/WaterCompiledResource";
import { WaterBodySourceKind } from "../../authoring/body/WaterBodyAuthoringTypes";
import { createPhysicalSurfaceIdentity } from "../../authoring/body/PhysicalSurfaceIdentity";
import { hashStableValue } from "../../compiler/shared/determinism";
import { createWaterRepresentationV1 } from "../../authoring/body/WaterBodyRepresentation";
import { createWaterResourceMemoryMetrics } from "../resources/WaterResourceMetrics";

export interface OceanNearshoreFieldResourceMetadata {
  readonly sourceId: string;
  readonly compiledHash: string;
  readonly width: number;
  readonly height: number;
}

export class OceanNearshoreFieldResource extends WaterReferenceCountedCompiledResource<OceanNearshoreCompiledData> {
  readonly metadata: Readonly<OceanNearshoreFieldResourceMetadata>;

  private constructor(data: OceanNearshoreCompiledData, route: Readonly<WaterCompiledBackendRouteIdentity>) {
    super(
      Object.freeze({
        ...route,
        sourceId: data.sourceId,
        sourceHash: data.sourceHash,
        physicalSurfaceHash: createPhysicalSurfaceIdentity({
          sourceHash: data.sourceHash,
          physicalWaveHash: hashStableValue({ model: "ocean-render-atlas-v1", sourceHash: data.sourceHash })
        }).contentHash,
        compiledHash: data.compiledHash,
        schemaVersion: data.schemaVersion
      }),
      data,
      createWaterResourceMemoryMetrics({ cpuStaticBytes: data.stats.atlasByteLength })
    );
    this.metadata = Object.freeze({
      sourceId: data.sourceId,
      compiledHash: data.compiledHash,
      width: data.grid.width,
      height: data.grid.height
    });
  }

  static create(
    data: OceanNearshoreCompiledData,
    route: Readonly<WaterCompiledBackendRouteIdentity> = Object.freeze({
      resolvedBackendId: "ocean",
      representation: createWaterRepresentationV1({ domain: "world-space-ocean", macroSurface: "gerstner" }),
      sourceKind: WaterBodySourceKind.OceanNearshore
    })
  ): OceanNearshoreFieldResource {
    return new OceanNearshoreFieldResource(data, route);
  }

  get atlas(): OceanNearshoreStaticAtlas {
    return this.data.staticAtlas;
  }

  get byteLength(): number {
    return this.memory.cpuStaticBytes;
  }

  /** Render-only Ocean never materializes a CPU surface-query grid. */
  get hasCpuQueryGrid(): false {
    return false;
  }

  get atlasByteLength(): number {
    return this.data.stats.atlasByteLength;
  }

  get queryByteLength(): 0 {
    return 0;
  }

  protected override onFinalizeDispose(): void {}
}
