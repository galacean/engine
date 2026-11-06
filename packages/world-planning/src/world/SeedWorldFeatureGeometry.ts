import type { SeedWorldFields } from "../runtime/SeedWorldFields.ts";
import type { SeedWorldPlan } from "./SeedWorldPlanner";
import { seedWorldRiverBankRadius } from "../runtime/SeedWorldRiverCurves.ts";

/** Physical half-width of the canonical planned road surface. */
export const SEED_WORLD_ROAD_HALF_WIDTH_METRES = 8;

const SEGMENT_INDEX_CELL_METRES = 128;

interface IndexedSegment {
  readonly startX: number;
  readonly startZ: number;
  readonly endX: number;
  readonly endZ: number;
}

interface IndexedRoadSegment extends IndexedSegment {
  readonly startHalfWidthMetres: number;
  readonly endHalfWidthMetres: number;
  readonly startShoulderWidthMetres: number;
  readonly endShoulderWidthMetres: number;
}

interface IndexedRiverSegment extends IndexedSegment {
  readonly startWidthMetres: number;
  readonly endWidthMetres: number;
  readonly startBankFeatherMetres: number;
  readonly endBankFeatherMetres: number;
  readonly startBankRadius: number;
  readonly endBankRadius: number;
}

interface SegmentIndex<Segment extends IndexedSegment> {
  readonly segments: readonly Segment[];
  readonly buckets: ReadonlyMap<string, readonly number[]>;
  readonly maximumExpansion: number;
}

const roadIndexCache = new WeakMap<SeedWorldPlan, SegmentIndex<IndexedRoadSegment>>();
const riverIndexCache = new WeakMap<SeedWorldFields, SegmentIndex<IndexedRiverSegment>>();

/** World-space oriented rectangle used for exact decoration footprint clearance. */
export interface SeedWorldOrientedBox {
  /** Rectangle centre in world X. */
  readonly centerX: number;
  /** Rectangle centre in world Z. */
  readonly centerZ: number;
  /** Local X half extent in metres. */
  readonly halfWidth: number;
  /** Local Z half extent in metres. */
  readonly halfDepth: number;
  /** Local-to-world yaw in radians. */
  readonly yawRadians: number;
}

/**
 * Samples exact point distance to the canonical road surface boundary.
 * @param plan Authoritative road polylines.
 * @param worldX Query X in world metres.
 * @param worldZ Query Z in world metres.
 * @returns Signed metres from the road boundary; negative values are on the road.
 */
export function sampleSeedWorldRoadSignedDistanceMetres(plan: SeedWorldPlan, worldX: number, worldZ: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const segment of roadIndex(plan).segments) {
    const projection = pointSegmentDistance(worldX, worldZ, segment.startX, segment.startZ, segment.endX, segment.endZ);
    nearest = Math.min(
      nearest,
      projection.distance - mix(segment.startHalfWidthMetres, segment.endHalfWidthMetres, projection.progress)
    );
  }
  return nearest;
}

/**
 * Rasterizes the canonical variable-width road surface with sub-texel area coverage.
 * @param plan Authoritative road polylines and per-point width profile.
 * @param resolution Square output field resolution.
 * @param samplesPerAxis Sub-texel samples per axis; at least four are required for stable diagonal coverage.
 * @returns Row-major road influence where one is paved core and zero is outside the C2 shoulder.
 * @throws {RangeError} When the requested lattice or supersampling rate is invalid.
 */
export function compileSeedWorldRoadSurfaceCoverage(
  plan: SeedWorldPlan,
  resolution: number,
  samplesPerAxis = 4
): Float32Array {
  if (!Number.isInteger(resolution) || resolution < 1) {
    throw new RangeError("Seed World road coverage resolution must be a positive integer");
  }
  if (!Number.isInteger(samplesPerAxis) || samplesPerAxis < 4) {
    throw new RangeError("Seed World road coverage requires at least four samples per texel axis");
  }
  const field = new Float32Array(resolution * resolution);
  const index = roadIndex(plan);
  if (index.segments.length === 0) return field;
  const cellMetres = plan.sizeMetres / resolution;
  const halfWorldMetres = plan.sizeMetres * 0.5;
  const candidatesByPixel = new Map<number, number[]>();
  for (let segmentIndex = 0; segmentIndex < index.segments.length; segmentIndex++) {
    const segment = index.segments[segmentIndex]!;
    const expansion = Math.max(
      segment.startHalfWidthMetres + segment.startShoulderWidthMetres,
      segment.endHalfWidthMetres + segment.endShoulderWidthMetres
    );
    const minimumX = clamp(
      Math.floor((Math.min(segment.startX, segment.endX) - expansion + halfWorldMetres) / cellMetres),
      0,
      resolution - 1
    );
    const maximumX = clamp(
      Math.floor((Math.max(segment.startX, segment.endX) + expansion + halfWorldMetres) / cellMetres),
      0,
      resolution - 1
    );
    const minimumZ = clamp(
      Math.floor((Math.min(segment.startZ, segment.endZ) - expansion + halfWorldMetres) / cellMetres),
      0,
      resolution - 1
    );
    const maximumZ = clamp(
      Math.floor((Math.max(segment.startZ, segment.endZ) + expansion + halfWorldMetres) / cellMetres),
      0,
      resolution - 1
    );
    for (let z = minimumZ; z <= maximumZ; z++) {
      for (let x = minimumX; x <= maximumX; x++) {
        const pixel = z * resolution + x;
        const candidates = candidatesByPixel.get(pixel);
        if (candidates) candidates.push(segmentIndex);
        else candidatesByPixel.set(pixel, [segmentIndex]);
      }
    }
  }
  const inverseSampleCount = 1 / (samplesPerAxis * samplesPerAxis);
  for (const [pixel, segmentIndexes] of candidatesByPixel) {
    const pixelX = pixel % resolution;
    const pixelZ = Math.floor(pixel / resolution);
    let coverage = 0;
    for (let sampleZ = 0; sampleZ < samplesPerAxis; sampleZ++) {
      const worldZ = -halfWorldMetres + (pixelZ + (sampleZ + 0.5) / samplesPerAxis) * cellMetres;
      for (let sampleX = 0; sampleX < samplesPerAxis; sampleX++) {
        const worldX = -halfWorldMetres + (pixelX + (sampleX + 0.5) / samplesPerAxis) * cellMetres;
        let influence = 0;
        for (const segmentIndex of segmentIndexes) {
          influence = Math.max(influence, roadSurfaceInfluence(index.segments[segmentIndex]!, worldX, worldZ));
          if (influence >= 1) break;
        }
        coverage += influence;
      }
    }
    field[pixel] = coverage * inverseSampleCount;
  }
  return field;
}

/**
 * Resolves dense-vegetation recovery outside the exact paved road core.
 * @param plan Authoritative road polylines and per-point width profile.
 * @param worldX Query X in world metres.
 * @param worldZ Query Z in world metres.
 * @param boundaryClearanceMetres Extra core clearance for bilinear support and the rendered plant footprint.
 * @returns Zero inside the expanded core, one outside the shoulder, and a C2 transition between them.
 */
export function sampleSeedWorldRoadVegetationWeight(
  plan: SeedWorldPlan,
  worldX: number,
  worldZ: number,
  boundaryClearanceMetres: number
): number {
  const index = roadIndex(plan);
  const searchRadius = index.maximumExpansion + Math.max(0, boundaryClearanceMetres);
  let weight = 1;
  for (const segment of querySegmentIndex(
    index,
    worldX - searchRadius,
    worldZ - searchRadius,
    worldX + searchRadius,
    worldZ + searchRadius
  )) {
    const projection = pointSegmentDistance(worldX, worldZ, segment.startX, segment.startZ, segment.endX, segment.endZ);
    const coreHalfWidthMetres = mix(segment.startHalfWidthMetres, segment.endHalfWidthMetres, projection.progress);
    const shoulderWidthMetres = mix(
      segment.startShoulderWidthMetres,
      segment.endShoulderWidthMetres,
      projection.progress
    );
    weight = Math.min(
      weight,
      roadVegetationWeight(projection.distance - coreHalfWidthMetres, shoulderWidthMetres, boundaryClearanceMetres)
    );
    if (weight <= 0) return 0;
  }
  return weight;
}

/**
 * Compiles one reusable dense-vegetation road-clearance field on the runtime coverage lattice.
 * @param plan Authoritative road polylines and per-point width profile.
 * @param resolution Square Detail DensityField resolution.
 * @param boundaryClearanceMetres Extra core clearance for bilinear support and rendered footprint.
 * @returns Row-major C2 vegetation recovery weights shared by every species in one category.
 * @throws {RangeError} When the requested lattice is invalid.
 */
export function compileSeedWorldRoadVegetationWeights(
  plan: SeedWorldPlan,
  resolution: number,
  boundaryClearanceMetres: number
): Float32Array {
  if (!Number.isInteger(resolution) || resolution < 1) {
    throw new RangeError("Seed World road vegetation resolution must be a positive integer");
  }
  const weights = new Float32Array(resolution * resolution);
  weights.fill(1);
  const index = roadIndex(plan);
  if (index.segments.length === 0) return weights;
  const cellMetres = plan.sizeMetres / resolution;
  const halfWorldMetres = plan.sizeMetres * 0.5;
  const clearanceMetres = Math.max(0, boundaryClearanceMetres);
  const candidatesByPixel = new Map<number, number[]>();
  for (let segmentIndex = 0; segmentIndex < index.segments.length; segmentIndex++) {
    const segment = index.segments[segmentIndex]!;
    const expansion =
      clearanceMetres +
      Math.max(
        segment.startHalfWidthMetres + segment.startShoulderWidthMetres * 1.5,
        segment.endHalfWidthMetres + segment.endShoulderWidthMetres * 1.5
      );
    const minimumX = clamp(
      Math.floor((Math.min(segment.startX, segment.endX) - expansion + halfWorldMetres) / cellMetres),
      0,
      resolution - 1
    );
    const maximumX = clamp(
      Math.floor((Math.max(segment.startX, segment.endX) + expansion + halfWorldMetres) / cellMetres),
      0,
      resolution - 1
    );
    const minimumZ = clamp(
      Math.floor((Math.min(segment.startZ, segment.endZ) - expansion + halfWorldMetres) / cellMetres),
      0,
      resolution - 1
    );
    const maximumZ = clamp(
      Math.floor((Math.max(segment.startZ, segment.endZ) + expansion + halfWorldMetres) / cellMetres),
      0,
      resolution - 1
    );
    for (let z = minimumZ; z <= maximumZ; z++) {
      for (let x = minimumX; x <= maximumX; x++) {
        const pixel = z * resolution + x;
        const candidates = candidatesByPixel.get(pixel);
        if (candidates) candidates.push(segmentIndex);
        else candidatesByPixel.set(pixel, [segmentIndex]);
      }
    }
  }
  for (const [pixel, segmentIndexes] of candidatesByPixel) {
    const worldX = -halfWorldMetres + ((pixel % resolution) + 0.5) * cellMetres;
    const worldZ = -halfWorldMetres + (Math.floor(pixel / resolution) + 0.5) * cellMetres;
    let weight = 1;
    for (const segmentIndex of segmentIndexes) {
      const segment = index.segments[segmentIndex]!;
      const projection = pointSegmentDistance(
        worldX,
        worldZ,
        segment.startX,
        segment.startZ,
        segment.endX,
        segment.endZ
      );
      const coreHalfWidthMetres = mix(segment.startHalfWidthMetres, segment.endHalfWidthMetres, projection.progress);
      const shoulderWidthMetres = mix(
        segment.startShoulderWidthMetres,
        segment.endShoulderWidthMetres,
        projection.progress
      );
      weight = Math.min(
        weight,
        roadVegetationWeight(projection.distance - coreHalfWidthMetres, shoulderWidthMetres, clearanceMetres)
      );
      if (weight <= 0) break;
    }
    weights[pixel] = weight;
  }
  return weights;
}

/**
 * Tests point clearance against canonical road segments using a conservative spatial query followed by exact distance.
 * @param plan Authoritative road polylines.
 * @param worldX Query X in world metres.
 * @param worldZ Query Z in world metres.
 * @param boundaryClearanceMetres Required distance outside the road boundary.
 * @returns Whether every road boundary is at least the requested distance away.
 */
export function seedWorldRoadPointHasClearance(
  plan: SeedWorldPlan,
  worldX: number,
  worldZ: number,
  boundaryClearanceMetres: number
): boolean {
  const index = roadIndex(plan);
  const searchRadius = index.maximumExpansion + boundaryClearanceMetres;
  for (const segment of querySegmentIndex(
    index,
    worldX - searchRadius,
    worldZ - searchRadius,
    worldX + searchRadius,
    worldZ + searchRadius
  )) {
    const projection = pointSegmentDistance(worldX, worldZ, segment.startX, segment.startZ, segment.endX, segment.endZ);
    const halfWidthMetres = mix(segment.startHalfWidthMetres, segment.endHalfWidthMetres, projection.progress);
    if (projection.distance - halfWidthMetres < boundaryClearanceMetres) {
      return false;
    }
  }
  return true;
}

/**
 * Samples exact point distance to the canonical variable-width river bank.
 * @param fields Canonical river curves and world extent.
 * @param worldX Query X in world metres.
 * @param worldZ Query Z in world metres.
 * @returns Signed metres from the bank; negative values are inside the bank.
 */
export function sampleSeedWorldRiverBankSignedDistanceMetres(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const segment of riverIndex(fields).segments) {
    const projection = pointSegmentDistance(worldX, worldZ, segment.startX, segment.startZ, segment.endX, segment.endZ);
    nearest = Math.min(
      nearest,
      projection.distance -
        seedWorldRiverBankRadius(
          mix(segment.startWidthMetres, segment.endWidthMetres, projection.progress),
          mix(segment.startBankFeatherMetres, segment.endBankFeatherMetres, projection.progress)
        )
    );
  }
  return nearest;
}

/**
 * Tests point clearance against canonical river banks using a conservative spatial query followed by exact distance.
 * @param fields Canonical river curves and world extent.
 * @param worldX Query X in world metres.
 * @param worldZ Query Z in world metres.
 * @param bankClearanceMetres Required distance outside the variable-width bank.
 * @returns Whether every river bank is at least the requested distance away.
 */
export function seedWorldRiverBankPointHasClearance(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  bankClearanceMetres: number
): boolean {
  const index = riverIndex(fields);
  const searchRadius = index.maximumExpansion + bankClearanceMetres;
  for (const segment of querySegmentIndex(
    index,
    worldX - searchRadius,
    worldZ - searchRadius,
    worldX + searchRadius,
    worldZ + searchRadius
  )) {
    const projection = pointSegmentDistance(worldX, worldZ, segment.startX, segment.startZ, segment.endX, segment.endZ);
    const bankRadius = seedWorldRiverBankRadius(
      mix(segment.startWidthMetres, segment.endWidthMetres, projection.progress),
      mix(segment.startBankFeatherMetres, segment.endBankFeatherMetres, projection.progress)
    );
    if (projection.distance - bankRadius < bankClearanceMetres) return false;
  }
  return true;
}

/**
 * Computes the minimum signed distance from an oriented footprint to the canonical road surface.
 * @param plan Authoritative road polylines.
 * @param box World-space oriented footprint.
 * @param maximumRelevantDistanceMetres Optional finite relevance bound that enables an indexed query. The default
 * scans every road segment and preserves the exact legacy result.
 * @returns Signed metres from the nearest relevant road boundary; negative values overlap the road. With a finite
 * relevance bound, `Infinity` means no road lies within that distance.
 */
export function seedWorldRoadToOrientedBoxSignedDistanceMetres(
  plan: SeedWorldPlan,
  box: SeedWorldOrientedBox,
  maximumRelevantDistanceMetres = Number.POSITIVE_INFINITY
): number {
  if (Number.isNaN(maximumRelevantDistanceMetres) || maximumRelevantDistanceMetres < 0) {
    throw new RangeError("Road-to-footprint maximum relevant distance must be non-negative.");
  }
  const index = roadIndex(plan);
  const boxBoundingRadiusMetres = Math.hypot(box.halfWidth, box.halfDepth);
  const queryExpansionMetres = boxBoundingRadiusMetres + index.maximumExpansion + maximumRelevantDistanceMetres;
  const segments = Number.isFinite(maximumRelevantDistanceMetres)
    ? querySegmentIndex(
        index,
        box.centerX - queryExpansionMetres,
        box.centerZ - queryExpansionMetres,
        box.centerX + queryExpansionMetres,
        box.centerZ + queryExpansionMetres
      )
    : index.segments;
  let nearest = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    nearest = Math.min(
      nearest,
      segmentToOrientedBoxDistance(segment.startX, segment.startZ, segment.endX, segment.endZ, box) -
        Math.max(segment.startHalfWidthMetres, segment.endHalfWidthMetres)
    );
  }
  return nearest <= maximumRelevantDistanceMetres ? nearest : Number.POSITIVE_INFINITY;
}

/**
 * Computes a conservative minimum signed distance from an oriented footprint to canonical river banks.
 * Each Bézier reach is sampled into metre-bounded segments and uses the larger endpoint bank radius.
 * @param fields Canonical river curves and world extent.
 * @param box World-space oriented footprint.
 * @returns Signed metres from the nearest river bank; negative values overlap the bank.
 */
export function seedWorldRiverToOrientedBoxSignedDistanceMetres(
  fields: SeedWorldFields,
  box: SeedWorldOrientedBox
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const segment of riverIndex(fields).segments) {
    const bankRadius = Math.max(segment.startBankRadius, segment.endBankRadius);
    nearest = Math.min(
      nearest,
      segmentToOrientedBoxDistance(segment.startX, segment.startZ, segment.endX, segment.endZ, box) - bankRadius
    );
  }
  return nearest;
}

function roadIndex(plan: SeedWorldPlan): SegmentIndex<IndexedRoadSegment> {
  const cached = roadIndexCache.get(plan);
  if (cached) return cached;
  const segments: IndexedRoadSegment[] = [];
  let maximumExpansionMetres = 0;
  for (const road of plan.roads) {
    for (let pointIndex = 1; pointIndex < road.points.length; pointIndex++) {
      const start = normalizedToWorld(road.points[pointIndex - 1], plan.sizeMetres);
      const end = normalizedToWorld(road.points[pointIndex], plan.sizeMetres);
      const startHalfWidthMetres = road.points[pointIndex - 1].coreHalfWidthMetres;
      const endHalfWidthMetres = road.points[pointIndex].coreHalfWidthMetres;
      const startShoulderWidthMetres = road.points[pointIndex - 1].shoulderWidthMetres;
      const endShoulderWidthMetres = road.points[pointIndex].shoulderWidthMetres;
      maximumExpansionMetres = Math.max(
        maximumExpansionMetres,
        startHalfWidthMetres + startShoulderWidthMetres * 1.5,
        endHalfWidthMetres + endShoulderWidthMetres * 1.5
      );
      segments.push(
        Object.freeze({
          startX: start.x,
          startZ: start.z,
          endX: end.x,
          endZ: end.z,
          startHalfWidthMetres,
          endHalfWidthMetres,
          startShoulderWidthMetres,
          endShoulderWidthMetres
        })
      );
    }
  }
  const compiled = buildSegmentIndex(Object.freeze(segments), maximumExpansionMetres);
  roadIndexCache.set(plan, compiled);
  return compiled;
}

function riverIndex(fields: SeedWorldFields): SegmentIndex<IndexedRiverSegment> {
  const cached = riverIndexCache.get(fields);
  if (cached) return cached;
  const segments: IndexedRiverSegment[] = [];
  let maximumBankRadius = 0;
  for (const samples of fields.riverCurveSamples) {
    for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex++) {
      const start = samples[sampleIndex - 1];
      const end = samples[sampleIndex];
      const startBankRadius = seedWorldRiverBankRadius(start.widthMetres, start.bankFeatherMetres);
      const endBankRadius = seedWorldRiverBankRadius(end.widthMetres, end.bankFeatherMetres);
      maximumBankRadius = Math.max(maximumBankRadius, startBankRadius, endBankRadius);
      segments.push(
        Object.freeze({
          startX: start.x,
          startZ: start.z,
          endX: end.x,
          endZ: end.z,
          startWidthMetres: start.widthMetres,
          endWidthMetres: end.widthMetres,
          startBankFeatherMetres: start.bankFeatherMetres,
          endBankFeatherMetres: end.bankFeatherMetres,
          startBankRadius,
          endBankRadius
        })
      );
    }
  }
  const compiled = buildSegmentIndex(Object.freeze(segments), maximumBankRadius);
  riverIndexCache.set(fields, compiled);
  return compiled;
}

function buildSegmentIndex<Segment extends IndexedSegment>(
  segments: readonly Segment[],
  maximumExpansion: number
): SegmentIndex<Segment> {
  const mutableBuckets = new Map<string, number[]>();
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const segment = segments[segmentIndex];
    const minimumCellX = spatialCell(Math.min(segment.startX, segment.endX));
    const maximumCellX = spatialCell(Math.max(segment.startX, segment.endX));
    const minimumCellZ = spatialCell(Math.min(segment.startZ, segment.endZ));
    const maximumCellZ = spatialCell(Math.max(segment.startZ, segment.endZ));
    for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ++) {
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX++) {
        const key = spatialKey(cellX, cellZ);
        const bucket = mutableBuckets.get(key);
        if (bucket) bucket.push(segmentIndex);
        else mutableBuckets.set(key, [segmentIndex]);
      }
    }
  }
  const buckets = new Map<string, readonly number[]>();
  for (const [key, segmentIndexes] of mutableBuckets) buckets.set(key, Object.freeze(segmentIndexes));
  return Object.freeze({ segments, buckets, maximumExpansion });
}

function querySegmentIndex<Segment extends IndexedSegment>(
  index: SegmentIndex<Segment>,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number
): readonly Segment[] {
  const visited = new Set<number>();
  const result: Segment[] = [];
  for (let cellZ = spatialCell(minimumZ); cellZ <= spatialCell(maximumZ); cellZ++) {
    for (let cellX = spatialCell(minimumX); cellX <= spatialCell(maximumX); cellX++) {
      const bucket = index.buckets.get(spatialKey(cellX, cellZ));
      if (!bucket) continue;
      for (const segmentIndex of bucket) {
        if (visited.has(segmentIndex)) continue;
        visited.add(segmentIndex);
        result.push(index.segments[segmentIndex]);
      }
    }
  }
  return result;
}

function spatialCell(worldCoordinate: number): number {
  return Math.floor(worldCoordinate / SEGMENT_INDEX_CELL_METRES);
}

function spatialKey(cellX: number, cellZ: number): string {
  return `${cellX}:${cellZ}`;
}

function segmentToOrientedBoxDistance(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  box: SeedWorldOrientedBox
): number {
  const cosine = Math.cos(box.yawRadians);
  const sine = Math.sin(box.yawRadians);
  const start = worldToBoxLocal(startX, startZ, box, cosine, sine);
  const end = worldToBoxLocal(endX, endZ, box, cosine, sine);
  if (segmentIntersectsAxisAlignedBox(start.x, start.z, end.x, end.z, box.halfWidth, box.halfDepth)) return 0;
  let nearest = Math.min(
    pointToAxisAlignedBoxDistance(start.x, start.z, box.halfWidth, box.halfDepth),
    pointToAxisAlignedBoxDistance(end.x, end.z, box.halfWidth, box.halfDepth)
  );
  const corners = [
    [-box.halfWidth, -box.halfDepth],
    [box.halfWidth, -box.halfDepth],
    [box.halfWidth, box.halfDepth],
    [-box.halfWidth, box.halfDepth]
  ] as const;
  for (let index = 0; index < corners.length; index++) {
    const edgeStart = corners[index];
    const edgeEnd = corners[(index + 1) % corners.length];
    nearest = Math.min(
      nearest,
      segmentSegmentDistance(start.x, start.z, end.x, end.z, edgeStart[0], edgeStart[1], edgeEnd[0], edgeEnd[1])
    );
  }
  return nearest;
}

function segmentIntersectsAxisAlignedBox(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  halfWidth: number,
  halfDepth: number
): boolean {
  let minimumProgress = 0;
  let maximumProgress = 1;
  const directionX = endX - startX;
  const directionZ = endZ - startZ;
  for (const [origin, direction, minimum, maximum] of [
    [startX, directionX, -halfWidth, halfWidth],
    [startZ, directionZ, -halfDepth, halfDepth]
  ] as const) {
    if (Math.abs(direction) <= Number.EPSILON) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const inverse = 1 / direction;
    let near = (minimum - origin) * inverse;
    let far = (maximum - origin) * inverse;
    if (near > far) [near, far] = [far, near];
    minimumProgress = Math.max(minimumProgress, near);
    maximumProgress = Math.min(maximumProgress, far);
    if (minimumProgress > maximumProgress) return false;
  }
  return true;
}

function segmentSegmentDistance(
  firstStartX: number,
  firstStartZ: number,
  firstEndX: number,
  firstEndZ: number,
  secondStartX: number,
  secondStartZ: number,
  secondEndX: number,
  secondEndZ: number
): number {
  if (
    segmentsIntersect(
      firstStartX,
      firstStartZ,
      firstEndX,
      firstEndZ,
      secondStartX,
      secondStartZ,
      secondEndX,
      secondEndZ
    )
  ) {
    return 0;
  }
  return Math.min(
    pointSegmentDistance(firstStartX, firstStartZ, secondStartX, secondStartZ, secondEndX, secondEndZ).distance,
    pointSegmentDistance(firstEndX, firstEndZ, secondStartX, secondStartZ, secondEndX, secondEndZ).distance,
    pointSegmentDistance(secondStartX, secondStartZ, firstStartX, firstStartZ, firstEndX, firstEndZ).distance,
    pointSegmentDistance(secondEndX, secondEndZ, firstStartX, firstStartZ, firstEndX, firstEndZ).distance
  );
}

function segmentsIntersect(
  firstStartX: number,
  firstStartZ: number,
  firstEndX: number,
  firstEndZ: number,
  secondStartX: number,
  secondStartZ: number,
  secondEndX: number,
  secondEndZ: number
): boolean {
  const firstDirectionX = firstEndX - firstStartX;
  const firstDirectionZ = firstEndZ - firstStartZ;
  const secondDirectionX = secondEndX - secondStartX;
  const secondDirectionZ = secondEndZ - secondStartZ;
  const denominator = cross(firstDirectionX, firstDirectionZ, secondDirectionX, secondDirectionZ);
  const offsetX = secondStartX - firstStartX;
  const offsetZ = secondStartZ - firstStartZ;
  if (Math.abs(denominator) <= Number.EPSILON) return false;
  const firstProgress = cross(offsetX, offsetZ, secondDirectionX, secondDirectionZ) / denominator;
  const secondProgress = cross(offsetX, offsetZ, firstDirectionX, firstDirectionZ) / denominator;
  return firstProgress >= 0 && firstProgress <= 1 && secondProgress >= 0 && secondProgress <= 1;
}

function pointSegmentDistance(
  pointX: number,
  pointZ: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number
): { readonly distance: number; readonly progress: number } {
  const directionX = endX - startX;
  const directionZ = endZ - startZ;
  const lengthSquared = directionX * directionX + directionZ * directionZ;
  const progress =
    lengthSquared > 0
      ? clamp(((pointX - startX) * directionX + (pointZ - startZ) * directionZ) / lengthSquared, 0, 1)
      : 0;
  return {
    distance: Math.hypot(pointX - mix(startX, endX, progress), pointZ - mix(startZ, endZ, progress)),
    progress
  };
}

function roadSurfaceInfluence(segment: IndexedRoadSegment, worldX: number, worldZ: number): number {
  const projection = pointSegmentDistance(worldX, worldZ, segment.startX, segment.startZ, segment.endX, segment.endZ);
  const coreHalfWidthMetres = mix(segment.startHalfWidthMetres, segment.endHalfWidthMetres, projection.progress);
  const signedDistanceMetres = projection.distance - coreHalfWidthMetres;
  if (signedDistanceMetres <= 0) return 1;
  const shoulderWidthMetres = mix(
    segment.startShoulderWidthMetres,
    segment.endShoulderWidthMetres,
    projection.progress
  );
  if (signedDistanceMetres >= shoulderWidthMetres) return 0;
  return 1 - smootherstep(signedDistanceMetres / Math.max(shoulderWidthMetres, 0.001));
}

function roadVegetationWeight(
  signedCoreDistanceMetres: number,
  shoulderWidthMetres: number,
  boundaryClearanceMetres: number
): number {
  const shoulder = Math.max(shoulderWidthMetres, 0.001);
  const recoveryStartMetres = Math.max(0, boundaryClearanceMetres) + shoulder * 0.65;
  return smootherstep((signedCoreDistanceMetres - recoveryStartMetres) / (shoulder * 0.85));
}

function pointToAxisAlignedBoxDistance(pointX: number, pointZ: number, halfWidth: number, halfDepth: number): number {
  return Math.hypot(Math.max(Math.abs(pointX) - halfWidth, 0), Math.max(Math.abs(pointZ) - halfDepth, 0));
}

function worldToBoxLocal(
  worldX: number,
  worldZ: number,
  box: SeedWorldOrientedBox,
  cosine: number,
  sine: number
): { readonly x: number; readonly z: number } {
  const offsetX = worldX - box.centerX;
  const offsetZ = worldZ - box.centerZ;
  return {
    x: offsetX * cosine + offsetZ * sine,
    z: -offsetX * sine + offsetZ * cosine
  };
}

function normalizedToWorld(point: Readonly<{ x: number; y: number }>, sizeMetres: number) {
  return { x: (point.x - 0.5) * sizeMetres, z: (point.y - 0.5) * sizeMetres };
}

function cross(leftX: number, leftZ: number, rightX: number, rightZ: number): number {
  return leftX * rightZ - leftZ * rightX;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smootherstep(value: number): number {
  const amount = clamp(value, 0, 1);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}
