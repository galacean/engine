import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { RiverReadonlyUint8Buffer } from "../shared/ReadonlyNumericBuffer";
import { RiverLocalMapRegionKind, RiverPackedLocalMapChannel } from "./RiverGeometryEnums";
import {
  RIVER_LOCAL_MAP_MAX_ATLAS_WIDTH,
  RIVER_LOCAL_MAP_PADDING,
  RIVER_LOCAL_MAP_SIGNED_DISTANCE_RANGE,
  RIVER_LOCAL_MAP_TILE_RESOLUTION_BY_QUALITY,
  RIVER_LOCAL_MAP_TUNING,
  RIVER_OBSTACLE_MAP_RADIUS_SCALE
} from "./constants";
import type {
  ReadonlyVector3Tuple,
  ReadonlyVector4Tuple,
  RiverCompiledDisturbanceSource,
  RiverCompiledReach,
  RiverJunctionArtifact,
  RiverLocalMapAtlasData,
  RiverLocalMapBakeRegion,
  RiverLocalMapTileData,
  Vector2Tuple
} from "./types";

interface RiverLocalMapSample {
  readonly flowX: number;
  readonly flowZ: number;
  readonly foam: number;
  readonly signedDistance: number;
}

interface RiverLocalMapTileDraft {
  readonly region: RiverLocalMapBakeRegion;
  readonly resolution: number;
  readonly sample: (worldX: number, worldZ: number) => RiverLocalMapSample;
  x: number;
  y: number;
}

export interface RiverLocalMapCompileResult {
  readonly regions: readonly RiverLocalMapBakeRegion[];
  readonly atlas?: RiverLocalMapAtlasData;
}

const PACKED_CHANNELS = Object.freeze([
  RiverPackedLocalMapChannel.FlowX,
  RiverPackedLocalMapChannel.FlowZ,
  RiverPackedLocalMapChannel.Foam,
  RiverPackedLocalMapChannel.SignedDistance
]);

function tuple2(x: number, y: number): Vector2Tuple {
  return Object.freeze([x, y] as const);
}

function tuple4(x: number, y: number, z: number, w: number): ReadonlyVector4Tuple {
  return Object.freeze([x, y, z, w] as const);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = clamp01((value - edge0) / Math.max(edge1 - edge0, 0.0001));
  return normalized * normalized * (3 - 2 * normalized);
}

function distancePointToSegment(
  pointX: number,
  pointZ: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const abX = bx - ax;
  const abZ = bz - az;
  const lengthSquared = abX * abX + abZ * abZ;
  const t = lengthSquared > 0 ? clamp01(((pointX - ax) * abX + (pointZ - az) * abZ) / lengthSquared) : 0;
  return Math.hypot(pointX - (ax + abX * t), pointZ - (az + abZ * t));
}

function isInsidePolygon(boundary: readonly ReadonlyVector3Tuple[], pointX: number, pointZ: number): boolean {
  let inside = false;
  for (let current = 0, previous = boundary.length - 1; current < boundary.length; previous = current++) {
    const currentPoint = boundary[current];
    const previousPoint = boundary[previous];
    const crosses =
      currentPoint[2] > pointZ !== previousPoint[2] > pointZ &&
      pointX <
        ((previousPoint[0] - currentPoint[0]) * (pointZ - currentPoint[2])) / (previousPoint[2] - currentPoint[2]) +
          currentPoint[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function signedDistanceToPolygon(boundary: readonly ReadonlyVector3Tuple[], pointX: number, pointZ: number): number {
  let distance = Number.POSITIVE_INFINITY;
  for (let current = 0, previous = boundary.length - 1; current < boundary.length; previous = current++) {
    distance = Math.min(
      distance,
      distancePointToSegment(
        pointX,
        pointZ,
        boundary[previous][0],
        boundary[previous][2],
        boundary[current][0],
        boundary[current][2]
      )
    );
  }
  return isInsidePolygon(boundary, pointX, pointZ) ? distance : -distance;
}

function createJunctionRegion(junction: RiverJunctionArtifact, junctionIndex: number): RiverLocalMapBakeRegion {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const position of junction.queryBoundary) {
    minX = Math.min(minX, position[0]);
    minZ = Math.min(minZ, position[2]);
    maxX = Math.max(maxX, position[0]);
    maxZ = Math.max(maxZ, position[2]);
  }
  return Object.freeze({
    id: junction.id,
    kind: RiverLocalMapRegionKind.Confluence,
    sourceIndex: junctionIndex,
    min: tuple2(minX, minZ),
    max: tuple2(maxX, maxZ),
    packedChannels: PACKED_CHANNELS
  });
}

function createObstacleRegion(
  disturbance: RiverCompiledDisturbanceSource,
  disturbanceIndex: number
): RiverLocalMapBakeRegion {
  const extent = disturbance.radius * RIVER_OBSTACLE_MAP_RADIUS_SCALE;
  return Object.freeze({
    id: disturbance.id,
    kind: RiverLocalMapRegionKind.Obstacle,
    sourceIndex: disturbanceIndex,
    min: tuple2(disturbance.position[0] - extent, disturbance.position[2] - extent),
    max: tuple2(disturbance.position[0] + extent, disturbance.position[2] + extent),
    packedChannels: PACKED_CHANNELS
  });
}

function createJunctionSampler(junction: RiverJunctionArtifact): RiverLocalMapTileDraft["sample"] {
  return (worldX, worldZ) => {
    let weightedX = junction.flowDirection[0] * junction.flowSpeed * RIVER_LOCAL_MAP_TUNING.junctionBaseWeight;
    let weightedZ = junction.flowDirection[2] * junction.flowSpeed * RIVER_LOCAL_MAP_TUNING.junctionBaseWeight;
    let totalWeight = RIVER_LOCAL_MAP_TUNING.junctionBaseWeight;
    let weightedSpeed = junction.flowSpeed * RIVER_LOCAL_MAP_TUNING.junctionBaseWeight;
    let nearestAnchorDistance = Number.POSITIVE_INFINITY;
    for (const anchor of junction.flowAnchors) {
      const deltaX = worldX - anchor.position[0];
      const deltaZ = worldZ - anchor.position[2];
      const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
      nearestAnchorDistance = Math.min(nearestAnchorDistance, Math.sqrt(distanceSquared));
      const weight =
        1 /
        (distanceSquared + junction.mergeRadius * junction.mergeRadius * RIVER_LOCAL_MAP_TUNING.junctionAnchorSoftness);
      weightedX += anchor.flowDirection[0] * anchor.flowSpeed * weight;
      weightedZ += anchor.flowDirection[2] * anchor.flowSpeed * weight;
      weightedSpeed += anchor.flowSpeed * weight;
      totalWeight += weight;
    }
    const resultantLength = Math.hypot(weightedX, weightedZ);
    const flowX = resultantLength > 0 ? weightedX / resultantLength : junction.flowDirection[0];
    const flowZ = resultantLength > 0 ? weightedZ / resultantLength : junction.flowDirection[2];
    const averageSpeed = weightedSpeed / Math.max(totalWeight, 0.0001);
    const coherence = clamp01(resultantLength / Math.max(weightedSpeed, 0.0001));
    const signedDistance = signedDistanceToPolygon(junction.queryBoundary, worldX, worldZ);
    const bankWidth = Math.max(junction.mergeRadius * RIVER_LOCAL_MAP_TUNING.junctionBankFoamWidth, 0.1);
    const normalizedAnchorDistance = nearestAnchorDistance / Math.max(junction.mergeRadius, 0.0001);
    const bankAnchorEnvelope = smoothstep(
      RIVER_LOCAL_MAP_TUNING.junctionBankAnchorSuppressionStart,
      RIVER_LOCAL_MAP_TUNING.junctionBankAnchorSuppressionEnd,
      normalizedAnchorDistance
    );
    const bankFoam = Math.exp(-Math.abs(signedDistance) / bankWidth) * bankAnchorEnvelope;
    const speedDifference = clamp01(Math.abs(averageSpeed - junction.flowSpeed) / Math.max(junction.flowSpeed, 0.1));
    const mixingSignal = clamp01(
      (1 - coherence + speedDifference - RIVER_LOCAL_MAP_TUNING.junctionMixingThreshold) *
        RIVER_LOCAL_MAP_TUNING.junctionMixingGain
    );
    const normalizedCenterDistance =
      Math.hypot(worldX - junction.position[0], worldZ - junction.position[2]) / Math.max(junction.mergeRadius, 0.0001);
    const centerEnvelope =
      1 -
      smoothstep(
        RIVER_LOCAL_MAP_TUNING.junctionMixingCenterStart,
        RIVER_LOCAL_MAP_TUNING.junctionMixingCenterEnd,
        normalizedCenterDistance
      );
    const interiorEnvelope = smoothstep(
      0,
      RIVER_LOCAL_MAP_TUNING.junctionMixingInteriorWidth,
      signedDistance / Math.max(junction.mergeRadius, 0.0001)
    );
    const mixing = mixingSignal * centerEnvelope * interiorEnvelope;
    const foam = clamp01(mixing + bankFoam * RIVER_LOCAL_MAP_TUNING.junctionBankWeight);
    return { flowX, flowZ, foam, signedDistance };
  };
}

interface NearestReachFlow {
  readonly reachIndex: number;
  readonly flowX: number;
  readonly flowZ: number;
  readonly flowSpeed: number;
}

function findNearestReachFlow(
  reaches: readonly RiverCompiledReach[],
  position: ReadonlyVector3Tuple
): NearestReachFlow {
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let best: NearestReachFlow = { reachIndex: 0, flowX: 1, flowZ: 0, flowSpeed: 0 };
  for (let reachIndex = 0; reachIndex < reaches.length; reachIndex++) {
    for (const sample of reaches[reachIndex].artifact.samples) {
      const deltaX = position[0] - sample.position[0];
      const deltaZ = position[2] - sample.position[2];
      const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
      if (distanceSquared >= bestDistanceSquared) continue;
      bestDistanceSquared = distanceSquared;
      const length = Math.hypot(sample.tangent[0], sample.tangent[2]) || 1;
      best = {
        reachIndex,
        flowX: sample.tangent[0] / length,
        flowZ: sample.tangent[2] / length,
        flowSpeed: sample.flowSpeed
      };
    }
  }
  return best;
}

function createObstacleSampler(
  disturbance: RiverCompiledDisturbanceSource,
  reachFlow: NearestReachFlow
): RiverLocalMapTileDraft["sample"] {
  const lateralX = -reachFlow.flowZ;
  const lateralZ = reachFlow.flowX;
  return (worldX, worldZ) => {
    const deltaX = worldX - disturbance.position[0];
    const deltaZ = worldZ - disturbance.position[2];
    const downstream = deltaX * reachFlow.flowX + deltaZ * reachFlow.flowZ;
    const across = deltaX * lateralX + deltaZ * lateralZ;
    const radius = disturbance.radius;
    const front =
      downstream < 0
        ? clamp01(1 + downstream / (radius * RIVER_LOCAL_MAP_TUNING.obstacleFrontLength)) *
          clamp01(1 - Math.abs(across) / (radius * RIVER_LOCAL_MAP_TUNING.obstacleFrontWidthScale))
        : 0;
    const wakeWidth = radius * 0.55 + downstream * RIVER_LOCAL_MAP_TUNING.obstacleWakeHalfAngle;
    const wake =
      downstream > 0 && downstream < radius * RIVER_LOCAL_MAP_TUNING.obstacleWakeLength
        ? clamp01(1 - downstream / (radius * RIVER_LOCAL_MAP_TUNING.obstacleWakeLength)) *
          clamp01(1 - Math.abs(across) / Math.max(wakeWidth, 0.1))
        : 0;
    const side = across < 0 ? -1 : 1;
    const deflection =
      side *
      disturbance.strength *
      (front * RIVER_LOCAL_MAP_TUNING.obstacleFrontDeflection + wake * RIVER_LOCAL_MAP_TUNING.obstacleWakeDeflection);
    const downstreamScale =
      1 +
      front * disturbance.strength * RIVER_LOCAL_MAP_TUNING.obstacleCompressionGain -
      wake * RIVER_LOCAL_MAP_TUNING.obstacleWakeSlowdown;
    const rawX = reachFlow.flowX * downstreamScale + lateralX * deflection;
    const rawZ = reachFlow.flowZ * downstreamScale + lateralZ * deflection;
    const flowLength = Math.hypot(rawX, rawZ) || 1;
    const signedDistance = Math.hypot(deltaX, deltaZ) - radius;
    const outsideObstacle = smoothObstacleMask(signedDistance, radius * RIVER_LOCAL_MAP_TUNING.obstacleSdfFeatherScale);
    const foam =
      clamp01(disturbance.strength * (wake + front * RIVER_LOCAL_MAP_TUNING.obstacleFrontFoamWeight)) * outsideObstacle;
    return { flowX: rawX / flowLength, flowZ: rawZ / flowLength, foam, signedDistance };
  };
}

function smoothObstacleMask(signedDistance: number, width: number): number {
  const normalized = clamp01(signedDistance / Math.max(width, 0.0001));
  return normalized * normalized * (3 - 2 * normalized);
}

function encodeSignedUnit(value: number): number {
  return Math.round(clamp01(value * 0.5 + 0.5) * 255);
}

function encodeUnit(value: number): number {
  return Math.round(clamp01(value) * 255);
}

function packDrafts(drafts: RiverLocalMapTileDraft[]): { width: number; height: number } {
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let width = 0;
  for (const draft of drafts) {
    const physicalSize = draft.resolution + RIVER_LOCAL_MAP_PADDING * 2;
    if (cursorX > 0 && cursorX + physicalSize > RIVER_LOCAL_MAP_MAX_ATLAS_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    draft.x = cursorX;
    draft.y = cursorY;
    cursorX += physicalSize;
    rowHeight = Math.max(rowHeight, physicalSize);
    width = Math.max(width, cursorX);
  }
  return { width, height: cursorY + rowHeight };
}

function buildAtlas(drafts: RiverLocalMapTileDraft[]): RiverLocalMapAtlasData | undefined {
  if (drafts.length === 0) return undefined;
  const { width, height } = packDrafts(drafts);
  const pixels = new Uint8Array(width * height * 4);
  const tiles: RiverLocalMapTileData[] = [];
  for (const draft of drafts) {
    const resolution = draft.resolution;
    const padding = RIVER_LOCAL_MAP_PADDING;
    const minX = draft.region.min[0];
    const minZ = draft.region.min[1];
    const sizeX = Math.max(draft.region.max[0] - minX, 0.0001);
    const sizeZ = Math.max(draft.region.max[1] - minZ, 0.0001);
    for (let localY = -padding; localY < resolution + padding; localY++) {
      const sampleY = Math.min(resolution - 1, Math.max(0, localY));
      const worldZ = minZ + ((sampleY + 0.5) / resolution) * sizeZ;
      for (let localX = -padding; localX < resolution + padding; localX++) {
        const sampleX = Math.min(resolution - 1, Math.max(0, localX));
        const worldX = minX + ((sampleX + 0.5) / resolution) * sizeX;
        const sample = draft.sample(worldX, worldZ);
        const atlasX = draft.x + localX + padding;
        const atlasY = draft.y + localY + padding;
        const offset = (atlasY * width + atlasX) * 4;
        pixels[offset] = encodeSignedUnit(sample.flowX);
        pixels[offset + 1] = encodeSignedUnit(sample.flowZ);
        pixels[offset + 2] = encodeUnit(sample.foam);
        pixels[offset + 3] = encodeSignedUnit(sample.signedDistance / RIVER_LOCAL_MAP_SIGNED_DISTANCE_RANGE);
      }
    }
    const pixelMinX = draft.x + padding;
    const pixelMinY = draft.y + padding;
    const uvMinX = (pixelMinX + 0.5) / width;
    const uvMinY = (pixelMinY + 0.5) / height;
    const uvMaxX = (pixelMinX + resolution - 0.5) / width;
    const uvMaxY = (pixelMinY + resolution - 0.5) / height;
    const scaleX = (uvMaxX - uvMinX) / sizeX;
    const scaleZ = (uvMaxY - uvMinY) / sizeZ;
    tiles.push(
      Object.freeze({
        id: draft.region.id,
        kind: draft.region.kind,
        sourceIndex: draft.region.sourceIndex,
        resolution,
        min: draft.region.min,
        max: draft.region.max,
        pixelRect: tuple4(pixelMinX, pixelMinY, resolution, resolution),
        uvRect: tuple4(uvMinX, uvMinY, uvMaxX, uvMaxY),
        worldToUv: tuple4(scaleX, scaleZ, uvMinX - minX * scaleX, uvMinY - minZ * scaleZ)
      })
    );
  }
  return Object.freeze({
    width,
    height,
    padding: RIVER_LOCAL_MAP_PADDING,
    tiles: Object.freeze(tiles),
    pixels: new RiverReadonlyUint8Buffer(pixels)
  });
}

export function compileRiverLocalMaps(
  reaches: readonly RiverCompiledReach[],
  junctions: readonly RiverJunctionArtifact[],
  disturbances: readonly RiverCompiledDisturbanceSource[]
): RiverLocalMapCompileResult {
  const regions: RiverLocalMapBakeRegion[] = [];
  const drafts: RiverLocalMapTileDraft[] = [];
  for (let junctionIndex = 0; junctionIndex < junctions.length; junctionIndex++) {
    const junction = junctions[junctionIndex];
    const region = createJunctionRegion(junction, junctionIndex);
    regions.push(region);
    const level = reaches[junction.materialSourceReachIndex].config.quality.maps.level;
    const resolution = RIVER_LOCAL_MAP_TILE_RESOLUTION_BY_QUALITY[level];
    if (resolution > 0) drafts.push({ region, resolution, sample: createJunctionSampler(junction), x: 0, y: 0 });
  }
  for (let disturbanceIndex = 0; disturbanceIndex < disturbances.length; disturbanceIndex++) {
    const disturbance = disturbances[disturbanceIndex];
    const region = createObstacleRegion(disturbance, disturbanceIndex);
    regions.push(region);
    const reachFlow = findNearestReachFlow(reaches, disturbance.position);
    const level = reaches[reachFlow.reachIndex]?.config.quality.maps.level ?? RiverQualityLevel.Low;
    const resolution = RIVER_LOCAL_MAP_TILE_RESOLUTION_BY_QUALITY[level];
    if (resolution > 0) {
      drafts.push({ region, resolution, sample: createObstacleSampler(disturbance, reachFlow), x: 0, y: 0 });
    }
  }
  drafts.sort((a, b) => a.region.kind.localeCompare(b.region.kind) || a.region.id.localeCompare(b.region.id));
  return Object.freeze({
    regions: Object.freeze(regions),
    atlas: buildAtlas(drafts)
  });
}
