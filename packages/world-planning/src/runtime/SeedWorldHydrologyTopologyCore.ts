import {
  sampleSeedWorldCoastSignedFieldMetres,
  sampleSeedWorldMountainFoothillSignedDistanceMetres,
  type SeedWorldPlan,
  type SeedWorldPoint,
  type SeedWorldRiverReach
} from "../world/SeedWorldPlanner.ts";
import {
  SEED_WORLD_LAKE_ANALYSIS_BOUNDARY_CLEARANCE_CELLS,
  SEED_WORLD_LAKE_ANALYSIS_SUPPORT_CLEARANCE_CELLS,
  SEED_WORLD_LAKE_LAYOUT_PROFILE,
  SEED_WORLD_MINIMUM_TERRAIN_CONSTRAINED_LAKE_AREA_SQUARE_METRES
} from "@galacean/engine-water/world/SeedWorldLakeLayoutProfile";
import {
  SeedWorldLakeCandidateRejectionError,
  type LakeCandidateRejectionReason
} from "@galacean/engine-water/world/SeedWorldLakeCandidate";
import {
  compileSeedWorldWaterSuitabilityPreview,
  type SeedWorldWaterSuitabilityPreview
} from "./SeedWorldWaterSuitabilityPreview.ts";

/** Mobile analysis lattice; final vector values still sample the authored H0 field. */
export const SEED_WORLD_BASIN_ANALYSIS_RESOLUTION = 129;
/** Largest terrain cut admitted by a planned Lake. */
export const SEED_WORLD_BASIN_MAXIMUM_CUT_METRES = SEED_WORLD_LAKE_LAYOUT_PROFILE.maximumBedCutMetres;
const INTEGRATED_RIVER_FULL_WIDTH_METRES = 24;
const INTEGRATED_RIVER_BANK_FEATHER_METRES = 8;
const INTEGRATED_RIVER_STYLED_DEPTH_METRES = 3;
const DEFAULT_HYDROLOGY_DEPTH_SCALE = 2.2;
const MINIMUM_INLET_LENGTH_METRES = 96;
const MINIMUM_TRIBUTARY_LENGTH_METRES = 72;
const MAXIMUM_INLET_LENGTH_METRES = 432;
const MAXIMUM_VISIBLE_INLET_REACHES = 3;
const MAXIMUM_BASIN_CELLS = 1_200;
const MAXIMUM_SHORELINE_CUT_METRES = SEED_WORLD_LAKE_LAYOUT_PROFILE.maximumShorelineCutMetres;
const DIRECTION_EPSILON_METRES = 1e-5;
const TWO_PI = Math.PI * 2;
const GRID_DIRECTIONS = Object.freeze([
  Object.freeze({ x: 1, y: 0, angle: 0 }),
  Object.freeze({ x: 1, y: 1, angle: Math.PI * 0.25 }),
  Object.freeze({ x: 0, y: 1, angle: Math.PI * 0.5 }),
  Object.freeze({ x: -1, y: 1, angle: Math.PI * 0.75 }),
  Object.freeze({ x: -1, y: 0, angle: Math.PI }),
  Object.freeze({ x: -1, y: -1, angle: Math.PI * 1.25 }),
  Object.freeze({ x: 0, y: -1, angle: Math.PI * 1.5 }),
  Object.freeze({ x: 1, y: -1, angle: Math.PI * 1.75 })
]);

/** Diagnostics describing the selected foothill basin. */
export interface SeedWorldHydrologyBodyStatistics {
  /** Horizontal water datum held inside the selected basin. */
  readonly waterLevelMetres: number;
  /** Lowest unchanged H0 boundary elevation surrounding the excavated basin. */
  readonly spillElevationMetres: number;
  /** Visible trunk plus tributary count. */
  readonly branchCount: number;
  /** Greatest cut represented by any visible control point. */
  readonly maximumCutDepthMetres: number;
  /** Number of H0 samples inside the horizontal basin surface. */
  readonly basinCellCount: number;
  /** Number of H0 samples draining through the dominant tree into the selected sink. */
  readonly catchmentCellCount: number;
  /** Signed distance from the sink to the closest mountain-footprint boundary. */
  readonly foothillDistanceMetres: number;
  /** Horizontal area covered by the excavated basin surface. */
  readonly basinAreaSquareMetres: number;
  /** Greatest actual water depth sampled inside the basin. */
  readonly maximumWaterDepthMetres: number;
}

/** Complete deterministic result for one basin selected from an existing river-free H0 field. */
export interface SeedWorldHydrologyBodyResult {
  /** Unsigned Root Seed used by the existing Seed World planner. */
  readonly rootSeed: number;
  /** Physical width and height of the square world. */
  readonly sizeMetres: number;
  /** Width and height of every analysis raster. */
  readonly resolution: number;
  /** Original FBM, coast, and mountain terrain with river reaches removed. */
  readonly naturalHeightMetres: Float32Array;
  /** Final lake bed after terrain-limited excavation; cells outside the basin equal H0. */
  readonly carvedHeightMetres: Float32Array;
  /** Basin water depth, defined exactly as water-surface Y minus carved terrain Y. */
  readonly waterDepthMetres: Float32Array;
  /** Separate Priority-Flood surface; H0 is never overwritten. */
  readonly filledHeightMetres: Float32Array;
  /** Signed coast field sampled from the existing Seed World coast shape. */
  readonly coastDistanceMetres: Float32Array;
  /** Signed distance to the nearest authored mountain foothill. */
  readonly foothillDistanceMetres: Float32Array;
  /** Binary ownership of the connected horizontal water surface. */
  readonly basinMask: Uint8Array;
  /** Binary ownership of the complete dominant drainage catchment. */
  readonly catchmentMask: Uint8Array;
  /** Dominant D-infinity receiver on the Priority-Flood potential, or -1 at an outlet. */
  readonly dominantReceiver: Int32Array;
  /** D-infinity receiver on the separate filled surface, with Priority-Flood flat routing. */
  readonly catchmentReceiver: Int32Array;
  /** Terrain-descending inlet reaches whose constant surface datum joins this Lake. */
  readonly inletReaches: readonly SeedWorldRiverReach[];
  /** Simplified outer contour of the horizontal basin surface. */
  readonly basinContour: readonly SeedWorldPoint[];
  /** Selected-basin values shown in the diagnostics sidebar. */
  readonly statistics: SeedWorldHydrologyBodyStatistics;
}

interface FlowReceiver {
  readonly first: number;
  readonly second: number;
  readonly firstWeight: number;
}

interface DrainageField {
  readonly dominantReceiver: Int32Array;
  readonly accumulation: Float64Array;
}

interface PreparedDrainageTopology {
  readonly receivers: readonly FlowReceiver[];
  readonly dominantReceiver: Int32Array;
  readonly descendingCells: readonly number[];
  readonly landRainfallWeights: Float32Array;
  readonly reverseTree: ReverseDrainageTree;
}

interface PriorityFloodResult {
  readonly filledHeightMetres: Float32Array;
  readonly flatReceiver: Int32Array;
}

interface ReverseDrainageTree {
  readonly firstChild: Int32Array;
  readonly nextSibling: Int32Array;
}

interface BasinCandidate {
  readonly waterLevelMetres: number;
  readonly spillElevationMetres: number;
  readonly foothillDistanceMetres: number;
  readonly basinMask: Uint8Array;
  readonly carvedHeightMetres: Float32Array;
  readonly waterDepthMetres: Float32Array;
}

interface BasinGrowthResult {
  readonly mask: Uint8Array;
  readonly carvedHeightMetres: Float32Array;
  readonly waterDepthMetres: Float32Array;
  readonly waterLevelMetres: number;
  readonly spillElevationMetres: number;
  readonly maximumCutDepthMetres: number;
}

interface DrainageAnchorCandidate {
  readonly cell: number;
  readonly score: number;
}

interface BasinSelectionAcceptedResult {
  readonly accepted: true;
  readonly candidate: BasinCandidate;
}

interface BasinSelectionRejectedResult {
  readonly accepted: false;
  readonly reason: Extract<
    LakeCandidateRejectionReason,
    "invalid-or-disconnected-footprint" | "planned-topology-overlap" | "world-boundary-clearance"
  >;
}

type BasinSelectionResult = BasinSelectionAcceptedResult | BasinSelectionRejectedResult;

/** Accepted natural Lake candidate and its immutable terrain-derived body. */
export interface SeedWorldHydrologyBodyCompileAcceptedResult {
  /** Discriminant for an accepted candidate. */
  readonly accepted: true;
  /** Terrain-derived Lake body selected for publication. */
  readonly body: SeedWorldHydrologyBodyResult;
}

/** Recoverable natural reason for skipping one Lake candidate. */
export interface SeedWorldHydrologyBodyCompileRejectedResult {
  /** Discriminant for a rejected candidate. */
  readonly accepted: false;
  /** Stable rejection category included in bounded-search diagnostics. */
  readonly reason: LakeCandidateRejectionReason;
  /** Human-readable evidence for authoring diagnostics. */
  readonly message: string;
}

/** Result of compiling one deterministic natural Lake candidate. */
export type SeedWorldHydrologyBodyCompileResult =
  | SeedWorldHydrologyBodyCompileAcceptedResult
  | SeedWorldHydrologyBodyCompileRejectedResult;

/** Terrain-qualified location selected before physical Lake growth. */
export interface SeedWorldHydrologyCandidateTarget {
  /** Preferred Lake centre in normalized world coordinates. */
  readonly normalizedX: number;
  /** Preferred Lake centre in normalized world coordinates. */
  readonly normalizedY: number;
  /** Terrain-qualified area target before local basin growth is evaluated. */
  readonly targetAreaSquareMetres: number;
}

/** Prepared H0 analysis that can evaluate multiple named Hydrology seeds. */
export interface SeedWorldPreparedHydrologyCandidateCompiler {
  /**
   * Evaluates one candidate without rebuilding seed-independent terrain analysis.
   * @param hydrologySeed Named Hydrology seed for this candidate attempt.
   * @param occupiedMask Analysis-grid support already reserved by accepted Lakes.
   * @param target Terrain-qualified location and capacity for this candidate attempt.
   * @returns Accepted body or a recoverable rejection result.
   */
  compileCandidate(
    hydrologySeed: number,
    occupiedMask?: Uint8Array,
    target?: SeedWorldHydrologyCandidateTarget
  ): SeedWorldHydrologyBodyCompileResult;
}

interface PreparedHydrologyTerrain {
  readonly plan: SeedWorldPlan;
  readonly naturalHeightMetres: Float32Array;
  readonly filledHeightMetres: Float32Array;
  readonly drainageTopology: PreparedDrainageTopology;
  readonly coastDistanceMetres: Float32Array;
  readonly foothillDistanceMetres: Float32Array;
  readonly suitabilityPreview: SeedWorldWaterSuitabilityPreview;
}

interface HeapEntry {
  readonly index: number;
  readonly elevation: number;
}

function sampleSuitabilityMaskAtAnalysisCell(
  preview: SeedWorldWaterSuitabilityPreview,
  analysisCell: number,
  analysisResolution: number
): boolean {
  const analysisX = analysisCell % analysisResolution;
  const analysisY = Math.floor(analysisCell / analysisResolution);
  const previewX = Math.round((analysisX / (analysisResolution - 1)) * (preview.resolution - 1));
  const previewY = Math.round((analysisY / (analysisResolution - 1)) * (preview.resolution - 1));
  return preview.availableMask[previewY * preview.resolution + previewX] !== 0;
}

function sampleSuitabilityAtAnalysisCell(
  preview: SeedWorldWaterSuitabilityPreview,
  analysisCell: number,
  analysisResolution: number
): number {
  const analysisX = analysisCell % analysisResolution;
  const analysisY = Math.floor(analysisCell / analysisResolution);
  const previewX = Math.round((analysisX / (analysisResolution - 1)) * (preview.resolution - 1));
  const previewY = Math.round((analysisY / (analysisResolution - 1)) * (preview.resolution - 1));
  return preview.suitability[previewY * preview.resolution + previewX]!;
}

function targetBasinCellCount(
  sizeMetres: number,
  resolution: number,
  hydrologySeed: number,
  maximumTargetAreaSquareMetres: number,
  preferredTargetAreaSquareMetres = lerp(
    SEED_WORLD_LAKE_LAYOUT_PROFILE.minimumTargetAreaSquareMetres,
    SEED_WORLD_LAKE_LAYOUT_PROFILE.maximumTargetAreaSquareMetres,
    hash01(17, 31, hydrologySeed ^ 0xa511_e9b3)
  )
): number {
  const cellSizeMetres = sizeMetres / (resolution - 1);
  const targetAreaSquareMetres = Math.min(preferredTargetAreaSquareMetres, maximumTargetAreaSquareMetres);
  return Math.max(
    Math.ceil(SEED_WORLD_MINIMUM_TERRAIN_CONSTRAINED_LAKE_AREA_SQUARE_METRES / (cellSizeMetres * cellSizeMetres)),
    Math.ceil(targetAreaSquareMetres / (cellSizeMetres * cellSizeMetres))
  );
}

/**
 * Selects one terrain-driven Lake from a prepared H0 field.
 * @param plan Existing Seed World plan that owns coast, mountain, and hydrology Seed intent.
 * @param naturalHeightMetres Existing river-free H0 raster at the mobile analysis resolution.
 * @returns One terrain-sized Lake near the Seed-owned target.
 * @throws {RangeError} When the supplied H0 raster does not match the analysis resolution.
 * @throws {Error} When the centre cannot support the required water surface within the cut budget.
 */
export function compileSeedWorldHydrologyBodyFromPreparedTerrain(
  plan: SeedWorldPlan,
  naturalHeightMetres: Float32Array
): SeedWorldHydrologyBodyResult {
  const result = prepareSeedWorldHydrologyCandidateCompiler(plan, naturalHeightMetres).compileCandidate(
    plan.stageSeeds.hydrology
  );
  if (!result.accepted) {
    throw new SeedWorldLakeCandidateRejectionError(result.reason, result.message);
  }
  return result.body;
}

/**
 * Prepares immutable terrain analysis reused by the bounded natural Lake candidate search.
 * @param plan Existing Seed World plan that owns terrain intent.
 * @param naturalHeightMetres River-free H0 at the analysis resolution.
 * @returns Candidate compiler that varies only the named Hydrology seed.
 */
export function prepareSeedWorldHydrologyCandidateCompiler(
  plan: SeedWorldPlan,
  naturalHeightMetres: Float32Array
): SeedWorldPreparedHydrologyCandidateCompiler {
  const resolution = SEED_WORLD_BASIN_ANALYSIS_RESOLUTION;
  if (naturalHeightMetres.length !== resolution * resolution) {
    throw new RangeError(`Prepared H0 must contain ${resolution * resolution} samples`);
  }
  const coastDistanceMetres = new Float32Array(naturalHeightMetres.length);
  const foothillDistanceMetres = new Float32Array(naturalHeightMetres.length);
  sampleTerrainIntent(plan, resolution, coastDistanceMetres, foothillDistanceMetres);
  const suitabilityPreview = compileSeedWorldWaterSuitabilityPreview(plan);
  const priorityFloodResult = priorityFlood(naturalHeightMetres, resolution);
  const drainageTopology = prepareDrainageTopology(
    priorityFloodResult.filledHeightMetres,
    coastDistanceMetres,
    resolution,
    priorityFloodResult.flatReceiver
  );
  const prepared = Object.freeze<PreparedHydrologyTerrain>({
    plan,
    naturalHeightMetres,
    filledHeightMetres: priorityFloodResult.filledHeightMetres,
    drainageTopology,
    coastDistanceMetres,
    foothillDistanceMetres,
    suitabilityPreview
  });
  return Object.freeze({
    compileCandidate: (hydrologySeed: number, occupiedMask?: Uint8Array, target?: SeedWorldHydrologyCandidateTarget) =>
      compilePreparedHydrologyCandidate(prepared, hydrologySeed, occupiedMask, target)
  });
}

function compilePreparedHydrologyCandidate(
  prepared: Readonly<PreparedHydrologyTerrain>,
  hydrologySeed: number,
  occupiedMask?: Uint8Array,
  target?: SeedWorldHydrologyCandidateTarget
): SeedWorldHydrologyBodyCompileResult {
  const {
    plan,
    naturalHeightMetres,
    filledHeightMetres,
    drainageTopology,
    coastDistanceMetres,
    foothillDistanceMetres,
    suitabilityPreview
  } = prepared;
  const resolution = SEED_WORLD_BASIN_ANALYSIS_RESOLUTION;
  if (occupiedMask && occupiedMask.length !== naturalHeightMetres.length) {
    throw new RangeError(`Occupied Lake support must contain ${naturalHeightMetres.length} Analysis samples`);
  }
  if (
    target &&
    (!Number.isFinite(target.normalizedX) ||
      target.normalizedX < 0 ||
      target.normalizedX > 1 ||
      !Number.isFinite(target.normalizedY) ||
      target.normalizedY < 0 ||
      target.normalizedY > 1 ||
      !Number.isFinite(target.targetAreaSquareMetres) ||
      target.targetAreaSquareMetres <= 0)
  ) {
    throw new RangeError("Hydrology candidate target must define a normalized location");
  }
  const catchmentDrainage = compileDrainage(drainageTopology, resolution, hydrologySeed);
  const selection = selectBasin(
    naturalHeightMetres,
    coastDistanceMetres,
    foothillDistanceMetres,
    catchmentDrainage,
    resolution,
    plan.sizeMetres,
    hydrologySeed,
    suitabilityPreview,
    occupiedMask,
    target
  );
  if (!selection.accepted) {
    return Object.freeze({
      accepted: false,
      reason: selection.reason,
      message:
        selection.reason === "planned-topology-overlap"
          ? "Seeded terrain target has no Lake slot outside reserved Lake support"
          : selection.reason === "world-boundary-clearance"
            ? "Seeded terrain target has no Lake slot with world-boundary support"
            : "Seeded terrain target cannot support one connected Lake inside the soft-bank domain"
    });
  }
  const candidate = selection.candidate;
  const catchmentCells = collectUpstreamCatchment(
    candidate.basinMask,
    coastDistanceMetres,
    drainageTopology.reverseTree
  );
  const catchmentMask = maskFromCells(catchmentCells, naturalHeightMetres.length);
  const inletReaches = compileLakeInletReaches(
    candidate,
    naturalHeightMetres,
    coastDistanceMetres,
    catchmentMask,
    catchmentDrainage,
    drainageTopology,
    resolution,
    plan.sizeMetres
  );
  const maximumBasinCutDepthMetres = maximumDifference(naturalHeightMetres, candidate.carvedHeightMetres);
  const maximumWaterDepthMetres = maximumValue(candidate.waterDepthMetres);
  const cellSizeMetres = plan.sizeMetres / (resolution - 1);
  return Object.freeze({
    accepted: true,
    body: Object.freeze({
      rootSeed: plan.rootSeed,
      sizeMetres: plan.sizeMetres,
      resolution,
      naturalHeightMetres,
      carvedHeightMetres: candidate.carvedHeightMetres,
      waterDepthMetres: candidate.waterDepthMetres,
      filledHeightMetres,
      coastDistanceMetres,
      foothillDistanceMetres,
      basinMask: candidate.basinMask,
      catchmentMask,
      dominantReceiver: catchmentDrainage.dominantReceiver,
      catchmentReceiver: catchmentDrainage.dominantReceiver,
      inletReaches,
      basinContour: traceLargestMaskContour(candidate.basinMask, resolution),
      statistics: Object.freeze({
        waterLevelMetres: candidate.waterLevelMetres,
        spillElevationMetres: candidate.spillElevationMetres,
        branchCount: inletReaches.length,
        maximumCutDepthMetres: maximumBasinCutDepthMetres,
        basinCellCount: countMask(candidate.basinMask),
        catchmentCellCount: catchmentCells.length,
        foothillDistanceMetres: candidate.foothillDistanceMetres,
        basinAreaSquareMetres: countMask(candidate.basinMask) * cellSizeMetres * cellSizeMetres,
        maximumWaterDepthMetres
      })
    })
  });
}

function sampleTerrainIntent(
  plan: SeedWorldPlan,
  resolution: number,
  coastDistanceMetres: Float32Array,
  foothillDistanceMetres: Float32Array
): void {
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const point = { x: x / (resolution - 1), y: y / (resolution - 1) };
      const index = y * resolution + x;
      coastDistanceMetres[index] = sampleSeedWorldCoastSignedFieldMetres(plan.coastShape, point);
      foothillDistanceMetres[index] = sampleSeedWorldMountainFoothillSignedDistanceMetres(plan, point);
    }
  }
}

function priorityFlood(height: Float32Array, resolution: number): PriorityFloodResult {
  const filled = new Float32Array(height.length);
  const flatReceiver = new Int32Array(height.length);
  flatReceiver.fill(-1);
  const visited = new Uint8Array(height.length);
  const heap = new MinimumHeap();
  const seedBoundary = (index: number): void => {
    if (visited[index]) return;
    visited[index] = 1;
    filled[index] = height[index]!;
    heap.push({ index, elevation: filled[index]! });
  };
  for (let coordinate = 0; coordinate < resolution; coordinate++) {
    seedBoundary(coordinate);
    seedBoundary((resolution - 1) * resolution + coordinate);
    seedBoundary(coordinate * resolution);
    seedBoundary(coordinate * resolution + resolution - 1);
  }
  while (heap.size > 0) {
    const current = heap.pop()!;
    const x = current.index % resolution;
    const y = Math.floor(current.index / resolution);
    for (const direction of GRID_DIRECTIONS) {
      const nextX = x + direction.x;
      const nextY = y + direction.y;
      if (nextX < 0 || nextY < 0 || nextX >= resolution || nextY >= resolution) continue;
      const next = nextY * resolution + nextX;
      if (visited[next]) continue;
      visited[next] = 1;
      filled[next] = Math.max(height[next]!, current.elevation);
      flatReceiver[next] = current.index;
      heap.push({ index: next, elevation: filled[next]! });
    }
  }
  return { filledHeightMetres: filled, flatReceiver };
}

function prepareDrainageTopology(
  height: Float32Array,
  coastDistanceMetres: Float32Array,
  resolution: number,
  flatReceiver: Int32Array
): PreparedDrainageTopology {
  const receivers = Array.from({ length: height.length }, (_, index) =>
    calculateDInfinityReceiver(index, height, resolution)
  );
  const dominantReceiver = new Int32Array(height.length);
  dominantReceiver.fill(-1);
  for (let index = 0; index < receivers.length; index++) {
    let receiver = receivers[index]!;
    if (receiver.first < 0 && flatReceiver[index]! >= 0) {
      receiver = { first: flatReceiver[index]!, second: -1, firstWeight: 1 };
      receivers[index] = receiver;
    }
    dominantReceiver[index] = receiver.second < 0 || receiver.firstWeight >= 0.5 ? receiver.first : receiver.second;
  }
  const descendingCells = Array.from({ length: height.length }, (_, index) => index).sort(
    (left, right) => height[right]! - height[left]! || left - right
  );
  const landRainfallWeights = new Float32Array(height.length);
  for (let index = 0; index < landRainfallWeights.length; index++) {
    landRainfallWeights[index] = smoothstep(-24, 96, coastDistanceMetres[index]!);
  }
  return Object.freeze({
    receivers: Object.freeze(receivers),
    dominantReceiver,
    descendingCells: Object.freeze(descendingCells),
    landRainfallWeights,
    reverseTree: compileReverseDrainageTree(dominantReceiver)
  });
}

function compileDrainage(
  topology: Readonly<PreparedDrainageTopology>,
  resolution: number,
  rainfallSeed: number
): DrainageField {
  const accumulation = new Float64Array(topology.receivers.length);
  for (let index = 0; index < accumulation.length; index++) {
    accumulation[index] = topology.landRainfallWeights[index]! * seededRainfall(index, resolution, rainfallSeed);
  }
  for (const index of topology.descendingCells) {
    const receiver = topology.receivers[index]!;
    if (receiver.first >= 0) accumulation[receiver.first] += accumulation[index]! * receiver.firstWeight;
    if (receiver.second >= 0) accumulation[receiver.second] += accumulation[index]! * (1 - receiver.firstWeight);
  }
  return { dominantReceiver: topology.dominantReceiver, accumulation };
}

function calculateDInfinityReceiver(index: number, height: Float32Array, resolution: number): FlowReceiver {
  const x = index % resolution;
  const y = Math.floor(index / resolution);
  const centreHeight = height[index]!;
  let bestSlope = 0;
  let bestFirst = -1;
  let bestSecond = -1;
  let bestFirstWeight = 1;
  for (let directionIndex = 0; directionIndex < GRID_DIRECTIONS.length; directionIndex++) {
    const firstDirection = GRID_DIRECTIONS[directionIndex]!;
    const secondDirection = GRID_DIRECTIONS[(directionIndex + 1) % GRID_DIRECTIONS.length]!;
    const firstX = x + firstDirection.x;
    const firstY = y + firstDirection.y;
    const secondX = x + secondDirection.x;
    const secondY = y + secondDirection.y;
    if (
      firstX < 0 ||
      firstY < 0 ||
      firstX >= resolution ||
      firstY >= resolution ||
      secondX < 0 ||
      secondY < 0 ||
      secondX >= resolution ||
      secondY >= resolution
    ) {
      continue;
    }
    const first = firstY * resolution + firstX;
    const second = secondY * resolution + secondX;
    const firstDelta = height[first]! - centreHeight;
    const secondDelta = height[second]! - centreHeight;
    const determinant = firstDirection.x * secondDirection.y - secondDirection.x * firstDirection.y;
    const gradientX = (firstDelta * secondDirection.y - secondDelta * firstDirection.y) / determinant;
    const gradientY = (firstDirection.x * secondDelta - secondDirection.x * firstDelta) / determinant;
    const descentAngle = normalizeAngle(Math.atan2(-gradientY, -gradientX));
    const angularOffset = normalizeAngle(descentAngle - firstDirection.angle);
    if (
      angularOffset <= Math.PI * 0.25 + Number.EPSILON &&
      firstDelta < -DIRECTION_EPSILON_METRES &&
      secondDelta < -DIRECTION_EPSILON_METRES
    ) {
      const slope = Math.hypot(gradientX, gradientY);
      if (slope > bestSlope) {
        bestSlope = slope;
        bestFirst = first;
        bestSecond = second;
        bestFirstWeight = clamp01(1 - angularOffset / (Math.PI * 0.25));
      }
    }
  }
  for (const direction of GRID_DIRECTIONS) {
    const nextX = x + direction.x;
    const nextY = y + direction.y;
    if (nextX < 0 || nextY < 0 || nextX >= resolution || nextY >= resolution) continue;
    const next = nextY * resolution + nextX;
    const run = Math.hypot(direction.x, direction.y);
    const slope = (centreHeight - height[next]!) / run;
    if (slope > bestSlope + DIRECTION_EPSILON_METRES) {
      bestSlope = slope;
      bestFirst = next;
      bestSecond = -1;
      bestFirstWeight = 1;
    }
  }
  return { first: bestFirst, second: bestSecond, firstWeight: bestFirstWeight };
}

function compileReverseDrainageTree(dominantReceiver: Int32Array): ReverseDrainageTree {
  const firstChild = new Int32Array(dominantReceiver.length);
  const nextSibling = new Int32Array(dominantReceiver.length);
  firstChild.fill(-1);
  nextSibling.fill(-1);
  for (let cell = 0; cell < dominantReceiver.length; cell++) {
    const receiver = dominantReceiver[cell]!;
    if (receiver < 0) continue;
    nextSibling[cell] = firstChild[receiver]!;
    firstChild[receiver] = cell;
  }
  return { firstChild, nextSibling };
}

function collectUpstreamCatchment(
  basinMask: Uint8Array,
  coastDistance: Float32Array,
  tree: ReverseDrainageTree
): readonly number[] {
  const visited = new Uint8Array(basinMask.length);
  const stack: number[] = [];
  for (let cell = 0; cell < basinMask.length; cell++) {
    if (!basinMask[cell]) continue;
    visited[cell] = 1;
    stack.push(cell);
  }
  const catchment: number[] = [];
  while (stack.length > 0) {
    const cell = stack.pop()!;
    catchment.push(cell);
    for (let child = tree.firstChild[cell]!; child >= 0; child = tree.nextSibling[child]!) {
      if (visited[child] || coastDistance[child]! <= 0) continue;
      visited[child] = 1;
      stack.push(child);
    }
  }
  return Object.freeze(catchment);
}

function compileLakeInletReaches(
  candidate: BasinCandidate,
  naturalHeightMetres: Float32Array,
  coastDistanceMetres: Float32Array,
  catchmentMask: Uint8Array,
  drainage: DrainageField,
  topology: PreparedDrainageTopology,
  resolution: number,
  sizeMetres: number
): readonly SeedWorldRiverReach[] {
  const accepted = new Uint8Array(candidate.basinMask);
  const boundaryClearance = SEED_WORLD_LAKE_ANALYSIS_BOUNDARY_CLEARANCE_CELLS;
  for (let orderIndex = topology.descendingCells.length - 1; orderIndex >= 0; orderIndex--) {
    const cell = topology.descendingCells[orderIndex]!;
    if (!catchmentMask[cell] || candidate.basinMask[cell]) continue;
    const receiver = drainage.dominantReceiver[cell]!;
    if (receiver < 0 || !accepted[receiver]) continue;
    const x = cell % resolution;
    const z = Math.floor(cell / resolution);
    if (
      x < boundaryClearance ||
      z < boundaryClearance ||
      x >= resolution - boundaryClearance ||
      z >= resolution - boundaryClearance ||
      coastDistanceMetres[cell]! <= 96
    ) {
      continue;
    }
    const styledBedElevationMetres = candidate.waterLevelMetres - INTEGRATED_RIVER_STYLED_DEPTH_METRES;
    if (naturalHeightMetres[cell]! - styledBedElevationMetres <= SEED_WORLD_BASIN_MAXIMUM_CUT_METRES) {
      accepted[cell] = 1;
    }
  }

  const upstreamCount = new Uint8Array(accepted.length);
  for (let cell = 0; cell < accepted.length; cell++) {
    if (!accepted[cell]) continue;
    const receiver = drainage.dominantReceiver[cell]!;
    if (receiver >= 0 && accepted[receiver]) upstreamCount[receiver]++;
  }
  const paths: number[][] = [];
  for (let leaf = 0; leaf < accepted.length; leaf++) {
    if (!accepted[leaf] || candidate.basinMask[leaf] || upstreamCount[leaf] !== 0) continue;
    const path: number[] = [];
    let current = leaf;
    while (current >= 0 && accepted[current]) {
      path.push(current);
      if (candidate.basinMask[current]) break;
      current = drainage.dominantReceiver[current]!;
    }
    if (!candidate.basinMask[path.at(-1)!]) continue;
    const trimmed = trimDrainagePathToLength(path, resolution, sizeMetres, MAXIMUM_INLET_LENGTH_METRES);
    const lengthMetres = pathLengthMetres(trimmed, resolution, sizeMetres);
    if (lengthMetres >= MINIMUM_INLET_LENGTH_METRES) paths.push(trimmed);
  }
  paths.sort(
    (left, right) =>
      pathLengthMetres(right, resolution, sizeMetres) - pathLengthMetres(left, resolution, sizeMetres) ||
      drainage.accumulation[right[0]!]! - drainage.accumulation[left[0]!]! ||
      left[0]! - right[0]!
  );
  const trunk = paths[0];
  if (!trunk) return Object.freeze([]);

  const selected: Array<Readonly<{ kind: "trunk" | "tributary"; cells: readonly number[] }>> = [
    Object.freeze({ kind: "trunk", cells: Object.freeze(trunk) })
  ];
  const network = new Set<number>(trunk);
  for (let cell = 0; cell < candidate.basinMask.length; cell++) {
    if (candidate.basinMask[cell]) network.add(cell);
  }
  while (selected.length < MAXIMUM_VISIBLE_INLET_REACHES) {
    let best: readonly number[] | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const path of paths.slice(1)) {
      const joinIndex = path.findIndex((cell) => network.has(cell));
      if (joinIndex < 1) continue;
      const cells = path.slice(0, joinIndex + 1);
      const lengthMetres = pathLengthMetres(cells, resolution, sizeMetres);
      if (lengthMetres < MINIMUM_TRIBUTARY_LENGTH_METRES) continue;
      const head = cells[0]!;
      const headX = head % resolution;
      const headZ = Math.floor(head / resolution);
      if (
        selected.some(({ cells: selectedCells }) => {
          const selectedHead = selectedCells[0]!;
          return Math.hypot(headX - (selectedHead % resolution), headZ - Math.floor(selectedHead / resolution)) < 4;
        })
      ) {
        continue;
      }
      const score = lengthMetres + Math.log2(1 + drainage.accumulation[head]!) * 12;
      if (score > bestScore) {
        bestScore = score;
        best = cells;
      }
    }
    if (!best) break;
    selected.push(Object.freeze({ kind: "tributary" as const, cells: Object.freeze([...best]) }));
    for (const cell of best) network.add(cell);
  }

  let basinAccumulation = 1;
  for (let cell = 0; cell < candidate.basinMask.length; cell++) {
    if (candidate.basinMask[cell]) basinAccumulation = Math.max(basinAccumulation, drainage.accumulation[cell]!);
  }
  return Object.freeze(
    selected.map(({ kind, cells }, reachIndex) => {
      const points = cells.map((cell, pointIndex) => {
        const progress = cells.length > 1 ? pointIndex / (cells.length - 1) : 1;
        const flow = clamp01(drainage.accumulation[cell]! / basinAccumulation);
        const widthProgress = Math.max(progress * 0.8, Math.sqrt(flow));
        const widthMetres =
          kind === "trunk"
            ? lerp(INTEGRATED_RIVER_FULL_WIDTH_METRES * 0.58, INTEGRATED_RIVER_FULL_WIDTH_METRES, widthProgress)
            : lerp(INTEGRATED_RIVER_FULL_WIDTH_METRES * 0.42, INTEGRATED_RIVER_FULL_WIDTH_METRES * 0.75, widthProgress);
        const depthMetres =
          (INTEGRATED_RIVER_STYLED_DEPTH_METRES / DEFAULT_HYDROLOGY_DEPTH_SCALE) * lerp(0.82, 1, progress);
        return Object.freeze({
          x: (cell % resolution) / (resolution - 1),
          y: Math.floor(cell / resolution) / (resolution - 1),
          elevation: naturalHeightMetres[cell]!,
          discharge: drainage.accumulation[cell]!,
          widthMetres,
          depthMetres,
          bankFeatherMetres: INTEGRATED_RIVER_BANK_FEATHER_METRES,
          bedElevationMetres: candidate.waterLevelMetres - depthMetres,
          junction: kind === "tributary" && pointIndex === cells.length - 1 ? true : undefined
        });
      });
      return Object.freeze({
        id: kind === "trunk" ? "lake-inlet-trunk" : `lake-inlet-tributary-${reachIndex}`,
        kind,
        points: Object.freeze(points)
      });
    })
  );
}

function trimDrainagePathToLength(
  path: readonly number[],
  resolution: number,
  sizeMetres: number,
  maximumLengthMetres: number
): number[] {
  let startIndex = path.length - 1;
  let lengthMetres = 0;
  const cellSizeMetres = sizeMetres / (resolution - 1);
  for (let index = path.length - 2; index >= 0; index--) {
    const cell = path[index]!;
    const downstream = path[index + 1]!;
    const segmentLengthMetres =
      Math.hypot(
        (cell % resolution) - (downstream % resolution),
        Math.floor(cell / resolution) - Math.floor(downstream / resolution)
      ) * cellSizeMetres;
    if (lengthMetres + segmentLengthMetres > maximumLengthMetres) break;
    lengthMetres += segmentLengthMetres;
    startIndex = index;
  }
  return path.slice(startIndex);
}

function pathLengthMetres(path: readonly number[], resolution: number, sizeMetres: number): number {
  const cellSizeMetres = sizeMetres / (resolution - 1);
  let lengthMetres = 0;
  for (let index = 1; index < path.length; index++) {
    const previous = path[index - 1]!;
    const current = path[index]!;
    lengthMetres +=
      Math.hypot(
        (previous % resolution) - (current % resolution),
        Math.floor(previous / resolution) - Math.floor(current / resolution)
      ) * cellSizeMetres;
  }
  return lengthMetres;
}

function selectBasin(
  height: Float32Array,
  coastDistance: Float32Array,
  foothillDistance: Float32Array,
  drainage: DrainageField,
  resolution: number,
  sizeMetres: number,
  hydrologySeed: number,
  suitabilityPreview: SeedWorldWaterSuitabilityPreview,
  occupiedMask?: Uint8Array,
  target?: SeedWorldHydrologyCandidateTarget
): BasinSelectionResult {
  const anchors = selectDrainageAnchorsNearSeededTarget(
    height,
    coastDistance,
    foothillDistance,
    drainage,
    resolution,
    hydrologySeed,
    suitabilityPreview,
    target
  );
  let boundaryRejected = false;
  let overlapRejected = false;
  for (const anchor of anchors) {
    const candidate = compileBasinAtAnchor(
      anchor,
      height,
      coastDistance,
      foothillDistance,
      resolution,
      sizeMetres,
      hydrologySeed,
      suitabilityPreview,
      target?.targetAreaSquareMetres
    );
    if (!candidate) continue;
    if (!hasMaskBoundaryClearance(candidate.basinMask, resolution, SEED_WORLD_LAKE_ANALYSIS_BOUNDARY_CLEARANCE_CELLS)) {
      boundaryRejected = true;
      continue;
    }
    if (
      occupiedMask &&
      expandedMaskOverlaps(
        candidate.basinMask,
        occupiedMask,
        resolution,
        SEED_WORLD_LAKE_ANALYSIS_SUPPORT_CLEARANCE_CELLS
      )
    ) {
      overlapRejected = true;
      continue;
    }
    return Object.freeze({ accepted: true, candidate });
  }
  return Object.freeze({
    accepted: false,
    reason: overlapRejected
      ? "planned-topology-overlap"
      : boundaryRejected
        ? "world-boundary-clearance"
        : "invalid-or-disconnected-footprint"
  });
}

function compileBasinAtAnchor(
  anchor: number,
  height: Float32Array,
  coastDistance: Float32Array,
  foothillDistance: Float32Array,
  resolution: number,
  sizeMetres: number,
  hydrologySeed: number,
  suitabilityPreview: SeedWorldWaterSuitabilityPreview,
  preferredTargetAreaSquareMetres?: number
): BasinCandidate | undefined {
  if (!sampleSuitabilityMaskAtAnalysisCell(suitabilityPreview, anchor, resolution)) return undefined;
  const maximumTargetAreaSquareMetres = SEED_WORLD_LAKE_LAYOUT_PROFILE.maximumTargetAreaSquareMetres;
  const anchorX = anchor % resolution;
  const anchorY = Math.floor(anchor / resolution);
  const centralSurfaceIncisionMetres = 0.45 + hash01(anchorX, anchorY, hydrologySeed ^ 0xc2b2_ae35) * 0.65;
  const centralWaterLevelMetres = height[anchor]! - centralSurfaceIncisionMetres;
  const seedMask = maskFromCells([anchor], height.length);
  const growth = growTerrainDrivenBasin(
    seedMask,
    centralWaterLevelMetres,
    height,
    coastDistance,
    resolution,
    sizeMetres,
    hydrologySeed,
    suitabilityPreview,
    maximumTargetAreaSquareMetres,
    preferredTargetAreaSquareMetres
  );
  const targetCellCount = targetBasinCellCount(
    sizeMetres,
    resolution,
    hydrologySeed,
    maximumTargetAreaSquareMetres,
    preferredTargetAreaSquareMetres
  );
  if (countMask(growth.mask) < Math.ceil(targetCellCount * 0.85) || !growth.mask[anchor]) {
    return undefined;
  }
  return {
    waterLevelMetres: growth.waterLevelMetres,
    spillElevationMetres: growth.spillElevationMetres,
    foothillDistanceMetres: foothillDistance[anchor]!,
    basinMask: growth.mask,
    carvedHeightMetres: growth.carvedHeightMetres,
    waterDepthMetres: growth.waterDepthMetres
  };
}

function selectDrainageAnchorsNearSeededTarget(
  height: Float32Array,
  coastDistance: Float32Array,
  foothillDistance: Float32Array,
  drainage: DrainageField,
  resolution: number,
  hydrologySeed: number,
  suitabilityPreview: SeedWorldWaterSuitabilityPreview,
  target?: SeedWorldHydrologyCandidateTarget
): readonly number[] {
  const seededTargetX = lerp(resolution * 0.12, resolution * 0.88, hash01(17, 31, hydrologySeed ^ 0x9e37_79b9));
  const seededTargetY = lerp(resolution * 0.12, resolution * 0.88, hash01(43, 59, hydrologySeed ^ 0x85eb_ca6b));
  const targets = target
    ? [
        Object.freeze({
          x: target.normalizedX * (resolution - 1),
          y: target.normalizedY * (resolution - 1),
          distancePenaltyPerCell: 36
        }),
        Object.freeze({ x: seededTargetX, y: seededTargetY, distancePenaltyPerCell: 12 })
      ]
    : [Object.freeze({ x: seededTargetX, y: seededTargetY, distancePenaltyPerCell: 12 })];
  const selected: number[] = [];
  for (const target of targets) {
    for (const cell of selectDrainageAnchorsNearTarget(
      height,
      coastDistance,
      foothillDistance,
      drainage,
      resolution,
      hydrologySeed,
      suitabilityPreview,
      target.x,
      target.y,
      target.distancePenaltyPerCell
    )) {
      if (!selected.includes(cell)) selected.push(cell);
    }
  }
  return Object.freeze(selected);
}

function selectDrainageAnchorsNearTarget(
  height: Float32Array,
  coastDistance: Float32Array,
  foothillDistance: Float32Array,
  drainage: DrainageField,
  resolution: number,
  hydrologySeed: number,
  suitabilityPreview: SeedWorldWaterSuitabilityPreview,
  targetX: number,
  targetY: number,
  distancePenaltyPerCell: number
): readonly number[] {
  const candidates: DrainageAnchorCandidate[] = [];
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const cell = y * resolution + x;
      if (!sampleSuitabilityMaskAtAnalysisCell(suitabilityPreview, cell, resolution)) continue;
      if (coastDistance[cell]! <= 96 || height[cell]! <= 1) continue;
      const distance = Math.hypot(x - targetX, y - targetY);
      const foothillPenalty = Math.max(0, Math.abs(foothillDistance[cell]!) - 720) * 0.25;
      const suitability = sampleSuitabilityAtAnalysisCell(suitabilityPreview, cell, resolution);
      const seedJitter = hash01(x, y, hydrologySeed ^ 0x1656_67b1) * 60;
      const score =
        suitability +
        Math.log2(1 + drainage.accumulation[cell]!) * 20 -
        distance * distancePenaltyPerCell -
        foothillPenalty +
        seedJitter;
      candidates.push({ cell, score });
    }
  }
  heapifyDrainageAnchorCandidates(candidates);
  const selectedNearTarget: number[] = [];
  while (candidates.length > 0 && selectedNearTarget.length < 24) {
    const candidate = popBestDrainageAnchorCandidate(candidates)!;
    const candidateX = candidate.cell % resolution;
    const candidateY = Math.floor(candidate.cell / resolution);
    if (
      selectedNearTarget.some(
        (cell) => Math.hypot(candidateX - (cell % resolution), candidateY - Math.floor(cell / resolution)) < 4
      )
    ) {
      continue;
    }
    selectedNearTarget.push(candidate.cell);
  }
  return Object.freeze(selectedNearTarget);
}

function heapifyDrainageAnchorCandidates(candidates: DrainageAnchorCandidate[]): void {
  for (let index = Math.floor(candidates.length / 2) - 1; index >= 0; index--) {
    siftDownDrainageAnchorCandidate(candidates, index);
  }
}

function popBestDrainageAnchorCandidate(candidates: DrainageAnchorCandidate[]): DrainageAnchorCandidate | undefined {
  const best = candidates[0];
  const last = candidates.pop();
  if (candidates.length > 0 && last) {
    candidates[0] = last;
    siftDownDrainageAnchorCandidate(candidates, 0);
  }
  return best;
}

function siftDownDrainageAnchorCandidate(candidates: DrainageAnchorCandidate[], startIndex: number): void {
  let index = startIndex;
  while (true) {
    const left = index * 2 + 1;
    if (left >= candidates.length) return;
    const right = left + 1;
    let bestChild = left;
    if (right < candidates.length && drainageAnchorPrecedes(candidates[right]!, candidates[left]!)) {
      bestChild = right;
    }
    if (drainageAnchorPrecedes(candidates[index]!, candidates[bestChild]!)) return;
    const previous = candidates[index]!;
    candidates[index] = candidates[bestChild]!;
    candidates[bestChild] = previous;
    index = bestChild;
  }
}

function drainageAnchorPrecedes(left: DrainageAnchorCandidate, right: DrainageAnchorCandidate): boolean {
  return left.score > right.score || (left.score === right.score && left.cell < right.cell);
}

function growTerrainDrivenBasin(
  naturalMask: Uint8Array,
  waterLevelMetres: number,
  height: Float32Array,
  coastDistance: Float32Array,
  resolution: number,
  sizeMetres: number,
  hydrologySeed: number,
  suitabilityPreview: SeedWorldWaterSuitabilityPreview,
  maximumTargetAreaSquareMetres: number,
  preferredTargetAreaSquareMetres?: number
): BasinGrowthResult {
  const mask = new Uint8Array(naturalMask);
  const carvedHeightMetres = new Float32Array(height);
  const waterDepthMetres = new Float32Array(height.length);
  const queued = new Uint8Array(height.length);
  const frontier = new MinimumHeap();
  const basinSeed = naturalMask.findIndex((value) => value === 1);
  const targetCellCount = targetBasinCellCount(
    sizeMetres,
    resolution,
    hydrologySeed,
    maximumTargetAreaSquareMetres,
    preferredTargetAreaSquareMetres
  );
  const freeboardMetres = 0.35 + hash01(43, 71, hydrologySeed ^ 0x27d4_eb2f) * 0.45;
  let basinCellCount = 0;
  let maximumCutDepthMetres = 0;
  const applyBed = (cell: number, surfaceYMetres: number): number | undefined => {
    const x = cell % resolution;
    const y = Math.floor(cell / resolution);
    const targetDepthMetres = 0.35 + 3.5 * seededBasinDepth(x, y, resolution, hydrologySeed);
    const carvedHeight = Math.min(height[cell]!, surfaceYMetres - targetDepthMetres);
    const cutDepthMetres = height[cell]! - carvedHeight;
    if (cutDepthMetres > SEED_WORLD_BASIN_MAXIMUM_CUT_METRES) return undefined;
    carvedHeightMetres[cell] = carvedHeight;
    const waterDepth = Math.max(0, surfaceYMetres - carvedHeight);
    waterDepthMetres[cell] = waterDepth;
    maximumCutDepthMetres = Math.max(maximumCutDepthMetres, cutDepthMetres);
    return waterDepth;
  };
  const pushNeighbours = (cell: number): void => {
    const x = cell % resolution;
    const y = Math.floor(cell / resolution);
    for (const direction of GRID_DIRECTIONS) {
      if (direction.x !== 0 && direction.y !== 0) continue;
      const nextX = x + direction.x;
      const nextY = y + direction.y;
      if (nextX < 0 || nextY < 0 || nextX >= resolution || nextY >= resolution) continue;
      const next = nextY * resolution + nextX;
      if (mask[next] || queued[next] || coastDistance[next]! <= 0) continue;
      if (!sampleSuitabilityMaskAtAnalysisCell(suitabilityPreview, next, resolution)) continue;
      const shorelineCutDepthMetres = Math.max(0, height[next]! - waterLevelMetres);
      if (shorelineCutDepthMetres > MAXIMUM_SHORELINE_CUT_METRES) continue;
      const targetDepthMetres = 0.35 + 3.5 * seededBasinDepth(nextX, nextY, resolution, hydrologySeed);
      const cutDepthMetres = Math.max(0, height[next]! - (waterLevelMetres - targetDepthMetres));
      if (cutDepthMetres > SEED_WORLD_BASIN_MAXIMUM_CUT_METRES) continue;
      queued[next] = 1;
      frontier.push({ index: next, elevation: shorelineCutDepthMetres });
    }
  };
  for (let cell = 0; cell < mask.length; cell++) {
    if (!mask[cell]) continue;
    const waterDepth = applyBed(cell, waterLevelMetres);
    if (waterDepth === undefined) {
      mask[cell] = 0;
      continue;
    }
    basinCellCount++;
  }
  for (let cell = 0; cell < mask.length; cell++) if (mask[cell]) pushNeighbours(cell);
  while (frontier.size > 0 && basinCellCount < Math.min(MAXIMUM_BASIN_CELLS, targetCellCount)) {
    const entry = frontier.pop()!;
    const cell = entry.index;
    const waterDepth = applyBed(cell, waterLevelMetres);
    if (waterDepth === undefined) continue;
    mask[cell] = 1;
    basinCellCount++;
    pushNeighbours(cell);
  }
  let resolvedWaterLevelMetres = waterLevelMetres;
  let spillElevationMetres = minimumBoundaryElevation(mask, height, resolution);
  for (let iteration = 0; iteration < 6 && mask[basinSeed]; iteration++) {
    resolvedWaterLevelMetres = Math.min(resolvedWaterLevelMetres, spillElevationMetres - freeboardMetres);
    carvedHeightMetres.set(height);
    waterDepthMetres.fill(0);
    maximumCutDepthMetres = 0;
    for (let cell = 0; cell < mask.length; cell++) {
      if (!mask[cell]) continue;
      const x = cell % resolution;
      const y = Math.floor(cell / resolution);
      const targetDepthMetres = 0.35 + 3.5 * seededBasinDepth(x, y, resolution, hydrologySeed);
      const carvedHeight = Math.min(height[cell]!, resolvedWaterLevelMetres - targetDepthMetres);
      const cutDepthMetres = height[cell]! - carvedHeight;
      if (cutDepthMetres > SEED_WORLD_BASIN_MAXIMUM_CUT_METRES) {
        mask[cell] = 0;
        continue;
      }
      carvedHeightMetres[cell] = carvedHeight;
      waterDepthMetres[cell] = Math.max(0, resolvedWaterLevelMetres - carvedHeight);
      maximumCutDepthMetres = Math.max(maximumCutDepthMetres, cutDepthMetres);
    }
    retainConnectedMask(mask, basinSeed, resolution);
    spillElevationMetres = minimumBoundaryElevation(mask, height, resolution);
  }
  return {
    mask,
    carvedHeightMetres,
    waterDepthMetres,
    waterLevelMetres: resolvedWaterLevelMetres,
    spillElevationMetres,
    maximumCutDepthMetres
  };
}

function traceLargestMaskContour(mask: Uint8Array, resolution: number): readonly SeedWorldPoint[] {
  type Edge = readonly [number, number, number, number];
  const edges: Edge[] = [];
  const isSet = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < resolution && y < resolution && mask[y * resolution + x] === 1;
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      if (!isSet(x, y)) continue;
      const left = x * 2 - 1;
      const right = x * 2 + 1;
      const top = y * 2 - 1;
      const bottom = y * 2 + 1;
      if (!isSet(x, y - 1)) edges.push([left, top, right, top]);
      if (!isSet(x + 1, y)) edges.push([right, top, right, bottom]);
      if (!isSet(x, y + 1)) edges.push([right, bottom, left, bottom]);
      if (!isSet(x - 1, y)) edges.push([left, bottom, left, top]);
    }
  }
  const byStart = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = `${edge[0]},${edge[1]}`;
    const options = byStart.get(key);
    if (options) options.push(edge);
    else byStart.set(key, [edge]);
  }
  const loops: SeedWorldPoint[][] = [];
  while (byStart.size > 0) {
    const firstOptions = byStart.values().next().value as Edge[];
    let edge = firstOptions.pop()!;
    if (firstOptions.length === 0) byStart.delete(`${edge[0]},${edge[1]}`);
    const startX = edge[0];
    const startY = edge[1];
    const loop: SeedWorldPoint[] = [];
    for (let guard = 0; guard <= edges.length; guard++) {
      loop.push({
        x: clamp01((edge[0] + 1) / (2 * resolution)),
        y: clamp01((edge[1] + 1) / (2 * resolution))
      });
      if (edge[2] === startX && edge[3] === startY) break;
      const key = `${edge[2]},${edge[3]}`;
      const options = byStart.get(key);
      if (!options || options.length === 0) break;
      edge = options.pop()!;
      if (options.length === 0) byStart.delete(key);
    }
    if (loop.length >= 4) loops.push(loop);
  }
  loops.sort((left, right) => Math.abs(polygonArea(right)) - Math.abs(polygonArea(left)));
  const largest = loops[0] ?? [];
  return Object.freeze(simplifyClosedContour(largest, 0.0015).map((point) => Object.freeze(point)));
}

function simplifyClosedContour(points: readonly SeedWorldPoint[], tolerance: number): readonly SeedWorldPoint[] {
  if (points.length < 8) return [...points];
  const sampled = points.filter((_, index) => index % 2 === 0);
  return sampled.filter((point, index) => {
    const previous = sampled[(index - 1 + sampled.length) % sampled.length]!;
    const next = sampled[(index + 1) % sampled.length]!;
    return pointSegmentDistance(point, previous, next) > tolerance;
  });
}

function seededRainfall(index: number, resolution: number, seed: number): number {
  const x = index % resolution;
  const y = Math.floor(index / resolution);
  const coarseX = x / 24;
  const coarseY = y / 24;
  const x0 = Math.floor(coarseX);
  const y0 = Math.floor(coarseY);
  const tx = smoothstep(0, 1, coarseX - x0);
  const ty = smoothstep(0, 1, coarseY - y0);
  const top = lerp(hash01(x0, y0, seed), hash01(x0 + 1, y0, seed), tx);
  const bottom = lerp(hash01(x0, y0 + 1, seed), hash01(x0 + 1, y0 + 1, seed), tx);
  return 0.72 + lerp(top, bottom, ty) * 0.56;
}

function seededBasinDepth(x: number, y: number, resolution: number, seed: number): number {
  const scale = Math.max(5, resolution / 18);
  const coarseX = x / scale;
  const coarseY = y / scale;
  const x0 = Math.floor(coarseX);
  const y0 = Math.floor(coarseY);
  const tx = smoothstep(0, 1, coarseX - x0);
  const ty = smoothstep(0, 1, coarseY - y0);
  const top = lerp(hash01(x0, y0, seed ^ 0x9e37_79b9), hash01(x0 + 1, y0, seed ^ 0x9e37_79b9), tx);
  const bottom = lerp(hash01(x0, y0 + 1, seed ^ 0x9e37_79b9), hash01(x0 + 1, y0 + 1, seed ^ 0x9e37_79b9), tx);
  return smoothstep(0.08, 0.92, lerp(top, bottom, ty));
}

function hash01(x: number, y: number, seed: number): number {
  let value = (seed ^ Math.imul(x, 0x9e37_79b1) ^ Math.imul(y, 0x85eb_ca77)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

function pointSegmentDistance(
  point: Pick<SeedWorldPoint, "x" | "y">,
  start: Pick<SeedWorldPoint, "x" | "y">,
  end: Pick<SeedWorldPoint, "x" | "y">
): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = clamp01(((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared);
  return Math.hypot(point.x - (start.x + segmentX * ratio), point.y - (start.y + segmentY * ratio));
}

function polygonArea(points: readonly SeedWorldPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function countMask(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value;
  return count;
}

function expandedMaskOverlaps(
  candidateMask: Uint8Array,
  occupiedMask: Uint8Array,
  resolution: number,
  radius: number
): boolean {
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      if (!candidateMask[y * resolution + x]) continue;
      const minimumY = Math.max(0, y - radius);
      const maximumY = Math.min(resolution - 1, y + radius);
      const minimumX = Math.max(0, x - radius);
      const maximumX = Math.min(resolution - 1, x + radius);
      for (let sampleY = minimumY; sampleY <= maximumY; sampleY++) {
        for (let sampleX = minimumX; sampleX <= maximumX; sampleX++) {
          if (occupiedMask[sampleY * resolution + sampleX]) return true;
        }
      }
    }
  }
  return false;
}

function hasMaskBoundaryClearance(mask: Uint8Array, resolution: number, clearanceCells: number): boolean {
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      if (!mask[y * resolution + x]) continue;
      if (
        x < clearanceCells ||
        y < clearanceCells ||
        x >= resolution - clearanceCells ||
        y >= resolution - clearanceCells
      ) {
        return false;
      }
    }
  }
  return true;
}

function minimumBoundaryElevation(mask: Uint8Array, height: Float32Array, resolution: number): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let cell = 0; cell < mask.length; cell++) {
    if (!mask[cell]) continue;
    const x = cell % resolution;
    const y = Math.floor(cell / resolution);
    for (const direction of GRID_DIRECTIONS) {
      if (direction.x !== 0 && direction.y !== 0) continue;
      const nextX = x + direction.x;
      const nextY = y + direction.y;
      if (nextX < 0 || nextY < 0 || nextX >= resolution || nextY >= resolution) continue;
      const next = nextY * resolution + nextX;
      if (!mask[next]) minimum = Math.min(minimum, height[next]!);
    }
  }
  return minimum;
}

function retainConnectedMask(mask: Uint8Array, seed: number, resolution: number): void {
  if (!mask[seed]) {
    mask.fill(0);
    return;
  }
  const connected = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  queue[tail++] = seed;
  connected[seed] = 1;
  while (head < tail) {
    const cell = queue[head++]!;
    const x = cell % resolution;
    const y = Math.floor(cell / resolution);
    for (const direction of GRID_DIRECTIONS) {
      if (direction.x !== 0 && direction.y !== 0) continue;
      const nextX = x + direction.x;
      const nextY = y + direction.y;
      if (nextX < 0 || nextY < 0 || nextX >= resolution || nextY >= resolution) continue;
      const next = nextY * resolution + nextX;
      if (!mask[next] || connected[next]) continue;
      connected[next] = 1;
      queue[tail++] = next;
    }
  }
  mask.set(connected);
}

function maximumValue(values: Float32Array): number {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, value);
  return maximum;
}

function maximumDifference(source: Float32Array, result: Float32Array): number {
  let maximum = 0;
  for (let index = 0; index < source.length; index++) maximum = Math.max(maximum, source[index]! - result[index]!);
  return maximum;
}

function maskFromCells(cells: readonly number[], length: number): Uint8Array {
  const mask = new Uint8Array(length);
  for (const cell of cells) mask[cell] = 1;
  return mask;
}

function normalizeAngle(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = clamp01((value - edge0) / (edge1 - edge0));
  return normalized * normalized * (3 - 2 * normalized);
}

function lerp(left: number, right: number, ratio: number): number {
  return left + (right - left) * ratio;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

class MinimumHeap {
  readonly #entries: HeapEntry[] = [];

  get size(): number {
    return this.#entries.length;
  }

  push(entry: HeapEntry): void {
    this.#entries.push(entry);
    let index = this.#entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.#entries[parent]!.elevation <= entry.elevation) break;
      this.#entries[index] = this.#entries[parent]!;
      index = parent;
    }
    this.#entries[index] = entry;
  }

  pop(): HeapEntry | undefined {
    const minimum = this.#entries[0];
    const tail = this.#entries.pop();
    if (!minimum || !tail || this.#entries.length === 0) return minimum;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.#entries.length) break;
      const right = left + 1;
      const child =
        right < this.#entries.length && this.#entries[right]!.elevation < this.#entries[left]!.elevation ? right : left;
      if (this.#entries[child]!.elevation >= tail.elevation) break;
      this.#entries[index] = this.#entries[child]!;
      index = child;
    }
    this.#entries[index] = tail;
    return minimum;
  }
}
