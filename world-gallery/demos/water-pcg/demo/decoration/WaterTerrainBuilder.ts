/**
 * Deterministic demo terrain generation around compiled river corridors.
 *
 * River examples receive one continuous height field that extends beyond the
 * water footprint. The field carves authored channels, adds smooth
 * seeded bed-depth variation, and raises noisy banks outside the shoreline.
 * The formal Terrain system remains externally owned; this is presentation data.
 */
import { RIVER_GEOMETRY_Y_OFFSET, RIVER_TERRAIN_CORRIDOR_COMPONENT } from "../../compiler/river/constants";
import type {
  ReadonlyVector3Tuple,
  RiverCompiledData,
  RiverGeometryBounds,
  RiverTerrainReachCorridorData,
  Vector2Tuple
} from "../../compiler/river/types";
import {
  HEIGHTFIELD_RIVER_TERRAIN_DETAIL_STYLE,
  WaterDecorationStyle,
  WATER_BED_PROFILE,
  WATER_TERRAIN_GRID_STYLE,
  WATER_TERRAIN_HASH_STYLE,
  WATER_TERRAIN_NOISE_STYLE
} from "./constants";

type WaterTerrainProfile = (typeof WATER_BED_PROFILE)[WaterDecorationStyle];
type RiverTerrainCorridorComponent =
  (typeof RIVER_TERRAIN_CORRIDOR_COMPONENT)[keyof typeof RIVER_TERRAIN_CORRIDOR_COMPONENT];

interface TerrainCenterlinePoint {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
  readonly depth: number;
  readonly halfWidth: number;
}

interface TerrainCenterlineSegment {
  readonly start: TerrainCenterlinePoint;
  readonly end: TerrainCenterlinePoint;
}

interface TerrainJunctionInfluence {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
  readonly depth: number;
  readonly radius: number;
}

interface TerrainInfluence {
  readonly normalizedDistance: number;
  readonly distanceSquared: number;
  readonly surfaceY: number;
  readonly depth: number;
}

interface WaterTerrainField {
  readonly style: WaterDecorationStyle;
  readonly profile: WaterTerrainProfile;
  readonly segments: readonly TerrainCenterlineSegment[];
  readonly junctions: readonly TerrainJunctionInfluence[];
}

export interface RiverBedChunkGeometry {
  readonly id: string;
  readonly positions: readonly ReadonlyVector3Tuple[];
  readonly uvs: readonly Vector2Tuple[];
  readonly indices: Uint32Array;
  readonly bounds: RiverGeometryBounds;
}

export type WaterTerrainHeightSampler = (x: number, z: number) => number;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function interpolate(from: number, to: number, weight: number): number {
  return from + (to - from) * weight;
}

function smoothStep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function readCorridorSample(
  corridor: RiverTerrainReachCorridorData,
  sampleIndex: number,
  component: RiverTerrainCorridorComponent
): number {
  return corridor.samples.at(sampleIndex * corridor.stride + component) ?? 0;
}

function readCenterlinePoint(corridor: RiverTerrainReachCorridorData, sampleIndex: number): TerrainCenterlinePoint {
  const surfaceY = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.waterSurfaceY);
  const bedY = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.riverBedY);
  return {
    x: readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.x),
    z: readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.z),
    surfaceY,
    depth: Math.max(0, surfaceY - bedY),
    halfWidth: readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.channelHalfWidth)
  };
}

function createTerrainField(data: RiverCompiledData, style: WaterDecorationStyle): WaterTerrainField {
  const segments: TerrainCenterlineSegment[] = [];
  for (const corridor of data.terrainInteraction.reachCorridors) {
    if (corridor.sampleCount === 1) {
      const point = readCenterlinePoint(corridor, 0);
      segments.push({ start: point, end: point });
      continue;
    }
    for (let sampleIndex = 0; sampleIndex < corridor.sampleCount - 1; sampleIndex++) {
      segments.push({
        start: readCenterlinePoint(corridor, sampleIndex),
        end: readCenterlinePoint(corridor, sampleIndex + 1)
      });
    }
  }
  const junctions = data.junctions.map((junction) => ({
    x: junction.position[0],
    z: junction.position[2],
    surfaceY: junction.position[1],
    depth: junction.depth,
    radius: junction.mergeRadius
  }));
  return { style, profile: WATER_BED_PROFILE[style], segments, junctions };
}

function hashGrid(x: number, z: number, seed: number): number {
  let hash =
    seed ^ Math.imul(x, WATER_TERRAIN_HASH_STYLE.xMultiplier) ^ Math.imul(z, WATER_TERRAIN_HASH_STYLE.zMultiplier);
  hash = Math.imul(hash ^ (hash >>> 16), WATER_TERRAIN_HASH_STYLE.avalancheMultiplierA);
  hash = Math.imul(hash ^ (hash >>> 15), WATER_TERRAIN_HASH_STYLE.avalancheMultiplierB);
  return ((hash ^ (hash >>> 16)) >>> 0) / WATER_TERRAIN_HASH_STYLE.unsignedMaximum;
}

function sampleValueNoise(x: number, z: number, scale: number, seed: number): number {
  const gridX = x * scale;
  const gridZ = z * scale;
  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const tx = smoothStep(gridX - x0);
  const tz = smoothStep(gridZ - z0);
  const near = interpolate(hashGrid(x0, z0, seed), hashGrid(x0 + 1, z0, seed), tx);
  const far = interpolate(hashGrid(x0, z0 + 1, seed), hashGrid(x0 + 1, z0 + 1, seed), tx);
  return interpolate(near, far, tz);
}

function sampleTerrainNoise(x: number, z: number, profile: WaterTerrainProfile, style: WaterDecorationStyle): number {
  const broad = sampleValueNoise(x, z, profile.geometryNoiseScale, profile.geometryNoiseSeed);
  const detail = sampleValueNoise(
    x,
    z,
    profile.geometryNoiseScale * WATER_TERRAIN_NOISE_STYLE.detailScaleMultiplier,
    profile.geometryNoiseSeed ^ WATER_TERRAIN_NOISE_STYLE.detailSeedOffset
  );
  const base = broad * WATER_TERRAIN_NOISE_STYLE.broadWeight + detail * WATER_TERRAIN_NOISE_STYLE.detailWeight;
  if (style !== WaterDecorationStyle.HeightfieldRiver) return base;

  const tuning = HEIGHTFIELD_RIVER_TERRAIN_DETAIL_STYLE;
  const fine = sampleValueNoise(
    x,
    z,
    profile.geometryNoiseScale * tuning.fineScaleMultiplier,
    profile.geometryNoiseSeed ^ tuning.fineSeedOffset
  );
  const ridgeNoise = sampleValueNoise(
    x,
    z,
    profile.geometryNoiseScale * tuning.ridgeScaleMultiplier,
    profile.geometryNoiseSeed ^ tuning.ridgeSeedOffset
  );
  const ridge = Math.pow(1 - Math.abs(ridgeNoise * 2 - 1), tuning.ridgeExponent);
  const centered =
    (base * 2 - 1) * tuning.baseWeight + (fine * 2 - 1) * tuning.fineWeight + (ridge * 2 - 1) * tuning.ridgeWeight;
  return clamp01(centered * 0.5 + 0.5);
}

function resolveSegmentInfluence(segment: TerrainCenterlineSegment, x: number, z: number): TerrainInfluence {
  const directionX = segment.end.x - segment.start.x;
  const directionZ = segment.end.z - segment.start.z;
  const lengthSquared = directionX * directionX + directionZ * directionZ;
  const projection =
    lengthSquared <= WATER_TERRAIN_GRID_STYLE.minimumDirectionLength
      ? 0
      : clamp01(((x - segment.start.x) * directionX + (z - segment.start.z) * directionZ) / lengthSquared);
  const closestX = interpolate(segment.start.x, segment.end.x, projection);
  const closestZ = interpolate(segment.start.z, segment.end.z, projection);
  const deltaX = x - closestX;
  const deltaZ = z - closestZ;
  const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
  const halfWidth = Math.max(
    WATER_TERRAIN_GRID_STYLE.minimumDirectionLength,
    interpolate(segment.start.halfWidth, segment.end.halfWidth, projection)
  );
  return {
    normalizedDistance: Math.sqrt(distanceSquared) / halfWidth,
    distanceSquared,
    surfaceY: interpolate(segment.start.surfaceY, segment.end.surfaceY, projection),
    depth: interpolate(segment.start.depth, segment.end.depth, projection)
  };
}

function resolveJunctionInfluence(junction: TerrainJunctionInfluence, x: number, z: number): TerrainInfluence {
  const deltaX = x - junction.x;
  const deltaZ = z - junction.z;
  const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
  return {
    normalizedDistance:
      Math.sqrt(distanceSquared) / Math.max(junction.radius, WATER_TERRAIN_GRID_STYLE.minimumDirectionLength),
    distanceSquared,
    surfaceY: junction.surfaceY,
    depth: junction.depth
  };
}

function chooseCloserInfluence(current: TerrainInfluence | undefined, candidate: TerrainInfluence): TerrainInfluence {
  if (!current) return candidate;
  if (candidate.normalizedDistance < current.normalizedDistance) return candidate;
  if (
    candidate.normalizedDistance === current.normalizedDistance &&
    candidate.distanceSquared < current.distanceSquared
  ) {
    return candidate;
  }
  return current;
}

function sampleTerrainHeight(field: WaterTerrainField, x: number, z: number): number {
  let influence: TerrainInfluence | undefined;
  let blendedSurfaceY = 0;
  let blendedSurfaceWeight = 0;
  const elevationBlendRadius = Math.max(
    field.profile.minimumTerrainMargin,
    WATER_TERRAIN_GRID_STYLE.minimumElevationBlendRadius
  );
  const elevationBlendRadiusSquared = elevationBlendRadius * elevationBlendRadius;
  const includeInfluence = (candidate: TerrainInfluence): void => {
    influence = chooseCloserInfluence(influence, candidate);
    const weightBase = 1 / (1 + candidate.distanceSquared / elevationBlendRadiusSquared);
    const weight = weightBase * weightBase;
    blendedSurfaceY += candidate.surfaceY * weight;
    blendedSurfaceWeight += weight;
  };
  for (const segment of field.segments) {
    includeInfluence(resolveSegmentInfluence(segment, x, z));
  }
  for (const junction of field.junctions) {
    includeInfluence(resolveJunctionInfluence(junction, x, z));
  }
  if (!influence) return 0;

  const profile = field.profile;
  const terrainNoise = sampleTerrainNoise(x, z, profile, field.style);
  const centeredNoise = terrainNoise * 2 - 1;
  const channelDistance = influence.normalizedDistance / profile.channelCarveScale;
  if (channelDistance <= 1) {
    const centerWeight = profile.flat ? 1 : 1 - Math.pow(channelDistance, profile.depthExponent);
    const authoredDepthRange = Math.max(0, influence.depth - profile.minimumDepth);
    const depthScale = Math.max(0, 1 + centeredNoise * profile.depthVariation);
    const depth = profile.minimumDepth + authoredDepthRange * centerWeight * depthScale;
    return influence.surfaceY - depth;
  }

  const bankProgress = smoothStep((channelDistance - 1) / Math.max(profile.terrainExtentScale - 1, 1));
  const broadSurfaceY = blendedSurfaceWeight > 0 ? blendedSurfaceY / blendedSurfaceWeight : influence.surfaceY;
  const surfaceY = interpolate(broadSurfaceY, influence.surfaceY, 1 - bankProgress);
  const bankRelief = profile.bankHeight + centeredNoise * profile.terrainRelief;
  return surfaceY - profile.minimumDepth + bankProgress * bankRelief;
}

export function createWaterTerrainHeightSampler(
  data: RiverCompiledData,
  style: WaterDecorationStyle
): WaterTerrainHeightSampler {
  const field = createTerrainField(data, style);
  return (x, z) => sampleTerrainHeight(field, x, z);
}

function createBounds(positions: readonly ReadonlyVector3Tuple[]): RiverGeometryBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    minX = Math.min(minX, position[0]);
    minY = Math.min(minY, position[1]);
    minZ = Math.min(minZ, position[2]);
    maxX = Math.max(maxX, position[0]);
    maxY = Math.max(maxY, position[1]);
    maxZ = Math.max(maxZ, position[2]);
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ]
  };
}

function createWorldUv(position: ReadonlyVector3Tuple, style: WaterDecorationStyle): Vector2Tuple {
  const uvScale = WATER_BED_PROFILE[style].worldUvScale;
  return [position[0] * uvScale, position[2] * uvScale];
}

function resolveTerrainBounds(data: RiverCompiledData, profile: WaterTerrainProfile): RiverGeometryBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const corridor of data.terrainInteraction.reachCorridors) {
    for (let sampleIndex = 0; sampleIndex < corridor.sampleCount; sampleIndex++) {
      const point = readCenterlinePoint(corridor, sampleIndex);
      const margin = Math.max(profile.minimumTerrainMargin, point.halfWidth * profile.terrainExtentScale);
      minX = Math.min(minX, point.x - margin);
      minZ = Math.min(minZ, point.z - margin);
      maxX = Math.max(maxX, point.x + margin);
      maxZ = Math.max(maxZ, point.z + margin);
    }
  }
  for (const junction of data.junctions) {
    const margin = Math.max(profile.minimumTerrainMargin, junction.mergeRadius * profile.terrainExtentScale);
    minX = Math.min(minX, junction.position[0] - margin);
    minZ = Math.min(minZ, junction.position[2] - margin);
    maxX = Math.max(maxX, junction.position[0] + margin);
    maxZ = Math.max(maxZ, junction.position[2] + margin);
  }
  if (!Number.isFinite(minX + minZ + maxX + maxZ)) {
    const margin = Math.max(profile.minimumTerrainMargin, profile.gridCellSize);
    return { min: [-margin, 0, -margin], max: [margin, 0, margin] };
  }
  return { min: [minX, 0, minZ], max: [maxX, 0, maxZ] };
}

function createTerrainGridGeometry(data: RiverCompiledData, style: WaterDecorationStyle): RiverBedChunkGeometry {
  const profile = WATER_BED_PROFILE[style];
  const terrainBounds = resolveTerrainBounds(data, profile);
  const width = terrainBounds.max[0] - terrainBounds.min[0];
  const depth = terrainBounds.max[2] - terrainBounds.min[2];
  const columnCount =
    Math.min(WATER_TERRAIN_GRID_STYLE.maxCellsPerAxis, Math.max(1, Math.ceil(width / profile.gridCellSize))) + 1;
  const rowCount =
    Math.min(WATER_TERRAIN_GRID_STYLE.maxCellsPerAxis, Math.max(1, Math.ceil(depth / profile.gridCellSize))) + 1;
  const cellWidth = width / (columnCount - 1);
  const cellDepth = depth / (rowCount - 1);
  const sampleHeight = createWaterTerrainHeightSampler(data, style);
  const positions: ReadonlyVector3Tuple[] = [];
  const indices: number[] = [];
  for (let row = 0; row < rowCount; row++) {
    const z = terrainBounds.min[2] + row * cellDepth;
    for (let column = 0; column < columnCount; column++) {
      const x = terrainBounds.min[0] + column * cellWidth;
      positions.push([x, sampleHeight(x, z), z]);
    }
  }
  for (let row = 0; row < rowCount - 1; row++) {
    const rowStart = row * columnCount;
    const nextRowStart = rowStart + columnCount;
    for (let column = 0; column < columnCount - 1; column++) {
      const a = rowStart + column;
      const b = a + 1;
      const c = nextRowStart + column;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    id: `terrain-${data.sourceId}`,
    positions,
    uvs: positions.map((position) => createWorldUv(position, style)),
    indices: Uint32Array.from(indices),
    bounds: createBounds(positions)
  };
}

function createReachBedGeometry(
  corridor: RiverTerrainReachCorridorData,
  style: WaterDecorationStyle
): RiverBedChunkGeometry {
  const profile = WATER_BED_PROFILE[style];
  const crossSectionFractions: readonly number[] = profile.crossSectionFractions;
  const positions: ReadonlyVector3Tuple[] = [];
  const indices: number[] = [];
  for (let sampleIndex = 0; sampleIndex < corridor.sampleCount; sampleIndex++) {
    const previousIndex = Math.max(0, sampleIndex - 1);
    const nextIndex = Math.min(corridor.sampleCount - 1, sampleIndex + 1);
    const point = readCenterlinePoint(corridor, sampleIndex);
    const previous = readCenterlinePoint(corridor, previousIndex);
    const next = readCenterlinePoint(corridor, nextIndex);
    const directionX = next.x - previous.x;
    const directionZ = next.z - previous.z;
    const directionLength = Math.max(
      Math.hypot(directionX, directionZ),
      WATER_TERRAIN_GRID_STYLE.minimumDirectionLength
    );
    const normalX = -directionZ / directionLength;
    const normalZ = directionX / directionLength;
    const edgeY = point.surfaceY - profile.minimumDepth;
    const centerBedY = point.surfaceY - point.depth;
    for (const lateralFraction of crossSectionFractions) {
      const depthWeight = profile.flat ? 1 : 1 - Math.pow(Math.abs(lateralFraction), profile.depthExponent);
      positions.push([
        point.x + normalX * point.halfWidth * lateralFraction,
        edgeY + (centerBedY - edgeY) * depthWeight,
        point.z + normalZ * point.halfWidth * lateralFraction
      ]);
    }
  }
  for (let sampleIndex = 0; sampleIndex < corridor.sampleCount - 1; sampleIndex++) {
    const row = sampleIndex * crossSectionFractions.length;
    const nextRow = row + crossSectionFractions.length;
    for (let strip = 0; strip < crossSectionFractions.length - 1; strip++) {
      const a = row + strip;
      const b = a + 1;
      const c = nextRow + strip;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    id: `reach-${corridor.id}`,
    positions,
    uvs: positions.map((position) => createWorldUv(position, style)),
    indices: Uint32Array.from(indices),
    bounds: createBounds(positions)
  };
}

function createCorridorBedGeometries(data: RiverCompiledData, style: WaterDecorationStyle): RiverBedChunkGeometry[] {
  const reachGeometries = data.terrainInteraction.reachCorridors.map((corridor) =>
    createReachBedGeometry(corridor, style)
  );
  const junctionGeometries = data.terrainInteraction.junctionCorridors.map((corridor) => {
    const junction = data.junctions[corridor.junctionIndex];
    const surfaceGeometry = junction.surfaceGeometry;
    const signedAcrossDistances = surfaceGeometry.uv2s;
    const halfWidths = surfaceGeometry.uv3s;
    if (!signedAcrossDistances || !halfWidths) {
      throw new Error(`Junction "${junction.id}" is missing surface motion coordinates for its demo riverbed.`);
    }
    const profile = WATER_BED_PROFILE[style];
    const channelDepth = Math.max(profile.minimumDepth, corridor.waterSurfaceElevation - corridor.riverBedElevation);
    const positions: ReadonlyVector3Tuple[] = surfaceGeometry.positions.map((position, vertexIndex) => {
      const halfWidth = Math.max(halfWidths[vertexIndex][0], WATER_TERRAIN_GRID_STYLE.minimumDirectionLength);
      const lateralFraction = Math.min(1, Math.abs(signedAcrossDistances[vertexIndex][0]) / halfWidth);
      const centerWeight = profile.flat ? 1 : 1 - Math.pow(lateralFraction, profile.depthExponent);
      const vertexDepth = profile.minimumDepth + (channelDepth - profile.minimumDepth) * centerWeight;
      const baseSurfaceY = position[1] - RIVER_GEOMETRY_Y_OFFSET.surface;
      return [position[0], baseSurfaceY - vertexDepth, position[2]];
    });
    return {
      id: `junction-${corridor.id}`,
      positions,
      uvs: positions.map((position) => createWorldUv(position, style)),
      indices: Uint32Array.from(surfaceGeometry.indices),
      bounds: createBounds(positions)
    };
  });
  return [...reachGeometries, ...junctionGeometries];
}

export function createRiverBedChunkGeometries(
  data: RiverCompiledData,
  style: WaterDecorationStyle = WaterDecorationStyle.River
): RiverBedChunkGeometry[] {
  return style === WaterDecorationStyle.Pool
    ? createCorridorBedGeometries(data, style)
    : [createTerrainGridGeometry(data, style)];
}
