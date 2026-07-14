import { RIVER_LIMITS } from "../../authoring/river/RiverAuthoringLimits";
import { RIVER_CHUNK_WORLD_SIZE } from "./constants";
import { createRiverGeometryData } from "./RiverGeometryCompiler";
import { RiverChunkSourceKind, RiverLocalMapRegionKind } from "./RiverGeometryEnums";
import type {
  ReadonlyVector3Tuple,
  RiverCompiledChunk,
  RiverCompiledReach,
  RiverGeometryData,
  RiverJunctionArtifact,
  RiverLocalMapTileData,
  ReadonlyVector4Tuple,
  RiverVertexColorTuple,
  Vector2Tuple
} from "./types";

interface TriangleBucket {
  readonly tileX: number;
  readonly tileZ: number;
  readonly part: number;
  readonly localMapTileIndex?: number;
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

type LocalMapTileResolver = (worldX: number, worldZ: number) => number | undefined;

function collectTriangleBuckets(
  geometry: RiverGeometryData,
  resolveLocalMapTileIndex?: LocalMapTileResolver
): TriangleBucket[] {
  const indices = Array.from(geometry.indices).slice(geometry.drawStart, geometry.drawStart + geometry.drawCount);
  const bucketsByTile = new Map<string, TriangleBucket[]>();
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]];
    const centroidX = triangle.reduce((sum, vertexIndex) => sum + geometry.positions[vertexIndex][0], 0) / 3;
    const centroidZ = triangle.reduce((sum, vertexIndex) => sum + geometry.positions[vertexIndex][2], 0) / 3;
    const tileX = Math.floor((centroidX + RIVER_CHUNK_WORLD_SIZE * 0.5) / RIVER_CHUNK_WORLD_SIZE);
    const tileZ = Math.floor((centroidZ + RIVER_CHUNK_WORLD_SIZE * 0.5) / RIVER_CHUNK_WORLD_SIZE);
    const localMapTileIndex = resolveLocalMapTileIndex?.(centroidX, centroidZ);
    const key = `${tileX}:${tileZ}:${localMapTileIndex ?? "none"}`;
    const tileBuckets = bucketsByTile.get(key) ?? [];
    let bucket = tileBuckets.at(-1);
    const addedVertexCount = triangle.filter((vertexIndex) => !bucket?.vertexIndices.has(vertexIndex)).length;
    if (!bucket || bucket.vertexIndices.size + addedVertexCount > RIVER_LIMITS.maxChunkVertexCount) {
      bucket = {
        tileX,
        tileZ,
        part: tileBuckets.length,
        localMapTileIndex,
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
    .sort(
      (a, b) =>
        a.tileX - b.tileX ||
        a.tileZ - b.tileZ ||
        (a.localMapTileIndex ?? -1) - (b.localMapTileIndex ?? -1) ||
        a.part - b.part
    );
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
  const normals: ReadonlyVector3Tuple[] | undefined = geometry.normals
    ? sourceVertexIndices.map((sourceIndex) => geometry.normals![sourceIndex])
    : undefined;
  const tangents: ReadonlyVector4Tuple[] | undefined = geometry.tangents
    ? sourceVertexIndices.map((sourceIndex) => geometry.tangents![sourceIndex])
    : undefined;
  const uv2s: Vector2Tuple[] | undefined = geometry.uv2s
    ? sourceVertexIndices.map((sourceIndex) => geometry.uv2s![sourceIndex])
    : undefined;
  const uv3s: Vector2Tuple[] | undefined = geometry.uv3s
    ? sourceVertexIndices.map((sourceIndex) => geometry.uv3s![sourceIndex])
    : undefined;
  const colors: RiverVertexColorTuple[] | undefined = geometry.colors
    ? sourceVertexIndices.map((sourceIndex) => geometry.colors![sourceIndex])
    : undefined;
  const indices = bucket.triangles.flatMap((triangle) =>
    triangle.map((sourceIndex) => {
      const localIndex = localIndexBySource.get(sourceIndex);
      if (localIndex === undefined) throw new Error("River chunk vertex remap is incomplete.");
      return localIndex;
    })
  );
  return createRiverGeometryData(positions, uvs, uv1s, indices, indices.length, colors, {
    normals,
    tangents,
    uv2s,
    uv3s,
    maxDisplacement: geometry.maxDisplacement
  });
}

function createLocalMapTileResolver(
  source: ChunkSource,
  tiles: readonly RiverLocalMapTileData[]
): LocalMapTileResolver | undefined {
  if (source.sourceKind === RiverChunkSourceKind.Junction) {
    const index = tiles.findIndex(
      (tile) => tile.kind === RiverLocalMapRegionKind.Confluence && tile.sourceIndex === source.sourceIndex
    );
    return index >= 0 ? () => index : undefined;
  }
  const obstacleTiles = tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => tile.kind === RiverLocalMapRegionKind.Obstacle);
  if (obstacleTiles.length === 0) return undefined;
  return (worldX, worldZ) => {
    let bestIndex: number | undefined;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const { tile, index } of obstacleTiles) {
      if (worldX < tile.min[0] || worldX > tile.max[0] || worldZ < tile.min[1] || worldZ > tile.max[1]) {
        continue;
      }
      const centerX = (tile.min[0] + tile.max[0]) * 0.5;
      const centerZ = (tile.min[1] + tile.max[1]) * 0.5;
      const distanceSquared = (worldX - centerX) ** 2 + (worldZ - centerZ) ** 2;
      if (distanceSquared < bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        bestIndex = index;
      }
    }
    return bestIndex;
  };
}

function compileSourceChunks(
  source: ChunkSource,
  localMapTiles: readonly RiverLocalMapTileData[]
): RiverCompiledChunk[] {
  const localMapTileResolver = createLocalMapTileResolver(source, localMapTiles);
  const surfaceBuckets = collectTriangleBuckets(source.surfaceGeometry, localMapTileResolver);
  const foamBucketsByKey = new Map(
    (source.bankFoamGeometry ? collectTriangleBuckets(source.bankFoamGeometry, localMapTileResolver) : []).map(
      (bucket) => [`${bucket.tileX}:${bucket.tileZ}:${bucket.localMapTileIndex ?? "none"}:${bucket.part}`, bucket]
    )
  );
  return surfaceBuckets.map((bucket) => {
    const localOrigin = tuple3(bucket.tileX * RIVER_CHUNK_WORLD_SIZE, 0, bucket.tileZ * RIVER_CHUNK_WORLD_SIZE);
    const localMapToken = bucket.localMapTileIndex ?? "none";
    const foamBucket = foamBucketsByKey.get(`${bucket.tileX}:${bucket.tileZ}:${localMapToken}:${bucket.part}`);
    return Object.freeze({
      id: `${source.sourceKind}-${source.id}-${bucket.tileX}-${bucket.tileZ}-${localMapToken}-${bucket.part}`,
      sourceKind: source.sourceKind,
      sourceIndex: source.sourceIndex,
      materialSourceReachIndex: source.materialSourceReachIndex,
      tileX: bucket.tileX,
      tileZ: bucket.tileZ,
      localOrigin,
      localMapTileIndex: bucket.localMapTileIndex,
      surfaceGeometry: sliceGeometry(source.surfaceGeometry, bucket, localOrigin),
      bankFoamGeometry:
        source.bankFoamGeometry && foamBucket
          ? sliceGeometry(source.bankFoamGeometry, foamBucket, localOrigin)
          : undefined
    });
  });
}

export function compileRiverChunks(
  reaches: readonly RiverCompiledReach[],
  junctions: readonly RiverJunctionArtifact[],
  localMapTiles: readonly RiverLocalMapTileData[] = []
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
  return Object.freeze(sources.flatMap((source) => compileSourceChunks(source, localMapTiles)));
}
