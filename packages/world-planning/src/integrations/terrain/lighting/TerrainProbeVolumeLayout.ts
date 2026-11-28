import type { ProbeVolumeBakeOptions } from "@galacean/engine";
import type { TerrainProbeVolumeRegionSource } from "./TerrainProbeVolumeRegionSource.ts";

export type { TerrainProbeVolumeRegionSource } from "./TerrainProbeVolumeRegionSource.ts";

/** Stable lighting scenarios offered by the in-memory probe baker. */
export const TERRAIN_PROBE_VOLUME_SCENARIOS = ["Dawn", "Morning", "Noon", "Afternoon", "Dusk", "Night"] as const;

/** Name of one authored probe-volume lighting scenario. */
export type TerrainProbeVolumeScenario = (typeof TERRAIN_PROBE_VOLUME_SCENARIOS)[number];

/** Engine probe topology needed to estimate an adaptive layout. */
export interface TerrainProbeVolumeTopology {
  /** Number of interpolation cells along one brick axis. */
  readonly brickCellCount: number;
  /** Number of probes along one brick axis. */
  readonly probeCountPerDimension: number;
}

/** Renderer-independent world bounds and bake budget exposed to diagnostics. */
export interface TerrainProbeVolumeLayoutSnapshot {
  /** Complete loaded-world bounds with a vertical capture margin. */
  readonly bounds: {
    /** Minimum world-space corner. */
    readonly minimum: readonly [x: number, y: number, z: number];
    /** Maximum world-space corner. */
    readonly maximum: readonly [x: number, y: number, z: number];
    /** World-space size. */
    readonly size: readonly [x: number, y: number, z: number];
    /** World-space center. */
    readonly center: readonly [x: number, y: number, z: number];
  };
  /** Adaptive placement settings. */
  readonly region: {
    /** Smallest probe brick size in metres. */
    readonly minBrickSize: number;
    /** Probe placement algorithm. */
    readonly placementMode: "adaptive";
    /** Maximum adaptive subdivision level. */
    readonly maxSubdivisionLevel: number;
    /** Surface search distance in metres. */
    readonly surfaceDistance: number;
  };
  /** Runtime probe-cell residency settings. */
  readonly streaming: {
    /** World-space cell size in metres. */
    readonly cellSize: number;
    /** Number of neighbouring cells kept around the anchor. */
    readonly streamingRadius: number;
    /** Maximum simultaneously resident cells. */
    readonly maxActiveCells: number;
  };
  /** Scenario names accepted by the baker. */
  readonly scenarios: readonly TerrainProbeVolumeScenario[];
  /** Coarse upper-bound estimate shown before baking. */
  readonly coarseLayoutEstimate: {
    /** Coarsest brick size in metres. */
    readonly brickSize: number;
    /** Coarse brick counts on each axis. */
    readonly brickCounts: readonly [x: number, y: number, z: number];
    /** Total coarse brick count. */
    readonly brickCount: number;
    /** Estimated total probe count. */
    readonly probeCount: number;
    /** Estimated cubemap face captures for one scenario. */
    readonly cubemapFaceCapturesPerScenario: number;
    /** Estimated cubemap face captures for all declared scenarios. */
    readonly cubemapFaceCapturesAllScenarios: number;
  };
  /** Exact options passed to the engine baker. */
  readonly bakeOptions: Readonly<
    Pick<
      ProbeVolumeBakeOptions,
      | "resolution"
      | "bounceCount"
      | "separateEnvironment"
      | "bakeSunIndirect"
      | "placementMode"
      | "maxSubdivisionLevel"
      | "surfaceDistance"
      | "probesPerBatch"
    >
  >;
}

const WORLD_HEIGHT_MARGIN = 32;
const MIN_BRICK_SIZE = 32;
const MAX_SUBDIVISION_LEVEL = 2;
const SURFACE_DISTANCE = 64;
const STREAMING_RADIUS = 1;
const MAX_ACTIVE_CELLS = 16;

/**
 * Derives one probe-volume layout from arbitrary canonical Region bounds.
 * @param regions Unordered, sparse, and independently sized Region bounds.
 * @param topology Engine probe topology used only for the diagnostic estimate.
 * @returns Complete-world adaptive layout and coarse capture estimate.
 * @throws If the Region set, bounds, or topology are invalid.
 */
export function createTerrainProbeVolumeLayout(
  regions: readonly TerrainProbeVolumeRegionSource[],
  topology: TerrainProbeVolumeTopology
): TerrainProbeVolumeLayoutSnapshot {
  if (regions.length === 0) throw new Error("Terrain probe layout requires at least one Region");
  if (
    !Number.isInteger(topology.brickCellCount) ||
    topology.brickCellCount < 1 ||
    !Number.isInteger(topology.probeCountPerDimension) ||
    topology.probeCountPerDimension < 2
  ) {
    throw new Error("Terrain probe layout requires a valid engine probe topology");
  }

  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (const region of regions) {
    const [originX, originY, originZ] = region.worldPosition;
    const [extentX, , extentZ] = region.worldSize;
    const values = [originX, originY, originZ, extentX, extentZ, region.minimumHeight, region.maximumHeight];
    if (values.some((value) => !Number.isFinite(value)) || extentX <= 0 || extentZ <= 0) {
      throw new Error(`Terrain probe Region "${region.id}" has invalid world bounds`);
    }
    if (region.maximumHeight < region.minimumHeight) {
      throw new Error(`Terrain probe Region "${region.id}" has an inverted height range`);
    }
    minimumX = Math.min(minimumX, originX);
    minimumY = Math.min(minimumY, originY + region.minimumHeight);
    minimumZ = Math.min(minimumZ, originZ);
    maximumX = Math.max(maximumX, originX + extentX);
    maximumY = Math.max(maximumY, originY + region.maximumHeight);
    maximumZ = Math.max(maximumZ, originZ + extentZ);
  }

  const minimum: [number, number, number] = [minimumX, minimumY - WORLD_HEIGHT_MARGIN, minimumZ];
  const maximum: [number, number, number] = [maximumX, maximumY + WORLD_HEIGHT_MARGIN, maximumZ];
  const size: [number, number, number] = [maximum[0] - minimum[0], maximum[1] - minimum[1], maximum[2] - minimum[2]];
  const center: [number, number, number] = [
    (minimum[0] + maximum[0]) * 0.5,
    (minimum[1] + maximum[1]) * 0.5,
    (minimum[2] + maximum[2]) * 0.5
  ];
  const coarseBrickSize = MIN_BRICK_SIZE * topology.brickCellCount ** MAX_SUBDIVISION_LEVEL;
  const brickCounts: [number, number, number] = [
    Math.ceil(size[0] / coarseBrickSize),
    Math.ceil(size[1] / coarseBrickSize),
    Math.ceil(size[2] / coarseBrickSize)
  ];
  const brickCount = brickCounts[0] * brickCounts[1] * brickCounts[2];
  const probeCount = brickCount * topology.probeCountPerDimension ** 3;
  const cubemapFaceCapturesPerScenario = probeCount * 6;
  const bakeOptions = {
    resolution: 8,
    bounceCount: 1,
    separateEnvironment: false,
    bakeSunIndirect: true,
    placementMode: "adaptive" as const,
    maxSubdivisionLevel: MAX_SUBDIVISION_LEVEL,
    surfaceDistance: SURFACE_DISTANCE,
    probesPerBatch: 1
  } satisfies TerrainProbeVolumeLayoutSnapshot["bakeOptions"];

  return {
    bounds: {
      minimum: Object.freeze(minimum),
      maximum: Object.freeze(maximum),
      size: Object.freeze(size),
      center: Object.freeze(center)
    },
    region: {
      minBrickSize: MIN_BRICK_SIZE,
      placementMode: "adaptive",
      maxSubdivisionLevel: MAX_SUBDIVISION_LEVEL,
      surfaceDistance: SURFACE_DISTANCE
    },
    streaming: {
      cellSize: MIN_BRICK_SIZE * 12,
      streamingRadius: STREAMING_RADIUS,
      maxActiveCells: MAX_ACTIVE_CELLS
    },
    scenarios: TERRAIN_PROBE_VOLUME_SCENARIOS,
    coarseLayoutEstimate: {
      brickSize: coarseBrickSize,
      brickCounts: Object.freeze(brickCounts),
      brickCount,
      probeCount,
      cubemapFaceCapturesPerScenario,
      cubemapFaceCapturesAllScenarios: cubemapFaceCapturesPerScenario * TERRAIN_PROBE_VOLUME_SCENARIOS.length
    },
    bakeOptions
  };
}
