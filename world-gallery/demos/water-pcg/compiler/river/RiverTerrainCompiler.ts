import { RiverReadonlyFloat32Buffer } from "../shared/ReadonlyNumericBuffer";
import {
  RiverLocalMapRegionKind,
  RiverPackedLocalMapChannel,
  RiverTerrainMaskChannel,
  RiverTerrainSurfaceOwnership
} from "./RiverGeometryEnums";
import { RIVER_TERRAIN_CORRIDOR_COMPONENT, RIVER_TERRAIN_CORRIDOR_STRIDE } from "./constants";
import type {
  RiverCompiledReach,
  RiverJunctionArtifact,
  RiverLocalMapBakeRegion,
  RiverTerrainInteractionData,
  RiverTerrainJunctionCorridorData,
  RiverTerrainReachCorridorData,
  Vector2Tuple
} from "./types";

function tuple2(x: number, y: number): Vector2Tuple {
  return Object.freeze([x, y] as const);
}

function compileReachCorridor(reach: RiverCompiledReach, reachIndex: number): RiverTerrainReachCorridorData {
  const data = new Float32Array(reach.artifact.samples.length * RIVER_TERRAIN_CORRIDOR_STRIDE);
  for (let sampleIndex = 0; sampleIndex < reach.artifact.samples.length; sampleIndex++) {
    const sample = reach.artifact.samples[sampleIndex];
    const offset = sampleIndex * RIVER_TERRAIN_CORRIDOR_STRIDE;
    const halfWidth = sample.width * 0.5;
    const exclusionRadius = halfWidth + sample.bankFeather;
    data[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.x] = sample.position[0];
    data[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.z] = sample.position[2];
    data[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.waterSurfaceY] = sample.position[1];
    data[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.riverBedY] = sample.position[1] - sample.depth;
    data[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.channelHalfWidth] = halfWidth;
    data[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.bankWetnessWidth] = sample.bankFeather;
    data[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.vegetationExclusionRadius] = exclusionRadius;
    data[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.buildingExclusionRadius] = exclusionRadius;
  }
  return Object.freeze({
    id: reach.id,
    reachIndex,
    samples: new RiverReadonlyFloat32Buffer(data),
    stride: RIVER_TERRAIN_CORRIDOR_STRIDE,
    sampleCount: reach.artifact.samples.length
  });
}

function compileJunctionCorridor(
  junction: RiverJunctionArtifact,
  junctionIndex: number
): RiverTerrainJunctionCorridorData {
  return Object.freeze({
    id: junction.id,
    junctionIndex,
    boundary: junction.queryBoundary,
    waterSurfaceElevation: junction.position[1],
    riverBedElevation: junction.position[1] - junction.depth
  });
}

function compileLocalMapRegion(junction: RiverJunctionArtifact, junctionIndex: number): RiverLocalMapBakeRegion {
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
    packedChannels: Object.freeze([
      RiverPackedLocalMapChannel.FlowX,
      RiverPackedLocalMapChannel.FlowZ,
      RiverPackedLocalMapChannel.Foam,
      RiverPackedLocalMapChannel.SignedDistance
    ])
  });
}

export function compileRiverTerrainInteraction(
  reaches: readonly RiverCompiledReach[],
  junctions: readonly RiverJunctionArtifact[]
): RiverTerrainInteractionData {
  return Object.freeze({
    terrainSurfaceOwnership: RiverTerrainSurfaceOwnership.ExternalTerrainSystem,
    maskChannels: Object.freeze([
      RiverTerrainMaskChannel.RiverBedCarve,
      RiverTerrainMaskChannel.BankWetnessSdf,
      RiverTerrainMaskChannel.VegetationExclusion,
      RiverTerrainMaskChannel.BuildingExclusion
    ]),
    reachCorridors: Object.freeze(reaches.map(compileReachCorridor)),
    junctionCorridors: Object.freeze(junctions.map(compileJunctionCorridor)),
    localMapBakeRegions: Object.freeze(junctions.map(compileLocalMapRegion))
  });
}
