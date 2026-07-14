/** CPU compilation constants that are not part of the authoring schema. */
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
export const RIVER_FLOW_UV_SCALE = 0.08;
export const RIVER_FLOW_TRAVEL_MIN_SPEED = 0.05;

export const RIVER_GEOMETRY_Y_OFFSET = {
  surface: 0.04
} as const;

export const RIVER_QUERY_SAMPLE_COMPONENT = {
  x: 0,
  y: 1,
  z: 2,
  distance: 3,
  width: 4,
  depth: 5,
  flowSpeed: 6,
  tangentX: 7,
  tangentZ: 8,
  flowTravelTime: 9
} as const;
export const RIVER_QUERY_SAMPLE_STRIDE = 10;

export const RIVER_QUERY_BOUNDS_STRIDE = 4;
export const RIVER_QUERY_CELL_COORDINATE_STRIDE = 2;
export const RIVER_QUERY_CELL_SIZE_BY_QUALITY = {
  low: 32,
  medium: 16,
  high: 8
} as const;

export const RIVER_RIBBON_MITER_LIMIT = 2.5;
export const RIVER_GEOMETRY_EPSILON = 1e-6;
export const RIVER_JUNCTION_MIN_REACH_LENGTH = 0.25;
/** Keeps the junction transition ring away from both the cut boundary and the singular center fan. */
export const RIVER_JUNCTION_INNER_RING_SCALE = 0.45;
/** Shrinks the singular junction center fan so flow/tangent interpolation does not create visible radial facets. */
export const RIVER_JUNCTION_CORE_RING_SCALE = 0.16;
export const RIVER_CHUNK_WORLD_SIZE = 128;
export const RIVER_CATMULL_ROM_ALPHA = 0.5;
export const RIVER_MAX_WATER_SURFACE_SLOPE = 0.2;

export const RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY = {
  [RiverQualityLevel.Low]: 3,
  [RiverQualityLevel.Medium]: 8,
  [RiverQualityLevel.High]: 16
} as const;

export const RIVER_SURFACE_REFERENCE_FLOW_SPEED = 1.5;
export const RIVER_SURFACE_DERIVATIVE_STEP = 0.05;
export const RIVER_SURFACE_TIME_DERIVATIVE_STEP = 0.016;
export const RIVER_SURFACE_FLOW_EPSILON = 0.0001;
export const RIVER_SURFACE_HASH_MULTIPLIER = 43758.5453123;
export const RIVER_SURFACE_HASH_SEED_SCALE = 0.12345;
export const RIVER_SURFACE_DOMAIN_WARP_SCALE = 0.55;
export const RIVER_SURFACE_DOMAIN_WARP_STRENGTH = 0.58;
export const RIVER_SURFACE_MACRO_NOISE = {
  hashDirection: [127.1, 311.7] as const,
  warpOffsetX: [13.1, 7.7] as const,
  warpOffsetY: [3.8, 19.4] as const,
  secondOctaveScale: 2.03,
  secondOctaveOffset: [17.7, 9.2] as const,
  thirdOctaveScale: 4.11,
  thirdOctaveOffset: [8.3, 21.6] as const,
  octaveWeights: [0.55, 0.28, 0.17] as const,
  ridgeScale: 1.37,
  ridgeOffset: [5.2, 11.6] as const,
  broadWeight: 0.72,
  ridgeWeight: 0.28
} as const;

export const RIVER_LOCAL_MAP_TILE_RESOLUTION_BY_QUALITY = {
  [RiverQualityLevel.Low]: 0,
  [RiverQualityLevel.Medium]: 32,
  [RiverQualityLevel.High]: 64
} as const;
export const RIVER_LOCAL_MAP_PADDING = 2;
export const RIVER_LOCAL_MAP_MAX_ATLAS_WIDTH = 512;
export const RIVER_LOCAL_MAP_SIGNED_DISTANCE_RANGE = 8;
export const RIVER_OBSTACLE_MAP_RADIUS_SCALE = 4;
export const RIVER_LOCAL_MAP_TUNING = {
  junctionBaseWeight: 0.35,
  junctionAnchorSoftness: 0.12,
  junctionBankFoamWidth: 0.16,
  junctionMixingThreshold: 0.18,
  junctionMixingGain: 1.15,
  junctionMixingCenterStart: 0.12,
  junctionMixingCenterEnd: 0.82,
  junctionMixingInteriorWidth: 0.28,
  junctionBankAnchorSuppressionStart: 0.18,
  junctionBankAnchorSuppressionEnd: 0.58,
  junctionBankWeight: 0.36,
  obstacleFrontLength: 1.5,
  obstacleWakeLength: 4,
  obstacleWakeHalfAngle: 0.42,
  obstacleFrontDeflection: 0.72,
  obstacleWakeDeflection: 0.48,
  obstacleWakeSlowdown: 0.56,
  obstacleFrontFoamWeight: 0.46,
  obstacleFrontWidthScale: 1.4,
  obstacleCompressionGain: 0.28,
  obstacleSdfFeatherScale: 0.2
} as const;

export const RIVER_TERRAIN_CORRIDOR_COMPONENT = {
  x: 0,
  z: 1,
  waterSurfaceY: 2,
  riverBedY: 3,
  channelHalfWidth: 4,
  bankWetnessWidth: 5,
  vegetationExclusionRadius: 6,
  buildingExclusionRadius: 7
} as const;
export const RIVER_TERRAIN_CORRIDOR_STRIDE = 8;
