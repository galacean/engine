/** Transferable wire format for heightfield-water compilation. */
import type { HeightfieldWaterDiagnostic } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { WaterQueryQualityV2 } from "../../authoring/quality/WaterQualityPlan";
import type {
  HeightfieldWaterCompiledChunk,
  HeightfieldWaterCompiledComponent,
  HeightfieldWaterCompiledData,
  HeightfieldWaterGeometryData,
  HeightfieldWaterLocalMapAtlas,
  HeightfieldWaterQueryGrid
} from "./HeightfieldWaterCompiledTypes";
import type { CompiledWaterWaveSet } from "../wave/CompiledWaterWaveTypes";

export enum HeightfieldWaterCompileWorkerMessageKind {
  Compile = "compile",
  Success = "success",
  Failure = "failure"
}

export interface HeightfieldWaterCompileWorkerIdentity {
  readonly sourceId?: string;
  readonly sourceHash?: string;
  readonly generationId?: number;
}

export interface HeightfieldWaterCompileWorkerSerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

export interface HeightfieldWaterCompileWorkerRequest {
  readonly kind: HeightfieldWaterCompileWorkerMessageKind.Compile;
  readonly requestId: number;
  readonly identity: Readonly<HeightfieldWaterCompileWorkerIdentity>;
  readonly source: unknown;
  readonly queryQuality?: WaterQueryQualityV2;
}

export type HeightfieldWaterGeometryTransfer = Omit<
  HeightfieldWaterGeometryData,
  "positions" | "normals" | "tangents" | "uvs" | "indices"
> & {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly tangents: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array;
};

export type HeightfieldWaterChunkTransfer = Omit<HeightfieldWaterCompiledChunk, "geometry"> & {
  readonly geometry: HeightfieldWaterGeometryTransfer;
};

export type HeightfieldWaterComponentTransfer = Omit<HeightfieldWaterCompiledComponent, "wetTexelIndices"> & {
  readonly wetTexelIndices: Uint32Array;
};

export type HeightfieldWaterAtlasTransfer = Omit<HeightfieldWaterLocalMapAtlas, "pixels"> & {
  readonly pixels: Uint8Array;
};

export type HeightfieldWaterQueryGridTransfer = Omit<
  HeightfieldWaterQueryGrid,
  "wetMask" | "shoreDistances" | "componentIndices" | "surfaceHeights" | "bedHeights" | "flowVectorsXZ"
> & {
  readonly wetMask: Uint8Array;
  readonly shoreDistances?: Float32Array;
  readonly componentIndices: Int32Array;
  readonly surfaceHeights: Float32Array;
  readonly bedHeights: Float32Array;
  readonly flowVectorsXZ: Float32Array;
};

export type HeightfieldWaterWaveSetTransfer = Omit<CompiledWaterWaveSet, "packedShaderData"> & {
  readonly packedShaderData: Float32Array;
};

export type HeightfieldWaterCompiledTransfer = Omit<
  HeightfieldWaterCompiledData,
  "components" | "chunks" | "localMapAtlas" | "queryGrid" | "waveSet"
> & {
  readonly components: readonly HeightfieldWaterComponentTransfer[];
  readonly chunks: readonly HeightfieldWaterChunkTransfer[];
  readonly localMapAtlas: HeightfieldWaterAtlasTransfer;
  readonly queryGrid?: HeightfieldWaterQueryGridTransfer;
  readonly waveSet: HeightfieldWaterWaveSetTransfer;
};

export interface HeightfieldWaterCompileWorkerSuccess {
  readonly kind: HeightfieldWaterCompileWorkerMessageKind.Success;
  readonly requestId: number;
  readonly identity: Readonly<HeightfieldWaterCompileWorkerIdentity>;
  readonly data: HeightfieldWaterCompiledTransfer;
}

export interface HeightfieldWaterCompileWorkerFailure {
  readonly kind: HeightfieldWaterCompileWorkerMessageKind.Failure;
  readonly requestId: number;
  readonly identity: Readonly<HeightfieldWaterCompileWorkerIdentity>;
  readonly phase: "compile" | "transfer";
  readonly diagnostics: readonly HeightfieldWaterDiagnostic[];
  readonly error?: Readonly<HeightfieldWaterCompileWorkerSerializedError>;
}

export type HeightfieldWaterCompileWorkerResponse =
  | HeightfieldWaterCompileWorkerSuccess
  | HeightfieldWaterCompileWorkerFailure;
