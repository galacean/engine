import { VEGETATION_AUTHORING_REFERENCE_SCALE } from "../asset-assembly/AssetAssemblyRenderProfile";

/** Schema version for deterministic tree-community structure and cohort sizing. */
export const SEED_WORLD_TREE_COMMUNITY_PROFILE_VERSION = 14;

/** Stable biological layer assigned to every accepted tree instance. */
export type SeedWorldTreeCohortKey = "juvenile" | "canopy" | "dominant";

/** Configurable size and competition policy for one biological tree layer. */
export interface SeedWorldTreeCohortProfile {
  /** Stable cohort identity used by named hashes and diagnostics. */
  readonly key: SeedWorldTreeCohortKey;
  /** Relative share before stand, gap-edge, and competition responses. */
  readonly populationWeight: number;
  /** Inclusive authored tree-scale range resolved literally by the shared asset profile. */
  readonly scaleRange: readonly [minimum: number, maximum: number];
  /** Inclusive trunk-to-trunk exclusion range in world metres. */
  readonly minimumSpacingMetres: readonly [minimum: number, maximum: number];
  /** Relative affinity for the interior of a tree stand. */
  readonly standInteriorWeight: number;
  /** Relative affinity for the transition around a canopy gap. */
  readonly gapEdgeWeight: number;
}

/** Stable terrain feature whose boundary attracts a natural tree grove. */
export type SeedWorldTreeGroveAnchorKey = "water-edge" | "road-edge" | "foothill";

/** Distance-band policy which turns one authored terrain feature into grove habitat. */
export interface SeedWorldTreeGroveAnchorProfile {
  /** Stable feature identity used by diagnostics and profile hashing. */
  readonly key: SeedWorldTreeGroveAnchorKey;
  /** Inclusive distance range where the feature can support a grove, in world metres. */
  readonly supportRangeMetres: readonly [minimum: number, maximum: number];
  /** Inclusive subrange receiving full feature affinity, in world metres. */
  readonly fullInfluenceRangeMetres: readonly [minimum: number, maximum: number];
  /** Relative contribution when several feature bands overlap. */
  readonly weight: number;
  /** Candidate-density multiplier at full influence for this feature band. */
  readonly densityMultiplier: number;
}

/** Moisture-field response which concentrates additional trees inside river-adjacent groves. */
export interface SeedWorldTreeRiparianMoistureProfile {
  /** Moisture value where the river-grove response begins. */
  readonly minimumMoisture: number;
  /** Moisture value where the river-grove response reaches full strength. */
  readonly fullInfluenceMoisture: number;
  /** River distance retaining full moist-grove response, in world metres. */
  readonly fullInfluenceRiverDistanceMetres: number;
  /** River distance where the moist-grove response reaches zero, in world metres. */
  readonly maximumRiverDistanceMetres: number;
  /** Maximum multiplier applied while ranking possible grove parents. */
  readonly parentRankMultiplier: number;
  /** Minimum river-moisture response allowed to recruit one additional grove parent. */
  readonly additionalParentMinimumInfluence: number;
  /** Minimum distance from the region's primary grove parent, in world metres. */
  readonly additionalParentSpacingMetres: number;
  /** Maximum density multiplier applied inside an accepted riparian grove. */
  readonly standDensityMultiplier: number;
}

/** Continuous rocky-substrate response which recruits sparse mountain groves without bypassing slope or OBB gates. */
export interface SeedWorldTreeRockySlopeProfile {
  /** Rocky-slope material weight where the mountain-grove response begins. */
  readonly minimumWeight: number;
  /** Rocky-slope material weight where the mountain-grove response reaches full strength. */
  readonly fullInfluenceWeight: number;
  /** Relative contribution when rocky substrate competes with distance-band anchors. */
  readonly anchorWeight: number;
  /** Candidate-density multiplier at full rocky-substrate influence. */
  readonly densityMultiplier: number;
  /** Outer distance from fully rocky terrain where the mountain-grove ecotone reaches zero. */
  readonly maximumProximityMetres: number;
}

/** Versioned first-principles controls for deterministic stands, gaps, and vertical tree layers. */
export interface SeedWorldTreeCommunityProfile {
  /** Stable profile version persisted with the generated plan. */
  readonly version: number;
  /** Expected deterministic stand-parent count per suitable square kilometre. */
  readonly standParentsPerSuitableSquareKilometre: number;
  /** Inclusive stand-radius range in world metres. */
  readonly standRadiusMetres: readonly [minimum: number, maximum: number];
  /** Inclusive minor-to-major axis ratio that prevents circular stand stamps. */
  readonly standAspectRatio: readonly [minimum: number, maximum: number];
  /** Inclusive low-frequency boundary displacement in world metres. */
  readonly standBoundaryWarpMetres: readonly [minimum: number, maximum: number];
  /** Inclusive radius of one species-and-palette patch inside the unchanged large forest stand. */
  readonly speciesPatchRadiusMetres: readonly [minimum: number, maximum: number];
  /** Original macro-forest connectivity retained independently of the added small-grove layer. */
  readonly macroGroveLinkDistanceMetres: number;
  /** Original minimum macro-forest component size. */
  readonly macroMinimumTreesPerGrove: number;
  /** Extra deterministic candidate reservoir used to form complete small groves before any clearance gate. */
  readonly groveCandidateDensityMultiplier: number;
  /** Inclusive nearest-trunk spacing used inside one visible small grove. */
  readonly groveSpacingMetres: readonly [minimum: number, maximum: number];
  /** Seed World-only uniform scale applied after cohort scale, including the physical footprint. */
  readonly treeUniformScale: number;
  /** Inclusive forced main-species share; the remainder follows the complete local ecological response. */
  readonly speciesPurity: readonly [minimum: number, maximum: number];
  /** Inclusive main-palette share assigned independently to each deterministic community. */
  readonly palettePurity: readonly [minimum: number, maximum: number];
  /** Expected canopy-gap count per stand-covered square kilometre. */
  readonly gapsPerStandSquareKilometre: number;
  /** Inclusive canopy-gap radius range in world metres. */
  readonly gapRadiusMetres: readonly [minimum: number, maximum: number];
  /** Inclusive minor-to-major axis ratio that prevents circular canopy gaps. */
  readonly gapAspectRatio: readonly [minimum: number, maximum: number];
  /** Inclusive low-frequency gap-boundary displacement in world metres. */
  readonly gapBoundaryWarpMetres: readonly [minimum: number, maximum: number];
  /** Lake-bank, roadside, and foothill bands allowed to recruit grove parents. */
  readonly groveAnchors: readonly SeedWorldTreeGroveAnchorProfile[];
  /** River proximity and moisture-field policy applied only within deterministic groves. */
  readonly riparianMoisture: SeedWorldTreeRiparianMoistureProfile;
  /** Rocky-substrate policy which recruits trees on dry mountain ground. */
  readonly rockySlope: SeedWorldTreeRockySlopeProfile;
  /** Relative tree density retained at a normalized ninety-degree slope. */
  readonly ninetyDegreeSlopeDensityMultiplier: number;
  /** Relative tree density outside deterministic stand coverage. */
  readonly backgroundDensityMultiplier: number;
  /** Relative tree density at a deterministic stand core. */
  readonly standCoreDensityMultiplier: number;
  /** Fraction of stand density retained inside a canopy gap. */
  readonly canopyGapRetention: number;
  /** Normalizes stand and gap modulation back to the authored whole-world tree budget. */
  readonly densityNormalization: number;
  /** Maximum tree-to-tree link distance used to identify one contiguous natural grove. */
  readonly groveLinkDistanceMetres: number;
  /** Minimum accepted natural-tree count retained in one contiguous grove. */
  readonly minimumTreesPerGrove: number;
  /** Maximum accepted natural-tree count retained in one contiguous grove. */
  readonly maximumTreesPerGrove: number;
  /** Configurable juvenile, canopy, and dominant-tree policies. */
  readonly cohorts: readonly SeedWorldTreeCohortProfile[];
}

/** Shared tree-community configuration compiled once by the Worker. */
export const SEED_WORLD_TREE_COMMUNITY_PROFILE: SeedWorldTreeCommunityProfile = Object.freeze({
  version: SEED_WORLD_TREE_COMMUNITY_PROFILE_VERSION,
  standParentsPerSuitableSquareKilometre: 1.6,
  standRadiusMetres: Object.freeze([200, 400] as const),
  standAspectRatio: Object.freeze([0.42, 0.82] as const),
  standBoundaryWarpMetres: Object.freeze([36, 92] as const),
  speciesPatchRadiusMetres: Object.freeze([12, 25] as const),
  macroGroveLinkDistanceMetres: 52,
  macroMinimumTreesPerGrove: 6,
  groveCandidateDensityMultiplier: 6,
  groveSpacingMetres: Object.freeze([4, 9] as const),
  treeUniformScale: VEGETATION_AUTHORING_REFERENCE_SCALE,
  speciesPurity: Object.freeze([0.1, 0.1] as const),
  palettePurity: Object.freeze([0.8, 0.95] as const),
  gapsPerStandSquareKilometre: 6,
  gapRadiusMetres: Object.freeze([28, 72] as const),
  gapAspectRatio: Object.freeze([0.52, 0.9] as const),
  gapBoundaryWarpMetres: Object.freeze([6, 18] as const),
  groveAnchors: Object.freeze([
    groveAnchor("water-edge", [0, 170], [6, 80], 1, 3.2),
    groveAnchor("road-edge", [18, 210], [32, 115], 0.82, 2.6),
    groveAnchor("foothill", [-180, 260], [-90, 120], 0.55, 1.15)
  ]),
  riparianMoisture: Object.freeze({
    minimumMoisture: 0.5,
    fullInfluenceMoisture: 0.72,
    fullInfluenceRiverDistanceMetres: 220,
    maximumRiverDistanceMetres: 460,
    parentRankMultiplier: 1.45,
    additionalParentMinimumInfluence: 0.18,
    additionalParentSpacingMetres: 96,
    standDensityMultiplier: 1.35
  }),
  rockySlope: Object.freeze({
    minimumWeight: 0.2,
    fullInfluenceWeight: 0.55,
    anchorWeight: 0.75,
    densityMultiplier: 1.35,
    maximumProximityMetres: 400
  }),
  ninetyDegreeSlopeDensityMultiplier: 0.2,
  backgroundDensityMultiplier: 0.004,
  standCoreDensityMultiplier: 2.6,
  canopyGapRetention: 0.04,
  densityNormalization: 0.7,
  groveLinkDistanceMetres: 9,
  minimumTreesPerGrove: 5,
  maximumTreesPerGrove: 12,
  cohorts: Object.freeze([
    cohort("juvenile", 0.4, [0.38, 0.58], [3, 5], 0.8, 2.8),
    cohort("canopy", 0.5, [0.82, 1.12], [7, 12], 1.2, 0.6),
    cohort("dominant", 0.1, [1.55, 1.9], [12, 18], 1.8, 0.1)
  ])
});

/**
 * Resolves the shared continuous slope response for natural tree density and species competition.
 * @param profile Tree-community slope-retention policy.
 * @param normalizedSlope Final terrain angle normalized so one is ninety degrees.
 * @returns Non-zero density multiplier which decreases monotonically toward ninety degrees.
 */
export function resolveSeedWorldTreeSlopeDensityMultiplier(
  profile: Pick<SeedWorldTreeCommunityProfile, "ninetyDegreeSlopeDensityMultiplier">,
  normalizedSlope: number
): number {
  const slope = clamp01(normalizedSlope);
  return mix(1, profile.ninetyDegreeSlopeDensityMultiplier, smoothstep(0, 1, slope));
}

function groveAnchor(
  key: SeedWorldTreeGroveAnchorKey,
  supportRangeMetres: readonly [number, number],
  fullInfluenceRangeMetres: readonly [number, number],
  weight: number,
  densityMultiplier: number
): SeedWorldTreeGroveAnchorProfile {
  return Object.freeze({
    key,
    supportRangeMetres: Object.freeze([...supportRangeMetres] as [number, number]),
    fullInfluenceRangeMetres: Object.freeze([...fullInfluenceRangeMetres] as [number, number]),
    weight,
    densityMultiplier
  });
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function cohort(
  key: SeedWorldTreeCohortKey,
  populationWeight: number,
  scaleRange: readonly [number, number],
  minimumSpacingMetres: readonly [number, number],
  standInteriorWeight: number,
  gapEdgeWeight: number
): SeedWorldTreeCohortProfile {
  return Object.freeze({
    key,
    populationWeight,
    scaleRange: Object.freeze([...scaleRange] as [number, number]),
    minimumSpacingMetres: Object.freeze([...minimumSpacingMetres] as [number, number]),
    standInteriorWeight,
    gapEdgeWeight
  });
}
