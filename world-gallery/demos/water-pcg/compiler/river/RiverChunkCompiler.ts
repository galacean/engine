import { RIVER_LIMITS } from "../../authoring/river/RiverAuthoringLimits";
import { RIVER_CHUNK_WORLD_SIZE } from "./constants";
import { createRiverGeometryData } from "./RiverGeometryCompiler";
import { RiverChunkSourceKind } from "./RiverGeometryEnums";
import type {
  ReadonlyVector3Tuple,
  RiverCompiledChunk,
  RiverCompiledReach,
  RiverGeometryData,
  RiverJunctionArtifact,
  Vector2Tuple
} from "./types";

interface TriangleBucket {
  readonly tileX: number;
  readonly tileZ: number;
  readonly part: number;
  readonly triangles: number[][];
  readonly vertexIndices: Set<number>;
}

interface ChunkSource {
  readonly id: string;
  readonly sourceKind: RiverChunkSourceKind;
  readonly sourceIndex: number;
  readonly materialSourceReachIndex: number;
  readonly surfaceGeometry: RiverGeometryData;
  readonly bankFoamGeometry?: RiverGeometryData;
}

function tuple3(x: number, y: number, z: number): ReadonlyVector3Tuple {
  return Object.freeze([x, y, z] as const);
}

function collectTriangleBuckets(geometry: RiverGeometryData): TriangleBucket[] {
  const indices = Array.from(geometry.indices).slice(geometry.drawStart, geometry.drawStart + geometry.drawCount);
  const bucketsByTile = new Map<string, TriangleBucket[]>();
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]];
    const centroidX = triangle.reduce((sum, vertexIndex) => sum + geometry.positions[vertexIndex][0], 0) / 3;
    const centroidZ = triangle.reduce((sum, vertexIndex) => sum + geometry.positions[vertexIndex][2], 0) / 3;
    const tileX = Math.floor((centroidX + RIVER_CHUNK_WORLD_SIZE * 0.5) / RIVER_CHUNK_WORLD_SIZE);
    const tileZ = Math.floor((centroidZ + RIVER_CHUNK_WORLD_SIZE * 0.5) / RIVER_CHUNK_WORLD_SIZE);
    const key = `${tileX}:${tileZ}`;
    const tileBuckets = bucketsByTile.get(key) ?? [];
    let bucket = tileBuckets.at(-1);
    const addedVertexCount = triangle.filter((vertexIndex) => !bucket?.vertexIndices.has(vertexIndex)).length;
    if (!bucket || bucket.vertexIndices.size + addedVertexCount > RIVER_LIMITS.maxChunkVertexCount) {
      bucket = {
        tileX,
        tileZ,
        part: tileBuckets.length,
        triangles: [],
        vertexIndices: new Set<number>()
      };
      tileBuckets.push(bucket);
      bucketsByTile.set(key, tileBuckets);
    }
    bucket.triangles.push(triangle);
    for (const vertexIndex of triangle) bucket.vertexIndices.add(vertexIndex);
  }
  return Array.from(bucketsByTile.values())
    .flat()
    .sort((a, b) => a.tileX - b.tileX || a.tileZ - b.tileZ || a.part - b.part);
}

function sliceGeometry(
  geometry: RiverGeometryData,
  bucket: TriangleBucket,
  localOrigin: ReadonlyVector3Tuple
): RiverGeometryData {
  const sourceVertexIndices = Array.from(bucket.vertexIndices).sort((a, b) => a - b);
  const localIndexBySource = new Map(sourceVertexIndices.map((sourceIndex, localIndex) => [sourceIndex, localIndex]));
  const positions: ReadonlyVector3Tuple[] = sourceVertexIndices.map((sourceIndex) => {
    const position = geometry.positions[sourceIndex];
    return tuple3(position[0] - localOrigin[0], position[1] - localOrigin[1], position[2] - localOrigin[2]);
  });
  const uvs: Vector2Tuple[] = sourceVertexIndices.map((sourceIndex) => geometry.uvs[sourceIndex]);
  const uv1s: Vector2Tuple[] = sourceVertexIndices.map((sourceIndex) => geometry.uv1s[sourceIndex]);
  const indices = bucket.triangles.flatMap((triangle) =>
    triangle.map((sourceIndex) => {
      const localIndex = localIndexBySource.get(sourceIndex);
      if (localIndex === undefined) throw new Error("River chunk vertex remap is incomplete.");
      return localIndex;
    })
  );
  return createRiverGeometryData(positions, uvs, uv1s, indices, indices.length);
}

function compileSourceChunks(source: ChunkSource): RiverCompiledChunk[] {
  return collectTriangleBuckets(source.surfaceGeometry).map((bucket) => {
    const localOrigin = tuple3(bucket.tileX * RIVER_CHUNK_WORLD_SIZE, 0, bucket.tileZ * RIVER_CHUNK_WORLD_SIZE);
    return Object.freeze({
      id: `${source.sourceKind}-${source.id}-${bucket.tileX}-${bucket.tileZ}-${bucket.part}`,
      sourceKind: source.sourceKind,
      sourceIndex: source.sourceIndex,
      materialSourceReachIndex: source.materialSourceReachIndex,
      tileX: bucket.tileX,
      tileZ: bucket.tileZ,
      localOrigin,
      surfaceGeometry: sliceGeometry(source.surfaceGeometry, bucket, localOrigin),
      bankFoamGeometry: source.bankFoamGeometry
        ? sliceGeometry(source.bankFoamGeometry, bucket, localOrigin)
        : undefined
    });
  });
}

export function compileRiverChunks(
  reaches: readonly RiverCompiledReach[],
  junctions: readonly RiverJunctionArtifact[]
): readonly RiverCompiledChunk[] {
  const sources: ChunkSource[] = [
    ...reaches.map((reach, sourceIndex) => ({
      id: reach.id,
      sourceKind: RiverChunkSourceKind.Reach,
      sourceIndex,
      materialSourceReachIndex: sourceIndex,
      surfaceGeometry: reach.artifact.surfaceGeometry,
      bankFoamGeometry: reach.artifact.bankFoamGeometry
    })),
    ...junctions.map((junction, sourceIndex) => ({
      id: junction.id,
      sourceKind: RiverChunkSourceKind.Junction,
      sourceIndex,
      materialSourceReachIndex: junction.materialSourceReachIndex,
      surfaceGeometry: junction.surfaceGeometry,
      bankFoamGeometry: junction.bankFoamGeometry
    }))
  ];
  return Object.freeze(sources.flatMap(compileSourceChunks));
}
