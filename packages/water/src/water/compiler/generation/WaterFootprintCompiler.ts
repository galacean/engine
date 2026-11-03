import type { WaterBodySourceV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterBodyAsset } from "../../authoring/body/WaterBodyAsset";
import {
  canonicalSha256HexToBytes,
  compareCanonicalBytes,
  createCanonicalWaterHashWriter
} from "../shared/CanonicalWaterBinaryWriterV1";
import {
  WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT,
  WaterGenerationCompileContextV1,
  type WaterGenerationLakeShorelineModeV1,
  type WaterGenerationScopedTerrainViewV1,
  normalizeTerrainTileIds
} from "./WaterGenerationCompileContext";

export const WATER_FOOTPRINT_COMPILER_VERSION = 11 as const;
export const WATER_TERRAIN_DEPENDENCY_SCHEMA_VERSION = 3 as const;
const LAKE_COVERAGE_TARGET_TEXEL_MILLIMETRES = 1_000;
const LAKE_COVERAGE_MAXIMUM_EDGE = 256;
const LAKE_COVERAGE_GUARD_MILLIMETRES = 32_000;
const LAKE_MINIMUM_VISIBLE_DEPTH_MILLIMETRES = 0;

export interface CompiledWaterFootprintTileV1 {
  readonly terrainTileId: number;
  readonly cellWidth: number;
  readonly wetMask: Uint8Array;
  readonly depthMillimetres: Uint32Array;
  readonly shoreDistanceMillimetres: Int32Array;
}

/** Canonical Lake render broad phase: conservative Tiles plus Hfinal-derived local Coverage. */
export interface CompiledWaterBasinTileSurfaceV1 {
  readonly topology: "triangle-list";
  /** World-grid offset XYZ in millimetres; every nine values form one triangle. */
  readonly triangleVerticesMillimetres: Int32Array;
  readonly triangleCount: number;
  readonly boundsMillimetres: Readonly<{
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
  }>;
  readonly coverage: Readonly<{
    readonly boundsMillimetres: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
    readonly width: number;
    readonly height: number;
    readonly basinSupport: Uint8Array;
    readonly terrainHeightsMillimetres: Int32Array;
    readonly waterLevelMillimetres: number;
    readonly minimumVisibleDepthMillimetres: number;
  }>;
  readonly basinSupportTexelCount: number;
  readonly visibleCoverageTexelCount: number;
  /** Integer visibility retention ratio over Basin Support, in `[0, 1000]`. */
  readonly visibleCoveragePermille: number;
  readonly visibleConnectedComponentCount: number;
  readonly largestVisibleConnectedComponentTexelCount: number;
  /** Dominant visible component ratio over all visible texels, in `[0, 1000]`. */
  readonly largestVisibleConnectedComponentPermille: number;
  /** Visible water touching the artificial support edge; non-zero surfaces are not closed Lakes. */
  readonly openSupportBoundaryVisibleTexelCount: number;
  readonly openCoverageEdgeVisibleTexelCount: number;
  readonly openBasinBoundaryVisibleTexelCount: number;
  readonly conservativeTileCount: number;
  /** Whether the shoreline closes against Terrain or the Hydrology-authored planned footprint. */
  readonly shorelineMode: "terrain-crossing" | "planned-footprint";
}

export interface CompiledWaterFootprintV1 {
  readonly compilerVersion: 1 | 2 | 5 | 6 | 7 | 8 | 9 | 10 | typeof WATER_FOOTPRINT_COMPILER_VERSION;
  readonly bodyId: string;
  readonly footprintHash: string;
  readonly terrainDependencyTileIds: readonly number[];
  readonly terrainDependencyHash: string;
  readonly maximumTerrainReadHaloMillimetres: number;
  readonly logicalBounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
  readonly wetOwnershipCellCount: number;
  readonly compiledNearshoreCellCount: number;
  readonly tiles: readonly Readonly<CompiledWaterFootprintTileV1>[];
  /** Lake-only render broad phase. Ownership/query semantics remain unchanged. */
  readonly lakeSurface?: Readonly<CompiledWaterBasinTileSurfaceV1>;
}

export interface WaterFootprintCompilationDiagnosticsV1 {
  readonly ownershipPassCount: 1 | 2;
  readonly ownershipCellVisitCount: number;
  readonly bodyCount: number;
  readonly compiledTileCount: number;
  readonly compiledCellCount: number;
  readonly fullWorldPerBodyScanCount: 0;
}

export interface WaterFootprintCompilationResultV1 {
  readonly footprints: readonly Readonly<CompiledWaterFootprintV1>[];
  readonly diagnostics: Readonly<WaterFootprintCompilationDiagnosticsV1>;
}

interface BodyAccumulator {
  readonly asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>;
  readonly tileMasks: Map<number, Uint8Array>;
  readonly includedCells: Set<number>;
  readonly boundaryCells: Set<number>;
  readonly oceanBoundaryTiles: Set<number>;
  wetOwnershipCellCount: number;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface WaterFootprintCompileOptionsV1 {
  /** Preparer-only mode after the complete AssetSet has already been validated. */
  readonly skipOwnersOutsideSelection?: boolean;
}

export class WaterFootprintCompilerV1 {
  compile(
    bodies: readonly Readonly<WaterBodyAsset<WaterBodySourceV1>>[],
    context: WaterGenerationCompileContextV1,
    options: Readonly<WaterFootprintCompileOptionsV1> = {}
  ): Readonly<WaterFootprintCompilationResultV1> {
    context.assertUsable();
    const bodyById = new Map<string, BodyAccumulator>();
    for (const asset of bodies) {
      if (asset.kind === "pool") throw new Error("Authoritative Water generation does not accept Pool WaterBodies.");
      if (bodyById.has(asset.id)) throw new Error(`Duplicate Water footprint body '${asset.id}'.`);
      bodyById.set(asset.id, createAccumulator(asset));
    }
    const resolution = context.ownership.resolution;
    const tileCellWidth = resolution / WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT;
    if (!Number.isInteger(tileCellWidth)) throw new Error("Ownership resolution must divide the 96x96 Tile layout.");

    // Pass 1 groups Lake/River cells and discovers Ocean boundary Tiles. It is
    // one generation-wide pass, never one full pass per WaterBody.
    for (let z = 0; z < resolution; z++) {
      context.assertUsable();
      for (let x = 0; x < resolution; x++) {
        const body = bodyAt(context, bodyById, x, z, options.skipOwnersOutsideSelection === true);
        if (!body) continue;
        body.wetOwnershipCellCount++;
        updateBounds(body, x, z);
        const boundary = isBoundaryCell(context, body.asset.id, x, z);
        if (body.asset.kind === "ocean") {
          if (boundary) body.oceanBoundaryTiles.add(terrainTileIdForOwnershipCell(x, z, tileCellWidth));
          continue;
        }
        includeCell(body, x, z, resolution, tileCellWidth, boundary);
      }
    }

    // Pass 2 retains only bounded nearshore Tiles for Ocean. Deep Ocean area
    // does not allocate masks/depth/SDF and is handled by its camera-relative representation.
    const oceanNearshoreTiles = new Map<string, ReadonlySet<number>>();
    for (const body of bodyById.values()) {
      if (body.asset.kind !== "ocean") continue;
      oceanNearshoreTiles.set(
        body.asset.id,
        new Set(expandTileIds(body.oceanBoundaryTiles, context.budget.maximumTerrainReadHaloMillimetres))
      );
    }
    const hasOcean = oceanNearshoreTiles.size > 0;
    if (hasOcean) {
      for (let z = 0; z < resolution; z++) {
        context.assertUsable();
        for (let x = 0; x < resolution; x++) {
          const body = bodyAt(context, bodyById, x, z, options.skipOwnersOutsideSelection === true);
          if (!body || body.asset.kind !== "ocean") continue;
          const tileId = terrainTileIdForOwnershipCell(x, z, tileCellWidth);
          if (!oceanNearshoreTiles.get(body.asset.id)!.has(tileId)) continue;
          includeCell(body, x, z, resolution, tileCellWidth, isBoundaryCell(context, body.asset.id, x, z));
        }
      }
    }

    const footprints = [...bodyById.values()]
      .sort((left, right) =>
        compareCanonicalBytes(canonicalSha256HexToBytes(left.asset.id), canonicalSha256HexToBytes(right.asset.id))
      )
      .map((body) => compileBodyFootprint(body, resolution, tileCellWidth, context));
    const compiledTileCount = footprints.reduce((sum, footprint) => sum + footprint.tiles.length, 0);
    const compiledCellCount = footprints.reduce((sum, footprint) => sum + footprint.compiledNearshoreCellCount, 0);
    return Object.freeze({
      footprints: Object.freeze(footprints),
      diagnostics: Object.freeze({
        ownershipPassCount: hasOcean ? (2 as const) : (1 as const),
        ownershipCellVisitCount: resolution * resolution * (hasOcean ? 2 : 1),
        bodyCount: bodies.length,
        compiledTileCount,
        compiledCellCount,
        fullWorldPerBodyScanCount: 0 as const
      })
    });
  }
}

function compileBodyFootprint(
  body: BodyAccumulator,
  resolution: number,
  tileCellWidth: number,
  context: WaterGenerationCompileContextV1
): Readonly<CompiledWaterFootprintV1> {
  if (body.wetOwnershipCellCount === 0) throw new Error(`WaterBody '${body.asset.id}' owns no Hydrology cell.`);
  const lakeWaterLevelMillimetres =
    body.asset.kind === "lake" ? sampleUniformLakeWaterLevelMillimetres(body, context) : undefined;
  const ownershipDependencyTileIds = expandTileIds(
    body.asset.kind === "ocean" ? body.oceanBoundaryTiles : body.tileMasks.keys(),
    context.budget.maximumTerrainReadHaloMillimetres
  );
  const dependencyTileIds =
    body.asset.kind === "lake"
      ? normalizeTerrainTileIds([
          ...new Set([...ownershipDependencyTileIds, ...lakeCoverageTerrainDependencyTileIds(body.asset.id, context)])
        ])
      : ownershipDependencyTileIds;
  const lakeSurface =
    body.asset.kind === "lake"
      ? compileBasinConstrainedLakeSurface(body, lakeWaterLevelMillimetres!, dependencyTileIds, context)
      : undefined;
  const terrainDependencyHash = hashWaterTerrainDependencies(
    dependencyTileIds,
    context.budget.maximumTerrainReadHaloMillimetres,
    context
  );
  const shoreDistances = compileInnerShoreDistances(body, resolution, context.transform.ownershipCellMillimetres);
  const tiles = [...body.tileMasks]
    .sort(([left], [right]) => left - right)
    .map(([terrainTileId, wetMask]) => {
      const depthMillimetres = new Uint32Array(wetMask.length);
      const shoreDistanceMillimetres = new Int32Array(wetMask.length);
      const tileX = terrainTileId % WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT;
      const tileZ = Math.floor(terrainTileId / WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT);
      for (let localZ = 0; localZ < tileCellWidth; localZ++) {
        for (let localX = 0; localX < tileCellWidth; localX++) {
          const localIndex = localZ * tileCellWidth + localX;
          if (wetMask[localIndex] === 0) continue;
          const x = tileX * tileCellWidth + localX;
          const z = tileZ * tileCellWidth + localZ;
          const surfaceHeightMillimetres = context.sampleSurfaceHeightMillimetres(body.asset.id, x, z);
          const bedHeightMillimetres = sampleBilinearHfinalMillimetres(context, x, z);
          const depth = surfaceHeightMillimetres - bedHeightMillimetres;
          if (depth <= 0) throw new Error(`WATER_FOOTPRINT_NEGATIVE_DEPTH for '${body.asset.id}' at (${x}, ${z}).`);
          depthMillimetres[localIndex] = depth;
          shoreDistanceMillimetres[localIndex] = shoreDistances.get(z * resolution + x) ?? 0;
        }
      }
      return Object.freeze({
        terrainTileId,
        cellWidth: tileCellWidth,
        wetMask,
        depthMillimetres,
        shoreDistanceMillimetres
      });
    });
  const footprintHash = hashFootprint(body, terrainDependencyHash, lakeSurface, context);
  return Object.freeze({
    compilerVersion: WATER_FOOTPRINT_COMPILER_VERSION,
    bodyId: body.asset.id,
    footprintHash,
    terrainDependencyTileIds: dependencyTileIds,
    terrainDependencyHash,
    maximumTerrainReadHaloMillimetres: context.budget.maximumTerrainReadHaloMillimetres,
    logicalBounds: Object.freeze({ minX: body.minX, minZ: body.minZ, maxX: body.maxX + 1, maxZ: body.maxZ + 1 }),
    wetOwnershipCellCount: body.wetOwnershipCellCount,
    compiledNearshoreCellCount: body.includedCells.size,
    tiles: Object.freeze(tiles),
    lakeSurface
  });
}

function compileInnerShoreDistances(
  body: BodyAccumulator,
  resolution: number,
  ownershipCellMillimetres: number
): ReadonlyMap<number, number> {
  const distances = new Map<number, number>();
  const queue = new MinimumDistanceQueue();
  for (const cell of body.boundaryCells) {
    distances.set(cell, 0);
    queue.push(cell, 0);
  }
  const diagonal = Math.round(Math.SQRT2 * ownershipCellMillimetres);
  const directions = [
    [-1, 0, ownershipCellMillimetres],
    [1, 0, ownershipCellMillimetres],
    [0, -1, ownershipCellMillimetres],
    [0, 1, ownershipCellMillimetres],
    [-1, -1, diagonal],
    [1, -1, diagonal],
    [-1, 1, diagonal],
    [1, 1, diagonal]
  ] as const;
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (distances.get(current.cell) !== current.distance) continue;
    const x = current.cell % resolution;
    const z = Math.floor(current.cell / resolution);
    for (const [dx, dz, cost] of directions) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= resolution || nz >= resolution) continue;
      const neighbor = nz * resolution + nx;
      if (!body.includedCells.has(neighbor)) continue;
      const nextDistance = current.distance + cost;
      if (nextDistance >= (distances.get(neighbor) ?? Number.POSITIVE_INFINITY)) continue;
      distances.set(neighbor, nextDistance);
      queue.push(neighbor, nextDistance);
    }
  }
  return distances;
}

function compileBasinConstrainedLakeSurface(
  body: BodyAccumulator,
  waterLevelMillimetres: number,
  dependencyTileIds: readonly number[],
  context: WaterGenerationCompileContextV1
): Readonly<CompiledWaterBasinTileSurfaceV1> {
  const { minX: minimumX, minZ: minimumZ, maxX: maximumX, maxZ: maximumZ } = lakeCoverageBounds(body.asset.id, context);
  const worldWidth = maximumX - minimumX;
  const worldHeight = maximumZ - minimumZ;
  if (worldWidth <= 0 || worldHeight <= 0) throw new Error("Lake '" + body.asset.id + "' has empty Coverage bounds.");
  const requiredWidth = Math.max(1, Math.ceil(worldWidth / LAKE_COVERAGE_TARGET_TEXEL_MILLIMETRES));
  const requiredHeight = Math.max(1, Math.ceil(worldHeight / LAKE_COVERAGE_TARGET_TEXEL_MILLIMETRES));
  const scale = Math.min(1, LAKE_COVERAGE_MAXIMUM_EDGE / Math.max(requiredWidth, requiredHeight));
  const width = Math.max(2, Math.floor(requiredWidth * scale));
  const height = Math.max(2, Math.floor(requiredHeight * scale));
  const terrain = context.createScopedTerrainView(dependencyTileIds);
  const basinSupport = new Uint8Array(width * height);
  const terrainHeightsMillimetres = new Int32Array(width * height);
  let basinSupportTexelCount = 0;
  let visibleCoverageTexelCount = 0;
  for (let z = 0; z < height; z++) {
    if ((z & 31) === 0) context.assertUsable();
    const worldZOffset = minimumZ + divideRoundTiesToEven(BigInt(2 * z + 1) * BigInt(worldHeight), BigInt(2 * height));
    for (let x = 0; x < width; x++) {
      const index = z * width + x;
      const worldXOffset = minimumX + divideRoundTiesToEven(BigInt(2 * x + 1) * BigInt(worldWidth), BigInt(2 * width));
      const terrainHeight = sampleScopedHfinalMillimetres(terrain, context, worldXOffset, worldZOffset);
      terrainHeightsMillimetres[index] = terrainHeight;
      if (!context.sampleLakeBasinSupport(body.asset.id, worldXOffset, worldZOffset)) {
        continue;
      }
      basinSupport[index] = 1;
      basinSupportTexelCount++;
      if (waterLevelMillimetres - terrainHeight > LAKE_MINIMUM_VISIBLE_DEPTH_MILLIMETRES) {
        visibleCoverageTexelCount++;
      }
    }
  }
  if (basinSupportTexelCount === 0 || visibleCoverageTexelCount === 0) {
    throw new Error("Lake '" + body.asset.id + "' produced no basin-constrained Hfinal Coverage.");
  }
  const visibleConnectivity = compileVisibleCoverageConnectivity(
    basinSupport,
    terrainHeightsMillimetres,
    width,
    height,
    waterLevelMillimetres,
    LAKE_MINIMUM_VISIBLE_DEPTH_MILLIMETRES
  );
  if (visibleConnectivity.visibleTexelCount !== visibleCoverageTexelCount) {
    throw new Error(`Lake '${body.asset.id}' visibility diagnostics diverged from compiled Coverage.`);
  }
  const openBoundary = countOpenSupportBoundaryVisibleTexels(
    basinSupport,
    terrainHeightsMillimetres,
    width,
    height,
    waterLevelMillimetres,
    LAKE_MINIMUM_VISIBLE_DEPTH_MILLIMETRES
  );
  const openSupportBoundaryVisibleTexelCount =
    openBoundary.coverageEdgeVisibleTexelCount + openBoundary.basinBoundaryVisibleTexelCount;
  const shorelineMode = context.lakeShorelineMode(body.asset.id);
  if (shorelineMode === "terrain-crossing" && openSupportBoundaryVisibleTexelCount > 0) {
    throw new Error(
      "WATER_LAKE_BASIN_SUPPORT_OPEN: Lake '" +
        body.asset.id +
        "' has " +
        openSupportBoundaryVisibleTexelCount +
        " visible Coverage texels touching its artificial support boundary (" +
        openBoundary.coverageEdgeVisibleTexelCount +
        " Coverage-edge, " +
        openBoundary.basinBoundaryVisibleTexelCount +
        " Basin-boundary)."
    );
  }
  const coverageBounds = Object.freeze({ minX: minimumX, minZ: minimumZ, maxX: maximumX, maxZ: maximumZ });
  const tiles = compileTerrainCrossingLakeSurface(
    body.asset.id,
    coverageBounds,
    width,
    height,
    basinSupport,
    waterLevelMillimetres,
    shorelineMode,
    context
  );
  return Object.freeze({
    topology: "triangle-list",
    triangleVerticesMillimetres: tiles.triangleVerticesMillimetres,
    triangleCount: tiles.triangleVerticesMillimetres.length / 9,
    boundsMillimetres: tiles.boundsMillimetres,
    coverage: Object.freeze({
      boundsMillimetres: coverageBounds,
      width,
      height,
      basinSupport,
      terrainHeightsMillimetres,
      waterLevelMillimetres,
      minimumVisibleDepthMillimetres: LAKE_MINIMUM_VISIBLE_DEPTH_MILLIMETRES
    }),
    basinSupportTexelCount,
    visibleCoverageTexelCount,
    visibleCoveragePermille: Math.floor((visibleCoverageTexelCount * 1_000) / basinSupportTexelCount),
    visibleConnectedComponentCount: visibleConnectivity.componentCount,
    largestVisibleConnectedComponentTexelCount: visibleConnectivity.largestComponentTexelCount,
    largestVisibleConnectedComponentPermille: Math.floor(
      (visibleConnectivity.largestComponentTexelCount * 1_000) / visibleCoverageTexelCount
    ),
    openSupportBoundaryVisibleTexelCount,
    openCoverageEdgeVisibleTexelCount: openBoundary.coverageEdgeVisibleTexelCount,
    openBasinBoundaryVisibleTexelCount: openBoundary.basinBoundaryVisibleTexelCount,
    conservativeTileCount: tiles.conservativeTileCount,
    shorelineMode
  });
}

function countOpenSupportBoundaryVisibleTexels(
  basinSupport: Uint8Array,
  terrainHeightsMillimetres: Int32Array,
  width: number,
  height: number,
  waterLevelMillimetres: number,
  minimumVisibleDepthMillimetres: number
): Readonly<{ coverageEdgeVisibleTexelCount: number; basinBoundaryVisibleTexelCount: number }> {
  let coverageEdgeVisibleTexelCount = 0;
  let basinBoundaryVisibleTexelCount = 0;
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const index = z * width + x;
      if (
        basinSupport[index] === 0 ||
        waterLevelMillimetres - terrainHeightsMillimetres[index]! <= minimumVisibleDepthMillimetres
      ) {
        continue;
      }
      if (x === 0 || z === 0 || x === width - 1 || z === height - 1) {
        coverageEdgeVisibleTexelCount++;
      } else if (
        isUnsupportedVisibleNeighbor(index - 1) ||
        isUnsupportedVisibleNeighbor(index + 1) ||
        isUnsupportedVisibleNeighbor(index - width) ||
        isUnsupportedVisibleNeighbor(index + width)
      ) {
        basinBoundaryVisibleTexelCount++;
      }
    }
  }
  return Object.freeze({ coverageEdgeVisibleTexelCount, basinBoundaryVisibleTexelCount });

  function isUnsupportedVisibleNeighbor(index: number): boolean {
    return (
      basinSupport[index] === 0 &&
      waterLevelMillimetres - terrainHeightsMillimetres[index]! > minimumVisibleDepthMillimetres
    );
  }
}

function compileVisibleCoverageConnectivity(
  basinSupport: Uint8Array,
  terrainHeightsMillimetres: Int32Array,
  width: number,
  height: number,
  waterLevelMillimetres: number,
  minimumVisibleDepthMillimetres: number
): Readonly<{ visibleTexelCount: number; componentCount: number; largestComponentTexelCount: number }> {
  const visible = new Uint8Array(width * height);
  let visibleTexelCount = 0;
  for (let index = 0; index < visible.length; index++) {
    if (
      basinSupport[index] !== 0 &&
      waterLevelMillimetres - terrainHeightsMillimetres[index]! > minimumVisibleDepthMillimetres
    ) {
      visible[index] = 1;
      visibleTexelCount++;
    }
  }
  const visited = new Uint8Array(visible.length);
  let componentCount = 0;
  let largestComponentTexelCount = 0;
  const queue = new Uint32Array(visible.length);
  for (let seed = 0; seed < visible.length; seed++) {
    if (visible[seed] === 0 || visited[seed] !== 0) continue;
    componentCount++;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    visited[seed] = 1;
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % width;
      const z = Math.floor(index / width);
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        z > 0 ? index - width : -1,
        z + 1 < height ? index + width : -1
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || visible[neighbour] === 0 || visited[neighbour] !== 0) continue;
        visited[neighbour] = 1;
        queue[tail++] = neighbour;
      }
    }
    largestComponentTexelCount = Math.max(largestComponentTexelCount, tail);
  }
  return Object.freeze({ visibleTexelCount, componentCount, largestComponentTexelCount });
}

function sampleUniformLakeWaterLevelMillimetres(
  body: BodyAccumulator,
  context: WaterGenerationCompileContextV1
): number {
  const sortedOwnershipCells = [...body.includedCells].sort((left, right) => left - right);
  let waterLevelMillimetres: number | undefined;
  for (const cellIndex of sortedOwnershipCells) {
    const ownershipX = cellIndex % context.transform.ownershipResolution;
    const ownershipZ = Math.floor(cellIndex / context.transform.ownershipResolution);
    const sampled = context.sampleSurfaceHeightMillimetres(body.asset.id, ownershipX, ownershipZ);
    if (waterLevelMillimetres === undefined) waterLevelMillimetres = sampled;
    else if (sampled !== waterLevelMillimetres) {
      throw new Error("Lake '" + body.asset.id + "' does not have one uniform canonical surface height.");
    }
  }
  if (waterLevelMillimetres === undefined) throw new Error("Lake '" + body.asset.id + "' has no surface samples.");
  return waterLevelMillimetres;
}

function lakeCoverageBounds(
  bodyId: string,
  context: WaterGenerationCompileContextV1
): Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }> {
  const bounds = context.lakeBasinBoundsMillimetres(bodyId);
  if (!bounds) throw new Error("Lake '" + bodyId + "' has no active authoritative Basin support.");
  // Keep an explicit guard outside the tight Hydrology support bounds. Without
  // it, the last supported texel is also the Coverage texture edge and a closed
  // Lake is indistinguishable from an artificially clipped surface.
  // Lake Coverage keeps its established one-Tile guard even when another
  // backend (for example Ocean) is authorized to read a wider Terrain halo.
  const guard = Math.min(
    context.budget.maximumTerrainReadHaloMillimetres,
    Math.max(
      LAKE_COVERAGE_GUARD_MILLIMETRES,
      context.lakeSurfaceUnderlapMillimetres(bodyId) + context.budget.maximumFootprintHorizontalErrorMillimetres
    )
  );
  return Object.freeze({
    minX: Math.max(0, bounds.minX - guard),
    minZ: Math.max(0, bounds.minZ - guard),
    maxX: Math.min(context.transform.worldSizeXMillimetres, bounds.maxX + guard),
    maxZ: Math.min(context.transform.worldSizeZMillimetres, bounds.maxZ + guard)
  });
}

function lakeCoverageTerrainDependencyTileIds(
  bodyId: string,
  context: WaterGenerationCompileContextV1
): readonly number[] {
  const bounds = lakeCoverageBounds(bodyId, context);
  const interpolationHalo = context.transform.hfinalSpacingMillimetres;
  const minimumX = Math.max(0, bounds.minX - interpolationHalo);
  const minimumZ = Math.max(0, bounds.minZ - interpolationHalo);
  const maximumX = Math.min(context.transform.worldSizeXMillimetres, bounds.maxX + interpolationHalo);
  const maximumZ = Math.min(context.transform.worldSizeZMillimetres, bounds.maxZ + interpolationHalo);
  const minimumTileX = Math.max(0, Math.floor(minimumX / 32_000));
  const minimumTileZ = Math.max(0, Math.floor(minimumZ / 32_000));
  const maximumTileX = Math.min(95, Math.floor((maximumX - 1) / 32_000));
  const maximumTileZ = Math.min(95, Math.floor((maximumZ - 1) / 32_000));
  const tileIds: number[] = [];
  for (let tileZ = minimumTileZ; tileZ <= maximumTileZ; tileZ++) {
    for (let tileX = minimumTileX; tileX <= maximumTileX; tileX++) {
      tileIds.push(tileZ * WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT + tileX);
    }
  }
  return normalizeTerrainTileIds(tileIds);
}

function sampleScopedHfinalMillimetres(
  terrain: WaterGenerationScopedTerrainViewV1,
  context: WaterGenerationCompileContextV1,
  worldXOffsetMillimetres: number,
  worldZOffsetMillimetres: number
): number {
  const spacing = context.transform.hfinalSpacingMillimetres;
  const maximumVertex = context.transform.hfinalResolution - 1;
  const x0 = Math.min(maximumVertex, Math.max(0, Math.floor(worldXOffsetMillimetres / spacing)));
  const z0 = Math.min(maximumVertex, Math.max(0, Math.floor(worldZOffsetMillimetres / spacing)));
  const x1 = Math.min(maximumVertex, x0 + 1);
  const z1 = Math.min(maximumVertex, z0 + 1);
  const remainderX = x1 === x0 ? 0 : worldXOffsetMillimetres - x0 * spacing;
  const remainderZ = z1 === z0 ? 0 : worldZOffsetMillimetres - z0 * spacing;
  const inverseX = spacing - remainderX;
  const inverseZ = spacing - remainderZ;
  const denominator = BigInt(spacing) * BigInt(spacing) * 65_535n;
  const weightedR16 =
    BigInt(terrain.sampleR16(x0, z0)) * BigInt(inverseX) * BigInt(inverseZ) +
    BigInt(terrain.sampleR16(x1, z0)) * BigInt(remainderX) * BigInt(inverseZ) +
    BigInt(terrain.sampleR16(x0, z1)) * BigInt(inverseX) * BigInt(remainderZ) +
    BigInt(terrain.sampleR16(x1, z1)) * BigInt(remainderX) * BigInt(remainderZ);
  const numerator =
    BigInt(context.hfinal.minimumHeightMillimetres) * denominator +
    BigInt(context.hfinal.maximumHeightMillimetres - context.hfinal.minimumHeightMillimetres) * weightedR16;
  return divideRoundTiesToEven(numerator, denominator);
}

function compileTerrainCrossingLakeSurface(
  bodyId: string,
  bounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>,
  width: number,
  height: number,
  basinSupport: Uint8Array,
  waterLevelMillimetres: number,
  shorelineMode: WaterGenerationLakeShorelineModeV1,
  context: WaterGenerationCompileContextV1
): Readonly<{
  triangleVerticesMillimetres: Int32Array;
  boundsMillimetres: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
  conservativeTileCount: number;
}> {
  const surfaceUnderlapMillimetres = context.lakeSurfaceUnderlapMillimetres(bodyId);
  const triangles: number[] = [];
  let minimumTileX = Number.POSITIVE_INFINITY;
  let minimumTileZ = Number.POSITIVE_INFINITY;
  let maximumTileX = Number.NEGATIVE_INFINITY;
  let maximumTileZ = Number.NEGATIVE_INFINITY;
  let conservativeTileCount = 0;
  const worldWidth = bounds.maxX - bounds.minX;
  const worldHeight = bounds.maxZ - bounds.minZ;
  for (let z = 0; z < height - 1; z++) {
    const z0 = sampleCentreCoordinate(bounds.minZ, worldHeight, z, height);
    const z1 = sampleCentreCoordinate(bounds.minZ, worldHeight, z + 1, height);
    for (let x = 0; x < width - 1; x++) {
      const x0 = sampleCentreCoordinate(bounds.minX, worldWidth, x, width);
      const x1 = sampleCentreCoordinate(bounds.minX, worldWidth, x + 1, width);
      const topLeft = createLakeSurfaceVertex(x0, z0, z * width + x);
      const bottomLeft = createLakeSurfaceVertex(x0, z1, (z + 1) * width + x);
      const bottomRight = createLakeSurfaceVertex(x1, z1, (z + 1) * width + x + 1);
      const topRight = createLakeSurfaceVertex(x1, z0, z * width + x + 1);
      emitClippedTriangle(topLeft, bottomLeft, bottomRight);
      emitClippedTriangle(topLeft, bottomRight, topRight);
    }
  }
  if (conservativeTileCount === 0)
    throw new Error("Lake '" + bodyId + "' produced no terrain-crossing surface triangles.");
  return Object.freeze({
    triangleVerticesMillimetres: Int32Array.from(triangles),
    boundsMillimetres: Object.freeze({
      minX: minimumTileX,
      minZ: minimumTileZ,
      maxX: maximumTileX,
      maxZ: maximumTileZ
    }),
    conservativeTileCount
  });

  function createLakeSurfaceVertex(x: number, z: number, index: number): LakeSurfaceClipVertex {
    const signedDistance = context.sampleLakeSignedDistanceMillimetres(bodyId, x, z);
    const plannedDepth = signedDistance === undefined ? 1 : surfaceUnderlapMillimetres - signedDistance;
    return {
      x,
      z,
      signedDepthMillimetres: shorelineMode === "planned-footprint" ? plannedDepth : basinSupport[index] === 0 ? -1 : 1
    };
  }

  function emitClippedTriangle(
    first: LakeSurfaceClipVertex,
    second: LakeSurfaceClipVertex,
    third: LakeSurfaceClipVertex
  ): void {
    const polygon = clipLakeSurfaceTriangle([first, second, third]);
    if (polygon.length < 3) return;
    for (let index = 1; index < polygon.length - 1; index++) {
      emitTriangle(polygon[0]!, polygon[index]!, polygon[index + 1]!);
    }
  }

  function emitTriangle(
    first: LakeSurfaceClipVertex,
    second: LakeSurfaceClipVertex,
    third: LakeSurfaceClipVertex
  ): void {
    const area = (second.x - first.x) * (third.z - first.z) - (third.x - first.x) * (second.z - first.z);
    if (area === 0) return;
    for (const vertex of [first, second, third]) {
      triangles.push(vertex.x, waterLevelMillimetres, vertex.z);
      minimumTileX = Math.min(minimumTileX, vertex.x);
      minimumTileZ = Math.min(minimumTileZ, vertex.z);
      maximumTileX = Math.max(maximumTileX, vertex.x);
      maximumTileZ = Math.max(maximumTileZ, vertex.z);
    }
    conservativeTileCount++;
  }
}

interface LakeSurfaceClipVertex {
  readonly x: number;
  readonly z: number;
  readonly signedDepthMillimetres: number;
}

function sampleCentreCoordinate(minimum: number, extent: number, index: number, resolution: number): number {
  return minimum + divideRoundTiesToEven(BigInt(2 * index + 1) * BigInt(extent), BigInt(2 * resolution));
}

function clipLakeSurfaceTriangle(vertices: readonly LakeSurfaceClipVertex[]): readonly LakeSurfaceClipVertex[] {
  const clipped: LakeSurfaceClipVertex[] = [];
  for (let index = 0; index < vertices.length; index++) {
    const current = vertices[index]!;
    const previous = vertices[(index + vertices.length - 1) % vertices.length]!;
    const currentInside = current.signedDepthMillimetres > LAKE_MINIMUM_VISIBLE_DEPTH_MILLIMETRES;
    const previousInside = previous.signedDepthMillimetres > LAKE_MINIMUM_VISIBLE_DEPTH_MILLIMETRES;
    if (currentInside !== previousInside) clipped.push(interpolateLakeSurfaceCrossing(previous, current));
    if (currentInside) clipped.push(current);
  }
  return clipped;
}

function interpolateLakeSurfaceCrossing(from: LakeSurfaceClipVertex, to: LakeSurfaceClipVertex): LakeSurfaceClipVertex {
  const denominator = from.signedDepthMillimetres - to.signedDepthMillimetres;
  const amount = denominator === 0 ? 0.5 : from.signedDepthMillimetres / denominator;
  return Object.freeze({
    x: Math.round(from.x + (to.x - from.x) * amount),
    z: Math.round(from.z + (to.z - from.z) * amount),
    signedDepthMillimetres: 0
  });
}

export function hashWaterTerrainDependencies(
  tileIds: readonly number[],
  maximumTerrainReadHaloMillimetres: number,
  context: WaterGenerationCompileContextV1
): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/terrain-dependency/v3", WATER_TERRAIN_DEPENDENCY_SCHEMA_VERSION)
    .writeUint32(maximumTerrainReadHaloMillimetres)
    .writeArray(tileIds, (itemWriter, tileId) => {
      itemWriter.writeUint16(tileId).writeFixedBytes(context.terrainTileDigest(tileId), 32);
    });
  return hash.digestHex();
}

/**
 * Body-static identity that can be evaluated before any Ownership or Hfinal scan.
 * Global Terrain identity is deliberately excluded; only the prior footprint's
 * declared Terrain Tile digests decide whether its compiled content is reusable.
 */
export function hashWaterFootprintPrecompileIdentity(
  asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>,
  context: WaterGenerationCompileContextV1
): string {
  context.assertUsable();
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/footprint-precompile-identity/v1", 1)
    .writeUint16(WATER_FOOTPRINT_COMPILER_VERSION)
    .writeFixedBytes(canonicalSha256HexToBytes(asset.id), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(asset.sourceHash), 32)
    .writeString(asset.kind)
    .writeString(asset.representation.domain)
    .writeString(asset.representation.macroSurface)
    .writeFixedBytes(canonicalSha256HexToBytes(context.transform.worldGridTransformHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(context.ownershipSourceHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(context.budget.waterRenderErrorBudgetHash), 32)
    .writeUint32(context.budget.maximumTerrainReadHaloMillimetres);
  if (asset.kind === "lake") {
    const bounds = context.lakeBasinBoundsMillimetres(asset.id);
    if (!bounds) throw new Error(`Lake '${asset.id}' has no active authoritative Basin support.`);
    writer
      .writeFixedBytes(canonicalSha256HexToBytes(context.lakeBasinSupportSourceHash(asset.id)), 32)
      .writeString(context.lakeShorelineMode(asset.id))
      .writeInt32(bounds.minX)
      .writeInt32(bounds.minZ)
      .writeInt32(bounds.maxX)
      .writeInt32(bounds.maxZ);
  }
  return hash.digestHex();
}

function hashFootprint(
  body: BodyAccumulator,
  terrainDependencyHash: string,
  lakeSurface: Readonly<CompiledWaterBasinTileSurfaceV1> | undefined,
  context: WaterGenerationCompileContextV1
): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/compiled-footprint/v1", WATER_FOOTPRINT_COMPILER_VERSION)
    .writeFixedBytes(canonicalSha256HexToBytes(body.asset.id), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(body.asset.sourceHash), 32)
    .writeString(body.asset.representation.domain)
    .writeString(body.asset.representation.macroSurface)
    .writeFixedBytes(canonicalSha256HexToBytes(context.transform.worldGridTransformHash), 32)
    .writeOptional(lakeSurface ? context.lakeBasinSupportSourceHash(body.asset.id) : undefined, (itemWriter, value) =>
      itemWriter.writeFixedBytes(canonicalSha256HexToBytes(value), 32)
    )
    .writeFixedBytes(canonicalSha256HexToBytes(context.budget.waterRenderErrorBudgetHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(terrainDependencyHash), 32)
    .writeUint32(body.includedCells.size)
    .writeUint8(lakeSurface ? 1 : 0);
  const sortedCells = [...body.includedCells].sort((left, right) => left - right);
  for (const cell of sortedCells) writer.writeUint32(cell);
  if (lakeSurface) {
    writer
      .writeUint32(lakeSurface.triangleCount)
      .writeInt32(lakeSurface.boundsMillimetres.minX)
      .writeInt32(lakeSurface.boundsMillimetres.minZ)
      .writeInt32(lakeSurface.boundsMillimetres.maxX)
      .writeInt32(lakeSurface.boundsMillimetres.maxZ)
      .writeUint32(lakeSurface.coverage.width)
      .writeUint32(lakeSurface.coverage.height)
      .writeInt32(lakeSurface.coverage.boundsMillimetres.minX)
      .writeInt32(lakeSurface.coverage.boundsMillimetres.minZ)
      .writeInt32(lakeSurface.coverage.boundsMillimetres.maxX)
      .writeInt32(lakeSurface.coverage.boundsMillimetres.maxZ)
      .writeInt32(lakeSurface.coverage.waterLevelMillimetres)
      .writeUint32(lakeSurface.coverage.minimumVisibleDepthMillimetres)
      .writeUint32(lakeSurface.basinSupportTexelCount)
      .writeUint32(lakeSurface.visibleCoverageTexelCount)
      .writeUint16(lakeSurface.visibleCoveragePermille)
      .writeUint32(lakeSurface.visibleConnectedComponentCount)
      .writeUint32(lakeSurface.largestVisibleConnectedComponentTexelCount)
      .writeUint16(lakeSurface.largestVisibleConnectedComponentPermille)
      .writeUint32(lakeSurface.openSupportBoundaryVisibleTexelCount)
      .writeUint32(lakeSurface.openCoverageEdgeVisibleTexelCount)
      .writeUint32(lakeSurface.openBasinBoundaryVisibleTexelCount)
      .writeUint32(lakeSurface.conservativeTileCount)
      .writeString(lakeSurface.shorelineMode);
    for (const value of lakeSurface.triangleVerticesMillimetres) writer.writeInt32(value);
    for (const value of lakeSurface.coverage.basinSupport) writer.writeUint8(value);
    for (const value of lakeSurface.coverage.terrainHeightsMillimetres) writer.writeInt32(value);
  }
  return hash.digestHex();
}

function sampleBilinearHfinalMillimetres(
  context: WaterGenerationCompileContextV1,
  ownershipX: number,
  ownershipZ: number
): number {
  const worldXOffsetMillimetres =
    ownershipX * context.transform.ownershipCellMillimetres + context.transform.ownershipCellMillimetres / 2;
  const worldZOffsetMillimetres =
    ownershipZ * context.transform.ownershipCellMillimetres + context.transform.ownershipCellMillimetres / 2;
  const spacing = context.transform.hfinalSpacingMillimetres;
  const maximumVertex = context.transform.hfinalResolution - 1;
  const x0 = Math.min(maximumVertex, Math.floor(worldXOffsetMillimetres / spacing));
  const z0 = Math.min(maximumVertex, Math.floor(worldZOffsetMillimetres / spacing));
  const x1 = Math.min(maximumVertex, x0 + 1);
  const z1 = Math.min(maximumVertex, z0 + 1);
  const remainderX = x1 === x0 ? 0 : worldXOffsetMillimetres - x0 * spacing;
  const remainderZ = z1 === z0 ? 0 : worldZOffsetMillimetres - z0 * spacing;
  const inverseX = spacing - remainderX;
  const inverseZ = spacing - remainderZ;
  const denominator = BigInt(spacing) * BigInt(spacing) * 65_535n;
  const weightedR16 =
    BigInt(context.hfinal.sampleR16(x0, z0)) * BigInt(inverseX) * BigInt(inverseZ) +
    BigInt(context.hfinal.sampleR16(x1, z0)) * BigInt(remainderX) * BigInt(inverseZ) +
    BigInt(context.hfinal.sampleR16(x0, z1)) * BigInt(inverseX) * BigInt(remainderZ) +
    BigInt(context.hfinal.sampleR16(x1, z1)) * BigInt(remainderX) * BigInt(remainderZ);
  const numerator =
    BigInt(context.hfinal.minimumHeightMillimetres) * denominator +
    BigInt(context.hfinal.maximumHeightMillimetres - context.hfinal.minimumHeightMillimetres) * weightedR16;
  return divideRoundTiesToEven(numerator, denominator);
}

function bodyAt(
  context: WaterGenerationCompileContextV1,
  bodyById: ReadonlyMap<string, BodyAccumulator>,
  x: number,
  z: number,
  skipOwnersOutsideSelection: boolean
): BodyAccumulator | undefined {
  const bodyIndex = context.ownership.sampleBodyIndex(x, z);
  if (bodyIndex === 0) return undefined;
  if (bodyIndex === 0xffff) throw new Error(`Water Ownership contains INVALID at (${x}, ${z}).`);
  const bodyId = context.bodyIdForOwnerIndex(bodyIndex);
  if (!bodyId) return undefined;
  const body = bodyById.get(bodyId);
  if (!body && skipOwnersOutsideSelection) return undefined;
  if (!body) throw new Error(`Water Ownership references body '${bodyId}' missing from the Asset Set.`);
  return body;
}

function isBoundaryCell(context: WaterGenerationCompileContextV1, bodyId: string, x: number, z: number): boolean {
  const resolution = context.ownership.resolution;
  if (x === 0 || z === 0 || x + 1 === resolution || z + 1 === resolution) return true;
  return ownerDiffers(x - 1, z) || ownerDiffers(x + 1, z) || ownerDiffers(x, z - 1) || ownerDiffers(x, z + 1);

  function ownerDiffers(neighborX: number, neighborZ: number): boolean {
    const neighborIndex = context.ownership.sampleBodyIndex(neighborX, neighborZ);
    return neighborIndex === 0 || context.bodyIdForOwnerIndex(neighborIndex) !== bodyId;
  }
}

function includeCell(
  body: BodyAccumulator,
  x: number,
  z: number,
  resolution: number,
  tileCellWidth: number,
  boundary: boolean
): void {
  const cell = z * resolution + x;
  body.includedCells.add(cell);
  if (boundary) body.boundaryCells.add(cell);
  const tileId = terrainTileIdForOwnershipCell(x, z, tileCellWidth);
  let mask = body.tileMasks.get(tileId);
  if (!mask) {
    mask = new Uint8Array(tileCellWidth * tileCellWidth);
    body.tileMasks.set(tileId, mask);
  }
  const localX = x % tileCellWidth;
  const localZ = z % tileCellWidth;
  mask[localZ * tileCellWidth + localX] = 1;
}

function expandTileIds(tileIds: Iterable<number>, haloMillimetres: number): readonly number[] {
  if (!Number.isInteger(haloMillimetres) || haloMillimetres < 0) {
    throw new RangeError("Water footprint Terrain read halo must be a non-negative millimetre integer.");
  }
  const radius = Math.ceil(haloMillimetres / 32_000);
  const expanded = new Set<number>();
  for (const tileId of tileIds) {
    const tileX = tileId % WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT;
    const tileZ = Math.floor(tileId / WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = tileX + dx;
        const z = tileZ + dz;
        if (x < 0 || z < 0 || x >= 96 || z >= 96) continue;
        expanded.add(z * 96 + x);
      }
    }
  }
  return normalizeTerrainTileIds([...expanded]);
}

function terrainTileIdForOwnershipCell(x: number, z: number, tileCellWidth: number): number {
  return Math.floor(z / tileCellWidth) * 96 + Math.floor(x / tileCellWidth);
}

function updateBounds(body: BodyAccumulator, x: number, z: number): void {
  body.minX = Math.min(body.minX, x);
  body.minZ = Math.min(body.minZ, z);
  body.maxX = Math.max(body.maxX, x);
  body.maxZ = Math.max(body.maxZ, z);
}

function createAccumulator(asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>): BodyAccumulator {
  return {
    asset,
    tileMasks: new Map(),
    includedCells: new Set(),
    boundaryCells: new Set(),
    oceanBoundaryTiles: new Set(),
    wetOwnershipCellCount: 0,
    minX: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY
  };
}

function divideRoundTiesToEven(numerator: bigint, denominator: bigint): number {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const twiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  let rounded = quotient;
  if (twiceRemainder > denominator || (twiceRemainder === denominator && (quotient & 1n) !== 0n)) {
    rounded += numerator >= 0n ? 1n : -1n;
  }
  const numeric = Number(rounded);
  if (!Number.isSafeInteger(numeric)) throw new RangeError("Hfinal decode exceeds safe integer range.");
  return numeric;
}

interface DistanceEntry {
  readonly cell: number;
  readonly distance: number;
}

class MinimumDistanceQueue {
  private readonly _entries: DistanceEntry[] = [];

  get length(): number {
    return this._entries.length;
  }

  push(cell: number, distance: number): void {
    const entry = { cell, distance };
    this._entries.push(entry);
    let index = this._entries.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (compareDistance(this._entries[parent]!, entry) <= 0) break;
      this._entries[index] = this._entries[parent]!;
      index = parent;
    }
    this._entries[index] = entry;
  }

  pop(): DistanceEntry | undefined {
    if (this._entries.length === 0) return undefined;
    const root = this._entries[0]!;
    const tail = this._entries.pop()!;
    if (this._entries.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this._entries.length) break;
      const right = left + 1;
      const child =
        right < this._entries.length && compareDistance(this._entries[right]!, this._entries[left]!) < 0 ? right : left;
      if (compareDistance(tail, this._entries[child]!) <= 0) break;
      this._entries[index] = this._entries[child]!;
      index = child;
    }
    this._entries[index] = tail;
    return root;
  }
}

function compareDistance(left: DistanceEntry, right: DistanceEntry): number {
  return left.distance - right.distance || left.cell - right.cell;
}
