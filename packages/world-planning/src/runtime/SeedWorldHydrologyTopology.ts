import {
  prepareSeedWorldHydrologyCandidateCompiler,
  SEED_WORLD_BASIN_ANALYSIS_RESOLUTION,
  type SeedWorldHydrologyCandidateTarget,
  type SeedWorldHydrologyBodyResult
} from "./SeedWorldHydrologyTopologyCore.ts";
import {
  SEED_WORLD_MAXIMUM_LAKE_CANDIDATE_EVALUATIONS,
  SEED_WORLD_MAXIMUM_LAKE_COUNT,
  SEED_WORLD_LAKE_CANDIDATE_REJECTION_REASONS,
  createSeedWorldLakeCandidateRejectionCounts,
  freezeSeedWorldLakeSearchDiagnostics,
  type SeedWorldLakeCandidateEvaluationResult,
  type SeedWorldLakeSearchDiagnostics
} from "@galacean/engine-water/world/SeedWorldLakeCandidate";
import { deriveSeedWorldNamedSeed, type SeedWorldPlan, type SeedWorldPoint } from "../world/SeedWorldPlanner.ts";
import {
  compileSeedWorldRiverCurves,
  rasterizeSeedWorldRiverField,
  sampleSeedWorldRiverCurve,
  type SeedWorldRiverCurve,
  type SeedWorldRiverCurveSample
} from "./SeedWorldRiverCurves.ts";
import {
  compileSeedWorldHydrologyBasinContour,
  sampleSeedWorldHydrologyBasinSignedDistanceMetres
} from "./SeedWorldHydrologyGeometry.ts";
import {
  SEED_WORLD_LAKE_ANALYSIS_BOUNDARY_CLEARANCE_CELLS,
  SEED_WORLD_LAKE_ANALYSIS_SUPPORT_CLEARANCE_CELLS,
  SEED_WORLD_LAKE_LAYOUT_PROFILE,
  SEED_WORLD_MINIMUM_TERRAIN_CONSTRAINED_LAKE_AREA_SQUARE_METRES
} from "@galacean/engine-water/world/SeedWorldLakeLayoutProfile";
import {
  compileSeedWorldWaterSuitabilityPreview,
  type SeedWorldWaterSuitabilityPreview
} from "./SeedWorldWaterSuitabilityPreview.ts";

/** Schema revision for the immutable Seed World hydrology topology. */
export const SEED_WORLD_HYDROLOGY_PROTOCOL_VERSION = 1;
/** Versioned hydrology selection profile included in deterministic cache keys and hashes. */
export const SEED_WORLD_HYDROLOGY_PROFILE_VERSION = 9;
/**
 * Empty Analysis-grid rings required between a planned Lake footprint and the bounded world edge.
 * @remarks Four 24-metre rings cover nearest-vertex reconstruction plus the coarsest supported
 * Hfinal support expansion, so the published Lake support can retain a closed in-world boundary.
 */
export const SEED_WORLD_HYDROLOGY_LAKE_BOUNDARY_CLEARANCE_CELLS = SEED_WORLD_LAKE_ANALYSIS_BOUNDARY_CLEARANCE_CELLS;
/** Minimum Analysis-grid distance between independent planned Lake footprints. */
export const SEED_WORLD_HYDROLOGY_LAKE_INTER_BODY_CLEARANCE_CELLS =
  SEED_WORLD_LAKE_ANALYSIS_SUPPORT_CLEARANCE_CELLS * 2 + 1;
const CURVE_SAMPLE_SPACING_METRES = 2;

/** Stable analysis-grid contract used only for terrain-driven topology selection. */
export interface SeedWorldHydrologyGridSpec {
  /** Number of vertex samples along either square axis. */
  readonly resolution: number;
  /** World-space distance between adjacent samples. */
  readonly spacingMetres: number;
  /** World-space X/Z coordinate of sample `[0, 0]`. */
  readonly originMetres: readonly [number, number];
}

/** One terrain-derived water body and drainage geometry selected from H0. */
export interface SeedWorldHydrologyBodyGeometry {
  /** Stable ordinal identity within the hydrology namespace. */
  readonly id: string;
  /** Named hydrology seed used to select this body without changing other random categories. */
  readonly hydrologySeed: number;
  /** One world-space water elevation shared by the connected body and its branches. */
  readonly waterLevelMetres: number;
  /** Lowest unchanged H0 escape elevation around this body. */
  readonly spillElevationMetres: number;
  /** Simplified normalized contour retained for exact 2D visualization. */
  readonly basinContour: readonly SeedWorldPoint[];
  /** Canonical branch curves; their horizontal geometry and widths are style-independent. */
  readonly curves: readonly SeedWorldRiverCurve[];
  /** Curves sampled once at a stable world-space chord for every raster consumer. */
  readonly curveSamples: readonly (readonly SeedWorldRiverCurveSample[])[];
  /** Binary water ownership on the topology analysis grid. */
  readonly wetMask: Uint8Array;
  /** World-metre signed distance to the complete basin and branch footprint. */
  readonly signedDistanceMetres: Float32Array;
  /** Approximate connected water area on the analysis grid. */
  readonly areaSquareMetres: number;
  /** Hash of this body's contour, curves, widths, and water datum. */
  readonly geometryHash: number;
}

/** Immutable Hydrology topology accepted against one final-Terrain generation profile. */
export interface SeedWorldHydrologyTopology {
  /** Protocol version used to validate serialized or cached topology. */
  readonly protocolVersion: number;
  /** Profile version owning selection thresholds and named namespaces. */
  readonly profileVersion: number;
  /** Root Seed that owns this topology. */
  readonly rootSeed: number;
  /** Physical edge length of the square world. */
  readonly sizeMetres: number;
  /** Analysis-grid sample convention. */
  readonly analysisGrid: SeedWorldHydrologyGridSpec;
  /** Hash of the exact river-free H0 samples used for topology selection. */
  readonly sourceHeightHash: number;
  /** Disconnected stable bodies selected from the same H0 field. */
  readonly bodies: readonly SeedWorldHydrologyBodyGeometry[];
  /** Read-only evidence from the bounded natural Lake candidate search. */
  readonly lakeSearchDiagnostics: SeedWorldLakeSearchDiagnostics;
  /** Deterministic identity of accepted geometry plus bounded-search diagnostics. */
  readonly geometryHash: number;
}

export interface SeedWorldLakeCandidatePreflightContext {
  /** Zero-based position in the deterministic candidate stream. */
  readonly attemptIndex: number;
  /** Candidates already proven legal against final Terrain. */
  readonly acceptedBodies: readonly SeedWorldHydrologyBodyGeometry[];
  /** Current candidate with its final published ordinal identity. */
  readonly candidate: SeedWorldHydrologyBodyGeometry;
  /** Exact tentative set that downstream Fine-grid consumers must validate. */
  readonly tentativeBodies: readonly SeedWorldHydrologyBodyGeometry[];
  /** Complete immutable tentative Topology consumed by Bake and Planned Solve. */
  readonly tentativeTopology: SeedWorldHydrologyTopology;
}

export type SeedWorldLakeCandidatePreflight = (
  context: Readonly<SeedWorldLakeCandidatePreflightContext>
) => SeedWorldLakeCandidateEvaluationResult;

/** Inputs required to select hydrology without generating a second world plan. */
export interface SeedWorldHydrologyTopologyInput {
  /** Existing semantic plan whose geology and coast own H0. */
  readonly plan: SeedWorldPlan;
  /** River-free H0 at `SEED_WORLD_BASIN_ANALYSIS_RESOLUTION`. */
  readonly naturalHeightMetres: Float32Array;
  /**
   * Candidate-local selection hook. World-scale final-Terrain compilation is forbidden here;
   * `SeedWorldHydrologyCompiler` batches that work after the Analysis candidate set is complete.
   */
  readonly candidatePreflight: SeedWorldLakeCandidatePreflight;
}

/**
 * Selects disconnected static basins and descending branches from a prepared river-free H0 field.
 * @param input Existing plan, exact analysis H0, and candidate-local selection hook.
 * @returns Frozen topology containing candidates accepted by the supplied selection hook.
 * Natural Lakes are best-effort: the bounded search publishes every legal candidate found, including none.
 * @throws {RangeError} When the H0 lattice is invalid.
 * @throws {Error} When a structural contract error is raised by candidate generation or preflight.
 */
export function compileSeedWorldHydrologyTopology(input: SeedWorldHydrologyTopologyInput): SeedWorldHydrologyTopology {
  const { plan, naturalHeightMetres } = input;
  const resolution = SEED_WORLD_BASIN_ANALYSIS_RESOLUTION;
  if (naturalHeightMetres.length !== resolution * resolution) {
    throw new RangeError(`Seed World hydrology H0 must contain ${resolution * resolution} samples.`);
  }
  const sourceHeightHash = hashFloatField(naturalHeightMetres);
  const rejectionCounts = createSeedWorldLakeCandidateRejectionCounts();
  const occupied = new Uint8Array(naturalHeightMetres.length);
  const suitabilityPreview = compileSeedWorldWaterSuitabilityPreview(plan);
  const candidateSlots = compileLakeCandidateSlots(plan, suitabilityPreview);
  const selected: SeedWorldHydrologyBodyGeometry[] = [];
  const candidateCompiler = prepareSeedWorldHydrologyCandidateCompiler(plan, naturalHeightMetres);
  let attemptedCandidateCount = 0;
  for (let slotIndex = 0; slotIndex < candidateSlots.length; slotIndex++) {
    const slot = candidateSlots[slotIndex]!;
    const baseVariantCount = Math.floor(SEED_WORLD_MAXIMUM_LAKE_CANDIDATE_EVALUATIONS / candidateSlots.length);
    const extraVariantCount = SEED_WORLD_MAXIMUM_LAKE_CANDIDATE_EVALUATIONS % candidateSlots.length;
    const variantCount = baseVariantCount + (slotIndex < extraVariantCount ? 1 : 0);
    for (let variantIndex = 0; variantIndex < variantCount; variantIndex++) {
      const attemptIndex = attemptedCandidateCount++;
      const bodyOrdinal = selected.length;
      const id = `hydrology-basin-${bodyOrdinal + 1}`;
      const hydrologySeed = deriveSeedWorldNamedSeed(
        plan.stageSeeds.hydrology,
        `static-basin:${bodyOrdinal}:attempt:${attemptIndex}`
      );
      const relaxation = variantCount > 1 ? variantIndex / (variantCount - 1) : 0;
      const candidateTarget = Object.freeze({
        ...slot,
        targetAreaSquareMetres:
          slot.targetAreaSquareMetres +
          (SEED_WORLD_MINIMUM_TERRAIN_CONSTRAINED_LAKE_AREA_SQUARE_METRES - slot.targetAreaSquareMetres) * relaxation
      });
      const coreResult = candidateCompiler.compileCandidate(hydrologySeed, occupied, candidateTarget);
      if (!coreResult.accepted) {
        rejectionCounts[coreResult.reason]++;
        continue;
      }
      const core: SeedWorldHydrologyBodyResult = coreResult.body;
      const curves = compileSeedWorldRiverCurves({
        sizeMetres: plan.sizeMetres,
        rivers: Object.freeze(core.inletReaches.map((reach) => Object.freeze({ ...reach, id: `${id}-${reach.id}` })))
      });
      const curveSamples = Object.freeze(
        curves.map((curve) => sampleSeedWorldRiverCurve(curve, plan.sizeMetres, CURVE_SAMPLE_SPACING_METRES))
      );
      const basinContour = compileSeedWorldHydrologyBasinContour(core.basinContour);
      const basinSignedDistanceMetres = compileTopologyBasinSignedDistance(basinContour, resolution, plan.sizeMetres);
      const basinWetMask = compileTopologyWetMask(basinSignedDistanceMetres);
      const signedDistanceMetres = compileTopologySignedDistance(
        basinSignedDistanceMetres,
        curves,
        curveSamples,
        resolution,
        plan.sizeMetres
      );
      const wetMask = compileTopologyWetMask(signedDistanceMetres);
      if (countMask(wetMask) === 0) {
        rejectionCounts["invalid-or-disconnected-footprint"]++;
        continue;
      }
      if (
        !isMaskInsideSuitabilityDomain(
          basinWetMask,
          resolution,
          suitabilityPreview.availableMask,
          suitabilityPreview.resolution
        )
      ) {
        rejectionCounts["insufficient-internal-clearance"]++;
        continue;
      }
      const cellAreaSquareMetres = Math.pow(plan.sizeMetres / (resolution - 1), 2);
      const basinAreaSquareMetres = countMask(basinWetMask) * cellAreaSquareMetres;
      if (basinAreaSquareMetres < SEED_WORLD_MINIMUM_TERRAIN_CONSTRAINED_LAKE_AREA_SQUARE_METRES) {
        rejectionCounts["invalid-or-disconnected-footprint"]++;
        continue;
      }
      const areaSquareMetres = countMask(wetMask) * cellAreaSquareMetres;
      if (!hasLakeWorldBoundaryClearance(wetMask, resolution)) {
        rejectionCounts["world-boundary-clearance"]++;
        continue;
      }
      const supportOccupancy = expandMask(wetMask, resolution, SEED_WORLD_LAKE_ANALYSIS_SUPPORT_CLEARANCE_CELLS);
      if (masksOverlap(occupied, supportOccupancy)) {
        rejectionCounts["planned-topology-overlap"]++;
        continue;
      }
      const geometryHash = hashBodyGeometry(
        id,
        core.statistics.waterLevelMetres,
        core.statistics.spillElevationMetres,
        basinContour,
        curves
      );
      const candidate = Object.freeze({
        id,
        hydrologySeed,
        waterLevelMetres: core.statistics.waterLevelMetres,
        spillElevationMetres: core.statistics.spillElevationMetres,
        basinContour,
        curves,
        curveSamples,
        wetMask,
        signedDistanceMetres,
        areaSquareMetres,
        geometryHash
      });
      const tentativeBodies = Object.freeze([...selected, candidate]);
      const tentativeDiagnostics = freezeSeedWorldLakeSearchDiagnostics(
        tentativeBodies.length,
        attemptedCandidateCount,
        rejectionCounts
      );
      const tentativeTopology = createTopologyArtifact(plan, sourceHeightHash, tentativeBodies, tentativeDiagnostics);
      const preflightResult = input.candidatePreflight(
        Object.freeze({
          attemptIndex,
          acceptedBodies: Object.freeze([...selected]),
          candidate,
          tentativeBodies,
          tentativeTopology
        })
      );
      if (!preflightResult.accepted) {
        rejectionCounts[preflightResult.reason]++;
        continue;
      }
      selected.push(candidate);
      for (let index = 0; index < occupied.length; index++) {
        if (supportOccupancy[index]) occupied[index] = 1;
      }
      break;
    }
  }
  const bodies = Object.freeze(selected);
  const lakeSearchDiagnostics = freezeSeedWorldLakeSearchDiagnostics(
    bodies.length,
    attemptedCandidateCount,
    rejectionCounts
  );

  return createTopologyArtifact(plan, sourceHeightHash, bodies, lakeSearchDiagnostics);
}

/**
 * Removes candidates rejected by one shared final-grid batch preflight without rerunning physical discovery.
 * Accepted geometry is reindexed only when a removed body would otherwise leave public body IDs non-contiguous.
 */
export function refineSeedWorldHydrologyTopology(
  topology: SeedWorldHydrologyTopology,
  evaluations: readonly SeedWorldLakeCandidateEvaluationResult[]
): SeedWorldHydrologyTopology {
  if (evaluations.length !== topology.bodies.length) {
    throw new RangeError("Hydrology batch preflight must evaluate every selected Lake candidate exactly once.");
  }
  if (evaluations.every((evaluation) => evaluation.accepted)) return topology;

  const rejectionCounts = createSeedWorldLakeCandidateRejectionCounts();
  for (const reason of SEED_WORLD_LAKE_CANDIDATE_REJECTION_REASONS) {
    rejectionCounts[reason] = topology.lakeSearchDiagnostics.rejectionCounts[reason];
  }
  const accepted: SeedWorldHydrologyBodyGeometry[] = [];
  for (let bodyIndex = 0; bodyIndex < topology.bodies.length; bodyIndex++) {
    const evaluation = evaluations[bodyIndex]!;
    if (!evaluation.accepted) {
      rejectionCounts[evaluation.reason]++;
      continue;
    }
    accepted.push(reindexBodyGeometry(topology.bodies[bodyIndex]!, accepted.length));
  }
  const bodies = Object.freeze(accepted);
  const lakeSearchDiagnostics = freezeSeedWorldLakeSearchDiagnostics(
    bodies.length,
    topology.lakeSearchDiagnostics.attemptedCandidateCount,
    rejectionCounts
  );
  return createTopologyArtifact(topology, topology.sourceHeightHash, bodies, lakeSearchDiagnostics);
}

function createTopologyArtifact(
  plan: Pick<SeedWorldPlan, "rootSeed" | "sizeMetres">,
  sourceHeightHash: number,
  bodies: readonly SeedWorldHydrologyBodyGeometry[],
  lakeSearchDiagnostics: SeedWorldLakeSearchDiagnostics
): SeedWorldHydrologyTopology {
  let geometryHash = hashUint32(0x811c9dc5, SEED_WORLD_HYDROLOGY_PROTOCOL_VERSION);
  geometryHash = hashUint32(geometryHash, SEED_WORLD_HYDROLOGY_PROFILE_VERSION);
  geometryHash = hashUint32(geometryHash, plan.rootSeed);
  geometryHash = hashUint32(geometryHash, sourceHeightHash);
  for (const body of bodies) geometryHash = hashUint32(geometryHash, body.geometryHash);
  geometryHash = hashUint32(geometryHash, lakeSearchDiagnostics.attemptedCandidateCount);
  for (const reason of SEED_WORLD_LAKE_CANDIDATE_REJECTION_REASONS) {
    geometryHash = hashUint32(geometryHash, lakeSearchDiagnostics.rejectionCounts[reason]);
  }
  const resolution = SEED_WORLD_BASIN_ANALYSIS_RESOLUTION;
  const spacingMetres = plan.sizeMetres / (resolution - 1);
  return Object.freeze({
    protocolVersion: SEED_WORLD_HYDROLOGY_PROTOCOL_VERSION,
    profileVersion: SEED_WORLD_HYDROLOGY_PROFILE_VERSION,
    rootSeed: plan.rootSeed,
    sizeMetres: plan.sizeMetres,
    analysisGrid: Object.freeze({
      resolution,
      spacingMetres,
      originMetres: Object.freeze([-plan.sizeMetres * 0.5, -plan.sizeMetres * 0.5] as const)
    }),
    sourceHeightHash,
    bodies: Object.freeze([...bodies]),
    lakeSearchDiagnostics,
    geometryHash: geometryHash >>> 0
  });
}

function reindexBodyGeometry(
  body: SeedWorldHydrologyBodyGeometry,
  bodyOrdinal: number
): SeedWorldHydrologyBodyGeometry {
  const id = `hydrology-basin-${bodyOrdinal + 1}`;
  if (body.id === id) return body;
  const curves = Object.freeze(
    body.curves.map((curve) =>
      Object.freeze({
        ...curve,
        id: replaceBodyIdPrefix(curve.id, body.id, id),
        controls: Object.freeze(
          curve.controls.map((control) =>
            Object.freeze({ ...control, id: replaceBodyIdPrefix(control.id, body.id, id) })
          )
        )
      })
    )
  );
  return Object.freeze({
    ...body,
    id,
    curves,
    geometryHash: hashBodyGeometry(id, body.waterLevelMetres, body.spillElevationMetres, body.basinContour, curves)
  });
}

function replaceBodyIdPrefix(value: string, previousBodyId: string, nextBodyId: string): string {
  if (!value.startsWith(`${previousBodyId}-`)) {
    throw new Error(`Hydrology body member '${value}' does not retain body prefix '${previousBodyId}'.`);
  }
  return `${nextBodyId}${value.slice(previousBodyId.length)}`;
}

function compileLakeCandidateSlots(
  plan: SeedWorldPlan,
  preview: SeedWorldWaterSuitabilityPreview
): readonly SeedWorldHydrologyCandidateTarget[] {
  const resolution = preview.resolution;
  const cellSizeMetres = plan.sizeMetres / (resolution - 1);
  const analysisCellSizeMetres = plan.sizeMetres / (SEED_WORLD_BASIN_ANALYSIS_RESOLUTION - 1);
  const minimumLakeAreaSquareMetres = SEED_WORLD_MINIMUM_TERRAIN_CONSTRAINED_LAKE_AREA_SQUARE_METRES;
  const boundaryInset = (SEED_WORLD_LAKE_ANALYSIS_BOUNDARY_CLEARANCE_CELLS * analysisCellSizeMetres) / plan.sizeMetres;
  const usableMask = new Uint8Array(preview.availableMask.length);
  for (let y = 0; y < resolution; y++) {
    const normalizedY = y / (resolution - 1);
    if (normalizedY < boundaryInset || normalizedY > 1 - boundaryInset) continue;
    for (let x = 0; x < resolution; x++) {
      const normalizedX = x / (resolution - 1);
      if (normalizedX < boundaryInset || normalizedX > 1 - boundaryInset) continue;
      const index = y * resolution + x;
      if (preview.availableMask[index]) usableMask[index] = 1;
    }
  }

  const clearanceCells = compileLakeSlotClearanceCells(usableMask, resolution);

  const componentIds = new Int32Array(usableMask.length);
  componentIds.fill(-1);
  const componentSizes: number[] = [];
  const queue = new Int32Array(usableMask.length);
  for (let start = 0; start < usableMask.length; start++) {
    if (!usableMask[start] || componentIds[start] >= 0) continue;
    const componentId = componentSizes.length;
    let head = 0;
    let tail = 0;
    let componentSize = 0;
    componentIds[start] = componentId;
    queue[tail++] = start;
    while (head < tail) {
      const cell = queue[head++]!;
      componentSize++;
      const x = cell % resolution;
      const y = Math.floor(cell / resolution);
      for (const [offsetX, offsetY] of LAKE_SLOT_CARDINAL_NEIGHBORS) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextY < 0 || nextX >= resolution || nextY >= resolution) continue;
        const next = nextY * resolution + nextX;
        if (!usableMask[next] || componentIds[next] >= 0) continue;
        componentIds[next] = componentId;
        queue[tail++] = next;
      }
    }
    componentSizes.push(componentSize);
  }

  const minimumComponentCells = Math.ceil(minimumLakeAreaSquareMetres / (cellSizeMetres * cellSizeMetres));
  const interBodySupportMetres = SEED_WORLD_LAKE_ANALYSIS_SUPPORT_CLEARANCE_CELLS * analysisCellSizeMetres * 2;
  const slotLimit = selectLakeCandidateSlotLimit(plan.stageSeeds.hydrology);
  const slots: SeedWorldHydrologyCandidateTarget[] = [];
  for (let slotIndex = 0; slotIndex < slotLimit; slotIndex++) {
    let bestCell = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestTargetAreaSquareMetres = 0;
    for (let cell = 0; cell < usableMask.length; cell++) {
      if (!usableMask[cell] || componentSizes[componentIds[cell]!]! < minimumComponentCells) continue;
      const clearanceMetres = Math.max(0, clearanceCells[cell]! - 1) * cellSizeMetres;
      if (clearanceMetres < SEED_WORLD_LAKE_LAYOUT_PROFILE.bankSupportMetres) continue;
      const maximumTargetAreaSquareMetres = Math.min(
        SEED_WORLD_LAKE_LAYOUT_PROFILE.maximumTargetAreaSquareMetres,
        componentSizes[componentIds[cell]!]! * cellSizeMetres * cellSizeMetres
      );
      if (maximumTargetAreaSquareMetres < minimumLakeAreaSquareMetres) continue;
      const x = cell % resolution;
      const y = Math.floor(cell / resolution);
      const normalizedX = x / (resolution - 1);
      const normalizedY = y / (resolution - 1);
      const jitter =
        hashUint32(plan.stageSeeds.hydrology ^ Math.imul(cell + 1, 0x9e37_79b1), slotIndex ^ 0x85eb_ca77) /
        0x1_0000_0000;
      const preferredMinimumTargetAreaSquareMetres =
        slotIndex === 0
          ? SEED_WORLD_LAKE_LAYOUT_PROFILE.minimumCentralTargetAreaSquareMetres
          : SEED_WORLD_LAKE_LAYOUT_PROFILE.minimumTargetAreaSquareMetres;
      const preferredMaximumTargetAreaSquareMetres =
        slotIndex === 0
          ? SEED_WORLD_LAKE_LAYOUT_PROFILE.maximumCentralTargetAreaSquareMetres
          : SEED_WORLD_LAKE_LAYOUT_PROFILE.maximumTargetAreaSquareMetres;
      const preferredTargetAreaSquareMetres =
        preferredMinimumTargetAreaSquareMetres +
        (preferredMaximumTargetAreaSquareMetres - preferredMinimumTargetAreaSquareMetres) * jitter;
      const targetAreaSquareMetres = Math.max(
        minimumLakeAreaSquareMetres,
        Math.min(preferredTargetAreaSquareMetres, maximumTargetAreaSquareMetres)
      );
      const targetRadiusMetres = Math.sqrt(targetAreaSquareMetres / Math.PI);
      const normalizedDistanceFromWorldCenter = Math.hypot(normalizedX - 0.5, normalizedY - 0.5) / Math.SQRT1_2;
      const centrality = Math.max(0, 1 - normalizedDistanceFromWorldCenter);
      let minimumDistanceMetres = Number.POSITIVE_INFINITY;
      let overlapsExistingSlot = false;
      for (const slot of slots) {
        const distanceMetres =
          Math.hypot(normalizedX - slot.normalizedX, normalizedY - slot.normalizedY) * plan.sizeMetres;
        minimumDistanceMetres = Math.min(minimumDistanceMetres, distanceMetres);
        const existingRadiusMetres = Math.sqrt(slot.targetAreaSquareMetres / Math.PI);
        if (distanceMetres < targetRadiusMetres + existingRadiusMetres + interBodySupportMetres) {
          overlapsExistingSlot = true;
          break;
        }
      }
      if (overlapsExistingSlot) continue;
      const score =
        slots.length === 0
          ? Math.min(clearanceMetres, 240) * 2 + preview.suitability[cell]! * 2 + centrality * 6_000 + jitter * 64
          : minimumDistanceMetres + clearanceMetres + preview.suitability[cell]! * 1.5 + jitter * 32;
      if (score > bestScore || (score === bestScore && cell < bestCell)) {
        bestCell = cell;
        bestScore = score;
        bestTargetAreaSquareMetres = targetAreaSquareMetres;
      }
    }
    if (bestCell < 0) break;
    slots.push(
      Object.freeze({
        normalizedX: (bestCell % resolution) / (resolution - 1),
        normalizedY: Math.floor(bestCell / resolution) / (resolution - 1),
        targetAreaSquareMetres: bestTargetAreaSquareMetres
      })
    );
  }
  return Object.freeze(slots);
}

function selectLakeCandidateSlotLimit(hydrologySeed: number): number {
  // Taking the lower of two draws preserves every 1-5 outcome while favouring visual breathing room.
  const firstDraw = deriveSeedWorldNamedSeed(hydrologySeed, "static-basin-count:first") % SEED_WORLD_MAXIMUM_LAKE_COUNT;
  const secondDraw =
    deriveSeedWorldNamedSeed(hydrologySeed, "static-basin-count:second") % SEED_WORLD_MAXIMUM_LAKE_COUNT;
  return Math.min(firstDraw, secondDraw) + 1;
}

function compileLakeSlotClearanceCells(mask: Uint8Array, resolution: number): Uint16Array {
  const clearance = new Uint16Array(mask.length);
  clearance.fill(0xffff);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < mask.length; cell++) {
    if (mask[cell]) continue;
    clearance[cell] = 0;
    queue[tail++] = cell;
  }
  while (head < tail) {
    const cell = queue[head++]!;
    const x = cell % resolution;
    const y = Math.floor(cell / resolution);
    const nextClearance = clearance[cell]! + 1;
    for (const [offsetX, offsetY] of LAKE_SLOT_CLEARANCE_NEIGHBORS) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= resolution || nextY >= resolution) continue;
      const next = nextY * resolution + nextX;
      if (clearance[next]! <= nextClearance) continue;
      clearance[next] = nextClearance;
      queue[tail++] = next;
    }
  }
  return clearance;
}

function hasLakeWorldBoundaryClearance(mask: Uint8Array, resolution: number): boolean {
  const clearance = SEED_WORLD_HYDROLOGY_LAKE_BOUNDARY_CLEARANCE_CELLS;
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      if (mask[z * resolution + x] === 0) continue;
      if (x < clearance || z < clearance || x >= resolution - clearance || z >= resolution - clearance) {
        return false;
      }
    }
  }
  return true;
}

const LAKE_SLOT_CARDINAL_NEIGHBORS = Object.freeze([
  Object.freeze([1, 0] as const),
  Object.freeze([-1, 0] as const),
  Object.freeze([0, 1] as const),
  Object.freeze([0, -1] as const)
]);

// Chebyshev distance conservatively underestimates Euclidean clearance, so preselection never overstates support.
const LAKE_SLOT_CLEARANCE_NEIGHBORS = Object.freeze([
  ...LAKE_SLOT_CARDINAL_NEIGHBORS,
  Object.freeze([1, 1] as const),
  Object.freeze([1, -1] as const),
  Object.freeze([-1, 1] as const),
  Object.freeze([-1, -1] as const)
]);

function expandMask(mask: Uint8Array, resolution: number, radius: number): Uint8Array {
  const expanded = new Uint8Array(mask.length);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      if (!mask[y * resolution + x]) continue;
      for (let offsetY = -radius; offsetY <= radius; offsetY++) {
        const targetY = y + offsetY;
        if (targetY < 0 || targetY >= resolution) continue;
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
          const targetX = x + offsetX;
          if (targetX < 0 || targetX >= resolution) continue;
          expanded[targetY * resolution + targetX] = 1;
        }
      }
    }
  }
  return expanded;
}

function isMaskInsideSuitabilityDomain(
  mask: Uint8Array,
  resolution: number,
  availableMask: Uint8Array,
  availableResolution: number
): boolean {
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    const x = index % resolution;
    const y = Math.floor(index / resolution);
    const availableX = Math.round((x / (resolution - 1)) * (availableResolution - 1));
    const availableY = Math.round((y / (resolution - 1)) * (availableResolution - 1));
    if (!availableMask[availableY * availableResolution + availableX]) return false;
  }
  return true;
}

function compileTopologyBasinSignedDistance(
  basinContour: readonly SeedWorldPoint[],
  resolution: number,
  sizeMetres: number
): Float32Array {
  const signedDistanceMetres = new Float32Array(resolution * resolution);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      signedDistanceMetres[y * resolution + x] = sampleSeedWorldHydrologyBasinSignedDistanceMetres(
        basinContour,
        sizeMetres,
        x / (resolution - 1),
        y / (resolution - 1)
      );
    }
  }
  return signedDistanceMetres;
}

function compileTopologySignedDistance(
  basinSignedDistanceMetres: Float32Array,
  curves: readonly SeedWorldRiverCurve[],
  curveSamples: readonly (readonly SeedWorldRiverCurveSample[])[],
  resolution: number,
  sizeMetres: number
): Float32Array {
  if (curves.length === 0) return basinSignedDistanceMetres;
  const river = rasterizeSeedWorldRiverField(curves, {
    resolution,
    sizeMetres,
    sampleOffset: 0,
    curveSampleSpacingMetres: CURVE_SAMPLE_SPACING_METRES,
    curveSamples
  });
  const signedDistanceMetres = new Float32Array(basinSignedDistanceMetres);
  for (let index = 0; index < signedDistanceMetres.length; index++) {
    signedDistanceMetres[index] = Math.min(signedDistanceMetres[index]!, river.bankDistanceMetres[index]!);
  }
  return signedDistanceMetres;
}

function compileTopologyWetMask(signedDistanceMetres: Float32Array): Uint8Array {
  const wetMask = new Uint8Array(signedDistanceMetres.length);
  for (let index = 0; index < wetMask.length; index++) {
    if (signedDistanceMetres[index]! <= 0) wetMask[index] = 1;
  }
  return wetMask;
}

function hashBodyGeometry(
  id: string,
  waterLevelMetres: number,
  spillElevationMetres: number,
  contour: readonly SeedWorldPoint[],
  curves: readonly SeedWorldRiverCurve[]
): number {
  let hash = hashString(0x811c9dc5, id);
  hash = hashNumber(hash, waterLevelMetres);
  hash = hashNumber(hash, spillElevationMetres);
  for (const point of contour) {
    hash = hashNumber(hash, point.x);
    hash = hashNumber(hash, point.y);
  }
  for (const curve of curves) {
    hash = hashString(hash, curve.id);
    for (const control of curve.controls) {
      for (const value of [
        control.x,
        control.y,
        control.widthMetres,
        control.flow,
        control.depthMetres,
        control.bankFeatherMetres,
        control.in[0],
        control.in[1],
        control.out[0],
        control.out[1]
      ]) {
        hash = hashNumber(hash, value);
      }
    }
  }
  return hash >>> 0;
}

function masksOverlap(left: Uint8Array, right: Uint8Array): boolean {
  for (let index = 0; index < left.length; index++) if (left[index] && right[index]) return true;
  return false;
}

function countMask(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value;
  return count;
}

function hashFloatField(values: Float32Array): number {
  let hash = 0x811c9dc5;
  for (const value of values) hash = hashNumber(hash, value);
  return hash >>> 0;
}

function hashString(hash: number, value: string): number {
  for (let index = 0; index < value.length; index++) hash = hashUint32(hash, value.charCodeAt(index));
  return hash;
}

function hashNumber(hash: number, value: number): number {
  return hashUint32(hash, Math.round(value * 1_000_000));
}

function hashUint32(hash: number, value: number): number {
  return Math.imul(hash ^ value, 0x01000193) >>> 0;
}
