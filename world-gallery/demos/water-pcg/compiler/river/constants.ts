/** CPU compilation constants that are not part of the authoring schema. */
export const RIVER_FLOW_UV_SCALE = 0.08;

export const RIVER_GEOMETRY_Y_OFFSET = {
  surface: 0.04,
  bankFoam: 0.02
} as const;

export const RIVER_QUERY_SAMPLE_STRIDE = 9;

export const RIVER_RIBBON_MITER_LIMIT = 2.5;
export const RIVER_GEOMETRY_EPSILON = 1e-6;
export const RIVER_JUNCTION_MIN_REACH_LENGTH = 0.25;
export const RIVER_CHUNK_WORLD_SIZE = 128;
