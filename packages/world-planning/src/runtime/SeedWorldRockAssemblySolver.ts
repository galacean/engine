import { sampleSeedWorldHeight, type SeedWorldFields } from "./SeedWorldFields.ts";
import type {
  SeedWorldRockCanyonPair,
  SeedWorldRockCoverageTarget,
  SeedWorldRockTerrainAnalysis
} from "./SeedWorldRockTerrainAnalysis.ts";

type Vector3Tuple = readonly [x: number, y: number, z: number];
type QuaternionTuple = readonly [x: number, y: number, z: number, w: number];

/** Semantic role of one OBB inside a one-, two-, or four-piece cliff composition. */
export type SeedWorldRockAssemblyRole = "primary" | "upper-stack" | "shoulder-fill" | "depth-layer";

/** Asset-owned OBB expressed in a canonical tangent/uphill frame. */
export interface SeedWorldRockAssetObbProfile {
  /** Stable authored asset identity. */
  readonly id: string;
  /** Concrete runtime prototype or Prefab family. */
  readonly prototypeFamily: string;
  /** Complete canonical OBB size as tangent, vertical, and uphill dimensions. */
  readonly canonicalSizeMetres: readonly [tangent: number, vertical: number, uphill: number];
  /** Canonical OBB centre relative to the authored asset root. */
  readonly canonicalCenterMetres: Vector3Tuple;
  /** Authored lower-envelope supports relative to the authored OBB centre. */
  readonly authoredSupportOffsetsMetres: readonly Vector3Tuple[];
  /** Lower-envelope supports rotated into the canonical tangent/uphill frame. */
  readonly canonicalSupportOffsetsMetres: readonly Vector3Tuple[];
  /** Authored upper-surface detail samples rotated into the canonical frame. */
  readonly canonicalDetailOffsetsMetres: readonly Vector3Tuple[];
  /** Detail samples on the end opposite the pointed canonical +Z tip. */
  readonly canonicalTailDetailOffsetsMetres: readonly Vector3Tuple[];
  /** Minimum scaled vertical fraction intentionally visible at the authored tail. */
  readonly tailDetailRevealRatio: number;
  /** Rotation from authored asset axes into the canonical OBB frame. */
  readonly assetToCanonicalQuaternion: QuaternionTuple;
}

/** Asset-neutral policy controlling OBB feasibility rather than terrain generation. */
export interface SeedWorldRockAssemblyOptions {
  /** Automatic visual composition or a forced diagnostic piece count. */
  readonly mode: "auto" | 1 | 2 | 4;
  /** Lowest fraction of canonical root-band samples intersecting final terrain. */
  readonly minimumContactRatio: number;
  /** Shallowest root insertion relative to canonical OBB thickness. */
  readonly minimumInsertionDepthThicknessRatio: number;
  /** Preferred root insertion relative to canonical OBB thickness. */
  readonly preferredInsertionDepthThicknessRatio: number;
  /** Deepest permitted root insertion relative to canonical OBB thickness. */
  readonly maximumInsertionDepthThicknessRatio: number;
  /** Largest gap inside the required lower-envelope contact quantile, relative to OBB thickness. */
  readonly maximumSupportGapThicknessRatio: number;
  /** Terrain/upper-surface separation reserved against distant depth fighting. */
  readonly surfaceConflictClearanceThicknessRatio: number;
  /** Lowest plan-view fraction independently visible for every piece. */
  readonly minimumIndependentPlanContributionRatio: number;
  /** Largest fraction of one member footprint covered by any sibling member. */
  readonly maximumMemberPlanOverlapRatio: number;
  /** Lowest independently visible 3D OBB surface after neighboring hills are considered. */
  readonly minimumGlobalObbContributionRatio: number;
  /** Largest visible OBB surface fraction penetrating an assembly owned by another terrain target. */
  readonly maximumCrossTargetVisibleOverlapRatio: number;
  /** Lowest fraction of the sampled final-terrain shoulder surface covered by the OBB union. */
  readonly minimumTerrainCoverageRatio: number;
  /** Lowest OBB rise above the final crest, relative to the convexity prominence. */
  readonly minimumCrestRiseProminenceRatio: number;
  /** Additional uniform scale reached at the world perimeter. */
  readonly outerUniformScaleGain: number;
  /** Smallest elevation angle available to the terrain-driven posture solve. */
  readonly minimumSkywardTiltDegrees: number;
  /** Largest elevation angle available to the terrain-driven posture solve. */
  readonly maximumSkywardTiltDegrees: number;
}

/** One final transform and its measured OBB evidence. */
export interface SeedWorldSolvedRockObb {
  /** Stable assembly-local identity. */
  readonly id: string;
  /** Composition role retained by debug overlays and runtime labels. */
  readonly role: SeedWorldRockAssemblyRole;
  /** Selected authored asset profile. */
  readonly assetId: string;
  /** Concrete runtime prototype or Prefab family. */
  readonly prototypeFamily: string;
  /** Authored root position in world metres. */
  readonly position: Vector3Tuple;
  /** World-space centre of the strict OBB used by every solver metric. */
  readonly obbCenter: Vector3Tuple;
  /** Authored asset rotation in world-space quaternion order. */
  readonly rotationQuaternion: QuaternionTuple;
  /** Canonical OBB rotation in world space, independent from authored asset axes. */
  readonly obbRotationQuaternion: QuaternionTuple;
  /** Uniform scale; all three source axes always use this value. */
  readonly uniformScale: number;
  /** Complete scaled canonical OBB size. */
  readonly obbSizeMetres: readonly [tangent: number, vertical: number, uphill: number];
  /** Fraction of sampled OBB support points at or below final terrain. */
  readonly contactRatio: number;
  /** Final terrain depth over the canonical downhill root, scaled with this OBB. */
  readonly insertionDepthMetres: number;
  /** Largest gap inside the required lower-envelope contact quantile. */
  readonly maximumSupportGapMetres: number;
  /** Median visible tail-detail height divided by the scaled canonical vertical size. */
  readonly tailDetailExposureRatio: number;
  /** Asset-authored minimum tail-detail exposure requested for this solve. */
  readonly tailDetailRequiredExposureRatio: number;
  /** Upper-detail samples inside the reserved terrain depth-conflict band. */
  readonly surfaceConflictSampleCount: number;
  /** Fraction of this plan OBB not hidden by another member of the same assembly. */
  readonly independentPlanContributionRatio: number;
  /** Fraction of this OBB surface not contained by any neighboring OBB. */
  readonly globalIndependentObbContributionRatio: number;
  /** Fraction of above-Hfinal OBB surface samples contained by a different target's OBB. */
  readonly crossTargetVisibleOverlapRatio: number;
  /** Stable rock identities whose strict OBBs intersect this rock across terrain targets. */
  readonly crossTargetOverlapRockIds: readonly string[];
  /** Skyward angle of the canonical uphill axis. */
  readonly skywardTiltDegrees: number;
  /** Whether this OBB contains the owning final-terrain crest. */
  readonly containsCrest: boolean;
}

/** One coverage target and its mandatory OBB composition. */
export interface SeedWorldRockAssemblyDecision {
  /** Owning terrain convexity. */
  readonly targetId: string;
  /** Requested composition count after automatic selection. */
  readonly requestedRockCount: 1 | 2 | 4;
  /** Final OBB members; every analyzed target owns at least one. */
  readonly rocks: readonly SeedWorldSolvedRockObb[];
  /** Lowest member contact ratio. */
  readonly minimumContactRatio: number;
  /** Lowest member independent plan contribution. */
  readonly minimumIndependentPlanContributionRatio: number;
  /** Largest sibling overlap measured against the smaller member footprint. */
  readonly maximumMemberPlanOverlapRatio: number;
  /** Lowest member 3D OBB surface contribution after neighboring assemblies are considered. */
  readonly minimumGlobalObbContributionRatio: number;
  /** Largest above-Hfinal OBB surface penetration into another terrain target. */
  readonly maximumCrossTargetVisibleOverlapRatio: number;
  /** Whether the union contains the required terrain crest. */
  readonly crestCovered: boolean;
  /** Whether every requested role intersects the same plan-view composition. */
  readonly assemblyConnected: boolean;
  /** Fraction of the selected final-terrain shoulder surface contained by the OBB union. */
  readonly terrainCoverageRatio: number;
  /** Highest OBB extent above the owning final-terrain crest. */
  readonly crestRiseMetres: number;
  /** Position-derived uniform hierarchy scale shared by the whole assembly. */
  readonly hierarchyScale: number;
  /** Acceptance diagnostics violated by the emitted best candidate. */
  readonly violations: readonly (
    | "contact"
    | "support-gap"
    | "tail-detail"
    | "surface-conflict"
    | "independent-contribution"
    | "member-overlap"
    | "neighbor-overlap"
    | "cross-target-overlap"
    | "crest-coverage"
    | "terrain-coverage"
    | "crest-rise"
    | "disconnected"
  )[];
  /** Per-role measurements from the selected or best rejected composition. */
  readonly memberDiagnostics: readonly SeedWorldRockAssemblyMemberDiagnostics[];
}

/** Per-role feasibility evidence retained even when the complete assembly is rejected. */
export interface SeedWorldRockAssemblyMemberDiagnostics {
  /** Evaluated composition role. */
  readonly role: SeedWorldRockAssemblyRole;
  /** Bottom-support contact measured against final terrain. */
  readonly contactRatio: number;
  /** Largest gap inside the required lower-envelope contact quantile, in metres. */
  readonly maximumSupportGapMetres: number;
  /** Measured authored-tail exposure ratio. */
  readonly tailDetailExposureRatio: number;
  /** Number of upper-detail samples inside the depth-conflict band. */
  readonly surfaceConflictSampleCount: number;
  /** Plan-view area not swallowed by another group member. */
  readonly independentPlanContributionRatio: number;
  /** Whether this member contains the owning crest. */
  readonly containsCrest: boolean;
}

/** Complete material-independent OBB solve over one terrain analysis. */
export interface SeedWorldRockAssemblyCompilation {
  /** Committed decisions. Runtime planning may omit a redundant low-priority target. */
  readonly decisions: readonly SeedWorldRockAssemblyDecision[];
  /** Flattened stable transform list consumed by runtime and overlays. */
  readonly rocks: readonly SeedWorldSolvedRockObb[];
  /** Present only when the fixed-budget runtime planner produced this compilation. */
  readonly runtimeDiagnostics?: SeedWorldRockRuntimePlanningDiagnostics;
}

/** Why the fixed-budget runtime planner did not commit one analyzed target. */
export interface SeedWorldRockRuntimeSkippedTarget {
  /** Stable terrain target identity. */
  readonly targetId: string;
  /** Bounded stage which prevented this target from being committed. */
  readonly reason: "local-infeasible" | "cross-target-conflict" | "operation-budget" | "covered-by-neighbor";
  /** Fraction of this target's physical shoulder covered by the committed OBB union. */
  readonly shoulderCoverageRatio: number;
  /** Committed target identities contributing to that coverage. */
  readonly coveringTargetIds: readonly string[];
}

/** Deterministic operation evidence for the bounded runtime placement path. */
export interface SeedWorldRockRuntimePlanningDiagnostics {
  /** Complete OBB candidates evaluated against local Hfinal constraints. */
  readonly candidateEvaluationCount: number;
  /** Hard per-world candidate cap; reaching it stops further candidate generation. */
  readonly candidateEvaluationLimit: number;
  /** Exact cross-target OBB SAT tests performed after spatial broad phase. */
  readonly collisionTestCount: number;
  /** Hard per-world SAT cap; reaching it rejects the current and later candidates. */
  readonly collisionTestLimit: number;
  /** Hfinal-visible OBB surface samples used only when strict buried volumes intersect. */
  readonly visibleOverlapSampleCount: number;
  /** Hard per-world visible-sample cap. */
  readonly visibleOverlapSampleLimit: number;
  /** Targets reserved by the selected canyon cross-sections before optional placement. */
  readonly mandatoryTargetIds: readonly string[];
  /** Broad high-priority shoulders reserved before canyon-pair choice. */
  readonly dominantTargetIds: readonly string[];
  /** One committed layout-owned left/right pair identity per canyon. */
  readonly selectedCanyonPairIds: readonly string[];
  /** Targets which required harmless buried/low-visible OBB intersection to preserve shoulder coverage. */
  readonly visibleOverlapFallbackTargetIds: readonly string[];
  /** Earlier optional targets replaced once by a composition covering at least 95% of their shoulder. */
  readonly evictedTargetIds: readonly string[];
  /** Every analyzed target deliberately omitted by the bounded solve. */
  readonly skippedTargets: readonly SeedWorldRockRuntimeSkippedTarget[];
  /** Whether either deterministic operation budget was exhausted. */
  readonly budgetExhausted: boolean;
}

/** Default visual feasibility policy shared by 2D and 3D consumers. */
export const SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS = Object.freeze<SeedWorldRockAssemblyOptions>({
  mode: "auto",
  minimumContactRatio: 0.68,
  minimumInsertionDepthThicknessRatio: 0.04,
  preferredInsertionDepthThicknessRatio: 0.12,
  maximumInsertionDepthThicknessRatio: 0.24,
  maximumSupportGapThicknessRatio: 0.045,
  surfaceConflictClearanceThicknessRatio: 0.018,
  minimumIndependentPlanContributionRatio: 0.28,
  maximumMemberPlanOverlapRatio: 0.62,
  minimumGlobalObbContributionRatio: 0.55,
  maximumCrossTargetVisibleOverlapRatio: 0.35,
  minimumTerrainCoverageRatio: 0.53,
  minimumCrestRiseProminenceRatio: 0.24,
  outerUniformScaleGain: 0.65,
  minimumSkywardTiltDegrees: 18,
  maximumSkywardTiltDegrees: 62
});

interface RoleShape {
  readonly role: SeedWorldRockAssemblyRole;
  /** Fraction of the complete physical shoulder width requested by this role. */
  readonly tangentRatio: number;
  /** Fraction of physical prominence requested by this role. */
  readonly verticalRatio: number;
  /** Fraction of the complete crest-to-foot span requested by this role. */
  readonly uphillRatio: number;
  /** Centre along the complete crest-to-foot span. */
  readonly downhillOffsetRatio: number;
  /** Signed centre across the complete physical shoulder width. */
  readonly tangentOffsetRatio: number;
  readonly tiltOffsetDegrees: number;
  readonly yawOffsetDegrees: number;
}

interface PendingRock {
  readonly id: string;
  readonly role: SeedWorldRockAssemblyRole;
  readonly asset: SeedWorldRockAssetObbProfile;
  readonly position: Vector3Tuple;
  readonly obbCenter: Vector3Tuple;
  readonly rotationQuaternion: QuaternionTuple;
  readonly obbRotationQuaternion: QuaternionTuple;
  readonly uniformScale: number;
  readonly obbSizeMetres: readonly [number, number, number];
  readonly axes: Readonly<{ tangent: Vector3Tuple; vertical: Vector3Tuple; uphill: Vector3Tuple }>;
  readonly planHalfTangent: number;
  readonly planHalfUphill: number;
  readonly skywardTiltDegrees: number;
  readonly contactRatio: number;
  readonly insertionDepthMetres: number;
  readonly maximumSupportGapMetres: number;
  readonly tailDetailExposureRatio: number;
  readonly surfaceConflictSampleCount: number;
  readonly containsCrest: boolean;
}

/** Bounded post-rotation translation which integrates one canonical OBB into final terrain. */
export interface SeedWorldRockObbPlacementFit {
  /** World-space OBB centre height after insertion and crest-coverage constraints. */
  readonly obbCenterY: number;
  /** Terrain depth over the canonical downhill root. */
  readonly insertionDepthMetres: number;
  /** Smallest permitted insertion for this scaled OBB. */
  readonly minimumInsertionDepthMetres: number;
  /** Largest permitted insertion for this scaled OBB. */
  readonly maximumInsertionDepthMetres: number;
  /** Largest additional downward translation which still keeps the crest covered. */
  readonly maximumAdditionalBurialMetres: number;
  /** Largest gap inside the required lower-envelope contact quantile after translation. */
  readonly maximumSupportGapMetres: number;
  /** Median visible tail-detail height divided by the scaled canonical vertical size. */
  readonly tailDetailExposureRatio: number;
  /** Upper-detail samples inside the configured terrain depth-conflict band. */
  readonly surfaceConflictSampleCount: number;
}

interface PlanRock {
  readonly obbCenter: Vector3Tuple;
  readonly axes: PendingRock["axes"];
  readonly planHalfTangent: number;
  readonly planHalfUphill: number;
}

interface VolumeRock {
  readonly obbCenter: Vector3Tuple;
  readonly axes: PendingRock["axes"];
  readonly obbSizeMetres: readonly [number, number, number];
}

interface CrossTargetVisibleOverlapEvidence {
  readonly ratio: number;
  readonly rockIds: readonly string[];
}

interface CandidateAssembly {
  readonly rocks: readonly PendingRock[];
  readonly score: number;
  readonly feasible: boolean;
  readonly terrainCoverageRatio: number;
  readonly crestRiseMetres: number;
  readonly hierarchyScale: number;
  readonly maximumMemberPlanOverlapRatio: number;
}

interface TargetPlacementContext {
  readonly uniformScaleMultiplier: number;
  readonly tangentOffsetRatio: number;
  readonly downhillOffsetRatio: number;
  readonly yawOffsetDegrees: number;
  /** Candidate-only fraction of the global tilt interval used to recover inter-hill visibility. */
  readonly tiltOffsetRatio: number;
  readonly compositionMirror: -1 | 1;
}

interface RuntimeAssemblyCandidate {
  readonly decision: SeedWorldRockAssemblyDecision;
  readonly score: number;
  readonly fallbackRank: number;
}

interface RuntimePlannerOperationState {
  candidateEvaluationCount: number;
  collisionTestCount: number;
  visibleOverlapSampleCount: number;
  budgetExhausted: boolean;
}

interface RuntimeSpatialIndex {
  readonly cellSizeMetres: number;
  readonly targetIdsByCell: Map<string, Set<string>>;
  readonly decisionsByTargetId: Map<string, SeedWorldRockAssemblyDecision>;
}

interface AssetDetailFit {
  readonly detailOffsets: readonly Vector3Tuple[];
  readonly tailDetailOffsets: readonly Vector3Tuple[];
  readonly tailDetailRevealRatio: number;
}

const ROLE_SHAPES = Object.freeze<Record<SeedWorldRockAssemblyRole, RoleShape>>({
  primary: Object.freeze({
    role: "primary",
    tangentRatio: 0.86,
    verticalRatio: 1.08,
    uphillRatio: 0.92,
    downhillOffsetRatio: 0.38,
    tangentOffsetRatio: 0,
    tiltOffsetDegrees: 4,
    yawOffsetDegrees: 0
  }),
  "upper-stack": Object.freeze({
    role: "upper-stack",
    tangentRatio: 0.46,
    verticalRatio: 1.02,
    uphillRatio: 0.66,
    downhillOffsetRatio: 0.13,
    tangentOffsetRatio: 0.4,
    tiltOffsetDegrees: 13,
    yawOffsetDegrees: 7
  }),
  "shoulder-fill": Object.freeze({
    role: "shoulder-fill",
    tangentRatio: 0.32,
    verticalRatio: 0.48,
    uphillRatio: 0.38,
    downhillOffsetRatio: 0.7,
    tangentOffsetRatio: -0.46,
    tiltOffsetDegrees: 2,
    yawOffsetDegrees: -9
  }),
  "depth-layer": Object.freeze({
    role: "depth-layer",
    tangentRatio: 0.3,
    verticalRatio: 0.4,
    uphillRatio: 0.36,
    downhillOffsetRatio: 0.43,
    tangentOffsetRatio: 0.66,
    tiltOffsetDegrees: 7,
    yawOffsetDegrees: 11
  })
});

const ROLE_ORDER = Object.freeze<readonly SeedWorldRockAssemblyRole[]>([
  "primary",
  "upper-stack",
  "shoulder-fill",
  "depth-layer"
]);
const OFFSET_VARIANTS = Object.freeze([0.48, 0.64, 0.8, 0.96, 1.12, 1.28] as const);
const SCALE_VARIANTS = Object.freeze([0.9, 1, 1.1, 1.2, 1.3] as const);
const YAW_VARIANTS_DEGREES = Object.freeze([-5, 0, 5] as const);
const PLAN_CONTRIBUTION_SAMPLES = 17;
const OBB_CONTRIBUTION_SAMPLES = 5;
const SUPPORT_GRID_SIZE = 3;
const RUNTIME_CANDIDATE_EVALUATION_LIMIT = 1_536;
const RUNTIME_COLLISION_TEST_LIMIT = 32_768;
const RUNTIME_VISIBLE_OVERLAP_SAMPLE_LIMIT = 262_144;
const RUNTIME_MAX_PAIR_CANDIDATES_PER_CANYON = 10;
const RUNTIME_MINIMUM_REDUNDANT_SHOULDER_COVERAGE_RATIO = 0.95;

interface RuntimeCandidateVariant {
  readonly offset: number;
  readonly scale: number;
  readonly yawDegrees: number;
  readonly tiltOffsetRatio: number;
}

const RUNTIME_CANDIDATE_VARIANTS = Object.freeze<readonly RuntimeCandidateVariant[]>([
  { offset: 0.8, scale: 1, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.96, scale: 1, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.64, scale: 1, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 1.12, scale: 1, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 1.28, scale: 1, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.8, scale: 0.9, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.96, scale: 0.9, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 1.12, scale: 0.9, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.8, scale: 1.1, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.96, scale: 1.1, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.64, scale: 1.1, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 1.12, scale: 1.1, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.8, scale: 1.2, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.96, scale: 1.2, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 1.12, scale: 1.2, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.8, scale: 1.3, yawDegrees: 0, tiltOffsetRatio: 0 },
  { offset: 0.8, scale: 1, yawDegrees: -5, tiltOffsetRatio: 0 },
  { offset: 0.8, scale: 1, yawDegrees: 5, tiltOffsetRatio: 0 },
  { offset: 0.96, scale: 1.1, yawDegrees: -5, tiltOffsetRatio: 0 },
  { offset: 0.96, scale: 1.1, yawDegrees: 5, tiltOffsetRatio: 0 },
  { offset: 1.12, scale: 1.1, yawDegrees: -5, tiltOffsetRatio: 0 },
  { offset: 1.12, scale: 1.1, yawDegrees: 5, tiltOffsetRatio: 0 },
  { offset: 0.8, scale: 1.1, yawDegrees: 0, tiltOffsetRatio: -0.12 },
  { offset: 0.8, scale: 1.1, yawDegrees: 0, tiltOffsetRatio: 0.12 },
  { offset: 0.96, scale: 1.1, yawDegrees: 0, tiltOffsetRatio: -0.12 },
  { offset: 0.96, scale: 1.1, yawDegrees: 0, tiltOffsetRatio: 0.12 },
  { offset: 1.12, scale: 1.2, yawDegrees: 0, tiltOffsetRatio: -0.12 },
  { offset: 1.12, scale: 1.2, yawDegrees: 0, tiltOffsetRatio: 0.12 }
]);

/**
 * Solves the bounded translation applied after an OBB has been rotated around its centre.
 * @param fields Final Heightmap used to place the canonical downhill root.
 * @param crest Final-terrain crest which must remain inside the OBB.
 * @param worldX Planned OBB centre X before vertical fitting.
 * @param worldZ Planned OBB centre Z before vertical fitting.
 * @param rotationQuaternion Canonical OBB orientation in world space.
 * @param size Complete scaled canonical OBB size.
 * @param options Size-relative insertion policy.
 * @param supportOffsets Optional asset lower-envelope samples relative to the OBB centre.
 * @returns Centre height and bounded insertion diagnostics.
 */
export function solveSeedWorldRockObbPlacement(
  fields: SeedWorldFields,
  crest: Vector3Tuple,
  worldX: number,
  worldZ: number,
  rotationQuaternion: QuaternionTuple,
  size: readonly [number, number, number],
  options: SeedWorldRockAssemblyOptions = SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS,
  supportOffsets?: readonly Vector3Tuple[]
): SeedWorldRockObbPlacementFit {
  const axes = Object.freeze({
    tangent: rotateVectorByQuaternion([1, 0, 0], rotationQuaternion),
    vertical: rotateVectorByQuaternion([0, 1, 0], rotationQuaternion),
    uphill: rotateVectorByQuaternion([0, 0, 1], rotationQuaternion)
  });
  return solveObbPlacement(fields, crest, worldX, worldZ, axes, size, options, supportOffsets);
}

/**
 * Exhaustively solves one-, two-, or four-piece rock compositions for offline reference baking.
 * @param analysis Rock-owned final-terrain coverage decisions and surface frames.
 * @param fields Final Heightmap used for every support and burial sample.
 * @param assets Available authored OBB profiles; order does not affect the result.
 * @param options Visual feasibility policy shared by diagnostics and runtime.
 * @returns Immutable per-target decisions and flattened rock transforms.
 * @throws {RangeError} When no asset exists or an OBB/profile option is invalid.
 */
export function solveSeedWorldRockAssemblies(
  analysis: SeedWorldRockTerrainAnalysis,
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  options: SeedWorldRockAssemblyOptions = SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS
): SeedWorldRockAssemblyCompilation {
  validateInputs(assets, options);
  const orderedAssets = assets.slice().sort((left, right) => left.id.localeCompare(right.id));
  const placementContexts = resolveTargetPlacementContexts(analysis.targets);
  const decisions = solveTargetsWithGlobalPlacementSearch(
    analysis.targets,
    fields,
    orderedAssets,
    options,
    placementContexts
  );
  return Object.freeze({
    decisions: Object.freeze(decisions),
    rocks: Object.freeze(decisions.flatMap((decision) => decision.rocks))
  });
}

/**
 * Solves runtime rock placement with fixed candidate and exact-collision operation budgets.
 * Layout-owned canyon cross-sections are reserved first; remaining targets are committed by
 * visual priority and may only be omitted as complete assemblies.
 */
export function solveSeedWorldRockAssembliesRuntime(
  analysis: SeedWorldRockTerrainAnalysis,
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  options: SeedWorldRockAssemblyOptions = SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS
): SeedWorldRockAssemblyCompilation {
  validateInputs(assets, options);
  const orderedAssets = assets.slice().sort((left, right) => left.id.localeCompare(right.id));
  const targetById = new Map(analysis.targets.map((target) => [target.id, target] as const));
  const placementContexts = resolveTargetPlacementContexts(analysis.targets);
  const candidateCache = new Map<string, readonly RuntimeAssemblyCandidate[]>();
  const expandedCandidateCache = new Map<string, readonly RuntimeAssemblyCandidate[]>();
  const state: RuntimePlannerOperationState = {
    candidateEvaluationCount: 0,
    collisionTestCount: 0,
    visibleOverlapSampleCount: 0,
    budgetExhausted: false
  };
  const spatialIndex = createRuntimeSpatialIndex(Math.max(64, fields.sizeMetres / 12));
  const accepted = new Map<string, SeedWorldRockAssemblyDecision>();
  const mandatoryTargetIds = new Set<string>();
  const dominantTargetIds = new Set<string>();
  const selectedCanyonPairIds: string[] = [];
  const visibleOverlapFallbackTargetIds = new Set<string>();
  const evictedTargetIds = new Set<string>();
  const initialSkipReason = new Map<string, SeedWorldRockRuntimeSkippedTarget["reason"]>();

  const candidatesFor = (targetId: string): readonly RuntimeAssemblyCandidate[] => {
    const cached = candidateCache.get(targetId);
    if (cached) return cached;
    const target = targetById.get(targetId)!;
    const generated = generateRuntimeAssemblyCandidates(
      target,
      fields,
      orderedAssets,
      options,
      placementContexts.get(targetId)!,
      state
    );
    candidateCache.set(targetId, generated);
    if (generated.length === 0) {
      initialSkipReason.set(targetId, state.budgetExhausted ? "operation-budget" : "local-infeasible");
    }
    return generated;
  };
  const expandedCandidatesFor = (targetId: string): readonly RuntimeAssemblyCandidate[] => {
    const cached = expandedCandidateCache.get(targetId);
    if (cached) return cached;
    const target = targetById.get(targetId)!;
    const expanded = Object.freeze([
      ...candidatesFor(targetId),
      ...generateRuntimeRepairCandidates(
        target,
        fields,
        orderedAssets,
        options,
        placementContexts.get(targetId)!,
        state
      )
    ]);
    expandedCandidateCache.set(targetId, expanded);
    return expanded;
  };
  const commit = (candidate: RuntimeAssemblyCandidate): void => {
    accepted.set(candidate.decision.targetId, candidate.decision);
    insertRuntimeSpatialDecision(spatialIndex, candidate.decision);
  };

  const dominantTargetCount = Math.max(1, Math.round(Math.sqrt(analysis.targets.length) * 0.5));
  const dominantTargets = analysis.targets
    .slice()
    .sort((left, right) => rockCoveragePriority(right) - rockCoveragePriority(left) || left.id.localeCompare(right.id))
    .slice(0, dominantTargetCount);
  for (const target of dominantTargets) {
    const candidates = expandedCandidatesFor(target.id)
      .map((candidate) => {
        const neighboringCoverageRatios = analysis.targets
          .filter((neighbor) => neighbor.id !== target.id)
          .map((neighbor) => measureSolvedTerrainCoverage(neighbor, fields, candidate.decision.rocks));
        return Object.freeze({
          candidate,
          absorbedShoulderCount: neighboringCoverageRatios.filter(
            (ratio) => ratio >= RUNTIME_MINIMUM_REDUNDANT_SHOULDER_COVERAGE_RATIO
          ).length,
          neighboringCoverageSum: neighboringCoverageRatios.reduce((sum, ratio) => sum + ratio, 0)
        });
      })
      .sort(
        (left, right) =>
          right.absorbedShoulderCount - left.absorbedShoulderCount ||
          right.neighboringCoverageSum - left.neighboringCoverageSum ||
          right.candidate.decision.terrainCoverageRatio - left.candidate.decision.terrainCoverageRatio ||
          left.candidate.score - right.candidate.score
      )
      .map((entry) => entry.candidate);
    const strictSelected = candidates.find(
      (candidate) => !runtimeDecisionConflicts(candidate.decision, spatialIndex, fields, options, state, true)
    );
    const visibleSelected = strictSelected
      ? undefined
      : candidates.find(
          (candidate) => !runtimeDecisionConflicts(candidate.decision, spatialIndex, fields, options, state, false)
        );
    const selected = strictSelected ?? visibleSelected;
    if (!selected) continue;
    commit(selected);
    if (visibleSelected) visibleOverlapFallbackTargetIds.add(target.id);
    dominantTargetIds.add(target.id);
  }

  const canyonIds = [...new Set(analysis.canyonPairs.map((pair) => pair.canyonId))].sort((left, right) =>
    compareRuntimeCanyonConstraints(left, right, analysis.canyonPairs, targetById)
  );
  for (const canyonId of canyonIds) {
    const pairCandidates = analysis.canyonPairs
      .filter((pair) => pair.canyonId === canyonId)
      .slice()
      .sort((left, right) => compareRuntimeCanyonPairs(left, right, targetById))
      .slice(0, RUNTIME_MAX_PAIR_CANDIDATES_PER_CANYON);
    let selectedPair: SeedWorldRockCanyonPair | undefined;
    for (const candidateSource of [candidatesFor, expandedCandidatesFor]) {
      for (const pair of pairCandidates) {
        for (const strictIntersection of [true, false]) {
          const placement = selectRuntimeCanyonPairPlacement(
            pair,
            accepted,
            spatialIndex,
            candidateSource,
            fields,
            options,
            state,
            strictIntersection
          );
          if (!placement) continue;
          for (const candidate of placement) commit(candidate);
          if (!strictIntersection) {
            for (const candidate of placement) {
              visibleOverlapFallbackTargetIds.add(candidate.decision.targetId);
            }
          }
          selectedPair = pair;
          break;
        }
        if (selectedPair) break;
      }
      if (selectedPair) break;
    }
    if (!selectedPair) continue;
    mandatoryTargetIds.add(selectedPair.leftTargetId);
    mandatoryTargetIds.add(selectedPair.rightTargetId);
    selectedCanyonPairIds.push(selectedPair.id);
  }

  const optionalTargets = analysis.targets
    .filter((target) => !accepted.has(target.id))
    .slice()
    .sort((left, right) => rockCoveragePriority(right) - rockCoveragePriority(left) || left.id.localeCompare(right.id));
  for (const target of optionalTargets) {
    const candidates = candidatesFor(target.id);
    const strictSelected = candidates.find(
      (candidate) => !runtimeDecisionConflicts(candidate.decision, spatialIndex, fields, options, state, true)
    );
    const visibleSelected = strictSelected
      ? undefined
      : candidates.find(
          (candidate) => !runtimeDecisionConflicts(candidate.decision, spatialIndex, fields, options, state, false)
        );
    const expandedCandidates = strictSelected || visibleSelected ? [] : expandedCandidatesFor(target.id);
    const repairStrictSelected = expandedCandidates.find(
      (candidate) => !runtimeDecisionConflicts(candidate.decision, spatialIndex, fields, options, state, true)
    );
    const repairVisibleSelected = repairStrictSelected
      ? undefined
      : expandedCandidates.find(
          (candidate) => !runtimeDecisionConflicts(candidate.decision, spatialIndex, fields, options, state, false)
        );
    const selected = strictSelected ?? visibleSelected ?? repairStrictSelected ?? repairVisibleSelected;
    if (visibleSelected || repairVisibleSelected) visibleOverlapFallbackTargetIds.add(target.id);
    if (selected) {
      commit(selected);
      continue;
    }
    const eviction = tryRuntimeSingleEviction(
      expandedCandidatesFor(target.id),
      accepted,
      spatialIndex,
      mandatoryTargetIds,
      targetById,
      fields,
      options,
      state
    );
    if (eviction) {
      commit(eviction.candidate);
      evictedTargetIds.add(eviction.evictedTargetId);
      initialSkipReason.set(eviction.evictedTargetId, "covered-by-neighbor");
      continue;
    }
    if (!initialSkipReason.has(target.id)) {
      initialSkipReason.set(target.id, state.budgetExhausted ? "operation-budget" : "cross-target-conflict");
    }
  }

  const orderedAccepted = analysis.targets.flatMap((target) => {
    const decision = accepted.get(target.id);
    return decision ? [decision] : [];
  });
  const finalized = finalizeGlobalObbContributions(orderedAccepted, fields, options);
  const skippedTargets = analysis.targets.flatMap((target) => {
    if (accepted.has(target.id)) return [];
    const coveringDecisions = finalized.filter(
      (decision) => measureSolvedTerrainCoverage(target, fields, decision.rocks) > 0
    );
    const shoulderCoverageRatio = measureSolvedTerrainCoverage(
      target,
      fields,
      coveringDecisions.flatMap((decision) => decision.rocks)
    );
    return [
      Object.freeze({
        targetId: target.id,
        reason:
          shoulderCoverageRatio >= RUNTIME_MINIMUM_REDUNDANT_SHOULDER_COVERAGE_RATIO
            ? "covered-by-neighbor"
            : (initialSkipReason.get(target.id) ?? "cross-target-conflict"),
        shoulderCoverageRatio,
        coveringTargetIds: Object.freeze(coveringDecisions.map((decision) => decision.targetId))
      })
    ];
  });
  const runtimeDiagnostics = Object.freeze<SeedWorldRockRuntimePlanningDiagnostics>({
    candidateEvaluationCount: state.candidateEvaluationCount,
    candidateEvaluationLimit: RUNTIME_CANDIDATE_EVALUATION_LIMIT,
    collisionTestCount: state.collisionTestCount,
    collisionTestLimit: RUNTIME_COLLISION_TEST_LIMIT,
    visibleOverlapSampleCount: state.visibleOverlapSampleCount,
    visibleOverlapSampleLimit: RUNTIME_VISIBLE_OVERLAP_SAMPLE_LIMIT,
    mandatoryTargetIds: Object.freeze([...mandatoryTargetIds].sort()),
    dominantTargetIds: Object.freeze([...dominantTargetIds].sort()),
    selectedCanyonPairIds: Object.freeze(selectedCanyonPairIds.slice().sort()),
    visibleOverlapFallbackTargetIds: Object.freeze([...visibleOverlapFallbackTargetIds].sort()),
    evictedTargetIds: Object.freeze([...evictedTargetIds].sort()),
    skippedTargets: Object.freeze(skippedTargets),
    budgetExhausted: state.budgetExhausted
  });
  return Object.freeze({
    decisions: Object.freeze(finalized),
    rocks: Object.freeze(finalized.flatMap((decision) => decision.rocks)),
    runtimeDiagnostics
  });
}

function generateRuntimeAssemblyCandidates(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  options: SeedWorldRockAssemblyOptions,
  placementContext: TargetPlacementContext,
  state: RuntimePlannerOperationState
): readonly RuntimeAssemblyCandidate[] {
  const preferredRockCount = selectRockCount(target, options.mode);
  const rockCounts = candidateRockCounts(preferredRockCount, options.mode);
  const feasible: RuntimeAssemblyCandidate[] = [];
  for (let rockCountIndex = 0; rockCountIndex < rockCounts.length; rockCountIndex++) {
    const rockCount = rockCounts[rockCountIndex]!;
    const variants = rockCountIndex === 0 ? RUNTIME_CANDIDATE_VARIANTS : RUNTIME_CANDIDATE_VARIANTS.slice(0, 8);
    for (const variant of variants) {
      if (state.candidateEvaluationCount >= RUNTIME_CANDIDATE_EVALUATION_LIMIT) {
        state.budgetExhausted = true;
        break;
      }
      state.candidateEvaluationCount++;
      const candidate = makeCandidate(
        target,
        fields,
        assets,
        rockCount,
        variant.offset,
        variant.scale,
        variant.yawDegrees,
        options,
        Object.freeze({
          ...placementContext,
          tiltOffsetRatio: placementContext.tiltOffsetRatio + variant.tiltOffsetRatio
        })
      );
      if (!candidate.feasible) continue;
      feasible.push(
        Object.freeze({
          decision: freezeRuntimeCandidateDecision(target, candidate, rockCount),
          score: candidate.score,
          fallbackRank: rockCountIndex
        })
      );
    }
    if (state.budgetExhausted) break;
  }
  return Object.freeze(
    feasible.sort(
      (left, right) =>
        left.fallbackRank - right.fallbackRank ||
        left.score - right.score ||
        compareRuntimeDecisions(left.decision, right.decision)
    )
  );
}

function generateRuntimeRepairCandidates(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  options: SeedWorldRockAssemblyOptions,
  placementContext: TargetPlacementContext,
  state: RuntimePlannerOperationState
): readonly RuntimeAssemblyCandidate[] {
  const preferredRockCount = selectRockCount(target, options.mode);
  const repairContextIndices = new Set([0, 1, 4, 5, 8, 9, 10, 11]);
  const repairContexts = globalPlacementContextVariants(placementContext).filter((_, index) =>
    repairContextIndices.has(index)
  );
  const candidates: RuntimeAssemblyCandidate[] = [];
  for (const context of repairContexts) {
    for (const variant of RUNTIME_CANDIDATE_VARIANTS.slice(0, 6)) {
      if (state.candidateEvaluationCount >= RUNTIME_CANDIDATE_EVALUATION_LIMIT) {
        state.budgetExhausted = true;
        break;
      }
      state.candidateEvaluationCount++;
      const candidate = makeCandidate(
        target,
        fields,
        assets,
        preferredRockCount,
        variant.offset,
        variant.scale,
        variant.yawDegrees,
        options,
        Object.freeze({
          ...context,
          tiltOffsetRatio: context.tiltOffsetRatio + variant.tiltOffsetRatio
        })
      );
      if (!candidate.feasible) continue;
      candidates.push(
        Object.freeze({
          decision: freezeRuntimeCandidateDecision(target, candidate, preferredRockCount),
          score: candidate.score,
          fallbackRank: 0
        })
      );
    }
    if (state.budgetExhausted) break;
  }
  return Object.freeze(
    candidates.sort((left, right) => left.score - right.score || compareRuntimeDecisions(left.decision, right.decision))
  );
}

function freezeRuntimeCandidateDecision(
  target: SeedWorldRockCoverageTarget,
  candidate: CandidateAssembly,
  requestedRockCount: 1 | 2 | 4
): SeedWorldRockAssemblyDecision {
  const contributions = measureIndependentPlanContributions(candidate.rocks);
  return freezeResolvedCandidate(
    target,
    candidate,
    requestedRockCount,
    contributions,
    Object.freeze([]),
    Math.min(...candidate.rocks.map((rock) => rock.contactRatio)),
    Math.min(...contributions),
    candidate.rocks.some((rock) => rock.containsCrest),
    assemblyIsConnected(candidate.rocks)
  );
}

function compareRuntimeDecisions(left: SeedWorldRockAssemblyDecision, right: SeedWorldRockAssemblyDecision): number {
  for (let rockIndex = 0; rockIndex < Math.min(left.rocks.length, right.rocks.length); rockIndex++) {
    const leftRock = left.rocks[rockIndex]!;
    const rightRock = right.rocks[rockIndex]!;
    for (let axis = 0; axis < 3; axis++) {
      const delta = leftRock.obbCenter[axis]! - rightRock.obbCenter[axis]!;
      if (Math.abs(delta) > 1e-9) return delta;
    }
  }
  return left.requestedRockCount - right.requestedRockCount;
}

function compareRuntimeCanyonPairs(
  left: SeedWorldRockCanyonPair,
  right: SeedWorldRockCanyonPair,
  targetById: ReadonlyMap<string, SeedWorldRockCoverageTarget>
): number {
  const leftCrowding = runtimeCanyonPairCrowdingScore(left, targetById);
  const rightCrowding = runtimeCanyonPairCrowdingScore(right, targetById);
  const leftPriority = Math.min(
    rockCoveragePriority(targetById.get(left.leftTargetId)!),
    rockCoveragePriority(targetById.get(left.rightTargetId)!)
  );
  const rightPriority = Math.min(
    rockCoveragePriority(targetById.get(right.leftTargetId)!),
    rockCoveragePriority(targetById.get(right.rightTargetId)!)
  );
  return (
    leftCrowding - rightCrowding ||
    Math.abs(left.leftGuideParameter - left.rightGuideParameter) -
      Math.abs(right.leftGuideParameter - right.rightGuideParameter) ||
    rightPriority - leftPriority ||
    left.id.localeCompare(right.id)
  );
}

function runtimeCanyonPairCrowdingScore(
  pair: SeedWorldRockCanyonPair,
  targetById: ReadonlyMap<string, SeedWorldRockCoverageTarget>
): number {
  const left = targetById.get(pair.leftTargetId)!;
  const right = targetById.get(pair.rightTargetId)!;
  const radius = (target: SeedWorldRockCoverageTarget): number =>
    Math.hypot(target.tangentSpanMetres, target.shoulderSpanMetres) * 0.5;
  return [...targetById.values()].filter((target) => {
    if (target.id === left.id || target.id === right.id) return false;
    const leftDistance = Math.hypot(target.crest[0] - left.crest[0], target.crest[2] - left.crest[2]);
    const rightDistance = Math.hypot(target.crest[0] - right.crest[0], target.crest[2] - right.crest[2]);
    return leftDistance < radius(target) + radius(left) || rightDistance < radius(target) + radius(right);
  }).length;
}

function compareRuntimeCanyonConstraints(
  leftCanyonId: string,
  rightCanyonId: string,
  pairs: readonly SeedWorldRockCanyonPair[],
  targetById: ReadonlyMap<string, SeedWorldRockCoverageTarget>
): number {
  const leftPairs = pairs.filter((pair) => pair.canyonId === leftCanyonId);
  const rightPairs = pairs.filter((pair) => pair.canyonId === rightCanyonId);
  const pairStrength = (pair: SeedWorldRockCanyonPair): number =>
    Math.min(
      rockCoveragePriority(targetById.get(pair.leftTargetId)!),
      rockCoveragePriority(targetById.get(pair.rightTargetId)!)
    );
  const leftMaximumStrength = Math.max(0, ...leftPairs.map(pairStrength));
  const rightMaximumStrength = Math.max(0, ...rightPairs.map(pairStrength));
  return (
    leftPairs.length - rightPairs.length ||
    leftMaximumStrength - rightMaximumStrength ||
    leftCanyonId.localeCompare(rightCanyonId)
  );
}

function selectRuntimeCanyonPairPlacement(
  pair: SeedWorldRockCanyonPair,
  accepted: ReadonlyMap<string, SeedWorldRockAssemblyDecision>,
  spatialIndex: RuntimeSpatialIndex,
  candidatesFor: (targetId: string) => readonly RuntimeAssemblyCandidate[],
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions,
  state: RuntimePlannerOperationState,
  strictIntersection: boolean
): readonly RuntimeAssemblyCandidate[] | undefined {
  const leftAccepted = accepted.get(pair.leftTargetId);
  const rightAccepted = accepted.get(pair.rightTargetId);
  if (leftAccepted && rightAccepted) return Object.freeze([]);
  if (leftAccepted || rightAccepted) {
    const missingTargetId = leftAccepted ? pair.rightTargetId : pair.leftTargetId;
    const candidate = candidatesFor(missingTargetId).find(
      (entry) => !runtimeDecisionConflicts(entry.decision, spatialIndex, fields, options, state, strictIntersection)
    );
    return candidate ? Object.freeze([candidate]) : undefined;
  }
  const leftCandidates = candidatesFor(pair.leftTargetId);
  const rightCandidates = candidatesFor(pair.rightTargetId);
  for (const left of leftCandidates) {
    if (runtimeDecisionConflicts(left.decision, spatialIndex, fields, options, state, strictIntersection)) continue;
    for (const right of rightCandidates) {
      if (
        runtimeCandidateSetConflicts(
          [left.decision, right.decision],
          spatialIndex,
          fields,
          options,
          state,
          strictIntersection
        )
      )
        continue;
      return Object.freeze([left, right]);
    }
  }
  return undefined;
}

function createRuntimeSpatialIndex(cellSizeMetres: number): RuntimeSpatialIndex {
  return {
    cellSizeMetres,
    targetIdsByCell: new Map(),
    decisionsByTargetId: new Map()
  };
}

function insertRuntimeSpatialDecision(index: RuntimeSpatialIndex, decision: SeedWorldRockAssemblyDecision): void {
  index.decisionsByTargetId.set(decision.targetId, decision);
  const keys = new Set(
    decision.rocks.flatMap((rock) => runtimeSpatialCellKeys(makeVolumeRockFromSolved(rock), index.cellSizeMetres))
  );
  for (const key of keys) {
    const targetIds = index.targetIdsByCell.get(key) ?? new Set<string>();
    targetIds.add(decision.targetId);
    index.targetIdsByCell.set(key, targetIds);
  }
}

function removeRuntimeSpatialDecision(index: RuntimeSpatialIndex, decision: SeedWorldRockAssemblyDecision): void {
  index.decisionsByTargetId.delete(decision.targetId);
  const keys = new Set(
    decision.rocks.flatMap((rock) => runtimeSpatialCellKeys(makeVolumeRockFromSolved(rock), index.cellSizeMetres))
  );
  for (const key of keys) {
    const targetIds = index.targetIdsByCell.get(key);
    if (!targetIds) continue;
    targetIds.delete(decision.targetId);
    if (targetIds.size === 0) index.targetIdsByCell.delete(key);
  }
}

function tryRuntimeSingleEviction(
  candidates: readonly RuntimeAssemblyCandidate[],
  accepted: Map<string, SeedWorldRockAssemblyDecision>,
  index: RuntimeSpatialIndex,
  mandatoryTargetIds: ReadonlySet<string>,
  targetById: ReadonlyMap<string, SeedWorldRockCoverageTarget>,
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions,
  state: RuntimePlannerOperationState
): Readonly<{ candidate: RuntimeAssemblyCandidate; evictedTargetId: string }> | undefined {
  for (const candidate of candidates) {
    const replaceableNeighbors = runtimeSpatialNeighborsForDecisions([candidate.decision], index)
      .filter((neighbor) => !mandatoryTargetIds.has(neighbor.targetId))
      .map((neighbor) =>
        Object.freeze({
          neighbor,
          shoulderCoverageRatio: measureSolvedTerrainCoverage(
            targetById.get(neighbor.targetId)!,
            fields,
            candidate.decision.rocks
          )
        })
      )
      .filter((entry) => entry.shoulderCoverageRatio >= RUNTIME_MINIMUM_REDUNDANT_SHOULDER_COVERAGE_RATIO)
      .sort(
        (left, right) =>
          right.shoulderCoverageRatio - left.shoulderCoverageRatio ||
          left.neighbor.targetId.localeCompare(right.neighbor.targetId)
      );
    for (const { neighbor } of replaceableNeighbors) {
      accepted.delete(neighbor.targetId);
      removeRuntimeSpatialDecision(index, neighbor);
      const conflicts = runtimeDecisionConflicts(candidate.decision, index, fields, options, state, false);
      if (!conflicts) {
        return Object.freeze({ candidate, evictedTargetId: neighbor.targetId });
      }
      accepted.set(neighbor.targetId, neighbor);
      insertRuntimeSpatialDecision(index, neighbor);
    }
  }
  return undefined;
}

function runtimeDecisionConflicts(
  candidate: SeedWorldRockAssemblyDecision,
  index: RuntimeSpatialIndex,
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions,
  state: RuntimePlannerOperationState,
  strictIntersection: boolean
): boolean {
  const neighborTargetIds = new Set<string>();
  for (const rock of candidate.rocks) {
    for (const key of runtimeSpatialCellKeys(makeVolumeRockFromSolved(rock), index.cellSizeMetres)) {
      for (const targetId of index.targetIdsByCell.get(key) ?? []) neighborTargetIds.add(targetId);
    }
  }
  const intersectingNeighbors: SeedWorldRockAssemblyDecision[] = [];
  for (const targetId of [...neighborTargetIds].sort()) {
    const neighbor = index.decisionsByTargetId.get(targetId)!;
    if (!runtimeDecisionsIntersect(candidate, neighbor, state)) continue;
    if (strictIntersection) return true;
    intersectingNeighbors.push(neighbor);
    if (state.collisionTestCount >= RUNTIME_COLLISION_TEST_LIMIT) return true;
  }
  return intersectingNeighbors.length > 0
    ? runtimeNeighborhoodVisiblyConflicts(
        [candidate, ...runtimeSpatialNeighborsForDecisions([candidate, ...intersectingNeighbors], index)],
        fields,
        options,
        state
      )
    : false;
}

function runtimeCandidateSetConflicts(
  candidates: readonly SeedWorldRockAssemblyDecision[],
  index: RuntimeSpatialIndex,
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions,
  state: RuntimePlannerOperationState,
  strictIntersection: boolean
): boolean {
  if (strictIntersection) {
    for (const candidate of candidates) {
      if (runtimeDecisionConflicts(candidate, index, fields, options, state, true)) return true;
    }
    for (let firstIndex = 0; firstIndex < candidates.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex++) {
        if (runtimeDecisionsIntersect(candidates[firstIndex]!, candidates[secondIndex]!, state)) return true;
      }
    }
    return false;
  }
  const directNeighbors = runtimeSpatialNeighborsForDecisions(candidates, index);
  const neighbors = runtimeSpatialNeighborsForDecisions([...candidates, ...directNeighbors], index);
  return runtimeNeighborhoodVisiblyConflicts([...candidates, ...neighbors], fields, options, state);
}

function runtimeSpatialNeighborsForDecisions(
  decisions: readonly SeedWorldRockAssemblyDecision[],
  index: RuntimeSpatialIndex
): readonly SeedWorldRockAssemblyDecision[] {
  const targetIds = new Set<string>();
  for (const decision of decisions) {
    for (const rock of decision.rocks) {
      for (const key of runtimeSpatialCellKeys(makeVolumeRockFromSolved(rock), index.cellSizeMetres)) {
        for (const targetId of index.targetIdsByCell.get(key) ?? []) targetIds.add(targetId);
      }
    }
  }
  return Object.freeze([...targetIds].sort().map((targetId) => index.decisionsByTargetId.get(targetId)!));
}

function runtimeDecisionsConflict(
  first: SeedWorldRockAssemblyDecision,
  second: SeedWorldRockAssemblyDecision,
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions,
  state: RuntimePlannerOperationState,
  strictIntersection: boolean
): boolean {
  if (!runtimeDecisionsIntersect(first, second, state)) return false;
  if (strictIntersection) return true;
  return runtimeNeighborhoodVisiblyConflicts([first, second], fields, options, state);
}

function runtimeNeighborhoodVisiblyConflicts(
  decisions: readonly SeedWorldRockAssemblyDecision[],
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions,
  state: RuntimePlannerOperationState
): boolean {
  for (const decision of decisions) {
    const obstacleVolumes = decisions
      .filter((candidate) => candidate.targetId !== decision.targetId)
      .flatMap((candidate) => candidate.rocks.map(makeVolumeRockFromSolved));
    if (
      decision.rocks.some(
        (rock) =>
          runtimeVisibleOverlapRatio(rock, obstacleVolumes, fields, state) >
          options.maximumCrossTargetVisibleOverlapRatio
      )
    )
      return true;
  }
  return false;
}

function runtimeDecisionsIntersect(
  first: SeedWorldRockAssemblyDecision,
  second: SeedWorldRockAssemblyDecision,
  state: RuntimePlannerOperationState
): boolean {
  for (const firstRock of first.rocks) {
    const firstVolume = makeVolumeRockFromSolved(firstRock);
    for (const secondRock of second.rocks) {
      if (state.collisionTestCount >= RUNTIME_COLLISION_TEST_LIMIT) {
        state.budgetExhausted = true;
        return true;
      }
      state.collisionTestCount++;
      if (volumeObbsIntersect(firstVolume, makeVolumeRockFromSolved(secondRock))) return true;
    }
  }
  return false;
}

function runtimeVisibleOverlapRatio(
  source: SeedWorldSolvedRockObb,
  obstacles: readonly VolumeRock[],
  fields: SeedWorldFields,
  state: RuntimePlannerOperationState
): number {
  const sourceVolume = makeVolumeRockFromSolved(source);
  let visibleSamples = 0;
  let overlappingSamples = 0;
  for (let tangentIndex = 0; tangentIndex < OBB_CONTRIBUTION_SAMPLES; tangentIndex++) {
    for (let verticalIndex = 0; verticalIndex < OBB_CONTRIBUTION_SAMPLES; verticalIndex++) {
      for (let uphillIndex = 0; uphillIndex < OBB_CONTRIBUTION_SAMPLES; uphillIndex++) {
        if (
          tangentIndex !== 0 &&
          tangentIndex !== OBB_CONTRIBUTION_SAMPLES - 1 &&
          verticalIndex !== 0 &&
          verticalIndex !== OBB_CONTRIBUTION_SAMPLES - 1 &&
          uphillIndex !== 0 &&
          uphillIndex !== OBB_CONTRIBUTION_SAMPLES - 1
        )
          continue;
        if (state.visibleOverlapSampleCount >= RUNTIME_VISIBLE_OVERLAP_SAMPLE_LIMIT) {
          state.budgetExhausted = true;
          return 1;
        }
        state.visibleOverlapSampleCount++;
        const local = Object.freeze([
          mix(-0.5, 0.5, tangentIndex / (OBB_CONTRIBUTION_SAMPLES - 1)) * source.obbSizeMetres[0],
          mix(-0.5, 0.5, verticalIndex / (OBB_CONTRIBUTION_SAMPLES - 1)) * source.obbSizeMetres[1],
          mix(-0.5, 0.5, uphillIndex / (OBB_CONTRIBUTION_SAMPLES - 1)) * source.obbSizeMetres[2]
        ] as const);
        const worldOffset = transformVector(local, sourceVolume.axes);
        const worldPoint = Object.freeze([
          source.obbCenter[0] + worldOffset[0],
          source.obbCenter[1] + worldOffset[1],
          source.obbCenter[2] + worldOffset[2]
        ] as const);
        const terrainHeight = sampleSeedWorldHeight(fields, worldPoint[0], worldPoint[2]);
        if (terrainHeight === undefined || worldPoint[1] <= terrainHeight + 1e-3) continue;
        visibleSamples++;
        if (
          obstacles.some((obstacle) =>
            pointInsideObb(worldPoint, obstacle.obbCenter, obstacle.axes, obstacle.obbSizeMetres)
          )
        )
          overlappingSamples++;
      }
    }
  }
  return overlappingSamples / Math.max(1, visibleSamples);
}

function runtimeSpatialCellKeys(rock: VolumeRock, cellSizeMetres: number): readonly string[] {
  const axes = [rock.axes.tangent, rock.axes.vertical, rock.axes.uphill] as const;
  const halfSizes = rock.obbSizeMetres.map((size) => size * 0.5);
  const extentX = axes.reduce((sum, axis, index) => sum + Math.abs(axis[0]) * halfSizes[index]!, 0);
  const extentZ = axes.reduce((sum, axis, index) => sum + Math.abs(axis[2]) * halfSizes[index]!, 0);
  const minimumX = Math.floor((rock.obbCenter[0] - extentX) / cellSizeMetres);
  const maximumX = Math.floor((rock.obbCenter[0] + extentX) / cellSizeMetres);
  const minimumZ = Math.floor((rock.obbCenter[2] - extentZ) / cellSizeMetres);
  const maximumZ = Math.floor((rock.obbCenter[2] + extentZ) / cellSizeMetres);
  const keys: string[] = [];
  for (let cellX = minimumX; cellX <= maximumX; cellX++) {
    for (let cellZ = minimumZ; cellZ <= maximumZ; cellZ++) keys.push(`${cellX}:${cellZ}`);
  }
  return Object.freeze(keys);
}

/**
 * Resolves every hill with the production local OBB constraints, then measures cross-hill visibility once.
 * This intentionally skips the expensive global repair loop and is only suitable for an explicitly
 * unaudited interactive preview; offline baking and publication must call {@link solveSeedWorldRockAssemblies}.
 */
export function previewSeedWorldRockAssemblies(
  analysis: SeedWorldRockTerrainAnalysis,
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  options: SeedWorldRockAssemblyOptions = SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS
): SeedWorldRockAssemblyCompilation {
  validateInputs(assets, options);
  const orderedAssets = assets.slice().sort((left, right) => left.id.localeCompare(right.id));
  const placementContexts = resolveTargetPlacementContexts(analysis.targets);
  const localDecisions = analysis.targets.map((target) =>
    solveTarget(target, fields, orderedAssets, options, placementContexts.get(target.id)!)
  );
  const measuredDecisions = finalizeGlobalObbContributions(localDecisions, fields, options);
  return Object.freeze({
    decisions: Object.freeze(measuredDecisions),
    rocks: Object.freeze(measuredDecisions.flatMap((decision) => decision.rocks))
  });
}

/**
 * Re-measures global visibility after the compiler removes redundant terrain targets.
 * Local transforms remain fixed so an accepted shoulder owner cannot move away from the
 * physical shoulder it was selected to cover.
 */
export function refinalizeSeedWorldRockAssemblySubset(
  decisions: readonly SeedWorldRockAssemblyDecision[],
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions = SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS
): SeedWorldRockAssemblyCompilation {
  const resolved = finalizeGlobalObbContributions(decisions, fields, options);
  return Object.freeze({
    decisions: Object.freeze(resolved),
    rocks: Object.freeze(resolved.flatMap((decision) => decision.rocks))
  });
}

function solveTargetsWithGlobalPlacementSearch(
  targets: readonly SeedWorldRockCoverageTarget[],
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  options: SeedWorldRockAssemblyOptions,
  placementContexts: ReadonlyMap<string, TargetPlacementContext>
): SeedWorldRockAssemblyDecision[] {
  const candidateCache = new Map<string, SeedWorldRockAssemblyDecision>();
  const orderedTargets = targets
    .slice()
    .sort((left, right) => rockCoveragePriority(right) - rockCoveragePriority(left) || left.id.localeCompare(right.id));
  const accepted: SeedWorldRockAssemblyDecision[] = [];
  for (const target of orderedTargets) {
    const baseContext = placementContexts.get(target.id)!;
    const baseDecision = solveTargetCached(candidateCache, target, fields, assets, options, baseContext);
    const baseTrial = finalizeGlobalObbContributions([...accepted, baseDecision], fields, options);
    if (globalTrialPasses(baseTrial, options)) {
      accepted.push(baseDecision);
      continue;
    }
    let selectedDecision = baseDecision;
    let selectedTrial = baseTrial;
    let selectedScore = scoreGlobalPlacementTrial(baseTrial, options, 0);
    const variants = globalPlacementContextVariants(baseContext);
    let candidateOrdinal = 0;
    for (const variant of variants) {
      for (const candidateOptions of [options]) {
        candidateOrdinal++;
        const decision = solveTargetCached(candidateCache, target, fields, assets, candidateOptions, variant);
        const trial = finalizeGlobalObbContributions([...accepted, decision], fields, options);
        const score = scoreGlobalPlacementTrial(trial, options, candidateOrdinal);
        if (score < selectedScore) {
          selectedDecision = decision;
          selectedTrial = trial;
          selectedScore = score;
        }
        if (globalTrialPasses(trial, options)) break;
      }
      if (globalTrialPasses(selectedTrial, options)) break;
    }
    accepted.push(selectedDecision);
    if (!globalTrialPasses(selectedTrial, options)) continue;
  }
  const repaired =
    options.mode === "auto"
      ? repairOccludedEarlierTargets(accepted, targets, fields, assets, options, placementContexts, candidateCache)
      : finalizeGlobalObbContributions(accepted, fields, options);
  const decisionByTargetId = new Map(repaired.map((decision) => [decision.targetId, decision] as const));
  return targets.map((target) => decisionByTargetId.get(target.id)!);
}

function repairOccludedEarlierTargets(
  decisions: readonly SeedWorldRockAssemblyDecision[],
  targets: readonly SeedWorldRockCoverageTarget[],
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  options: SeedWorldRockAssemblyOptions,
  placementContexts: ReadonlyMap<string, TargetPlacementContext>,
  candidateCache: Map<string, SeedWorldRockAssemblyDecision>
): SeedWorldRockAssemblyDecision[] {
  const targetById = new Map(targets.map((target) => [target.id, target] as const));
  let resolved = finalizeGlobalObbContributions(decisions, fields, options);
  for (let sweep = 0; sweep < 2 && !globalTrialPasses(resolved, options); sweep++) {
    const failingDecisions = resolved
      .filter(
        (decision) =>
          decision.violations.length > 0 &&
          decision.violations.every(
            (violation) => violation === "neighbor-overlap" || violation === "cross-target-overlap"
          )
      )
      .sort(
        (left, right) =>
          right.maximumCrossTargetVisibleOverlapRatio - left.maximumCrossTargetVisibleOverlapRatio ||
          left.minimumGlobalObbContributionRatio - right.minimumGlobalObbContributionRatio ||
          left.targetId.localeCompare(right.targetId)
      );
    const repairTargetIds = new Set(failingDecisions.map((decision) => decision.targetId));
    for (const failing of failingDecisions) {
      for (const competitor of globalOverlapCompetitors(failing, resolved)) {
        repairTargetIds.add(competitor.targetId);
      }
    }
    let improved = false;
    for (const targetId of repairTargetIds) {
      const target = targetById.get(targetId)!;
      const baseContext = placementContexts.get(targetId)!;
      const others = resolved.filter((decision) => decision.targetId !== targetId);
      let selectedTrial = finalizeGlobalObbContributions(
        [...others, resolved.find((decision) => decision.targetId === targetId)!],
        fields,
        options
      );
      let selectedScore = scoreGlobalPlacementTrial(selectedTrial, options, 0);
      const variants = [baseContext, ...globalPlacementContextVariants(baseContext)];
      for (const variant of variants) {
        for (const candidateOptions of [options]) {
          const candidate = solveTargetCached(candidateCache, target, fields, assets, candidateOptions, variant);
          const trial = finalizeGlobalObbContributions([...others, candidate], fields, options);
          const score = scoreGlobalPlacementTrial(trial, options, 0);
          if (score + 1e-9 < selectedScore) {
            selectedTrial = trial;
            selectedScore = score;
            improved = true;
          }
          if (globalTrialPasses(trial, options)) break;
        }
        if (globalTrialPasses(selectedTrial, options)) break;
      }
      resolved = selectedTrial;
      if (globalTrialPasses(resolved, options)) break;
    }
    if (!improved) break;
  }
  return resolved;
}

function solveTargetCached(
  cache: Map<string, SeedWorldRockAssemblyDecision>,
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  options: SeedWorldRockAssemblyOptions,
  context: TargetPlacementContext
): SeedWorldRockAssemblyDecision {
  const key = [
    target.id,
    options.mode,
    context.uniformScaleMultiplier,
    context.tangentOffsetRatio,
    context.downhillOffsetRatio,
    context.yawOffsetDegrees,
    context.tiltOffsetRatio,
    context.compositionMirror
  ].join(":");
  const cached = cache.get(key);
  if (cached) return cached;
  const decision = solveTarget(target, fields, assets, options, context);
  cache.set(key, decision);
  return decision;
}

function globalOverlapCompetitors(
  failing: SeedWorldRockAssemblyDecision,
  decisions: readonly SeedWorldRockAssemblyDecision[]
): readonly SeedWorldRockAssemblyDecision[] {
  const overlappingRockIds = new Set(failing.rocks.flatMap((rock) => rock.crossTargetOverlapRockIds));
  return decisions.filter(
    (candidate) =>
      candidate.targetId !== failing.targetId &&
      candidate.rocks.some(
        (candidateRock) =>
          overlappingRockIds.has(candidateRock.id) ||
          candidateRock.crossTargetOverlapRockIds.some((rockId) => failing.rocks.some((rock) => rock.id === rockId))
      )
  );
}

function globalPlacementContextVariants(base: TargetPlacementContext): readonly TargetPlacementContext[] {
  return Object.freeze(
    [
      [-0.16, 0, -4, 0, 1, 1],
      [0.16, 0, 4, 0, 1, 1],
      [0, 0, 0, 0, 1, 0.9],
      [0, 0, 0, 0, 1, 0.82],
      [-0.32, 0, -7, -0.04, 1, 1],
      [0.32, 0, 7, 0.04, 1, 1],
      [-0.48, 0, -10, -0.08, 1, 1],
      [0.48, 0, 10, 0.08, 1, 1],
      [-0.18, -0.1, -6, 0, 1, 1],
      [0.18, -0.1, 6, 0, 1, 1],
      [-0.18, 0.1, -6, 0, 1, 1],
      [0.18, 0.1, 6, 0, 1, 1]
    ].map(
      ([
        tangentOffsetDelta,
        downhillOffsetRatio,
        yawOffsetDegrees,
        tiltOffsetRatio,
        mirrorMultiplier,
        scaleMultiplier
      ]) =>
        Object.freeze({
          uniformScaleMultiplier: base.uniformScaleMultiplier * scaleMultiplier!,
          tangentOffsetRatio: clamp(base.tangentOffsetRatio + tangentOffsetDelta!, -0.68, 0.68),
          downhillOffsetRatio: base.downhillOffsetRatio + downhillOffsetRatio!,
          yawOffsetDegrees: base.yawOffsetDegrees + yawOffsetDegrees!,
          tiltOffsetRatio: base.tiltOffsetRatio + tiltOffsetRatio!,
          compositionMirror: (base.compositionMirror * mirrorMultiplier!) as -1 | 1
        })
    )
  );
}

function globalTrialPasses(
  decisions: readonly SeedWorldRockAssemblyDecision[],
  options: SeedWorldRockAssemblyOptions
): boolean {
  return decisions.every(
    (decision) =>
      decision.violations.length === 0 &&
      decision.minimumGlobalObbContributionRatio >= options.minimumGlobalObbContributionRatio &&
      decision.maximumCrossTargetVisibleOverlapRatio <= options.maximumCrossTargetVisibleOverlapRatio
  );
}

function scoreGlobalPlacementTrial(
  decisions: readonly SeedWorldRockAssemblyDecision[],
  options: SeedWorldRockAssemblyOptions,
  variantIndex: number
): number {
  const localViolations = decisions.reduce(
    (sum, decision) =>
      sum +
      decision.violations.filter(
        (violation) => violation !== "neighbor-overlap" && violation !== "cross-target-overlap"
      ).length,
    0
  );
  const visibilityDeficit = decisions.reduce(
    (sum, decision) =>
      sum + Math.max(0, options.minimumGlobalObbContributionRatio - decision.minimumGlobalObbContributionRatio),
    0
  );
  const crossTargetOverlapCount = decisions.filter(
    (decision) => decision.maximumCrossTargetVisibleOverlapRatio > options.maximumCrossTargetVisibleOverlapRatio
  ).length;
  const crossTargetOverlapExcess = decisions.reduce(
    (sum, decision) =>
      sum + Math.max(0, decision.maximumCrossTargetVisibleOverlapRatio - options.maximumCrossTargetVisibleOverlapRatio),
    0
  );
  return (
    localViolations * 10_000 +
    crossTargetOverlapCount * 8_000 +
    crossTargetOverlapExcess * 5_000 +
    visibilityDeficit * 5_000 +
    variantIndex
  );
}

function rockCoveragePriority(target: SeedWorldRockCoverageTarget): number {
  const canyonPairBonus = target.frame.canyonId && target.frame.bankSide ? 1.25 : 1;
  return target.prominenceMetres * Math.sqrt(Math.max(1, target.tangentSpanMetres)) * canyonPairBonus;
}

function resolveTargetPlacementContexts(
  targets: readonly SeedWorldRockCoverageTarget[]
): ReadonlyMap<string, TargetPlacementContext> {
  const contexts = new Map<string, TargetPlacementContext>();
  for (const target of targets) {
    const compositionMirror = resolveCompositionMirror(target);
    const structureScale = resolveStructureProximityScale(target);
    contexts.set(
      target.id,
      Object.freeze({
        uniformScaleMultiplier: structureScale,
        tangentOffsetRatio: 0,
        downhillOffsetRatio: 0,
        yawOffsetDegrees: 0,
        tiltOffsetRatio: 0,
        compositionMirror
      })
    );
  }
  return contexts;
}

function resolveCompositionMirror(target: SeedWorldRockCoverageTarget): -1 | 1 {
  if (target.frame.bankSide) return target.frame.bankSide === "left" ? 1 : -1;
  let hash = 0x811c9dc5;
  for (let index = 0; index < target.id.length; index++) {
    hash = Math.imul(hash ^ target.id.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0) % 2 === 0 ? 1 : -1;
}

function resolveStructureProximityScale(target: SeedWorldRockCoverageTarget): number {
  const anchor = target.frame.canyonAnchor;
  const halfWidthMetres = target.frame.canyonHalfWidthMetres;
  if (!anchor || halfWidthMetres === undefined) return 1;
  const distanceFromGuideMetres = Math.hypot(target.crest[0] - anchor[0], target.crest[2] - anchor[1]);
  const distanceFromBankMetres = Math.max(0, distanceFromGuideMetres - halfWidthMetres);
  const proximity = 1 - clamp(distanceFromBankMetres / Math.max(1, target.shoulderSpanMetres), 0, 1);
  return mix(0.94, 1.08, proximity);
}

function constrainPrimaryCenterToContainCrest(
  target: SeedWorldRockCoverageTarget,
  axes: PendingRock["axes"],
  size: readonly [number, number, number],
  desiredOffset: readonly [x: number, z: number]
): readonly [x: number, z: number] {
  const range = centerYRangeContainingPoint(
    target.crest,
    target.crest[0] + desiredOffset[0],
    target.crest[2] + desiredOffset[1],
    axes,
    size
  );
  if (range.minimum <= range.maximum) return desiredOffset;
  let minimumAmount = 0;
  let maximumAmount = 1;
  for (let iteration = 0; iteration < 24; iteration++) {
    const amount = (minimumAmount + maximumAmount) * 0.5;
    const candidateRange = centerYRangeContainingPoint(
      target.crest,
      target.crest[0] + desiredOffset[0] * amount,
      target.crest[2] + desiredOffset[1] * amount,
      axes,
      size
    );
    if (candidateRange.minimum <= candidateRange.maximum) minimumAmount = amount;
    else maximumAmount = amount;
  }
  return Object.freeze([desiredOffset[0] * minimumAmount, desiredOffset[1] * minimumAmount] as const);
}

function solveTarget(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  options: SeedWorldRockAssemblyOptions,
  placementContext: TargetPlacementContext
): SeedWorldRockAssemblyDecision {
  const preferredRockCount = selectRockCount(target, options.mode);
  const rockCounts = candidateRockCounts(preferredRockCount, options.mode);
  let selected: CandidateAssembly | undefined;
  let selectedRockCount = preferredRockCount;
  let bestRejected: CandidateAssembly | undefined;
  for (const rockCount of rockCounts) {
    const candidate = findBestCandidate(target, fields, assets, rockCount, options, placementContext);
    if (!bestRejected || candidate.score < bestRejected.score) bestRejected = candidate;
    if (!candidate.feasible) continue;
    selected = candidate;
    selectedRockCount = rockCount;
    break;
  }
  if (!selected?.feasible) {
    const candidate = bestRejected!;
    const candidateRocks = candidate.rocks;
    const contributions = measureIndependentPlanContributions(candidateRocks);
    const minimumContact =
      candidateRocks.length === 0 ? 0 : Math.min(...candidateRocks.map((rock) => rock.contactRatio));
    const minimumContribution = contributions.length === 0 ? 0 : Math.min(...contributions);
    const crestCovered = candidateRocks.some((rock) => rock.containsCrest);
    const connected = assemblyIsConnected(candidateRocks);
    const terrainCoverageRatio = bestRejected?.terrainCoverageRatio ?? 0;
    const crestRiseMetres = bestRejected?.crestRiseMetres ?? 0;
    const hasSupportGap = candidateRocks.some(
      (rock) =>
        rock.maximumSupportGapMetres / Math.max(1, rock.obbSizeMetres[1]) > options.maximumSupportGapThicknessRatio
    );
    const hasTailDetailDeficit = candidateRocks.some(
      (rock) => rock.tailDetailExposureRatio < rock.asset.tailDetailRevealRatio
    );
    const hasSurfaceConflict = candidateRocks.some((rock) => rock.surfaceConflictSampleCount > 0);
    const violations = Object.freeze([
      ...(minimumContact < options.minimumContactRatio ? (["contact"] as const) : []),
      ...(hasSupportGap ? (["support-gap"] as const) : []),
      ...(hasTailDetailDeficit ? (["tail-detail"] as const) : []),
      ...(hasSurfaceConflict ? (["surface-conflict"] as const) : []),
      ...(minimumContribution < options.minimumIndependentPlanContributionRatio
        ? (["independent-contribution"] as const)
        : []),
      ...(candidate.maximumMemberPlanOverlapRatio > options.maximumMemberPlanOverlapRatio
        ? (["member-overlap"] as const)
        : []),
      ...(!crestCovered ? (["crest-coverage"] as const) : []),
      ...(terrainCoverageRatio < options.minimumTerrainCoverageRatio ? (["terrain-coverage"] as const) : []),
      ...(crestRiseMetres < minimumCrestRiseMetres(target, options) ? (["crest-rise"] as const) : []),
      ...(!connected ? (["disconnected"] as const) : [])
    ]);
    return freezeResolvedCandidate(
      target,
      candidate,
      preferredRockCount,
      contributions,
      violations,
      minimumContact,
      minimumContribution,
      crestCovered,
      connected
    );
  }
  const contributions = measureIndependentPlanContributions(selected.rocks);
  const obbContributions = measureIndependentObbContributions(selected.rocks);
  const solved = selected.rocks.map((rock, index) =>
    Object.freeze({
      id: rock.id,
      role: rock.role,
      assetId: rock.asset.id,
      prototypeFamily: rock.asset.prototypeFamily,
      position: rock.position,
      obbCenter: rock.obbCenter,
      rotationQuaternion: rock.rotationQuaternion,
      obbRotationQuaternion: rock.obbRotationQuaternion,
      uniformScale: rock.uniformScale,
      obbSizeMetres: rock.obbSizeMetres,
      contactRatio: rock.contactRatio,
      insertionDepthMetres: rock.insertionDepthMetres,
      maximumSupportGapMetres: rock.maximumSupportGapMetres,
      tailDetailExposureRatio: rock.tailDetailExposureRatio,
      tailDetailRequiredExposureRatio: rock.asset.tailDetailRevealRatio,
      surfaceConflictSampleCount: rock.surfaceConflictSampleCount,
      independentPlanContributionRatio: contributions[index]!,
      globalIndependentObbContributionRatio: obbContributions[index]!,
      crossTargetVisibleOverlapRatio: 0,
      crossTargetOverlapRockIds: Object.freeze([]),
      skywardTiltDegrees: rock.skywardTiltDegrees,
      containsCrest: rock.containsCrest
    })
  );
  return freezeDecision(
    target.id,
    selectedRockCount,
    solved,
    solved.some((rock) => rock.containsCrest),
    true,
    [],
    solved.map((rock) =>
      Object.freeze({
        role: rock.role,
        contactRatio: rock.contactRatio,
        maximumSupportGapMetres: rock.maximumSupportGapMetres,
        tailDetailExposureRatio: rock.tailDetailExposureRatio,
        surfaceConflictSampleCount: rock.surfaceConflictSampleCount,
        independentPlanContributionRatio: rock.independentPlanContributionRatio,
        containsCrest: rock.containsCrest
      })
    ),
    undefined,
    undefined,
    selected.maximumMemberPlanOverlapRatio,
    selected.terrainCoverageRatio,
    selected.crestRiseMetres,
    selected.hierarchyScale
  );
}

function freezeResolvedCandidate(
  target: SeedWorldRockCoverageTarget,
  candidate: CandidateAssembly,
  requestedRockCount: 1 | 2 | 4,
  contributions: readonly number[],
  violations: SeedWorldRockAssemblyDecision["violations"],
  minimumContact: number,
  minimumContribution: number,
  crestCovered: boolean,
  connected: boolean
): SeedWorldRockAssemblyDecision {
  const obbContributions = measureIndependentObbContributions(candidate.rocks);
  const solved = candidate.rocks.map((rock, index) =>
    Object.freeze({
      id: rock.id,
      role: rock.role,
      assetId: rock.asset.id,
      prototypeFamily: rock.asset.prototypeFamily,
      position: rock.position,
      obbCenter: rock.obbCenter,
      rotationQuaternion: rock.rotationQuaternion,
      obbRotationQuaternion: rock.obbRotationQuaternion,
      uniformScale: rock.uniformScale,
      obbSizeMetres: rock.obbSizeMetres,
      contactRatio: rock.contactRatio,
      insertionDepthMetres: rock.insertionDepthMetres,
      maximumSupportGapMetres: rock.maximumSupportGapMetres,
      tailDetailExposureRatio: rock.tailDetailExposureRatio,
      tailDetailRequiredExposureRatio: rock.asset.tailDetailRevealRatio,
      surfaceConflictSampleCount: rock.surfaceConflictSampleCount,
      independentPlanContributionRatio: contributions[index]!,
      globalIndependentObbContributionRatio: obbContributions[index]!,
      crossTargetVisibleOverlapRatio: 0,
      crossTargetOverlapRockIds: Object.freeze([]),
      skywardTiltDegrees: rock.skywardTiltDegrees,
      containsCrest: rock.containsCrest
    })
  );
  return freezeDecision(
    target.id,
    requestedRockCount,
    solved,
    crestCovered,
    connected,
    violations,
    candidate.rocks.map((rock, index) => freezeMemberDiagnostic(rock, contributions[index] ?? 0)),
    minimumContact,
    minimumContribution,
    candidate.maximumMemberPlanOverlapRatio,
    candidate.terrainCoverageRatio,
    candidate.crestRiseMetres,
    candidate.hierarchyScale
  );
}

function candidateRockCounts(
  preferredRockCount: 1 | 2 | 4,
  mode: SeedWorldRockAssemblyOptions["mode"]
): readonly (1 | 2 | 4)[] {
  if (mode !== "auto") return Object.freeze([preferredRockCount]);
  return Object.freeze(
    [preferredRockCount, 4, 2, 1].filter(
      (rockCount, index, counts): rockCount is 1 | 2 | 4 => counts.indexOf(rockCount) === index
    )
  );
}

function findBestCandidate(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  rockCount: 1 | 2 | 4,
  options: SeedWorldRockAssemblyOptions,
  placementContext: TargetPlacementContext
): CandidateAssembly {
  let selected: CandidateAssembly | undefined;
  const placementVariants = [
    placementContext,
    ...[-0.16, -0.08, 0.08, 0.16].map((tiltOffsetDelta) =>
      Object.freeze({
        ...placementContext,
        tiltOffsetRatio: placementContext.tiltOffsetRatio + tiltOffsetDelta
      })
    )
  ];
  for (const placementVariant of placementVariants) {
    for (const offsetVariant of OFFSET_VARIANTS) {
      for (const scaleVariant of SCALE_VARIANTS) {
        for (const yawVariantDegrees of YAW_VARIANTS_DEGREES) {
          const candidate = makeCandidate(
            target,
            fields,
            assets,
            rockCount,
            offsetVariant,
            scaleVariant,
            yawVariantDegrees,
            options,
            placementVariant
          );
          if (
            !selected ||
            (candidate.feasible !== selected.feasible ? candidate.feasible : candidate.score < selected.score)
          ) {
            selected = candidate;
          }
        }
      }
    }
    if (selected?.feasible) break;
  }
  return selected!;
}

function makeCandidate(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  rockCount: 1 | 2 | 4,
  offsetVariant: number,
  scaleVariant: number,
  yawVariantDegrees: number,
  options: SeedWorldRockAssemblyOptions,
  placementContext: TargetPlacementContext
): CandidateAssembly {
  const hierarchyScale = resolveHierarchyScale(target, fields, options) * placementContext.uniformScaleMultiplier;
  const roles = ROLE_ORDER.slice(0, rockCount);
  const unconstrained = roles.map((role, ordinal) =>
    makeRock(
      target,
      fields,
      assets,
      ROLE_SHAPES[role],
      ordinal,
      offsetVariant,
      scaleVariant,
      yawVariantDegrees,
      options,
      placementContext.tangentOffsetRatio,
      placementContext.downhillOffsetRatio,
      placementContext.yawOffsetDegrees,
      placementContext.tiltOffsetRatio,
      placementContext.compositionMirror,
      hierarchyScale
    )
  );
  const pending = constrainAssemblyToOwningCanyonBank(target, fields, unconstrained, options);
  const contributions = measureIndependentPlanContributions(pending);
  const contactDeficit = pending.reduce(
    (sum, rock) => sum + Math.max(0, options.minimumContactRatio - rock.contactRatio),
    0
  );
  const contributionDeficit = contributions.reduce(
    (sum, contribution) => sum + Math.max(0, options.minimumIndependentPlanContributionRatio - contribution),
    0
  );
  const supportGapDeficit = pending.reduce(
    (sum, rock) =>
      sum +
      Math.max(
        0,
        rock.maximumSupportGapMetres / Math.max(1, rock.obbSizeMetres[1]) - options.maximumSupportGapThicknessRatio
      ),
    0
  );
  const tailDetailDeficit = pending.reduce(
    (sum, rock) => sum + Math.max(0, rock.asset.tailDetailRevealRatio - rock.tailDetailExposureRatio),
    0
  );
  const surfaceConflictCount = pending.reduce((sum, rock) => sum + rock.surfaceConflictSampleCount, 0);
  const maximumMemberPlanOverlapRatio = Math.max(0, ...contributions.map((contribution) => 1 - contribution));
  const memberOverlapDeficit = Math.max(0, maximumMemberPlanOverlapRatio - options.maximumMemberPlanOverlapRatio);
  const crestCovered = pending.some((rock) => rock.containsCrest);
  const connected = assemblyIsConnected(pending);
  const terrainCoverageRatio = measurePendingTerrainCoverage(target, fields, pending);
  const crestRiseMetres = measurePendingCrestRise(target, pending);
  const terrainCoverageDeficit = Math.max(0, options.minimumTerrainCoverageRatio - terrainCoverageRatio);
  const requiredCrestRiseMetres = minimumCrestRiseMetres(target, options);
  const crestRiseDeficit = Math.max(0, requiredCrestRiseMetres - crestRiseMetres) / requiredCrestRiseMetres;
  const feasible =
    contactDeficit === 0 &&
    supportGapDeficit === 0 &&
    tailDetailDeficit === 0 &&
    surfaceConflictCount === 0 &&
    contributionDeficit === 0 &&
    memberOverlapDeficit === 0 &&
    terrainCoverageDeficit === 0 &&
    crestRiseDeficit === 0 &&
    crestCovered &&
    connected;
  const targetPlanArea = Math.max(1, target.tangentSpanMetres * target.shoulderSpanMetres);
  const sizeCost =
    pending.reduce((sum, rock) => sum + rock.planHalfTangent * rock.planHalfUphill * 4, 0) / targetPlanArea;
  return Object.freeze({
    rocks: Object.freeze(pending),
    feasible,
    terrainCoverageRatio,
    crestRiseMetres,
    hierarchyScale,
    maximumMemberPlanOverlapRatio,
    score:
      contactDeficit * 1_000 +
      supportGapDeficit * 1_200 +
      tailDetailDeficit * 1_000 +
      surfaceConflictCount * 80 +
      contributionDeficit * 1_000 +
      memberOverlapDeficit * 1_000 +
      terrainCoverageDeficit * 1_200 +
      crestRiseDeficit * 1_000 +
      (crestCovered ? 0 : 500) +
      (connected ? 0 : 350) +
      sizeCost * 0.02
  });
}

function makeRock(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  assets: readonly SeedWorldRockAssetObbProfile[],
  shape: RoleShape,
  ordinal: number,
  offsetVariant: number,
  scaleVariant: number,
  yawVariantDegrees: number,
  options: SeedWorldRockAssemblyOptions,
  groupTangentOffsetRatio: number,
  groupDownhillOffsetRatio: number,
  groupYawOffsetDegrees: number,
  groupTiltOffsetRatio: number,
  compositionMirror: -1 | 1,
  hierarchyScale: number
): PendingRock {
  const requestedSize = Object.freeze([
    Math.max(8, target.tangentSpanMetres * shape.tangentRatio) * hierarchyScale,
    Math.max(8, target.prominenceMetres * shape.verticalRatio) * hierarchyScale,
    Math.max(12, target.shoulderSpanMetres * shape.uphillRatio) * hierarchyScale
  ] as const);
  const asset = selectAsset(assets, requestedSize);
  const bearing = wrapAngle(
    target.frame.uphillBearingRadians +
      degreesToRadians(shape.yawOffsetDegrees + yawVariantDegrees + groupYawOffsetDegrees)
  );
  const skywardTiltDegrees = resolveSkywardTiltDegrees(target, fields, shape, groupTiltOffsetRatio, options);
  const axes = makeAxes(bearing, degreesToRadians(skywardTiltDegrees), target.frame.shoulderTangentBearingRadians);
  const uniformScale = resolveUniformScale(asset.canonicalSizeMetres, requestedSize) * scaleVariant;
  const obbSizeMetres = Object.freeze(
    asset.canonicalSizeMetres.map((size) => size * uniformScale) as [number, number, number]
  );
  const supportOffsets = scaleSupportOffsets(asset.canonicalSupportOffsetsMetres, uniformScale);
  const detailFit = Object.freeze<AssetDetailFit>({
    detailOffsets: scaleSupportOffsets(asset.canonicalDetailOffsetsMetres, uniformScale),
    tailDetailOffsets: scaleSupportOffsets(asset.canonicalTailDetailOffsetsMetres, uniformScale),
    tailDetailRevealRatio: asset.tailDetailRevealRatio
  });
  const downhill = bearingVector(target.frame.downhillBearingRadians);
  const tangent = bearingVector(target.frame.shoulderTangentBearingRadians);
  const downhillOffsetMetres =
    target.shoulderSpanMetres * (shape.downhillOffsetRatio * offsetVariant + groupDownhillOffsetRatio);
  const tangentOffsetMetres =
    target.tangentSpanMetres * (shape.tangentOffsetRatio * compositionMirror * offsetVariant + groupTangentOffsetRatio);
  const desiredDeltaX = downhill[0] * downhillOffsetMetres + tangent[0] * tangentOffsetMetres;
  const desiredDeltaZ = downhill[1] * downhillOffsetMetres + tangent[1] * tangentOffsetMetres;
  const constrainedOffset =
    shape.role === "primary"
      ? constrainPrimaryCenterToContainCrest(target, axes, obbSizeMetres, [desiredDeltaX, desiredDeltaZ])
      : Object.freeze([desiredDeltaX, desiredDeltaZ] as const);
  const horizontal = Object.freeze({
    x: target.crest[0] + constrainedOffset[0],
    z: target.crest[2] + constrainedOffset[1]
  });
  const canonicalRotationQuaternion = quaternionFromAxes(axes.tangent, axes.vertical, axes.uphill);
  const containmentAnchor =
    shape.role === "primary"
      ? target.crest
      : Object.freeze([horizontal.x, sampleHeight(fields, horizontal.x, horizontal.z), horizontal.z] as const);
  const placement = solveObbPlacement(
    fields,
    containmentAnchor,
    horizontal.x,
    horizontal.z,
    axes,
    obbSizeMetres,
    options,
    supportOffsets,
    detailFit
  );
  const obbCenter = Object.freeze([horizontal.x, placement.obbCenterY, horizontal.z] as const);
  const canonicalCenterOffset = transformVector(
    asset.canonicalCenterMetres.map((component) => component * uniformScale) as [number, number, number],
    axes
  );
  const position = Object.freeze([
    obbCenter[0] - canonicalCenterOffset[0],
    obbCenter[1] - canonicalCenterOffset[1],
    obbCenter[2] - canonicalCenterOffset[2]
  ] as const);
  const contactRatio = measureContactRatio(fields, obbCenter, axes, obbSizeMetres, supportOffsets);
  const planHalfTangent = obbSizeMetres[0] * 0.5;
  const planHalfUphill =
    Math.abs(axes.uphill[1]) * obbSizeMetres[1] * 0.5 +
    Math.hypot(axes.uphill[0], axes.uphill[2]) * obbSizeMetres[2] * 0.5;
  return Object.freeze({
    id: `${target.id}:rock-${ordinal + 1}`,
    role: shape.role,
    asset,
    position,
    obbCenter,
    rotationQuaternion: multiplyQuaternion(canonicalRotationQuaternion, asset.assetToCanonicalQuaternion),
    obbRotationQuaternion: canonicalRotationQuaternion,
    uniformScale,
    obbSizeMetres,
    axes,
    planHalfTangent,
    planHalfUphill,
    skywardTiltDegrees,
    contactRatio,
    insertionDepthMetres: placement.insertionDepthMetres,
    maximumSupportGapMetres: placement.maximumSupportGapMetres,
    tailDetailExposureRatio: placement.tailDetailExposureRatio,
    surfaceConflictSampleCount: placement.surfaceConflictSampleCount,
    containsCrest: pointInsideObb(target.crest, obbCenter, axes, obbSizeMetres)
  });
}

function constrainAssemblyToOwningCanyonBank(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  rocks: readonly PendingRock[],
  options: SeedWorldRockAssemblyOptions
): readonly PendingRock[] {
  const anchor = target.frame.canyonAnchor;
  const outwardBearing = target.frame.canyonOutwardBearingRadians;
  const halfWidth = target.frame.canyonHalfWidthMetres;
  if (!anchor || outwardBearing === undefined || halfWidth === undefined) return rocks;
  const outward = bearingVector(outwardBearing);
  const minimumDistance = Math.min(
    ...rocks.map((rock) => (rock.obbCenter[0] - anchor[0]) * outward[0] + (rock.obbCenter[2] - anchor[1]) * outward[1])
  );
  const requiredShift = Math.max(0, halfWidth - minimumDistance);
  if (requiredShift === 0) return rocks;
  return Object.freeze(
    rocks.map((rock) =>
      translatePendingRockOnTerrain(
        target,
        fields,
        rock,
        outward[0] * requiredShift,
        outward[1] * requiredShift,
        options
      )
    )
  );
}

function translatePendingRockOnTerrain(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  rock: PendingRock,
  deltaX: number,
  deltaZ: number,
  options: SeedWorldRockAssemblyOptions
): PendingRock {
  const desiredOffset = Object.freeze([
    rock.obbCenter[0] + deltaX - target.crest[0],
    rock.obbCenter[2] + deltaZ - target.crest[2]
  ] as const);
  const constrainedOffset =
    rock.role === "primary"
      ? constrainPrimaryCenterToContainCrest(target, rock.axes, rock.obbSizeMetres, desiredOffset)
      : desiredOffset;
  const x = target.crest[0] + constrainedOffset[0];
  const z = target.crest[2] + constrainedOffset[1];
  const containmentAnchor =
    rock.role === "primary" ? target.crest : Object.freeze([x, sampleHeight(fields, x, z), z] as const);
  const placement = solveObbPlacement(
    fields,
    containmentAnchor,
    x,
    z,
    rock.axes,
    rock.obbSizeMetres,
    options,
    scaleSupportOffsets(rock.asset.canonicalSupportOffsetsMetres, rock.uniformScale),
    Object.freeze({
      detailOffsets: scaleSupportOffsets(rock.asset.canonicalDetailOffsetsMetres, rock.uniformScale),
      tailDetailOffsets: scaleSupportOffsets(rock.asset.canonicalTailDetailOffsetsMetres, rock.uniformScale),
      tailDetailRevealRatio: rock.asset.tailDetailRevealRatio
    })
  );
  const obbCenter = Object.freeze([x, placement.obbCenterY, z] as const);
  const canonicalCenterOffset = transformVector(
    rock.asset.canonicalCenterMetres.map((component) => component * rock.uniformScale) as [number, number, number],
    rock.axes
  );
  return Object.freeze({
    ...rock,
    position: Object.freeze([
      x - canonicalCenterOffset[0],
      obbCenter[1] - canonicalCenterOffset[1],
      z - canonicalCenterOffset[2]
    ] as const),
    obbCenter,
    contactRatio: measureContactRatio(
      fields,
      obbCenter,
      rock.axes,
      rock.obbSizeMetres,
      scaleSupportOffsets(rock.asset.canonicalSupportOffsetsMetres, rock.uniformScale)
    ),
    insertionDepthMetres: placement.insertionDepthMetres,
    maximumSupportGapMetres: placement.maximumSupportGapMetres,
    tailDetailExposureRatio: placement.tailDetailExposureRatio,
    surfaceConflictSampleCount: placement.surfaceConflictSampleCount,
    containsCrest: pointInsideObb(target.crest, obbCenter, rock.axes, rock.obbSizeMetres)
  });
}

function selectRockCount(target: SeedWorldRockCoverageTarget, mode: SeedWorldRockAssemblyOptions["mode"]): 1 | 2 | 4 {
  if (mode !== "auto") return mode;
  const reliefComplexity =
    target.prominenceMetres / 48 + target.shoulderSpanMetres / 180 + target.tangentSpanMetres / 220;
  if (reliefComplexity < 2.2) return 1;
  const shoulderAspectRatio = target.tangentSpanMetres / Math.max(1, target.shoulderSpanMetres);
  if (reliefComplexity < 4.3 || shoulderAspectRatio > 1.7) return 2;
  return 4;
}

function selectAsset(
  assets: readonly SeedWorldRockAssetObbProfile[],
  requestedSize: readonly [number, number, number]
): SeedWorldRockAssetObbProfile {
  return assets
    .map((asset) => {
      const scale = resolveUniformScale(asset.canonicalSizeMetres, requestedSize);
      const resolved = asset.canonicalSizeMetres.map((size) => size * scale);
      const aspectError = resolved.reduce(
        (sum, size, index) => sum + Math.abs(Math.log(Math.max(1e-6, size / requestedSize[index]!))),
        0
      );
      return Object.freeze({ asset, aspectError });
    })
    .sort((left, right) => left.aspectError - right.aspectError || left.asset.id.localeCompare(right.asset.id))[0]!
    .asset;
}

function resolveUniformScale(
  sourceSize: readonly [number, number, number],
  requestedSize: readonly [number, number, number]
): number {
  return Math.max(...requestedSize.map((size, index) => size / sourceSize[index]!));
}

function scaleSupportOffsets(offsets: readonly Vector3Tuple[], uniformScale: number): readonly Vector3Tuple[] {
  return Object.freeze(
    offsets.map((offset) =>
      Object.freeze(offset.map((component) => component * uniformScale) as [number, number, number])
    )
  );
}

function resolveSkywardTiltDegrees(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  shape: RoleShape,
  groupTiltOffsetRatio: number,
  options: SeedWorldRockAssemblyOptions
): number {
  const hierarchyScale = resolveHierarchyScale(target, fields, options);
  const hierarchyRatio =
    options.outerUniformScaleGain <= 1e-9 ? 0 : clamp((hierarchyScale - 1) / options.outerUniformScaleGain, 0, 1);
  const meanShoulderSlopeDegrees = radiansToDegrees(
    Math.atan2(target.prominenceMetres, Math.max(1, target.shoulderSpanMetres))
  );
  const fittedTerrainSlopeDegrees = mix(meanShoulderSlopeDegrees, target.frame.maximumSlopeDegrees, 0.55);
  const availableRangeDegrees = options.maximumSkywardTiltDegrees - options.minimumSkywardTiltDegrees;
  const hierarchyLiftDegrees = hierarchyRatio * availableRangeDegrees * 0.08;
  const stableVariationDegrees =
    signedUnitHash(fields.rootSeed, `${target.id}:${shape.role}:skyward-tilt`) * availableRangeDegrees * 0.22;
  const globalVisibilityRecoveryDegrees = groupTiltOffsetRatio * availableRangeDegrees;
  return clamp(
    fittedTerrainSlopeDegrees +
      hierarchyLiftDegrees +
      shape.tiltOffsetDegrees +
      stableVariationDegrees +
      globalVisibilityRecoveryDegrees,
    options.minimumSkywardTiltDegrees,
    options.maximumSkywardTiltDegrees
  );
}

function signedUnitHash(seed: number, key: string): number {
  let hash = (seed ^ 0x9e37_79b9) >>> 0;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x85eb_ca6b) >>> 0;
    hash ^= hash >>> 13;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb_352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846c_a68b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return (hash / 0xffff_ffff) * 2 - 1;
}

function makeAxes(
  uphillBearing: number,
  pitchRadians: number,
  signedTangentBearing: number
): Readonly<{ tangent: Vector3Tuple; vertical: Vector3Tuple; uphill: Vector3Tuple }> {
  const horizontalUphill = bearingVector(uphillBearing);
  const uphill = normalize3([
    horizontalUphill[0] * Math.cos(pitchRadians),
    Math.sin(pitchRadians),
    horizontalUphill[1] * Math.cos(pitchRadians)
  ]);
  const requestedTangent = bearingVector(signedTangentBearing);
  let tangent = normalize3([requestedTangent[0], 0, requestedTangent[1]]);
  let vertical = normalize3(cross(uphill, tangent));
  if (vertical[1] < 0) {
    tangent = Object.freeze([-tangent[0], -tangent[1], -tangent[2]] as const);
    vertical = normalize3(cross(uphill, tangent));
  }
  tangent = normalize3(cross(vertical, uphill));
  return Object.freeze({ tangent, vertical, uphill });
}

function solveObbPlacement(
  fields: SeedWorldFields,
  crest: Vector3Tuple,
  worldX: number,
  worldZ: number,
  axes: PendingRock["axes"],
  size: readonly [number, number, number],
  options: SeedWorldRockAssemblyOptions,
  supportOffsets: readonly Vector3Tuple[] = rootSupportOffsets(size),
  detailFit?: AssetDetailFit
): SeedWorldRockObbPlacementFit {
  const rotatedSupports = supportOffsets.map((offset) => transformVector(offset, axes));
  const rootThresholds = rotatedSupports.map((rotated) => {
    return sampleHeight(fields, worldX + rotated[0], worldZ + rotated[2]) - rotated[1];
  });
  rootThresholds.sort((left, right) => left - right);
  const requiredContactCount = Math.min(
    rootThresholds.length,
    Math.max(1, Math.ceil(rootThresholds.length * options.minimumContactRatio))
  );
  const rootSurfaceCenterY = rootThresholds[rootThresholds.length - requiredContactCount]!;
  const minimumInsertionDepthMetres = Math.max(0.75, size[1] * options.minimumInsertionDepthThicknessRatio);
  const preferredInsertionDepthMetres = Math.max(
    minimumInsertionDepthMetres,
    size[1] * options.preferredInsertionDepthThicknessRatio
  );
  const maximumInsertionDepthMetres = Math.max(
    preferredInsertionDepthMetres,
    size[1] * options.maximumInsertionDepthThicknessRatio
  );
  const minimumAllowedCenterY = rootSurfaceCenterY - maximumInsertionDepthMetres;
  const maximumAllowedCenterY = rootSurfaceCenterY - minimumInsertionDepthMetres;
  const preferredCenterY = rootSurfaceCenterY - preferredInsertionDepthMetres;
  const crestRange = centerYRangeContainingPoint(crest, worldX, worldZ, axes, size);
  const feasibleMinimumCenterY = Math.max(minimumAllowedCenterY, crestRange.minimum);
  const feasibleMaximumCenterY = Math.min(maximumAllowedCenterY, crestRange.maximum);
  const baseCenterY =
    feasibleMinimumCenterY <= feasibleMaximumCenterY
      ? clamp(preferredCenterY, feasibleMinimumCenterY, feasibleMaximumCenterY)
      : crestRange.minimum > maximumAllowedCenterY
        ? maximumAllowedCenterY
        : crestRange.maximum < minimumAllowedCenterY
          ? minimumAllowedCenterY
          : clamp(preferredCenterY, minimumAllowedCenterY, maximumAllowedCenterY);
  const detailClearanceMetres = Math.max(1.25, size[1] * options.surfaceConflictClearanceThicknessRatio);
  const verticalCandidates = [baseCenterY, feasibleMinimumCenterY, feasibleMaximumCenterY];
  if (detailFit && feasibleMinimumCenterY <= feasibleMaximumCenterY) {
    const tailThresholds = detailFit.tailDetailOffsets.map((offset) => {
      const rotated = transformVector(offset, axes);
      return (
        sampleHeight(fields, worldX + rotated[0], worldZ + rotated[2]) -
        rotated[1] +
        detailFit.tailDetailRevealRatio * size[1]
      );
    });
    if (tailThresholds.length > 0) {
      tailThresholds.sort((left, right) => left - right);
      verticalCandidates.push(tailThresholds[Math.floor(tailThresholds.length * 0.5)]!);
    }
    for (const offset of detailFit.detailOffsets) {
      const rotated = transformVector(offset, axes);
      const terrain = sampleHeight(fields, worldX + rotated[0], worldZ + rotated[2]);
      verticalCandidates.push(
        terrain - rotated[1] - detailClearanceMetres,
        terrain - rotated[1] + detailClearanceMetres
      );
    }
  }
  const candidateBounds =
    feasibleMinimumCenterY <= feasibleMaximumCenterY
      ? Object.freeze({ minimum: feasibleMinimumCenterY, maximum: feasibleMaximumCenterY })
      : Object.freeze({ minimum: minimumAllowedCenterY, maximum: maximumAllowedCenterY });
  const obbCenterY = [
    ...new Set(verticalCandidates.map((value) => clamp(value, candidateBounds.minimum, candidateBounds.maximum)))
  ]
    .map((centerY) => ({
      centerY,
      metrics: measurePlacementSurfaceMetrics(
        fields,
        worldX,
        worldZ,
        centerY,
        axes,
        size,
        options,
        rotatedSupports,
        detailFit,
        detailClearanceMetres
      )
    }))
    .sort(
      (left, right) =>
        placementSurfaceScore(left.metrics, detailFit, size, options) -
          placementSurfaceScore(right.metrics, detailFit, size, options) ||
        Math.abs(left.centerY - preferredCenterY) - Math.abs(right.centerY - preferredCenterY) ||
        left.centerY - right.centerY
    )[0]!.centerY;
  const insertionDepthMetres = rootSurfaceCenterY - obbCenterY;
  const maximumAdditionalBurialMetres = Math.max(
    0,
    Math.min(maximumInsertionDepthMetres - insertionDepthMetres, obbCenterY - crestRange.minimum)
  );
  const metrics = measurePlacementSurfaceMetrics(
    fields,
    worldX,
    worldZ,
    obbCenterY,
    axes,
    size,
    options,
    rotatedSupports,
    detailFit,
    detailClearanceMetres
  );
  return Object.freeze({
    obbCenterY,
    insertionDepthMetres,
    minimumInsertionDepthMetres,
    maximumInsertionDepthMetres,
    maximumAdditionalBurialMetres,
    maximumSupportGapMetres: metrics.maximumSupportGapMetres,
    tailDetailExposureRatio: metrics.tailDetailExposureRatio,
    surfaceConflictSampleCount: metrics.surfaceConflictSampleCount
  });
}

interface PlacementSurfaceMetrics {
  readonly contactRatio: number;
  readonly maximumSupportGapMetres: number;
  readonly tailDetailExposureRatio: number;
  readonly surfaceConflictSampleCount: number;
}

function measurePlacementSurfaceMetrics(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  centerY: number,
  axes: PendingRock["axes"],
  size: readonly [number, number, number],
  options: SeedWorldRockAssemblyOptions,
  rotatedSupports: readonly Vector3Tuple[],
  detailFit: AssetDetailFit | undefined,
  detailClearanceMetres: number
): PlacementSurfaceMetrics {
  const contactToleranceMetres = Math.max(1.5, size[1] * 0.025);
  const supportGaps = rotatedSupports.map(
    (rotated) => centerY + rotated[1] - sampleHeight(fields, worldX + rotated[0], worldZ + rotated[2])
  );
  const orderedSupportGaps = supportGaps.slice().sort((left, right) => left - right);
  const requiredContactCount = Math.min(
    orderedSupportGaps.length,
    Math.max(1, Math.ceil(orderedSupportGaps.length * options.minimumContactRatio))
  );
  const maximumRequiredSupportGapMetres = Math.max(0, orderedSupportGaps[requiredContactCount - 1] ?? 0);
  const contactRatio =
    supportGaps.filter((gap) => gap <= contactToleranceMetres).length / Math.max(1, supportGaps.length);
  if (!detailFit) {
    return Object.freeze({
      contactRatio,
      maximumSupportGapMetres: maximumRequiredSupportGapMetres,
      tailDetailExposureRatio: 1,
      surfaceConflictSampleCount: 0
    });
  }
  const detailExposures = detailFit.detailOffsets.map((offset) => {
    const rotated = transformVector(offset, axes);
    return centerY + rotated[1] - sampleHeight(fields, worldX + rotated[0], worldZ + rotated[2]);
  });
  const tailExposures = detailFit.tailDetailOffsets
    .map((offset) => {
      const rotated = transformVector(offset, axes);
      return centerY + rotated[1] - sampleHeight(fields, worldX + rotated[0], worldZ + rotated[2]);
    })
    .sort((left, right) => left - right);
  return Object.freeze({
    contactRatio,
    maximumSupportGapMetres: maximumRequiredSupportGapMetres,
    tailDetailExposureRatio:
      tailExposures.length === 0 ? 1 : tailExposures[Math.floor(tailExposures.length * 0.5)]! / Math.max(1, size[1]),
    surfaceConflictSampleCount: detailExposures.filter((exposure) => Math.abs(exposure) < detailClearanceMetres).length
  });
}

function placementSurfaceScore(
  metrics: PlacementSurfaceMetrics,
  detailFit: AssetDetailFit | undefined,
  size: readonly [number, number, number],
  options: SeedWorldRockAssemblyOptions
): number {
  const contactDeficit = Math.max(0, options.minimumContactRatio - metrics.contactRatio);
  const supportGapDeficit = Math.max(
    0,
    metrics.maximumSupportGapMetres / Math.max(1, size[1]) - options.maximumSupportGapThicknessRatio
  );
  const tailDeficit = detailFit ? Math.max(0, detailFit.tailDetailRevealRatio - metrics.tailDetailExposureRatio) : 0;
  return (
    contactDeficit * 4_000 + supportGapDeficit * 4_000 + tailDeficit * 3_000 + metrics.surfaceConflictSampleCount * 250
  );
}

function measureContactRatio(
  fields: SeedWorldFields,
  position: Vector3Tuple,
  axes: PendingRock["axes"],
  size: readonly [number, number, number],
  supportOffsets: readonly Vector3Tuple[] = rootSupportOffsets(size)
): number {
  const toleranceMetres = Math.max(1.5, size[1] * 0.025);
  const contacts = supportOffsets.filter((offset) => {
    const rotated = transformVector(offset, axes);
    const terrain = sampleHeight(fields, position[0] + rotated[0], position[2] + rotated[2]);
    return position[1] + rotated[1] <= terrain + toleranceMetres;
  }).length;
  return contacts / supportOffsets.length;
}

function rootSupportOffsets(size: readonly [number, number, number]): Vector3Tuple[] {
  const offsets: Vector3Tuple[] = [];
  for (let tangentIndex = 0; tangentIndex < SUPPORT_GRID_SIZE; tangentIndex++) {
    for (let uphillIndex = 0; uphillIndex < SUPPORT_GRID_SIZE; uphillIndex++) {
      offsets.push(
        Object.freeze([
          mix(-0.5, 0.5, tangentIndex / (SUPPORT_GRID_SIZE - 1)) * size[0],
          -size[1] * 0.5,
          mix(-0.5, -0.45, uphillIndex / (SUPPORT_GRID_SIZE - 1)) * size[2]
        ] as const)
      );
    }
  }
  return offsets;
}

function centerYRangeContainingPoint(
  point: Vector3Tuple,
  worldX: number,
  worldZ: number,
  axes: PendingRock["axes"],
  size: readonly [number, number, number]
): Readonly<{ minimum: number; maximum: number }> {
  let minimum = Number.NEGATIVE_INFINITY;
  let maximum = Number.POSITIVE_INFINITY;
  const horizontalDeltaX = point[0] - worldX;
  const horizontalDeltaZ = point[2] - worldZ;
  const axisEntries = [
    [axes.tangent, size[0] * 0.5],
    [axes.vertical, size[1] * 0.5],
    [axes.uphill, size[2] * 0.5]
  ] as const;
  for (const [axis, halfExtent] of axisEntries) {
    const base = horizontalDeltaX * axis[0] + point[1] * axis[1] + horizontalDeltaZ * axis[2];
    if (Math.abs(axis[1]) < 1e-9) {
      if (Math.abs(base) > halfExtent) return Object.freeze({ minimum: 1, maximum: 0 });
      continue;
    }
    const first = (base - halfExtent) / axis[1];
    const second = (base + halfExtent) / axis[1];
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
  }
  return Object.freeze({ minimum, maximum });
}

function measureIndependentPlanContributions(rocks: readonly PlanRock[]): number[] {
  return rocks.map((rock, rockIndex) => {
    let samples = 0;
    let independent = 0;
    for (let tangentIndex = 0; tangentIndex < PLAN_CONTRIBUTION_SAMPLES; tangentIndex++) {
      for (let uphillIndex = 0; uphillIndex < PLAN_CONTRIBUTION_SAMPLES; uphillIndex++) {
        const tangentAmount = mix(-1, 1, tangentIndex / (PLAN_CONTRIBUTION_SAMPLES - 1));
        const uphillAmount = mix(-1, 1, uphillIndex / (PLAN_CONTRIBUTION_SAMPLES - 1));
        if (tangentAmount * tangentAmount + uphillAmount * uphillAmount > 1.12) continue;
        const worldX =
          rock.obbCenter[0] +
          rock.axes.tangent[0] * tangentAmount * rock.planHalfTangent +
          rock.axes.uphill[0] * uphillAmount * rock.planHalfUphill;
        const worldZ =
          rock.obbCenter[2] +
          rock.axes.tangent[2] * tangentAmount * rock.planHalfTangent +
          rock.axes.uphill[2] * uphillAmount * rock.planHalfUphill;
        samples++;
        if (
          rocks.every((other, otherIndex) => otherIndex === rockIndex || !pointInsidePlanObb(worldX, worldZ, other))
        ) {
          independent++;
        }
      }
    }
    return independent / Math.max(1, samples);
  });
}

function measureIndependentObbContributions(rocks: readonly VolumeRock[]): number[] {
  return rocks.map((rock, rockIndex) => {
    const possibleOccluders = rocks.filter(
      (other, otherIndex) => otherIndex !== rockIndex && volumeBoundingSpheresOverlap(rock, other)
    );
    let samples = 0;
    let independent = 0;
    for (let tangentIndex = 0; tangentIndex < OBB_CONTRIBUTION_SAMPLES; tangentIndex++) {
      for (let verticalIndex = 0; verticalIndex < OBB_CONTRIBUTION_SAMPLES; verticalIndex++) {
        for (let uphillIndex = 0; uphillIndex < OBB_CONTRIBUTION_SAMPLES; uphillIndex++) {
          if (
            tangentIndex !== 0 &&
            tangentIndex !== OBB_CONTRIBUTION_SAMPLES - 1 &&
            verticalIndex !== 0 &&
            verticalIndex !== OBB_CONTRIBUTION_SAMPLES - 1 &&
            uphillIndex !== 0 &&
            uphillIndex !== OBB_CONTRIBUTION_SAMPLES - 1
          ) {
            continue;
          }
          const local = Object.freeze([
            mix(-0.5, 0.5, tangentIndex / (OBB_CONTRIBUTION_SAMPLES - 1)) * rock.obbSizeMetres[0],
            mix(-0.5, 0.5, verticalIndex / (OBB_CONTRIBUTION_SAMPLES - 1)) * rock.obbSizeMetres[1],
            mix(-0.5, 0.5, uphillIndex / (OBB_CONTRIBUTION_SAMPLES - 1)) * rock.obbSizeMetres[2]
          ] as const);
          const worldOffset = transformVector(local, rock.axes);
          const worldPoint = Object.freeze([
            rock.obbCenter[0] + worldOffset[0],
            rock.obbCenter[1] + worldOffset[1],
            rock.obbCenter[2] + worldOffset[2]
          ] as const);
          samples++;
          if (
            possibleOccluders.every(
              (other) => !pointInsideObb(worldPoint, other.obbCenter, other.axes, other.obbSizeMetres)
            )
          ) {
            independent++;
          }
        }
      }
    }
    return independent / Math.max(1, samples);
  });
}

function measureCrossTargetVisibleOverlapEvidence(
  rocks: readonly SeedWorldSolvedRockObb[],
  targetIdByRockId: ReadonlyMap<string, string>,
  fields: SeedWorldFields
): ReadonlyMap<string, CrossTargetVisibleOverlapEvidence> {
  const volumeByRockId = new Map(rocks.map((rock) => [rock.id, makeVolumeRockFromSolved(rock)] as const));
  return new Map(
    rocks.map((rock) => {
      const owningTargetId = targetIdByRockId.get(rock.id)!;
      const sourceVolume = volumeByRockId.get(rock.id)!;
      const broadPhaseCompetitors = rocks.filter(
        (candidate) =>
          targetIdByRockId.get(candidate.id) !== owningTargetId &&
          volumeBoundingSpheresOverlap(sourceVolume, volumeByRockId.get(candidate.id)!)
      );
      const competitors = broadPhaseCompetitors.filter((candidate) =>
        volumeObbsIntersect(sourceVolume, volumeByRockId.get(candidate.id)!)
      );
      const overlappingRockIds = new Set(competitors.map((candidate) => candidate.id));
      let visibleSamples = 0;
      let overlappingSamples = 0;
      for (let tangentIndex = 0; tangentIndex < OBB_CONTRIBUTION_SAMPLES; tangentIndex++) {
        for (let verticalIndex = 0; verticalIndex < OBB_CONTRIBUTION_SAMPLES; verticalIndex++) {
          for (let uphillIndex = 0; uphillIndex < OBB_CONTRIBUTION_SAMPLES; uphillIndex++) {
            if (
              tangentIndex !== 0 &&
              tangentIndex !== OBB_CONTRIBUTION_SAMPLES - 1 &&
              verticalIndex !== 0 &&
              verticalIndex !== OBB_CONTRIBUTION_SAMPLES - 1 &&
              uphillIndex !== 0 &&
              uphillIndex !== OBB_CONTRIBUTION_SAMPLES - 1
            ) {
              continue;
            }
            const local = Object.freeze([
              mix(-0.5, 0.5, tangentIndex / (OBB_CONTRIBUTION_SAMPLES - 1)) * rock.obbSizeMetres[0],
              mix(-0.5, 0.5, verticalIndex / (OBB_CONTRIBUTION_SAMPLES - 1)) * rock.obbSizeMetres[1],
              mix(-0.5, 0.5, uphillIndex / (OBB_CONTRIBUTION_SAMPLES - 1)) * rock.obbSizeMetres[2]
            ] as const);
            const worldOffset = transformVector(local, sourceVolume.axes);
            const worldPoint = Object.freeze([
              rock.obbCenter[0] + worldOffset[0],
              rock.obbCenter[1] + worldOffset[1],
              rock.obbCenter[2] + worldOffset[2]
            ] as const);
            const terrainHeight = sampleSeedWorldHeight(fields, worldPoint[0], worldPoint[2]);
            if (terrainHeight === undefined || worldPoint[1] <= terrainHeight + 1e-3) continue;
            visibleSamples++;
            const overlappingCompetitors = competitors.filter((candidate) => {
              const volume = volumeByRockId.get(candidate.id)!;
              return pointInsideObb(worldPoint, volume.obbCenter, volume.axes, volume.obbSizeMetres);
            });
            if (overlappingCompetitors.length === 0) continue;
            overlappingSamples++;
            for (const competitor of overlappingCompetitors) overlappingRockIds.add(competitor.id);
          }
        }
      }
      return [
        rock.id,
        Object.freeze({
          ratio: overlappingSamples / Math.max(1, visibleSamples),
          rockIds: Object.freeze([...overlappingRockIds].sort())
        })
      ] as const;
    })
  );
}

function volumeBoundingSpheresOverlap(first: VolumeRock, second: VolumeRock): boolean {
  const centreDistanceSquared =
    (first.obbCenter[0] - second.obbCenter[0]) ** 2 +
    (first.obbCenter[1] - second.obbCenter[1]) ** 2 +
    (first.obbCenter[2] - second.obbCenter[2]) ** 2;
  const combinedRadius = volumeBoundingRadius(first) + volumeBoundingRadius(second);
  return centreDistanceSquared <= combinedRadius * combinedRadius;
}

function volumeObbsIntersect(first: VolumeRock, second: VolumeRock): boolean {
  const firstAxes = [first.axes.tangent, first.axes.vertical, first.axes.uphill] as const;
  const secondAxes = [second.axes.tangent, second.axes.vertical, second.axes.uphill] as const;
  const firstHalfSize = first.obbSizeMetres.map((size) => size * 0.5);
  const secondHalfSize = second.obbSizeMetres.map((size) => size * 0.5);
  const centerOffset = Object.freeze([
    second.obbCenter[0] - first.obbCenter[0],
    second.obbCenter[1] - first.obbCenter[1],
    second.obbCenter[2] - first.obbCenter[2]
  ] as const);
  const rotation = firstAxes.map((firstAxis) => secondAxes.map((secondAxis) => dot3(firstAxis, secondAxis)));
  const absoluteRotation = rotation.map((row) => row.map((value) => Math.abs(value) + 1e-8));
  const translatedCenter = firstAxes.map((axis) => dot3(centerOffset, axis));

  for (let firstAxis = 0; firstAxis < 3; firstAxis++) {
    const firstRadius = firstHalfSize[firstAxis]!;
    const secondRadius = secondHalfSize.reduce(
      (sum, halfSize, secondAxis) => sum + halfSize * absoluteRotation[firstAxis]![secondAxis]!,
      0
    );
    if (Math.abs(translatedCenter[firstAxis]!) > firstRadius + secondRadius) return false;
  }
  for (let secondAxis = 0; secondAxis < 3; secondAxis++) {
    const firstRadius = firstHalfSize.reduce(
      (sum, halfSize, firstAxis) => sum + halfSize * absoluteRotation[firstAxis]![secondAxis]!,
      0
    );
    const secondRadius = secondHalfSize[secondAxis]!;
    const distance = Math.abs(
      translatedCenter.reduce((sum, translated, firstAxis) => sum + translated * rotation[firstAxis]![secondAxis]!, 0)
    );
    if (distance > firstRadius + secondRadius) return false;
  }
  for (let firstAxis = 0; firstAxis < 3; firstAxis++) {
    for (let secondAxis = 0; secondAxis < 3; secondAxis++) {
      const firstOther = (firstAxis + 1) % 3;
      const firstRemaining = (firstAxis + 2) % 3;
      const secondOther = (secondAxis + 1) % 3;
      const secondRemaining = (secondAxis + 2) % 3;
      const firstRadius =
        firstHalfSize[firstOther]! * absoluteRotation[firstRemaining]![secondAxis]! +
        firstHalfSize[firstRemaining]! * absoluteRotation[firstOther]![secondAxis]!;
      const secondRadius =
        secondHalfSize[secondOther]! * absoluteRotation[firstAxis]![secondRemaining]! +
        secondHalfSize[secondRemaining]! * absoluteRotation[firstAxis]![secondOther]!;
      const distance = Math.abs(
        translatedCenter[firstRemaining]! * rotation[firstOther]![secondAxis]! -
          translatedCenter[firstOther]! * rotation[firstRemaining]![secondAxis]!
      );
      if (distance > firstRadius + secondRadius) return false;
    }
  }
  return true;
}

function volumeBoundingRadius(rock: VolumeRock): number {
  return Math.hypot(...rock.obbSizeMetres) * 0.5;
}

function assemblyIsConnected(rocks: readonly PendingRock[]): boolean {
  if (rocks.length === 1) return true;
  const connected = new Set<number>([0]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let first = 0; first < rocks.length; first++) {
      if (!connected.has(first)) continue;
      for (let second = 0; second < rocks.length; second++) {
        if (connected.has(second)) continue;
        if (planObbsOverlap(rocks[first]!, rocks[second]!)) {
          connected.add(second);
          changed = true;
        }
      }
    }
  }
  return connected.size === rocks.length;
}

function planObbsOverlap(first: PendingRock, second: PendingRock): boolean {
  const points = [
    [first.obbCenter[0], first.obbCenter[2]],
    [second.obbCenter[0], second.obbCenter[2]],
    ...planCorners(first),
    ...planCorners(second)
  ] as const;
  return points.some(
    ([x, z], index) =>
      (index === 0 && pointInsidePlanObb(x, z, second)) ||
      (index === 1 && pointInsidePlanObb(x, z, first)) ||
      (index >= 2 && pointInsidePlanObb(x, z, first) && pointInsidePlanObb(x, z, second))
  );
}

function planCorners(rock: PlanRock): readonly (readonly [number, number])[] {
  const uphill = planUphillDirection(rock);
  return Object.freeze(
    [-1, 1].flatMap((tangentSign) =>
      [-1, 1].map((uphillSign) =>
        Object.freeze([
          rock.obbCenter[0] +
            rock.axes.tangent[0] * tangentSign * rock.planHalfTangent +
            uphill[0] * uphillSign * rock.planHalfUphill,
          rock.obbCenter[2] +
            rock.axes.tangent[2] * tangentSign * rock.planHalfTangent +
            uphill[1] * uphillSign * rock.planHalfUphill
        ] as const)
      )
    )
  );
}

function pointInsidePlanObb(worldX: number, worldZ: number, rock: PlanRock): boolean {
  const deltaX = worldX - rock.obbCenter[0];
  const deltaZ = worldZ - rock.obbCenter[2];
  const tangent = deltaX * rock.axes.tangent[0] + deltaZ * rock.axes.tangent[2];
  const uphillDirection = planUphillDirection(rock);
  const uphill = deltaX * uphillDirection[0] + deltaZ * uphillDirection[1];
  return Math.abs(tangent) <= rock.planHalfTangent && Math.abs(uphill) <= rock.planHalfUphill;
}

function planUphillDirection(rock: PlanRock): readonly [number, number] {
  const length = Math.hypot(rock.axes.uphill[0], rock.axes.uphill[2]);
  return Object.freeze([rock.axes.uphill[0] / length, rock.axes.uphill[2] / length] as const);
}

function makePlanRockFromSolved(rock: SeedWorldSolvedRockObb): PlanRock {
  const tangent = rotateVectorByQuaternion([1, 0, 0], rock.obbRotationQuaternion);
  const vertical = rotateVectorByQuaternion([0, 1, 0], rock.obbRotationQuaternion);
  const uphill = rotateVectorByQuaternion([0, 0, 1], rock.obbRotationQuaternion);
  return Object.freeze({
    obbCenter: rock.obbCenter,
    axes: Object.freeze({ tangent, vertical, uphill }),
    planHalfTangent: rock.obbSizeMetres[0] * 0.5,
    planHalfUphill:
      Math.abs(uphill[1]) * rock.obbSizeMetres[1] * 0.5 + Math.hypot(uphill[0], uphill[2]) * rock.obbSizeMetres[2] * 0.5
  });
}

function makeVolumeRockFromSolved(rock: SeedWorldSolvedRockObb): VolumeRock {
  return Object.freeze({
    obbCenter: rock.obbCenter,
    axes: Object.freeze({
      tangent: rotateVectorByQuaternion([1, 0, 0], rock.obbRotationQuaternion),
      vertical: rotateVectorByQuaternion([0, 1, 0], rock.obbRotationQuaternion),
      uphill: rotateVectorByQuaternion([0, 0, 1], rock.obbRotationQuaternion)
    }),
    obbSizeMetres: rock.obbSizeMetres
  });
}

function pointInsideObb(
  point: Vector3Tuple,
  center: Vector3Tuple,
  axes: PendingRock["axes"],
  size: readonly [number, number, number]
): boolean {
  const delta = Object.freeze([point[0] - center[0], point[1] - center[1], point[2] - center[2]] as const);
  return (
    Math.abs(dot3(delta, axes.tangent)) <= size[0] * 0.5 + 1e-6 &&
    Math.abs(dot3(delta, axes.vertical)) <= size[1] * 0.5 + 1e-6 &&
    Math.abs(dot3(delta, axes.uphill)) <= size[2] * 0.5 + 1e-6
  );
}

function pointInsideSolvedObb(point: Vector3Tuple, rock: SeedWorldSolvedRockObb): boolean {
  const delta = Object.freeze([
    point[0] - rock.obbCenter[0],
    point[1] - rock.obbCenter[1],
    point[2] - rock.obbCenter[2]
  ] as const);
  const local = rotateVectorByQuaternionConjugate(delta, rock.obbRotationQuaternion);
  return rock.obbSizeMetres.every((size, index) => Math.abs(local[index]!) <= size * 0.5 + 1e-6);
}

function measurePendingTerrainCoverage(
  target: SeedWorldRockCoverageTarget,
  _fields: SeedWorldFields,
  rocks: readonly PendingRock[]
): number {
  const samples = makeTerrainCoveragePlanSamples(target);
  const covered = samples.filter(([worldX, worldZ]) =>
    rocks.some((rock) => pointInsidePlanObb(worldX, worldZ, rock))
  ).length;
  return covered / samples.length;
}

function measureSolvedTerrainCoverage(
  target: SeedWorldRockCoverageTarget,
  _fields: SeedWorldFields,
  rocks: readonly SeedWorldSolvedRockObb[]
): number {
  const planRocks = rocks.map(makePlanRockFromSolved);
  const samples = makeTerrainCoveragePlanSamples(target);
  const covered = samples.filter(([worldX, worldZ]) =>
    planRocks.some((rock) => pointInsidePlanObb(worldX, worldZ, rock))
  ).length;
  return covered / samples.length;
}

function makeTerrainCoveragePlanSamples(
  target: SeedWorldRockCoverageTarget
): readonly (readonly [x: number, z: number])[] {
  return Object.freeze(
    target.rockPlanShoulder.sampleOffsets.map((offset) =>
      Object.freeze([target.crest[0] + offset[0], target.crest[2] + offset[1]] as const)
    )
  );
}

function measurePendingCrestRise(target: SeedWorldRockCoverageTarget, rocks: readonly PendingRock[]): number {
  return Math.max(
    0,
    ...rocks.map((rock) => highestObbY(rock.obbCenter, rock.axes, rock.obbSizeMetres) - target.crest[1])
  );
}

function measureSolvedCrestRise(target: SeedWorldRockCoverageTarget, rocks: readonly SeedWorldSolvedRockObb[]): number {
  return Math.max(
    0,
    ...rocks.map((rock) => {
      const axes = Object.freeze({
        tangent: rotateVectorByQuaternion([1, 0, 0], rock.obbRotationQuaternion),
        vertical: rotateVectorByQuaternion([0, 1, 0], rock.obbRotationQuaternion),
        uphill: rotateVectorByQuaternion([0, 0, 1], rock.obbRotationQuaternion)
      });
      return highestObbY(rock.obbCenter, axes, rock.obbSizeMetres) - target.crest[1];
    })
  );
}

function highestObbY(center: Vector3Tuple, axes: PendingRock["axes"], size: readonly [number, number, number]): number {
  return (
    center[1] +
    Math.abs(axes.tangent[1]) * size[0] * 0.5 +
    Math.abs(axes.vertical[1]) * size[1] * 0.5 +
    Math.abs(axes.uphill[1]) * size[2] * 0.5
  );
}

function minimumCrestRiseMetres(target: SeedWorldRockCoverageTarget, options: SeedWorldRockAssemblyOptions): number {
  return Math.max(10, target.prominenceMetres * options.minimumCrestRiseProminenceRatio);
}

function resolveHierarchyScale(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions
): number {
  const radialRatio = clamp(
    Math.hypot(target.crest[0], target.crest[2]) / (fields.sizeMetres * 0.5 * Math.SQRT2),
    0,
    1
  );
  const smoothRadialRatio = radialRatio * radialRatio * (3 - 2 * radialRatio);
  return 1 + smoothRadialRatio * options.outerUniformScaleGain;
}

function finalizeGlobalObbContributions(
  decisions: readonly SeedWorldRockAssemblyDecision[],
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions
): SeedWorldRockAssemblyDecision[] {
  const decisionByRockId = new Map(
    decisions.flatMap((decision) => decision.rocks.map((rock) => [rock.id, decision.targetId] as const))
  );
  const rocks = decisions.flatMap((decision) => decision.rocks);
  const contributionById = new Map(
    rocks.map((rock) => {
      const owningTargetId = decisionByRockId.get(rock.id)!;
      const competingRocks = rocks.filter((candidate) => decisionByRockId.get(candidate.id) !== owningTargetId);
      const contribution = measureIndependentObbContributions(
        [rock, ...competingRocks].map(makeVolumeRockFromSolved)
      )[0]!;
      return [rock.id, contribution] as const;
    })
  );
  const crossTargetOverlapById = measureCrossTargetVisibleOverlapEvidence(rocks, decisionByRockId, fields);
  return decisions.map((decision) => {
    const resolvedRocks = Object.freeze(
      decision.rocks.map((rock) =>
        Object.freeze({
          ...rock,
          globalIndependentObbContributionRatio: contributionById.get(rock.id)!,
          crossTargetVisibleOverlapRatio: crossTargetOverlapById.get(rock.id)!.ratio,
          crossTargetOverlapRockIds: crossTargetOverlapById.get(rock.id)!.rockIds
        })
      )
    );
    const minimumGlobalObbContributionRatio =
      resolvedRocks.length === 0
        ? 0
        : Math.min(...resolvedRocks.map((rock) => rock.globalIndependentObbContributionRatio));
    const maximumCrossTargetVisibleOverlapRatio =
      resolvedRocks.length === 0 ? 0 : Math.max(...resolvedRocks.map((rock) => rock.crossTargetVisibleOverlapRatio));
    const violations = Object.freeze([
      ...decision.violations.filter(
        (violation) => violation !== "neighbor-overlap" && violation !== "cross-target-overlap"
      ),
      ...(minimumGlobalObbContributionRatio < options.minimumGlobalObbContributionRatio
        ? (["neighbor-overlap"] as const)
        : []),
      ...(maximumCrossTargetVisibleOverlapRatio > options.maximumCrossTargetVisibleOverlapRatio
        ? (["cross-target-overlap"] as const)
        : [])
    ]);
    return Object.freeze({
      ...decision,
      rocks: resolvedRocks,
      minimumGlobalObbContributionRatio,
      maximumCrossTargetVisibleOverlapRatio,
      violations,
      memberDiagnostics: Object.freeze(
        resolvedRocks.map((rock) =>
          Object.freeze({
            role: rock.role,
            contactRatio: rock.contactRatio,
            maximumSupportGapMetres: rock.maximumSupportGapMetres,
            tailDetailExposureRatio: rock.tailDetailExposureRatio,
            surfaceConflictSampleCount: rock.surfaceConflictSampleCount,
            independentPlanContributionRatio: rock.independentPlanContributionRatio,
            containsCrest: rock.containsCrest
          })
        )
      )
    });
  });
}

function freezeDecision(
  targetId: string,
  requestedRockCount: SeedWorldRockAssemblyDecision["requestedRockCount"],
  rocks: readonly SeedWorldSolvedRockObb[],
  crestCovered: boolean,
  assemblyConnected: boolean,
  violations: SeedWorldRockAssemblyDecision["violations"],
  memberDiagnostics: readonly SeedWorldRockAssemblyMemberDiagnostics[],
  measuredMinimumContactRatio?: number,
  measuredMinimumIndependentPlanContributionRatio?: number,
  maximumMemberPlanOverlapRatio = 0,
  terrainCoverageRatio = 0,
  crestRiseMetres = 0,
  hierarchyScale = 1
): SeedWorldRockAssemblyDecision {
  return Object.freeze({
    targetId,
    requestedRockCount,
    rocks: Object.freeze(rocks),
    minimumContactRatio:
      measuredMinimumContactRatio ?? (rocks.length === 0 ? 0 : Math.min(...rocks.map((rock) => rock.contactRatio))),
    minimumIndependentPlanContributionRatio:
      measuredMinimumIndependentPlanContributionRatio ??
      (rocks.length === 0 ? 0 : Math.min(...rocks.map((rock) => rock.independentPlanContributionRatio))),
    minimumGlobalObbContributionRatio:
      rocks.length === 0 ? 0 : Math.min(...rocks.map((rock) => rock.globalIndependentObbContributionRatio)),
    maximumCrossTargetVisibleOverlapRatio:
      rocks.length === 0 ? 0 : Math.max(...rocks.map((rock) => rock.crossTargetVisibleOverlapRatio)),
    maximumMemberPlanOverlapRatio,
    crestCovered,
    assemblyConnected,
    terrainCoverageRatio,
    crestRiseMetres,
    hierarchyScale,
    violations: Object.freeze(violations),
    memberDiagnostics: Object.freeze(memberDiagnostics)
  });
}

function freezeMemberDiagnostic(
  rock: PendingRock,
  independentPlanContributionRatio: number
): SeedWorldRockAssemblyMemberDiagnostics {
  return Object.freeze({
    role: rock.role,
    contactRatio: rock.contactRatio,
    maximumSupportGapMetres: rock.maximumSupportGapMetres,
    tailDetailExposureRatio: rock.tailDetailExposureRatio,
    surfaceConflictSampleCount: rock.surfaceConflictSampleCount,
    independentPlanContributionRatio,
    containsCrest: rock.containsCrest
  });
}

function validateInputs(assets: readonly SeedWorldRockAssetObbProfile[], options: SeedWorldRockAssemblyOptions): void {
  if (assets.length === 0) throw new RangeError("Rock assembly solving requires at least one asset OBB profile");
  for (const asset of assets) {
    if (
      asset.canonicalSizeMetres.some((value) => !Number.isFinite(value) || value <= 0) ||
      asset.canonicalCenterMetres.some((value) => !Number.isFinite(value)) ||
      asset.authoredSupportOffsetsMetres.length < 3 ||
      asset.authoredSupportOffsetsMetres.some((offset) => offset.some((value) => !Number.isFinite(value))) ||
      asset.canonicalSupportOffsetsMetres.length !== asset.authoredSupportOffsetsMetres.length ||
      asset.canonicalSupportOffsetsMetres.some((offset) => offset.some((value) => !Number.isFinite(value))) ||
      asset.canonicalDetailOffsetsMetres.length < 3 ||
      asset.canonicalDetailOffsetsMetres.some((offset) => offset.some((value) => !Number.isFinite(value))) ||
      asset.canonicalTailDetailOffsetsMetres.length < 1 ||
      asset.canonicalTailDetailOffsetsMetres.some((offset) => offset.some((value) => !Number.isFinite(value))) ||
      !Number.isFinite(asset.tailDetailRevealRatio) ||
      asset.tailDetailRevealRatio < 0 ||
      asset.tailDetailRevealRatio > 1 ||
      asset.assetToCanonicalQuaternion.some((value) => !Number.isFinite(value))
    ) {
      throw new RangeError(`Rock asset OBB profile "${asset.id}" contains invalid geometry`);
    }
  }
  if (
    !Number.isFinite(options.minimumContactRatio) ||
    options.minimumContactRatio < 0 ||
    options.minimumContactRatio > 1 ||
    !Number.isFinite(options.minimumInsertionDepthThicknessRatio) ||
    options.minimumInsertionDepthThicknessRatio < 0 ||
    !Number.isFinite(options.preferredInsertionDepthThicknessRatio) ||
    options.preferredInsertionDepthThicknessRatio < options.minimumInsertionDepthThicknessRatio ||
    !Number.isFinite(options.maximumInsertionDepthThicknessRatio) ||
    options.maximumInsertionDepthThicknessRatio < options.preferredInsertionDepthThicknessRatio ||
    options.maximumInsertionDepthThicknessRatio > 0.5 ||
    !Number.isFinite(options.maximumSupportGapThicknessRatio) ||
    options.maximumSupportGapThicknessRatio < 0 ||
    options.maximumSupportGapThicknessRatio > 0.5 ||
    !Number.isFinite(options.surfaceConflictClearanceThicknessRatio) ||
    options.surfaceConflictClearanceThicknessRatio < 0 ||
    options.surfaceConflictClearanceThicknessRatio > 0.5 ||
    !Number.isFinite(options.minimumIndependentPlanContributionRatio) ||
    options.minimumIndependentPlanContributionRatio < 0 ||
    options.minimumIndependentPlanContributionRatio > 1 ||
    !Number.isFinite(options.maximumMemberPlanOverlapRatio) ||
    options.maximumMemberPlanOverlapRatio < 0 ||
    options.maximumMemberPlanOverlapRatio > 1 ||
    !Number.isFinite(options.minimumGlobalObbContributionRatio) ||
    options.minimumGlobalObbContributionRatio < 0 ||
    options.minimumGlobalObbContributionRatio > 1 ||
    !Number.isFinite(options.maximumCrossTargetVisibleOverlapRatio) ||
    options.maximumCrossTargetVisibleOverlapRatio < 0 ||
    options.maximumCrossTargetVisibleOverlapRatio > 1 ||
    !Number.isFinite(options.minimumTerrainCoverageRatio) ||
    options.minimumTerrainCoverageRatio <= 0 ||
    options.minimumTerrainCoverageRatio > 1 ||
    !Number.isFinite(options.minimumCrestRiseProminenceRatio) ||
    options.minimumCrestRiseProminenceRatio <= 0 ||
    options.minimumCrestRiseProminenceRatio > 1 ||
    !Number.isFinite(options.outerUniformScaleGain) ||
    options.outerUniformScaleGain < 0 ||
    options.outerUniformScaleGain > 2 ||
    !Number.isFinite(options.minimumSkywardTiltDegrees) ||
    options.minimumSkywardTiltDegrees <= 0 ||
    options.minimumSkywardTiltDegrees >= options.maximumSkywardTiltDegrees ||
    !Number.isFinite(options.maximumSkywardTiltDegrees) ||
    options.maximumSkywardTiltDegrees <= 0 ||
    options.maximumSkywardTiltDegrees >= 90
  ) {
    throw new RangeError(
      "Rock assembly feasibility ratios, insertion depths, and angles are outside their physical ranges"
    );
  }
}

function quaternionFromAxes(xAxis: Vector3Tuple, yAxis: Vector3Tuple, zAxis: Vector3Tuple): QuaternionTuple {
  const m00 = xAxis[0];
  const m01 = yAxis[0];
  const m02 = zAxis[0];
  const m10 = xAxis[1];
  const m11 = yAxis[1];
  const m12 = zAxis[1];
  const m20 = xAxis[2];
  const m21 = yAxis[2];
  const m22 = zAxis[2];
  const trace = m00 + m11 + m22;
  let x: number;
  let y: number;
  let z: number;
  let w: number;
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    w = 0.25 * scale;
    x = (m21 - m12) / scale;
    y = (m02 - m20) / scale;
    z = (m10 - m01) / scale;
  } else if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / scale;
    x = 0.25 * scale;
    y = (m01 + m10) / scale;
    z = (m02 + m20) / scale;
  } else if (m11 > m22) {
    const scale = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / scale;
    x = (m01 + m10) / scale;
    y = 0.25 * scale;
    z = (m12 + m21) / scale;
  } else {
    const scale = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / scale;
    x = (m02 + m20) / scale;
    y = (m12 + m21) / scale;
    z = 0.25 * scale;
  }
  return normalizeQuaternion([x, y, z, w]);
}

function multiplyQuaternion(left: QuaternionTuple, right: QuaternionTuple): QuaternionTuple {
  return normalizeQuaternion([
    left[3] * right[0] + left[0] * right[3] + left[1] * right[2] - left[2] * right[1],
    left[3] * right[1] - left[0] * right[2] + left[1] * right[3] + left[2] * right[0],
    left[3] * right[2] + left[0] * right[1] - left[1] * right[0] + left[2] * right[3],
    left[3] * right[3] - left[0] * right[0] - left[1] * right[1] - left[2] * right[2]
  ]);
}

function normalizeQuaternion(value: readonly [number, number, number, number]): QuaternionTuple {
  const length = Math.hypot(...value);
  return Object.freeze(value.map((component) => component / length) as [number, number, number, number]);
}

function rotateVectorByQuaternionConjugate(vector: Vector3Tuple, quaternion: QuaternionTuple): Vector3Tuple {
  const [x, y, z, w] = quaternion;
  const crossX = -y * vector[2] + z * vector[1];
  const crossY = -z * vector[0] + x * vector[2];
  const crossZ = -x * vector[1] + y * vector[0];
  const secondCrossX = -y * crossZ + z * crossY;
  const secondCrossY = -z * crossX + x * crossZ;
  const secondCrossZ = -x * crossY + y * crossX;
  return Object.freeze([
    vector[0] + 2 * (w * crossX + secondCrossX),
    vector[1] + 2 * (w * crossY + secondCrossY),
    vector[2] + 2 * (w * crossZ + secondCrossZ)
  ] as const);
}

function rotateVectorByQuaternion(vector: Vector3Tuple, quaternion: QuaternionTuple): Vector3Tuple {
  const [x, y, z, w] = quaternion;
  const crossX = y * vector[2] - z * vector[1];
  const crossY = z * vector[0] - x * vector[2];
  const crossZ = x * vector[1] - y * vector[0];
  const secondCrossX = y * crossZ - z * crossY;
  const secondCrossY = z * crossX - x * crossZ;
  const secondCrossZ = x * crossY - y * crossX;
  return Object.freeze([
    vector[0] + 2 * (w * crossX + secondCrossX),
    vector[1] + 2 * (w * crossY + secondCrossY),
    vector[2] + 2 * (w * crossZ + secondCrossZ)
  ] as const);
}

function transformVector(vector: Vector3Tuple, axes: PendingRock["axes"]): Vector3Tuple {
  return Object.freeze([
    axes.tangent[0] * vector[0] + axes.vertical[0] * vector[1] + axes.uphill[0] * vector[2],
    axes.tangent[1] * vector[0] + axes.vertical[1] * vector[1] + axes.uphill[1] * vector[2],
    axes.tangent[2] * vector[0] + axes.vertical[2] * vector[1] + axes.uphill[2] * vector[2]
  ] as const);
}

function cross(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return Object.freeze([
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ] as const);
}

function dot3(left: Vector3Tuple, right: Vector3Tuple): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalize3(vector: readonly [number, number, number]): Vector3Tuple {
  const length = Math.hypot(...vector);
  return Object.freeze(vector.map((component) => component / length) as [number, number, number]);
}

function bearingVector(bearing: number): readonly [x: number, z: number] {
  return Object.freeze([Math.sin(bearing), Math.cos(bearing)] as const);
}

function sampleHeight(fields: SeedWorldFields, worldX: number, worldZ: number): number {
  const half = fields.sizeMetres * 0.5;
  return sampleSeedWorldHeight(fields, clamp(worldX, -half, half), clamp(worldZ, -half, half)) ?? 0;
}

function wrapAngle(angle: number): number {
  const wrapped = angle % (Math.PI * 2);
  return wrapped < 0 ? wrapped + Math.PI * 2 : wrapped;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
