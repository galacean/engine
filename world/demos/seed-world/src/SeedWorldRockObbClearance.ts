import type { SeedWorldPresentationDecorationInstance } from "@galacean/engine-world-planning/world/SeedWorldDecorations";
import { sampleSeedWorldHeight, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type {
  SeedWorldDetailDensityField,
  SeedWorldPopulationInstance,
  SeedWorldPopulationPreview
} from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";
import type { SeedWorldSolvedRockObb } from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";

const ROCK_OBB_CLEARANCE_HASH_VERSION = "seed-world-rock-obb-clearance/v1";
const POLYGON_EPSILON_METRES = 1e-6;

type Point2 = readonly [x: number, z: number];

/** Convex X-Z occupancy of one final tilted 3D rock OBB or its terrain-contact slice. */
export interface SeedWorldProjectedRockObb {
  readonly rockId: string;
  readonly polygon: readonly Point2[];
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
}

/** Counts removed only by the final rock-OBB occupancy pass. */
export interface SeedWorldRockObbClearanceDiagnostics {
  readonly finalRockCount: number;
  readonly removedDecorations: Readonly<Record<"stone" | "small-rock" | "mushroom" | "lotus", number>>;
  readonly removedPopulation: Readonly<Record<"tree" | "shrub" | "grass" | "flower", number>>;
  readonly clearedDetailTexels: Readonly<Record<"grass" | "flower", number>>;
}

/** Runtime-facing decorations and population after final rock OBBs become authoritative obstacles. */
export interface SeedWorldRockObbClearanceResult {
  readonly decorations: readonly SeedWorldPresentationDecorationInstance[];
  readonly population: SeedWorldPopulationPreview;
  /** Producer-owned trees hidden by final Clif contact and eligible for exact rock-surface grounding. */
  readonly rockSurfaceTreeCandidates: readonly SeedWorldPopulationInstance[];
  readonly diagnostics: SeedWorldRockObbClearanceDiagnostics;
}

/** Optional debug-workbench overrides; production never supplies this adapter. */
export interface SeedWorldRockPreviewOverride {
  readonly rocks: readonly SeedWorldSolvedRockObb[];
  readonly deletedRockIds: readonly string[];
  readonly addedRocks: readonly SeedWorldSolvedRockObb[];
}

/** Resolves transient debug previews without encoding a Seed or generated-world identity. */
export function resolveSeedWorldPublishedRockObbs(
  formalRocks: readonly SeedWorldSolvedRockObb[],
  preview: SeedWorldRockPreviewOverride | undefined
): readonly SeedWorldSolvedRockObb[] {
  if (!preview) return formalRocks;
  const previewById = new Map(preview.rocks.map((rock) => [rock.id, rock] as const));
  const deletedIds = new Set(preview.deletedRockIds);
  return Object.freeze([
    ...formalRocks.filter((rock) => !deletedIds.has(rock.id)).map((rock) => previewById.get(rock.id) ?? rock),
    ...preview.addedRocks
  ]);
}

/**
 * Applies a deterministic downstream occupancy pass without changing layout or rock planning.
 * Exact decorations and woody instances use their authored oriented footprints. Grass density remains
 * continuous beneath rocks so raster-cell clearing cannot create a visible fringe before the mesh boundary.
 */
export function compileSeedWorldRockObbClearance(
  worldSizeMetres: number,
  decorations: readonly SeedWorldPresentationDecorationInstance[],
  population: SeedWorldPopulationPreview,
  finalRocks: readonly SeedWorldSolvedRockObb[],
  terrainFields?: SeedWorldFields,
  rockSurfaceTreeSourceInstances: readonly SeedWorldPopulationInstance[] = population.treeInstances
): SeedWorldRockObbClearanceResult {
  if (!(worldSizeMetres > 0) || !Number.isFinite(worldSizeMetres)) {
    throw new RangeError("Seed World rock OBB clearance requires a positive finite world size");
  }
  const projectedRocks = finalRocks.map(projectSeedWorldRockObbToGround);
  const removedDecorations = { stone: 0, "small-rock": 0, mushroom: 0, lotus: 0 };
  const removedPopulation = { tree: 0, shrub: 0, grass: 0, flower: 0 };
  const clearedDetailTexels = { grass: 0, flower: 0 };
  if (projectedRocks.length === 0) {
    return Object.freeze({
      decorations,
      population,
      rockSurfaceTreeCandidates: Object.freeze([]),
      diagnostics: Object.freeze({
        finalRockCount: 0,
        removedDecorations: Object.freeze(removedDecorations),
        removedPopulation: Object.freeze(removedPopulation),
        clearedDetailTexels: Object.freeze(clearedDetailTexels)
      })
    });
  }

  const projectedPopulationRocks = terrainFields
    ? finalRocks
        .map((rock) => projectSeedWorldRockObbTerrainContactOrUndefined(rock, terrainFields, 0))
        .filter((rock): rock is SeedWorldProjectedRockObb => rock !== undefined)
    : projectedRocks;
  const rockSurfaceTreeCandidates = rockSurfaceTreeSourceInstances.filter(
    (instance) =>
      instance.category === "tree" &&
      seedWorldFootprintOverlapsProjectedRock(instance, worldSizeMetres, projectedPopulationRocks)
  );
  const filteredDecorations = decorations.filter((decoration) => {
    // Supplemental debris is already rejected against every complete projected OBB while it is generated.
    // Trust that internal result here to avoid repeating the same all-rock collision pass for every stone.
    if (
      decoration.category === "stone" &&
      decoration.sourceKind === "land" &&
      decoration.id.startsWith("rock-obb-debris:")
    ) {
      return true;
    }
    if (!seedWorldFootprintOverlapsProjectedRock(decoration, worldSizeMetres, projectedRocks)) return true;
    if (decoration.category !== "rock") removedDecorations[decoration.category]++;
    return false;
  });
  const directlyFilteredTrees = population.treeInstances.filter((instance) => {
    if (!seedWorldFootprintOverlapsProjectedRock(instance, worldSizeMetres, projectedPopulationRocks)) return true;
    removedPopulation[instance.category]++;
    return false;
  });
  const survivingNaturalTreeClusters = new Map<string, SeedWorldPopulationInstance[]>();
  for (const instance of directlyFilteredTrees) {
    if (instance.category !== "tree" || !instance.treeClusterId) continue;
    const cluster = survivingNaturalTreeClusters.get(instance.treeClusterId) ?? [];
    cluster.push(instance);
    survivingNaturalTreeClusters.set(instance.treeClusterId, cluster);
  }
  const retainedNaturalTreeIds = new Set<string>();
  for (const cluster of survivingNaturalTreeClusters.values()) {
    const components = connectedTreeComponents(
      cluster,
      worldSizeMetres,
      population.treeCommunityProfile.groveLinkDistanceMetres
    );
    const retained = components.sort(
      (left, right) => right.length - left.length || left[0]!.id.localeCompare(right[0]!.id)
    )[0];
    if (!retained || retained.length < population.treeCommunityProfile.minimumTreesPerGrove) continue;
    for (const instance of retained) retainedNaturalTreeIds.add(instance.id);
  }
  const filteredTrees = directlyFilteredTrees.map((instance) => {
    if (!instance.treeClusterId || retainedNaturalTreeIds.has(instance.id)) return instance;
    // A final rock may split an authored small grove. Preserve every non-overlapping tree as
    // part of the unchanged macro forest; only the no-longer-complete small-grove identity is removed.
    const { treeClusterId: _removedClusterIdentity, ...macroTree } = instance;
    return Object.freeze(macroTree);
  });
  const masksByResolution = new Map<number, Uint8Array>();
  const filteredDetailFields = population.detailDensityFields.map((field) => {
    if (field.category === "grass") return field;
    let mask = masksByResolution.get(field.resolution);
    if (!mask) {
      mask = compileProjectedRockOccupancyMask(worldSizeMetres, field.resolution, projectedRocks);
      masksByResolution.set(field.resolution, mask);
    }
    const samples = new Uint8Array(field.samples);
    let cleared = 0;
    for (let index = 0; index < samples.length; index++) {
      if (mask[index] === 0 || samples[index] === 0) continue;
      samples[index] = 0;
      cleared++;
    }
    clearedDetailTexels[field.category] += cleared;
    return cleared === 0 ? field : rebuildDetailDensityField(field, samples);
  });
  const populationChanged =
    filteredTrees.length !== population.treeInstances.length ||
    filteredDetailFields.some((field, index) => field !== population.detailDensityFields[index]);
  const clearedPopulation = populationChanged
    ? rebuildPopulationPreview(population, filteredTrees, filteredDetailFields, finalRocks)
    : population;

  return Object.freeze({
    decorations: Object.freeze(filteredDecorations),
    population: clearedPopulation,
    rockSurfaceTreeCandidates: Object.freeze(rockSurfaceTreeCandidates),
    diagnostics: Object.freeze({
      finalRockCount: finalRocks.length,
      removedDecorations: Object.freeze(removedDecorations),
      removedPopulation: Object.freeze(removedPopulation),
      clearedDetailTexels: Object.freeze(clearedDetailTexels)
    })
  });
}

function connectedTreeComponents(
  instances: readonly SeedWorldPopulationInstance[],
  worldSizeMetres: number,
  linkDistanceMetres: number
): SeedWorldPopulationInstance[][] {
  const adjacency = instances.map(() => [] as number[]);
  for (let left = 0; left < instances.length; left++) {
    for (let right = left + 1; right < instances.length; right++) {
      const leftPosition = instances[left]!.normalizedPosition;
      const rightPosition = instances[right]!.normalizedPosition;
      if (
        Math.hypot(
          (leftPosition.x - rightPosition.x) * worldSizeMetres,
          (leftPosition.y - rightPosition.y) * worldSizeMetres
        ) > linkDistanceMetres
      ) {
        continue;
      }
      adjacency[left]!.push(right);
      adjacency[right]!.push(left);
    }
  }
  const visited = new Uint8Array(instances.length);
  const components: SeedWorldPopulationInstance[][] = [];
  for (let start = 0; start < instances.length; start++) {
    if (visited[start]) continue;
    visited[start] = 1;
    const component: SeedWorldPopulationInstance[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const index = stack.pop()!;
      component.push(instances[index]!);
      for (const neighbor of adjacency[index]!) {
        if (visited[neighbor]) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

/**
 * Projects only the part of one tilted OBB that can collide with a ground asset of the requested height.
 * Unlike the full vertical projection, this excludes high overhang volume which is far above Hfinal.
 */
export function projectSeedWorldRockObbTerrainContact(
  rock: SeedWorldSolvedRockObb,
  fields: SeedWorldFields,
  groundAssetHeightMetres: number
): SeedWorldProjectedRockObb {
  return (
    projectSeedWorldRockObbTerrainContactOrUndefined(rock, fields, groundAssetHeightMetres) ??
    projectSeedWorldRockObbToGround(rock)
  );
}

function projectSeedWorldRockObbTerrainContactOrUndefined(
  rock: SeedWorldSolvedRockObb,
  fields: SeedWorldFields,
  groundAssetHeightMetres: number
): SeedWorldProjectedRockObb | undefined {
  if (!Number.isFinite(groundAssetHeightMetres) || groundAssetHeightMetres < 0) {
    throw new RangeError("Seed World rock terrain contact requires a finite non-negative asset height");
  }
  const fullProjection = projectSeedWorldRockObbToGround(rock);
  const worldHalfSize = fields.sizeMetres * 0.5;
  const minimumX = Math.max(-worldHalfSize, fullProjection.minimumX);
  const maximumX = Math.min(worldHalfSize, fullProjection.maximumX);
  const minimumZ = Math.max(-worldHalfSize, fullProjection.minimumZ);
  const maximumZ = Math.min(worldHalfSize, fullProjection.maximumZ);
  if (minimumX >= maximumX || minimumZ >= maximumZ) return undefined;

  const heightSampleSpacing = fields.sizeMetres / Math.max(1, fields.heightResolution - 1);
  const maximumSpan = Math.max(maximumX - minimumX, maximumZ - minimumZ);
  const targetSpacing = Math.max(heightSampleSpacing, maximumSpan / 128);
  const columnCount = Math.max(1, Math.ceil((maximumX - minimumX) / targetSpacing));
  const rowCount = Math.max(1, Math.ceil((maximumZ - minimumZ) / targetSpacing));
  const cellWidth = (maximumX - minimumX) / columnCount;
  const cellDepth = (maximumZ - minimumZ) / rowCount;
  const contactCells: Point2[] = [];
  for (let row = 0; row < rowCount; row++) {
    const worldZ = minimumZ + (row + 0.5) * cellDepth;
    for (let column = 0; column < columnCount; column++) {
      const worldX = minimumX + (column + 0.5) * cellWidth;
      const terrainY = sampleSeedWorldHeight(fields, worldX, worldZ);
      if (
        terrainY === undefined ||
        !verticalSegmentIntersectsRockObb(rock, worldX, worldZ, terrainY, terrainY + groundAssetHeightMetres)
      ) {
        continue;
      }
      const cellMinimumX = worldX - cellWidth * 0.5;
      const cellMaximumX = worldX + cellWidth * 0.5;
      const cellMinimumZ = worldZ - cellDepth * 0.5;
      const cellMaximumZ = worldZ + cellDepth * 0.5;
      contactCells.push(
        Object.freeze([cellMinimumX, cellMinimumZ] as const),
        Object.freeze([cellMaximumX, cellMinimumZ] as const),
        Object.freeze([cellMaximumX, cellMaximumZ] as const),
        Object.freeze([cellMinimumX, cellMaximumZ] as const)
      );
    }
  }
  if (contactCells.length < 3) return undefined;
  return projectedRockObb(rock.id, convexHull(contactCells));
}

/** Projects one complete tilted 3D rock OBB into its exact convex X-Z occupancy. */
export function projectSeedWorldRockObbToGround(rock: SeedWorldSolvedRockObb): SeedWorldProjectedRockObb {
  const tangent = rotateVectorByQuaternion([1, 0, 0], rock.obbRotationQuaternion);
  const vertical = rotateVectorByQuaternion([0, 1, 0], rock.obbRotationQuaternion);
  const uphill = rotateVectorByQuaternion([0, 0, 1], rock.obbRotationQuaternion);
  const halfSizes = rock.obbSizeMetres.map((size) => size * 0.5) as [number, number, number];
  const corners: Point2[] = [];
  for (const tangentSign of [-1, 1]) {
    for (const verticalSign of [-1, 1]) {
      for (const uphillSign of [-1, 1]) {
        corners.push(
          Object.freeze([
            rock.obbCenter[0] +
              tangent[0] * tangentSign * halfSizes[0] +
              vertical[0] * verticalSign * halfSizes[1] +
              uphill[0] * uphillSign * halfSizes[2],
            rock.obbCenter[2] +
              tangent[2] * tangentSign * halfSizes[0] +
              vertical[2] * verticalSign * halfSizes[1] +
              uphill[2] * uphillSign * halfSizes[2]
          ] as const)
        );
      }
    }
  }
  return projectedRockObb(rock.id, convexHull(corners));
}

function projectedRockObb(rockId: string, polygon: readonly Point2[]): SeedWorldProjectedRockObb {
  return Object.freeze({
    rockId,
    polygon,
    minimumX: Math.min(...polygon.map((point) => point[0])),
    maximumX: Math.max(...polygon.map((point) => point[0])),
    minimumZ: Math.min(...polygon.map((point) => point[1])),
    maximumZ: Math.max(...polygon.map((point) => point[1]))
  });
}

function verticalSegmentIntersectsRockObb(
  rock: SeedWorldSolvedRockObb,
  worldX: number,
  worldZ: number,
  minimumY: number,
  maximumY: number
): boolean {
  const start = rotateVectorByQuaternionConjugate(
    [worldX - rock.obbCenter[0], minimumY - rock.obbCenter[1], worldZ - rock.obbCenter[2]],
    rock.obbRotationQuaternion
  );
  const direction = rotateVectorByQuaternionConjugate([0, maximumY - minimumY, 0], rock.obbRotationQuaternion);
  let minimumT = 0;
  let maximumT = 1;
  for (let axis = 0; axis < 3; axis++) {
    const halfSize = rock.obbSizeMetres[axis]! * 0.5;
    const origin = start[axis]!;
    const delta = direction[axis]!;
    if (Math.abs(delta) <= POLYGON_EPSILON_METRES) {
      if (Math.abs(origin) > halfSize + POLYGON_EPSILON_METRES) return false;
      continue;
    }
    const first = (-halfSize - origin) / delta;
    const second = (halfSize - origin) / delta;
    minimumT = Math.max(minimumT, Math.min(first, second));
    maximumT = Math.min(maximumT, Math.max(first, second));
    if (minimumT > maximumT + POLYGON_EPSILON_METRES) return false;
  }
  return true;
}

/** Tests one complete rotated asset footprint against final projected rock occupancy. */
export function seedWorldFootprintOverlapsProjectedRock(
  instance: Pick<SeedWorldPopulationInstance, "normalizedPosition" | "footprintMetres" | "yawRadians">,
  worldSizeMetres: number,
  projectedRocks: readonly SeedWorldProjectedRockObb[]
): boolean {
  const centerX = (instance.normalizedPosition.x - 0.5) * worldSizeMetres;
  const centerZ = (instance.normalizedPosition.y - 0.5) * worldSizeMetres;
  const polygon = orientedRectangle(
    centerX,
    centerZ,
    instance.footprintMetres[0] * 0.5,
    instance.footprintMetres[1] * 0.5,
    instance.yawRadians
  );
  const minimumX = Math.min(...polygon.map((point) => point[0]));
  const maximumX = Math.max(...polygon.map((point) => point[0]));
  const minimumZ = Math.min(...polygon.map((point) => point[1]));
  const maximumZ = Math.max(...polygon.map((point) => point[1]));
  return projectedRocks.some(
    (rock) =>
      rangesOverlap(minimumX, maximumX, rock.minimumX, rock.maximumX) &&
      rangesOverlap(minimumZ, maximumZ, rock.minimumZ, rock.maximumZ) &&
      convexPolygonsOverlap(polygon, rock.polygon)
  );
}

function compileProjectedRockOccupancyMask(
  worldSizeMetres: number,
  resolution: number,
  rocks: readonly SeedWorldProjectedRockObb[]
): Uint8Array {
  if (!Number.isInteger(resolution) || resolution <= 0) {
    throw new RangeError("Seed World rock OBB clearance requires a positive integer Detail resolution");
  }
  const mask = new Uint8Array(resolution * resolution);
  const cellMetres = worldSizeMetres / resolution;
  const halfWorld = worldSizeMetres * 0.5;
  for (const rock of rocks) {
    const minimumCellX = clampCell(Math.floor((rock.minimumX + halfWorld) / cellMetres), resolution);
    const maximumCellX = clampCell(Math.floor((rock.maximumX + halfWorld) / cellMetres), resolution);
    const minimumCellZ = clampCell(Math.floor((rock.minimumZ + halfWorld) / cellMetres), resolution);
    const maximumCellZ = clampCell(Math.floor((rock.maximumZ + halfWorld) / cellMetres), resolution);
    for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ++) {
      const minimumZ = cellZ * cellMetres - halfWorld;
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX++) {
        const minimumX = cellX * cellMetres - halfWorld;
        const cell = Object.freeze([
          Object.freeze([minimumX, minimumZ] as const),
          Object.freeze([minimumX + cellMetres, minimumZ] as const),
          Object.freeze([minimumX + cellMetres, minimumZ + cellMetres] as const),
          Object.freeze([minimumX, minimumZ + cellMetres] as const)
        ]);
        if (convexPolygonsOverlap(cell, rock.polygon)) mask[cellZ * resolution + cellX] = 1;
      }
    }
  }
  return mask;
}

function rebuildDetailDensityField(
  field: SeedWorldDetailDensityField,
  samples: Uint8Array
): SeedWorldDetailDensityField {
  let hash = hashText(0x811c_9dc5, ROCK_OBB_CLEARANCE_HASH_VERSION);
  hash = hashUint32(hash, field.hash);
  for (const sample of samples) hash = hashUint32(hash, sample);
  return Object.freeze({ ...field, samples, hash });
}

function rebuildPopulationPreview(
  preview: SeedWorldPopulationPreview,
  treeInstances: readonly SeedWorldPopulationInstance[],
  detailDensityFields: readonly SeedWorldDetailDensityField[],
  rocks: readonly SeedWorldSolvedRockObb[]
): SeedWorldPopulationPreview {
  let hash = hashText(0x811c_9dc5, ROCK_OBB_CLEARANCE_HASH_VERSION);
  hash = hashUint32(hash, preview.hash);
  for (const rock of rocks) hash = hashText(hash, rock.id);
  for (const instance of treeInstances) hash = hashText(hash, instance.id);
  for (const field of detailDensityFields) hash = hashUint32(hash, field.hash);
  return Object.freeze({
    ...preview,
    treeInstances: Object.freeze([...treeInstances]),
    detailDensityFields: Object.freeze([...detailDensityFields]),
    hash
  });
}

function orientedRectangle(
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
  yawRadians: number
): readonly Point2[] {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  return Object.freeze(
    [
      [-halfWidth, -halfDepth],
      [halfWidth, -halfDepth],
      [halfWidth, halfDepth],
      [-halfWidth, halfDepth]
    ].map(([localX, localZ]) =>
      Object.freeze([centerX + localX! * cosine - localZ! * sine, centerZ + localX! * sine + localZ! * cosine] as const)
    )
  );
}

function convexHull(points: readonly Point2[]): readonly Point2[] {
  const sorted = [...points]
    .sort((left, right) => left[0] - right[0] || left[1] - right[1])
    .filter(
      (point, index, values) =>
        index === 0 ||
        Math.abs(point[0] - values[index - 1]![0]) > POLYGON_EPSILON_METRES ||
        Math.abs(point[1] - values[index - 1]![1]) > POLYGON_EPSILON_METRES
    );
  if (sorted.length <= 2) return Object.freeze(sorted);
  const lower: Point2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross2(lower.at(-2)!, lower.at(-1)!, point) <= POLYGON_EPSILON_METRES) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point2[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross2(upper.at(-2)!, upper.at(-1)!, point) <= POLYGON_EPSILON_METRES) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return Object.freeze([...lower, ...upper]);
}

function convexPolygonsOverlap(left: readonly Point2[], right: readonly Point2[]): boolean {
  if (left.length < 3 || right.length < 3) return false;
  for (const polygon of [left, right]) {
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index]!;
      const end = polygon[(index + 1) % polygon.length]!;
      const axisX = -(end[1] - start[1]);
      const axisZ = end[0] - start[0];
      let leftMinimum = Number.POSITIVE_INFINITY;
      let leftMaximum = Number.NEGATIVE_INFINITY;
      let rightMinimum = Number.POSITIVE_INFINITY;
      let rightMaximum = Number.NEGATIVE_INFINITY;
      for (const point of left) {
        const projection = point[0] * axisX + point[1] * axisZ;
        leftMinimum = Math.min(leftMinimum, projection);
        leftMaximum = Math.max(leftMaximum, projection);
      }
      for (const point of right) {
        const projection = point[0] * axisX + point[1] * axisZ;
        rightMinimum = Math.min(rightMinimum, projection);
        rightMaximum = Math.max(rightMaximum, projection);
      }
      if (leftMaximum < rightMinimum - POLYGON_EPSILON_METRES || rightMaximum < leftMinimum - POLYGON_EPSILON_METRES) {
        return false;
      }
    }
  }
  return true;
}

function rotateVectorByQuaternion(
  vector: readonly [number, number, number],
  quaternion: readonly [number, number, number, number]
): readonly [number, number, number] {
  const [x, y, z, w] = quaternion;
  const crossX = y * vector[2] - z * vector[1];
  const crossY = z * vector[0] - x * vector[2];
  const crossZ = x * vector[1] - y * vector[0];
  const secondCrossX = y * crossZ - z * crossY;
  const secondCrossY = z * crossX - x * crossZ;
  const secondCrossZ = x * crossY - y * crossX;
  return Object.freeze([
    vector[0] + 2 * (w * crossX + secondCrossX),
    vector[1] + 2 * (w * crossY + secondCrossY),
    vector[2] + 2 * (w * crossZ + secondCrossZ)
  ] as const);
}

function rotateVectorByQuaternionConjugate(
  vector: readonly [number, number, number],
  quaternion: readonly [number, number, number, number]
): readonly [number, number, number] {
  return rotateVectorByQuaternion(vector, [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]]);
}

function cross2(origin: Point2, left: Point2, right: Point2): number {
  return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0]);
}

function rangesOverlap(leftMinimum: number, leftMaximum: number, rightMinimum: number, rightMaximum: number): boolean {
  return leftMaximum >= rightMinimum - POLYGON_EPSILON_METRES && rightMaximum >= leftMinimum - POLYGON_EPSILON_METRES;
}

function clampCell(value: number, resolution: number): number {
  return Math.max(0, Math.min(resolution - 1, value));
}

function hashText(hash: number, value: string): number {
  for (let index = 0; index < value.length; index++) hash = hashUint32(hash, value.charCodeAt(index));
  return hash;
}

function hashUint32(hash: number, value: number): number {
  return Math.imul(hash ^ value, 0x0100_0193) >>> 0;
}
