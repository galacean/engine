export interface TerrainRoadPlan {
  /** At least two ordered X/Z coordinates, with both axes in the terrain's 0–1024 metre range. */
  keypoints: { x: number; z: number }[];
  /** Core width in metres, from 3 to 12. Defaults to 7. */
  widthMetres?: number;
}

export interface TerrainWaterCountRange {
  countMin: number;
  countMax: number;
}

export interface TerrainLakePlan extends TerrainWaterCountRange {
  /** Defaults to true. False accepts natural basins only. */
  allowCarving?: boolean;
}

export interface TerrainPreviewOptions {
  /** Unsigned 32-bit seed. Omit to select a random seed and use the returned seed for replay. */
  seed?: number;
  /** FBM elevation amplitude in metres, from 0 to 80. Defaults to 51. */
  reliefAmplitudeMetres?: number;
  /** Open road centerlines to compile. Roads can share a keypoint to form a junction. */
  roads?: TerrainRoadPlan[];
  /** Omitted rivers produce none. Fixed targets use equal minimum and maximum counts. */
  rivers?: TerrainWaterCountRange;
  /** Omitted lakes produce none. */
  lakes?: TerrainLakePlan;
  /** Surround the generated islands with a native Ocean. Defaults to false. */
  ocean?: boolean;
}

export interface TerrainRoadPreview {
  /** Zero-based index in the requested roads. */
  road: number;
  /** Total centerline length in metres. */
  lengthMetres: number;
  /** Sum of straight-line distances between successive keypoints in metres. */
  keypointDistanceMetres: number;
  /** Highest ratio of routed length to straight-line distance between adjacent keypoints. */
  maxLegDetour: number;
  /** Zero-based index of the leg with the highest detour. */
  maxDetourLeg: number;
  /** Minimum signed distance from the routed centerline to the mainland coast, in metres. */
  coastClearanceMetres: number;
  /** Steepest grade sampled along the road, as a rise/run percentage. */
  maxGradePercent: number;
}

export interface TerrainHydrologyPreview {
  counts: { rivers: { target: number; actual: number }; lakes: { target: number; actual: number } };
  diagnostics: string[];
  rivers: {
    id: string;
    outline: { x: number; z: number }[];
    points: { x: number; z: number; elevation: number; width: number }[];
  }[];
  lakes: { id: string; shoreline: { x: number; z: number }[]; waterLevel: number }[];
  ocean: boolean;
}

export interface TerrainPreviewResult {
  seed: number;
  reliefAmplitudeMetres: number;
  /** Sample spacing. Column and row indices times this spacing give local X and Z. */
  spacingMetres: number;
  /** Rows of increasing Z, columns of increasing X. Each cell contains height in metres, signed mainland clearance in metres, and local grade percent. */
  samples: [number, number, number][][];
  /** Compiled roads in input order. Omitted roads produce an empty array. */
  roads: TerrainRoadPreview[];
  hydrology?: TerrainHydrologyPreview;
}

export type TerrainIslandShape = TerrainPreviewOptions & { seed: number; reliefAmplitudeMetres: number };
