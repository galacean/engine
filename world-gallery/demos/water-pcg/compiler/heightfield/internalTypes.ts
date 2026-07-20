import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import type { HeightfieldWaterCompiledComponent } from "./HeightfieldWaterCompiledTypes";

export interface PreparedHeightfieldWaterData {
  readonly descriptor: HeightfieldWaterDescriptorV1;
  readonly wetMask: Uint8Array;
  readonly componentIndices: Int32Array;
  readonly surfaceHeights: Float32Array;
  readonly bedHeights: Float32Array;
  readonly flowVectorsXZ: Float32Array;
  readonly wetOrdinalByTexel: Int32Array;
  readonly components: readonly HeightfieldWaterCompiledComponent[];
}

export interface HeightfieldWaterRenderCell {
  readonly id: string;
  readonly componentIndex: number;
  readonly blockX: number;
  readonly blockZ: number;
  readonly minSourceX: number;
  readonly minSourceZ: number;
  readonly maxSourceX: number;
  readonly maxSourceZ: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly centerHeight: number;
}

export interface HeightfieldWaterSurfaceVertex {
  readonly key: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly tangentZ: number;
}

export interface HeightfieldWaterSurfaceTopology {
  readonly cells: readonly HeightfieldWaterRenderCell[];
  readonly cornerVertices: ReadonlyMap<string, HeightfieldWaterSurfaceVertex>;
  readonly centerVertices: ReadonlyMap<string, HeightfieldWaterSurfaceVertex>;
}
