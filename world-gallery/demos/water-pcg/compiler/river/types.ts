/** Engine-object-free contracts produced and consumed by river compilation. */
import type { Vector3 } from "@galacean/engine-math";
import type { RiverAuthoringConfig } from "../../authoring/river/RiverAuthoringTypes";
import type { RiverNetworkSchemaVersion, RiverNodeKind } from "../../authoring/river/RiverAuthoringEnums";
import type { RiverDiagnostic } from "../shared/diagnostics";

export interface ReadonlyUint32Buffer extends Iterable<number> {
  readonly length: number;
  at(index: number): number | undefined;
  toTypedArray(): Uint32Array;
}

export interface ReadonlyFloat32Buffer extends Iterable<number> {
  readonly length: number;
  at(index: number): number | undefined;
  toTypedArray(): Float32Array;
}

export type DeepReadonly<T> = T extends readonly [infer A, infer B, infer C]
  ? readonly [DeepReadonly<A>, DeepReadonly<B>, DeepReadonly<C>]
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface RiverCompiledNode {
  readonly id: string;
  readonly kind: RiverNodeKind;
  readonly position: readonly [number, number, number];
  readonly mergeRadius?: number;
  readonly authoredElevation: number;
  readonly waterSurfaceElevation: number;
  readonly incomingReachIndices: ReadonlyUint32Buffer;
  readonly outgoingReachIndices: ReadonlyUint32Buffer;
}

export interface RiverCompiledReach {
  readonly id: string;
  readonly fromNodeIndex: number;
  readonly toNodeIndex: number;
  readonly order: number;
  readonly elevationDrop: number;
  readonly length: number;
  readonly networkDistanceOffset: number;
  readonly sampleCount: number;
  readonly config: DeepReadonly<RiverAuthoringConfig>;
  readonly artifact: RiverReachArtifact;
}

export interface RiverCompileStats {
  readonly nodeCount: number;
  readonly reachCount: number;
  readonly sourceCount: number;
  readonly mouthCount: number;
  readonly junctionCount: number;
  readonly maxReachOrder: number;
  readonly endpointSnapCount: number;
  readonly reversedElevationCount: number;
  readonly waterProfileAdjustmentCount: number;
  readonly sampleCount: number;
  readonly vertexCount: number;
  readonly chunkCount: number;
  readonly mapPixelCount: number;
  readonly budgetRedistributed: boolean;
  readonly minWaterSurfaceElevation: number;
  readonly maxWaterSurfaceElevation: number;
}

export interface RiverCompiledData {
  readonly schemaVersion: RiverNetworkSchemaVersion;
  readonly sourceId: string;
  readonly nodes: readonly RiverCompiledNode[];
  readonly reaches: readonly RiverCompiledReach[];
  readonly topologicalNodeIndices: ReadonlyUint32Buffer;
  readonly waterSurfaceElevations: ReadonlyFloat32Buffer;
  readonly diagnostics: readonly RiverDiagnostic[];
  readonly stats: RiverCompileStats;
}

export interface RiverCompileResult {
  readonly data?: RiverCompiledData;
  readonly diagnostics: readonly RiverDiagnostic[];
  readonly valid: boolean;
}

export interface RiverSamplePoint {
  position: Vector3;
  tangent: Vector3;
  distance: number;
  width: number;
  depth: number;
  flowSpeed: number;
  bankFeather: number;
}

export interface RiverSampleResult {
  points: RiverSamplePoint[];
  totalLength: number;
  diagnostics: RiverDiagnostic[];
}

export type Vector2Tuple = readonly [number, number];
export type ReadonlyVector3Tuple = readonly [number, number, number];

export interface RiverCompiledSample {
  readonly position: ReadonlyVector3Tuple;
  readonly tangent: ReadonlyVector3Tuple;
  readonly distance: number;
  readonly width: number;
  readonly depth: number;
  readonly flowSpeed: number;
  readonly bankFeather: number;
}

export interface RiverGeometryBounds {
  readonly min: ReadonlyVector3Tuple;
  readonly max: ReadonlyVector3Tuple;
}

/** Plain CPU geometry. Runtime owns conversion and GPU upload. */
export interface RiverGeometryData {
  readonly positions: readonly ReadonlyVector3Tuple[];
  readonly uvs: readonly Vector2Tuple[];
  readonly uv1s: readonly Vector2Tuple[];
  readonly indices: ReadonlyUint32Buffer;
  readonly bounds: RiverGeometryBounds;
  readonly drawStart: number;
  readonly drawCount: number;
}

export interface RiverQuerySourceData {
  readonly samples: ReadonlyFloat32Buffer;
  readonly stride: number;
  readonly sampleCount: number;
}

export interface RiverGeometryAnalysis {
  readonly sharpBendFallbackCount: number;
  readonly bankSelfIntersectionCount: number;
  readonly degenerateTriangleCount: number;
}

export interface RiverReachArtifact {
  readonly samples: readonly RiverCompiledSample[];
  readonly totalLength: number;
  readonly diagnostics: readonly RiverDiagnostic[];
  readonly geometryAnalysis: RiverGeometryAnalysis;
  readonly surfaceGeometry: RiverGeometryData;
  readonly bankFoamGeometry?: RiverGeometryData;
  readonly querySource: RiverQuerySourceData;
}

export interface TerrainHeightSampler {
  getHeight(x: number, z: number): number;
}
