import { PopulationInstanceClearanceIndex } from "./SeedWorldPopulationClearance.ts";
import {
  sampleSeedWorldPopulation,
  sampleSeedWorldRoadDistanceMetres,
  sampleSeedWorldWaterBoundaryDistanceMetres,
  type SeedWorldFields,
  type SeedWorldPopulationSample
} from "./SeedWorldFields.ts";
import {
  deriveSeedWorldNamedSeed,
  sampleSeedWorldMountainUpliftMetres,
  sampleSeedWorldCoastSignedFieldMetres,
  sampleSeedWorldMountainFoothillSignedDistanceMetres,
  SEED_WORLD_MAXIMUM_MOUNTAIN_UPLIFT_METRES,
  SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES,
  SeedWorldLandCover,
  type SeedWorldAquaticHabitatMask,
  type SeedWorldDetailBrushOperation,
  type SeedWorldPlan,
  type SeedWorldPoint,
  type SeedWorldTreeScatterOperation,
  type SeedWorldVegetationRule
} from "../world/SeedWorldPlanner.ts";
import {
  SEED_WORLD_TREE_SPECIES_PROFILE_VERSION,
  type SeedWorldTreePaletteKey,
  type SeedWorldTreePaletteProfile,
  type SeedWorldTreeSpeciesProfile,
  type SeedWorldTreeSpeciesKey
} from "@galacean/engine-vegetation/world/SeedWorldTreeSpecies";
import {
  projectSeedWorldTreeFootprintObb,
  resolveSeedWorldTreeFootprintMetres,
  SeedWorldTreeBoundsIndex,
  type SeedWorldTreeBoundsIndexDiagnostics
} from "@galacean/engine-vegetation/world/SeedWorldTreeBoundsPacking";
import {
  resolveSeedWorldTreeSlopeDensityMultiplier,
  type SeedWorldTreeCohortKey,
  type SeedWorldTreeCohortProfile,
  type SeedWorldTreeCommunityProfile
} from "@galacean/engine-vegetation/world/SeedWorldTreeCommunity";
import {
  compileSeedWorldRoadVegetationWeights,
  seedWorldRiverBankPointHasClearance,
  seedWorldRoadPointHasClearance
} from "../world/SeedWorldFeatureGeometry.ts";
import {
  getSeedWorldAssetPlacementProfile,
  resolveSeedWorldAssetPlacement,
  type SeedWorldResolvedAssetPlacement,
  type SeedWorldTransformIntent
} from "../world/SeedWorldAssetPlacementProfile.ts";
import {
  getSeedWorldDetailSpeciesProfile,
  SEED_WORLD_DETAIL_SPECIES_PROFILES,
  SEED_WORLD_DETAIL_SPECIES_PROFILE_VERSION,
  type SeedWorldDetailSpeciesProfile
} from "../world/SeedWorldDetailSpecies.ts";
import { compileSeedWorldDetailDistribution } from "../world/SeedWorldDetailDistribution.ts";
import type { SeedWorldDecorationInstance } from "../world/SeedWorldDecorations.ts";
import {
  resolveSeedWorldGrassSurfaceWeight,
  resolveSeedWorldRiparianFlowerWeight,
  resolveSeedWorldRiparianVegetationWeight
} from "./SeedWorldSurfaceIntent.ts";
import { sampleSeedWorldWaterBasinProfileV1 } from "./hydrology-v1/SeedWorldTerrainFeatureGeometry.ts";

/** Population Cell edge length shared by the vector preview and runtime consumer contract. */
export const SEED_WORLD_POPULATION_CELL_METRES = 64;

/** One exact accepted habitat-driven candidate. */
export interface SeedWorldPopulationInstance {
  /** Stable category, Cell, and candidate identity. */
  readonly id: string;
  /** Habitat-driven population category. */
  readonly category: SeedWorldVegetationRule["category"];
  /** Stable Population Cell identity. */
  readonly sourceCellId: string;
  /** Stable candidate ordinal inside its category and Cell. */
  readonly ordinal: number;
  /** Stable Authoring Brush owner; absent only for Root-Seed natural population. */
  readonly authoringBrushId?: string;
  /** Exact normalized world X-Z position. */
  readonly normalizedPosition: SeedWorldPoint;
  /** Asset-independent semantic transform selection. */
  readonly intent: SeedWorldTransformIntent<"tree" | "shrub" | "flower" | "grass">;
  /** Version of the profile that resolved the exact transform. */
  readonly profileVersion: number;
  /** Category prototype resolved by the shared placement profile. */
  readonly prototypeFamily: "tree" | "shrub" | "flower" | "grass";
  /** Stable unsigned rank used by the asset adapter to choose one authored prototype in this family. */
  readonly prototypeRank: number;
  /** Exact configured tree species selected from moisture, mountain influence, and a named ecotone field. */
  readonly treeSpeciesProfileKey?: SeedWorldTreeSpeciesKey;
  /** Exact biological layer which owns this tree's configured size and competition policy. */
  readonly treeCohortProfileKey?: SeedWorldTreeCohortKey;
  /** Exact authored tree recipe selected by the species profile; absent for non-tree categories. */
  readonly assetRecipeId?: string;
  /** Stable ecological community which owns species and palette selection. */
  readonly treeCommunityId?: string;
  /** Stable 12–25 metre natural-grove identity; absent for explicit user-authored trees. */
  readonly treeClusterId?: string;
  /** Exact species-owned palette selected at community scale. */
  readonly treePaletteKey?: SeedWorldTreePaletteKey;
  /** Exact local X-Y-Z scale resolved by the shared placement profile. */
  readonly scale: readonly [x: number, y: number, z: number];
  /** Exact scaled X-Z footprint used by every clearance gate. */
  readonly footprintMetres: readonly [width: number, depth: number];
  /** Exact yaw selected by the Vegetation stream. */
  readonly yawRadians: number;
  /** Signed normalized authored color variation in the `[-1, 1]` range. */
  readonly colorVariation: number;
}

/** One dense Detail channel rendered from the same saved brush operations as the 2D plan. */
export interface SeedWorldDetailDensityField {
  /** Stable authored Detail prototype. */
  readonly prototypeFamily: SeedWorldDetailBrushOperation["prototypeFamily"];
  /** Dense vegetation category carried explicitly instead of inferred from the prototype name. */
  readonly category: SeedWorldDetailSpeciesProfile["category"];
  /** Asset Assembly prototype selected by the versioned species profile. */
  readonly assetProfileKey: string;
  /** Square world-space sampling resolution. */
  readonly resolution: number;
  /** Maximum density represented by a byte value of 255. */
  readonly maximumDensityPerSquareMetre: number;
  /** Row-major brush coverage samples; zero means no authored detail. */
  readonly samples: Uint8Array;
  /** Editable region provenance: one-based indices into ids; shared by species using this density. */
  readonly ownership?: { readonly ids: readonly string[]; readonly samples: Uint32Array };
  /** Optional immutable candidate identity for presentation masks; absent preserves content-seeded generation. */
  readonly candidateSeed?: number;
  /** Optional ecology-produced grass height interval in metres, aligned with samples.
   * Interleaved [minimum, maximum] pairs. Absent retains the native species parameters. */
  readonly heightRangeMetres?: { readonly samples: Float32Array; readonly minimum: number; readonly maximum: number };
  /** Stable hash of all density samples and the density scale. */
  readonly hash: number;
}

/** Shared 2D/3D population authoring result compiled once by the Worker. */
export interface SeedWorldPopulationPreview {
  /** Version of the tree-species catalog used to resolve every exact tree. */
  readonly treeSpeciesProfileVersion: number;
  /** Configurable tree species used by the Worker and literal 3D consumer. */
  readonly treeSpeciesProfiles: readonly SeedWorldTreeSpeciesProfile[];
  /** Version of the tree-community profile used to resolve stand, gap, cohort, and competition structure. */
  readonly treeCommunityProfileVersion: number;
  /** Configurable tree-community policy consumed by the Worker. */
  readonly treeCommunityProfile: SeedWorldTreeCommunityProfile;
  /** Version of the species catalog used to compile every dense Detail field. */
  readonly detailSpeciesProfileVersion: number;
  /** Versioned species configuration consumed by both the 2D and 3D paths. */
  readonly detailSpeciesProfiles: readonly SeedWorldDetailSpeciesProfile[];
  /** Saved Unity-style tree and shrub authoring operations. */
  readonly treeScatterOperations: readonly SeedWorldTreeScatterOperation[];
  /** Saved Unity-style hard-edge Detail authoring operations. */
  readonly detailBrushOperations: readonly SeedWorldDetailBrushOperation[];
  /** Exact tree and shrub instances compiled once from the saved scatter operations. */
  readonly treeInstances: readonly SeedWorldPopulationInstance[];
  /** Per-prototype continuous density fields; no grass or flower map points are synthesized. */
  readonly detailDensityFields: readonly SeedWorldDetailDensityField[];
  /** Stable hash covering saved operations and every DensityField byte. */
  readonly hash: number;
}

/** Copies runtime-transferable density buffers while sharing immutable authoring records. */
export function cloneSeedWorldPopulationPreview(preview: SeedWorldPopulationPreview): SeedWorldPopulationPreview {
  return Object.freeze({
    ...preview,
    detailDensityFields: Object.freeze(
      preview.detailDensityFields.map((field) =>
        Object.freeze({
          ...field,
          samples: new Uint8Array(field.samples),
          ...(field.heightRangeMetres
            ? {
                heightRangeMetres: {
                  ...field.heightRangeMetres,
                  samples: new Float32Array(field.heightRangeMetres.samples)
                }
              }
            : {})
        })
      )
    )
  });
}

/** Exact full-world acceptance statistics for one habitat-driven category. */
export interface SeedWorldPopulationCategoryStatistics {
  /** Population category measured by this row. */
  readonly category: SeedWorldVegetationRule["category"];
  /** Monte Carlo estimate of the land area where the category has non-zero habitat suitability. */
  readonly eligibleAreaSquareMetres: number;
  /** Suitability-weighted habitat area used to compare accepted density with the authored target. */
  readonly effectiveHabitatAreaSquareMetres: number;
  /** Exact number of stable candidates accepted across the world. */
  readonly acceptedCount: number;
  /** Exact accepted count divided by the complete world area. */
  readonly acceptedPerWorldSquareKilometre: number;
  /** Exact accepted count divided by the estimated non-zero habitat area. */
  readonly acceptedPerEligibleSquareKilometre: number;
  /** Exact accepted count divided by the suitability-weighted habitat area. */
  readonly acceptedPerEffectiveHabitatSquareKilometre: number;
}

/** Mutually exclusive final-render tree region, ordered by ecological priority. */
export type SeedWorldFinalTreeRegionKey = "water-edge" | "road-edge" | "ordinary-slope";

/** Final exact-instance density measured against one dry-land feature band. */
export interface SeedWorldFinalTreeRegionStatistics {
  readonly region: SeedWorldFinalTreeRegionKey;
  readonly areaSquareMetres: number;
  readonly finalTreeCount: number;
  readonly finalTreesPerSquareKilometre: number;
}

/** Tree evidence computed from the exact population submitted to the renderer. */
export interface SeedWorldFinalTreeStatistics {
  readonly finalTreeCount: number;
  readonly clusterCount: number;
  readonly clusterSizes: readonly number[];
  readonly regions: Readonly<Record<SeedWorldFinalTreeRegionKey, SeedWorldFinalTreeRegionStatistics>>;
}

/**
 * Measures exact final tree instances after every upstream clearance pass.
 * Region areas come from the same Water/road raster contract, while counts come only from the supplied renderer layout.
 */
export function compileSeedWorldFinalTreeStatistics(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  population: Pick<SeedWorldPopulationPreview, "treeInstances">
): SeedWorldFinalTreeStatistics {
  validatePlanAndFields(plan, fields);
  const areas: Record<SeedWorldFinalTreeRegionKey, number> = {
    "water-edge": 0,
    "road-edge": 0,
    "ordinary-slope": 0
  };
  const counts: Record<SeedWorldFinalTreeRegionKey, number> = {
    "water-edge": 0,
    "road-edge": 0,
    "ordinary-slope": 0
  };
  const texelAreaSquareMetres = (fields.sizeMetres / fields.surfaceResolution) ** 2;
  for (let z = 0; z < fields.surfaceResolution; z++) {
    for (let x = 0; x < fields.surfaceResolution; x++) {
      const index = z * fields.surfaceResolution + x;
      if (fields.waterMask[index] !== 0 || fields.habitat[index] === SeedWorldLandCover.Wetland) continue;
      const worldX = ((x + 0.5) / fields.surfaceResolution - 0.5) * fields.sizeMetres;
      const worldZ = ((z + 0.5) / fields.surfaceResolution - 0.5) * fields.sizeMetres;
      const region = classifySeedWorldFinalTreeRegion(
        plan,
        sampleSeedWorldWaterBoundaryDistanceMetres(plan, fields, worldX, worldZ)!,
        sampleSeedWorldRoadDistanceMetres(plan, worldX, worldZ)!
      );
      areas[region] += texelAreaSquareMetres;
    }
  }
  const clusterSizes = new Map<string, number>();
  let finalTreeCount = 0;
  for (const instance of population.treeInstances) {
    if (instance.category !== "tree") continue;
    finalTreeCount++;
    const worldX = (instance.normalizedPosition.x - 0.5) * plan.sizeMetres;
    const worldZ = (instance.normalizedPosition.y - 0.5) * plan.sizeMetres;
    const sample = sampleSeedWorldPopulation(plan, fields, worldX, worldZ);
    if (!sample) continue;
    counts[classifySeedWorldFinalTreeRegion(plan, sample.waterBoundaryDistanceMetres, sample.roadDistanceMetres)]++;
    if (instance.treeClusterId) {
      clusterSizes.set(instance.treeClusterId, (clusterSizes.get(instance.treeClusterId) ?? 0) + 1);
    }
  }
  const regionStatistics = Object.fromEntries(
    (["water-edge", "road-edge", "ordinary-slope"] as const).map((region) => [
      region,
      Object.freeze({
        region,
        areaSquareMetres: areas[region],
        finalTreeCount: counts[region],
        finalTreesPerSquareKilometre: areas[region] > 0 ? (counts[region] * 1_000_000) / areas[region] : 0
      })
    ])
  ) as Record<SeedWorldFinalTreeRegionKey, SeedWorldFinalTreeRegionStatistics>;
  return Object.freeze({
    finalTreeCount,
    clusterCount: clusterSizes.size,
    clusterSizes: Object.freeze([...clusterSizes.values()].sort((left, right) => left - right)),
    regions: Object.freeze(regionStatistics)
  });
}

function classifySeedWorldFinalTreeRegion(
  plan: Pick<SeedWorldPlan, "treeCommunityProfile">,
  waterBoundaryDistanceMetres: number,
  roadDistanceMetres: number
): SeedWorldFinalTreeRegionKey {
  const water = plan.treeCommunityProfile.groveAnchors.find(({ key }) => key === "water-edge")!;
  const road = plan.treeCommunityProfile.groveAnchors.find(({ key }) => key === "road-edge")!;
  if (
    waterBoundaryDistanceMetres >= water.supportRangeMetres[0] &&
    waterBoundaryDistanceMetres <= water.supportRangeMetres[1]
  ) {
    return "water-edge";
  }
  if (roadDistanceMetres >= road.supportRangeMetres[0] && roadDistanceMetres <= road.supportRangeMetres[1]) {
    return "road-edge";
  }
  return "ordinary-slope";
}

/**
 * Compiles every accepted candidate in one Population Cell.
 * Candidate position and acceptance depend only on Root-derived Vegetation stream, category, Cell, and ordinal.
 * @param plan Authoritative semantic plan.
 * @param fields Canonical terrain, water, road, and habitat fields.
 * @param cellX Zero-based Population Cell X coordinate.
 * @param cellZ Zero-based Population Cell Z coordinate.
 * @param categories Optional category subset; all categories are compiled by default.
 * @returns Exact stable candidates accepted by habitat and clearance constraints.
 * @throws {RangeError} When Plan and fields mismatch or Cell coordinates are outside the world.
 */
export function compileSeedWorldPopulationCell(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  cellX: number,
  cellZ: number,
  categories: readonly SeedWorldVegetationRule["category"][] = plan.vegetationRules.map((rule) => rule.category)
): readonly SeedWorldPopulationInstance[] {
  return new SeedWorldPopulationCellCompiler(plan, fields, cellX, cellZ, categories).finish();
}

/**
 * Incrementally compiles one deterministic Population Cell without changing candidate order or acceptance.
 * @remarks Runtime residency advances this compiler in short frame budgets; offline and test consumers use `finish`.
 */
export class SeedWorldPopulationCellCompiler {
  private readonly _plan: SeedWorldPlan;
  private readonly _fields: SeedWorldFields;
  private readonly _cellX: number;
  private readonly _cellZ: number;
  private readonly _cellMinimumWorldX: number;
  private readonly _cellMinimumWorldZ: number;
  private readonly _cellWidth: number;
  private readonly _cellDepth: number;
  private readonly _rules: readonly SeedWorldVegetationRule[];
  private readonly _result: SeedWorldPopulationInstance[] = [];
  private _ruleIndex = 0;
  private _ordinal = 0;
  private _finished: readonly SeedWorldPopulationInstance[] | undefined;

  /**
   * Creates a deterministic Cell compiler.
   * @param plan Authoritative semantic plan.
   * @param fields Canonical terrain and habitat fields.
   * @param cellX Zero-based Population Cell X coordinate.
   * @param cellZ Zero-based Population Cell Z coordinate.
   * @param categories Optional category subset to compile in canonical rule order.
   * @throws {RangeError} When Plan, fields, or Cell coordinates do not describe the same world.
   */
  constructor(
    plan: SeedWorldPlan,
    fields: SeedWorldFields,
    cellX: number,
    cellZ: number,
    categories: readonly SeedWorldVegetationRule["category"][] = plan.vegetationRules.map((rule) => rule.category)
  ) {
    validateCellRequest(plan, fields, cellX, cellZ);
    this._plan = plan;
    this._fields = fields;
    this._cellX = cellX;
    this._cellZ = cellZ;
    this._cellMinimumWorldX = -plan.sizeMetres * 0.5 + cellX * SEED_WORLD_POPULATION_CELL_METRES;
    this._cellMinimumWorldZ = -plan.sizeMetres * 0.5 + cellZ * SEED_WORLD_POPULATION_CELL_METRES;
    this._cellWidth = Math.min(
      SEED_WORLD_POPULATION_CELL_METRES,
      plan.sizeMetres - cellX * SEED_WORLD_POPULATION_CELL_METRES
    );
    this._cellDepth = Math.min(
      SEED_WORLD_POPULATION_CELL_METRES,
      plan.sizeMetres - cellZ * SEED_WORLD_POPULATION_CELL_METRES
    );
    const requested = new Set(categories);
    this._rules = Object.freeze(plan.vegetationRules.filter((rule) => requested.has(rule.category)));
  }

  /**
   * Whether every candidate in this Cell has been evaluated.
   * @returns `true` once `result` is available.
   */
  get complete(): boolean {
    return this._finished !== undefined;
  }

  /**
   * Advances a bounded count of canonical candidate evaluations.
   * @param maximumCandidates Maximum candidates to evaluate before yielding, or positive infinity to finish synchronously.
   * @returns `true` once the complete immutable Cell result is available.
   * @throws {RangeError} When the candidate budget is not positive.
   */
  advance(maximumCandidates: number): boolean {
    if (this._finished) return true;
    if (
      !(
        maximumCandidates === Number.POSITIVE_INFINITY ||
        (Number.isInteger(maximumCandidates) && maximumCandidates > 0)
      )
    ) {
      throw new RangeError("Seed World Population candidate budget must be positive");
    }
    let remaining = maximumCandidates;
    while (remaining > 0 && this._ruleIndex < this._rules.length) {
      const rule = this._rules[this._ruleIndex]!;
      if (this._ordinal >= rule.candidatesPerCell) {
        this._ruleIndex++;
        this._ordinal = 0;
        continue;
      }
      const ordinal = this._ordinal++;
      const categorySeed = deriveSeedWorldNamedSeed(
        this._plan.generationStreams.vegetation,
        `population:${rule.category}`
      );
      const cellSeed = deriveSeedWorldNamedSeed(categorySeed, `cell:${this._cellX}:${this._cellZ}`);
      const candidate = evaluatePopulationCandidate(
        this._plan,
        this._fields,
        rule,
        categorySeed,
        cellSeed,
        ordinal,
        this._cellMinimumWorldX,
        this._cellMinimumWorldZ,
        this._cellWidth,
        this._cellDepth
      );
      if (candidate.accepted && candidate.placement) {
        this._result.push(
          Object.freeze({
            id: `population:${rule.category}:${this._cellX}:${this._cellZ}:${ordinal}`,
            category: rule.category,
            sourceCellId: `cell-${this._cellX}-${this._cellZ}`,
            ordinal,
            normalizedPosition: Object.freeze({
              x: candidate.worldX / this._plan.sizeMetres + 0.5,
              y: candidate.worldZ / this._plan.sizeMetres + 0.5
            }),
            intent: candidate.placement.intent,
            profileVersion: candidate.placement.profileVersion,
            prototypeFamily: candidate.placement.prototypeFamily as SeedWorldPopulationInstance["prototypeFamily"],
            prototypeRank: deriveSeedWorldNamedSeed(candidate.seed, "prototype-rank"),
            ...(candidate.treeSpecies
              ? {
                  treeSpeciesProfileKey: candidate.treeSpecies.key,
                  treeCohortProfileKey: candidate.treeCohort!.key,
                  ...compileSeedWorldTreeAppearance(
                    this._plan,
                    candidate.treeSpecies,
                    candidate.treeCommunity!,
                    candidate.seed
                  ),
                  treeClusterId: candidate.treeCommunity!.communityId
                }
              : {}),
            scale: candidate.placement.scale,
            footprintMetres: candidate.placement.footprintMetres,
            yawRadians: unitFloat(candidate.seed, "yaw") * Math.PI * 2,
            colorVariation: 0
          })
        );
      }
      remaining--;
    }
    if (this._ruleIndex < this._rules.length) return false;
    this._finished = Object.freeze(this._result);
    return true;
  }

  /**
   * Completes the Cell synchronously for offline callers and tests.
   * @returns Immutable exact Population instances in canonical order.
   */
  finish(): readonly SeedWorldPopulationInstance[] {
    this.advance(Number.POSITIVE_INFINITY);
    return this._finished!;
  }
}

/**
 * Measures the exact full-world population accepted by the shared Cell compiler.
 * This diagnostic performs the same stable candidate and habitat evaluation without allocating instance arrays.
 * @param plan Authoritative semantic plan.
 * @param fields Canonical terrain, water, road, and habitat fields.
 * @returns Per-category eligible area and exact accepted-density statistics.
 * @throws {RangeError} When the plan and fields do not belong to the same Root Seed or world extent.
 */
export function compileSeedWorldPopulationStatistics(
  plan: SeedWorldPlan,
  fields: SeedWorldFields
): readonly SeedWorldPopulationCategoryStatistics[] {
  validatePlanAndFields(plan, fields);
  const cellCount = populationCellCount(plan.sizeMetres);
  const worldAreaSquareMetres = plan.sizeMetres * plan.sizeMetres;
  const result: SeedWorldPopulationCategoryStatistics[] = [];
  for (const rule of plan.vegetationRules) {
    const categorySeed = deriveSeedWorldNamedSeed(plan.generationStreams.vegetation, `population:${rule.category}`);
    let eligibleAreaSquareMetres = 0;
    let effectiveHabitatAreaSquareMetres = 0;
    let acceptedCount = 0;
    for (let cellZ = 0; cellZ < cellCount; cellZ++) {
      const cellMinimumWorldZ = -plan.sizeMetres * 0.5 + cellZ * SEED_WORLD_POPULATION_CELL_METRES;
      const cellDepth = Math.min(
        SEED_WORLD_POPULATION_CELL_METRES,
        plan.sizeMetres - cellZ * SEED_WORLD_POPULATION_CELL_METRES
      );
      for (let cellX = 0; cellX < cellCount; cellX++) {
        const cellMinimumWorldX = -plan.sizeMetres * 0.5 + cellX * SEED_WORLD_POPULATION_CELL_METRES;
        const cellWidth = Math.min(
          SEED_WORLD_POPULATION_CELL_METRES,
          plan.sizeMetres - cellX * SEED_WORLD_POPULATION_CELL_METRES
        );
        const candidateAreaSquareMetres = (cellWidth * cellDepth) / rule.candidatesPerCell;
        const cellSeed = deriveSeedWorldNamedSeed(categorySeed, `cell:${cellX}:${cellZ}`);
        for (let ordinal = 0; ordinal < rule.candidatesPerCell; ordinal++) {
          const candidate = evaluatePopulationCandidate(
            plan,
            fields,
            rule,
            categorySeed,
            cellSeed,
            ordinal,
            cellMinimumWorldX,
            cellMinimumWorldZ,
            cellWidth,
            cellDepth
          );
          if (candidate.density > 0) eligibleAreaSquareMetres += candidateAreaSquareMetres;
          effectiveHabitatAreaSquareMetres += Math.min(1, candidate.density) * candidateAreaSquareMetres;
          if (candidate.accepted) acceptedCount++;
        }
      }
    }
    result.push(
      Object.freeze({
        category: rule.category,
        eligibleAreaSquareMetres,
        effectiveHabitatAreaSquareMetres,
        acceptedCount,
        acceptedPerWorldSquareKilometre: (acceptedCount * 1_000_000) / worldAreaSquareMetres,
        acceptedPerEligibleSquareKilometre:
          eligibleAreaSquareMetres > 0 ? (acceptedCount * 1_000_000) / eligibleAreaSquareMetres : 0,
        acceptedPerEffectiveHabitatSquareKilometre:
          effectiveHabitatAreaSquareMetres > 0 ? (acceptedCount * 1_000_000) / effectiveHabitatAreaSquareMetres : 0
      })
    );
  }
  return Object.freeze(result);
}

/**
 * Compiles saved Detail brushes into the exact density fields shown by the 2D plan.
 * @param plan Authoritative semantic plan.
 * @param fields Canonical terrain, water, road, and habitat fields.
 * @param detailSpeciesProfiles Versioned species configuration used to compile density fields.
 * @param rockDecorations Exact large-rock footprints excluded from woody instances and non-grass Detail fields.
 * @returns Saved brush operations and per-prototype density fields.
 * @throws {RangeError} When the plan and fields do not belong to the same Root Seed or world extent.
 */
export function compileSeedWorldPopulationPreview(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  detailSpeciesProfiles: readonly SeedWorldDetailSpeciesProfile[] = SEED_WORLD_DETAIL_SPECIES_PROFILES,
  rockDecorations: readonly SeedWorldDecorationInstance[] = []
): SeedWorldPopulationPreview {
  validatePlanAndFields(plan, fields);
  const treeInstances = compileTreeScatterInstances(plan, fields, rockDecorations);
  const detailDensityFields = compileDetailDensityFields(plan, fields, detailSpeciesProfiles, rockDecorations);
  return Object.freeze({
    treeSpeciesProfileVersion: SEED_WORLD_TREE_SPECIES_PROFILE_VERSION,
    treeSpeciesProfiles: plan.treeSpeciesProfiles,
    treeCommunityProfileVersion: plan.treeCommunityProfileVersion,
    treeCommunityProfile: plan.treeCommunityProfile,
    detailSpeciesProfileVersion: SEED_WORLD_DETAIL_SPECIES_PROFILE_VERSION,
    detailSpeciesProfiles: Object.freeze([...detailSpeciesProfiles]),
    treeScatterOperations: plan.treeScatterOperations,
    detailBrushOperations: plan.detailBrushOperations,
    treeInstances,
    detailDensityFields,
    hash: hashPopulationPreview(
      plan.treeSpeciesProfiles,
      plan.treeCommunityProfile,
      plan.vegetationRules,
      plan.treeScatterOperations,
      plan.detailBrushOperations,
      treeInstances,
      detailDensityFields
    )
  });
}

/**
 * Removes every persisted local Authoring operation while preserving the natural Root-Seed plan.
 * Terrain and Water Authoring are already represented by the supplied fields, so this projection is
 * the immutable Population baseline against which subsequent local vegetation deltas are composed.
 */
export function createSeedWorldRootPopulationPlan(plan: SeedWorldPlan): SeedWorldPlan {
  const treeScatterOperations = plan.treeScatterOperations.filter(
    (operation) => operation.distribution !== "local-brush"
  );
  const detailBrushOperations = plan.detailBrushOperations.filter(
    (operation) => operation.distribution !== "local-brush"
  );
  if (
    treeScatterOperations.length === plan.treeScatterOperations.length &&
    detailBrushOperations.length === plan.detailBrushOperations.length
  ) {
    return plan;
  }
  return Object.freeze({
    ...plan,
    treeScatterOperations: Object.freeze(treeScatterOperations),
    detailBrushOperations: Object.freeze(detailBrushOperations)
  });
}

/**
 * Rebuilds one immutable Population publication from already-compiled local layout data.
 * The caller owns the local delta; this boundary only restores the canonical operation catalog and content hash.
 */
export function createSeedWorldPopulationPreviewFromLayout(
  plan: SeedWorldPlan,
  published: SeedWorldPopulationPreview,
  treeInstances: readonly SeedWorldPopulationInstance[],
  detailDensityFields: readonly SeedWorldDetailDensityField[] = published.detailDensityFields
): SeedWorldPopulationPreview {
  const immutableTreeInstances = Object.freeze([...treeInstances]);
  const immutableDetailDensityFields = Object.freeze([...detailDensityFields]);
  return Object.freeze({
    ...published,
    treeSpeciesProfileVersion: SEED_WORLD_TREE_SPECIES_PROFILE_VERSION,
    treeSpeciesProfiles: plan.treeSpeciesProfiles,
    treeCommunityProfileVersion: plan.treeCommunityProfileVersion,
    treeCommunityProfile: plan.treeCommunityProfile,
    treeScatterOperations: plan.treeScatterOperations,
    detailBrushOperations: plan.detailBrushOperations,
    treeInstances: immutableTreeInstances,
    detailDensityFields: immutableDetailDensityFields,
    hash: hashPopulationPreview(
      plan.treeSpeciesProfiles,
      plan.treeCommunityProfile,
      plan.vegetationRules,
      plan.treeScatterOperations,
      plan.detailBrushOperations,
      immutableTreeInstances,
      immutableDetailDensityFields
    )
  });
}

/**
 * Compiles one Authoring Brush against every population instance already owned by the world.
 * Brushes are independent durable resources, so a later write may add around existing owners but never evict them.
 */
export function compileSeedWorldLocalTreeScatterOperations(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  operations: readonly SeedWorldTreeScatterOperation[],
  occupiedInstances: readonly SeedWorldPopulationInstance[],
  occupiedNaturalTreeInstanceIds: ReadonlySet<string>,
  rockDecorations: readonly SeedWorldDecorationInstance[] = []
): readonly SeedWorldPopulationInstance[] {
  validatePlanAndFields(plan, fields);
  const densityCandidates: SeedWorldPopulationInstance[] = [];
  const overlappingAuthoredShrubs: SeedWorldPopulationInstance[] = [];
  const exactOperations: Extract<SeedWorldTreeScatterOperation, { distribution: "local-brush" }>[] = [];
  for (const operation of operations) {
    if (operation.distribution !== "local-brush") {
      throw new RangeError("Local Population compilation accepts only local-brush tree or shrub operations");
    }
    if (operation.exactInstanceCount !== undefined) {
      exactOperations.push(operation);
      continue;
    }
    const rule = plan.vegetationRules.find((candidate) => candidate.category === operation.category);
    if (!rule) throw new RangeError(`Seed World is missing a ${operation.category} vegetation rule`);
    const candidateCount = Math.max(
      operation.category === "shrub" ? 1 : 0,
      Math.ceil(Math.PI * operation.radiusMetres * operation.radiusMetres * operation.densityPerSquareMetre)
    );
    for (let ordinal = 0; ordinal < candidateCount; ordinal++) {
      const instance = compileTreeScatterCandidate(plan, fields, rockDecorations, operation, rule, ordinal);
      if (!instance) continue;
      if (operation.category === "shrub") overlappingAuthoredShrubs.push(instance);
      else densityCandidates.push(instance);
    }
  }

  const occupiedIds = new Set(occupiedInstances.map(({ id }) => id));
  const competitionWinners =
    densityCandidates.length === 0
      ? []
      : applySeedWorldTreeCompetition(
          plan,
          [...occupiedInstances, ...densityCandidates],
          occupiedNaturalTreeInstanceIds,
          occupiedIds
        ).filter((instance) => !occupiedIds.has(instance.id));
  const densityClearance = new PopulationInstanceClearanceIndex(plan.sizeMetres, occupiedInstances);
  const additions: SeedWorldPopulationInstance[] = [];
  for (const instance of competitionWinners) {
    if (densityClearance.overlaps(instance)) continue;
    additions.push(instance);
    densityClearance.add(instance);
  }
  const working = [...occupiedInstances, ...overlappingAuthoredShrubs, ...additions];
  const clearance = new PopulationInstanceClearanceIndex(plan.sizeMetres, working);
  appendExactTreeScatterOperations(plan, fields, rockDecorations, exactOperations, working, clearance);
  return Object.freeze(working.slice(occupiedInstances.length));
}

/**
 * Compiles only explicit local Detail operations without evaluating natural sparse Population.
 * The returned fields use the same density normalization and hashes as a canonical full preview,
 * so Authoring can compose them with the immutable Root-Seed density publication.
 */
export function compileSeedWorldLocalDetailDensityFields(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  operations: readonly SeedWorldDetailBrushOperation[],
  detailSpeciesProfiles: readonly SeedWorldDetailSpeciesProfile[] = SEED_WORLD_DETAIL_SPECIES_PROFILES,
  rockDecorations: readonly SeedWorldDecorationInstance[] = []
): readonly SeedWorldDetailDensityField[] {
  if (operations.some((operation) => operation.distribution !== "local-brush")) {
    throw new RangeError("Local Detail compilation accepts only local-brush operations");
  }
  const localPlan = Object.freeze({
    ...plan,
    detailBrushOperations: Object.freeze([...operations])
  });
  validatePlanAndFields(localPlan, fields);
  return compileDetailDensityFields(localPlan, fields, detailSpeciesProfiles, rockDecorations);
}

/**
 * Quantizes one absolute Detail-density raster through the canonical publication contract.
 * Keeping normalization here prevents local Authoring from inventing a second field format.
 */
export function createSeedWorldDetailDensityField(
  profile: SeedWorldDetailSpeciesProfile,
  resolution: number,
  densities: Float32Array
): SeedWorldDetailDensityField {
  if (!Number.isInteger(resolution) || resolution <= 0 || densities.length !== resolution * resolution) {
    throw new RangeError("Seed World Detail density dimensions do not match the requested field resolution");
  }
  let maximum = 0;
  for (const density of densities) maximum = Math.max(maximum, density);
  const samples = new Uint8Array(densities.length);
  if (maximum > 0) {
    for (let index = 0; index < samples.length; index++) {
      samples[index] = Math.round((densities[index]! / maximum) * 255);
    }
  }
  let hash = 0x811c_9dc5;
  for (const sample of samples) hash = hashUint32(hash, sample);
  hash = hashText(hash, profile.category);
  hash = hashText(hash, profile.assetProfileKey);
  hash = hashText(hash, profile.habitat);
  hash = hashFloat(hash, profile.grasslandWeight);
  hash = hashFloat(hash, profile.forestWeight);
  hash = hashFloat(hash, profile.moistureRange[0]);
  hash = hashFloat(hash, profile.moistureRange[1]);
  hash = hashFloat(hash, profile.preferredMoisture);
  hash = hashFloat(hash, profile.maximumSlope);
  hash = hashText(hash, profile.distribution.kind);
  if (profile.distribution.kind === "warped-cluster") {
    for (const value of profile.distribution.clustersPerSuitableSquareKilometre) hash = hashFloat(hash, value);
    for (const value of profile.distribution.majorRadiusMetres) hash = hashFloat(hash, value);
    for (const value of profile.distribution.minorRadiusMetres) hash = hashFloat(hash, value);
    for (const value of profile.distribution.warpWavelengthMetres) hash = hashFloat(hash, value);
    for (const value of profile.distribution.warpAmplitudeMetres) hash = hashFloat(hash, value);
    hash = hashFloat(hash, profile.distribution.clusteredFraction);
  }
  hash = hashFloat(hash, maximum);
  return Object.freeze({
    prototypeFamily: profile.key,
    category: profile.category,
    assetProfileKey: profile.assetProfileKey,
    resolution,
    maximumDensityPerSquareMetre: maximum,
    samples,
    hash: hash >>> 0
  });
}

/**
 * Lists ownership-transfer buffers for one immutable Detail density result.
 * @param preview Worker-produced authoring result.
 * @returns Distinct DensityField sample buffers safe to transfer to the UI thread.
 */
export function seedWorldPopulationPreviewTransferables(preview: SeedWorldPopulationPreview): readonly Transferable[] {
  return Object.freeze(
    preview.detailDensityFields.flatMap((field) => [
      field.samples.buffer,
      ...(field.heightRangeMetres ? [field.heightRangeMetres.samples.buffer] : [])
    ])
  );
}

function hashPopulationPreview(
  treeSpeciesProfiles: readonly SeedWorldTreeSpeciesProfile[],
  treeCommunityProfile: SeedWorldTreeCommunityProfile,
  vegetationRules: readonly SeedWorldVegetationRule[],
  treeScatterOperations: readonly SeedWorldTreeScatterOperation[],
  detailBrushOperations: readonly SeedWorldDetailBrushOperation[],
  treeInstances: readonly SeedWorldPopulationInstance[],
  detailDensityFields: readonly SeedWorldDetailDensityField[]
): number {
  let hash = 0x811c_9dc5;
  for (const species of treeSpeciesProfiles) {
    hash = hashText(hash, species.key);
    hash = hashText(hash, species.assetRecipeId);
    for (const value of species.moistureRange) hash = hashFloat(hash, value);
    hash = hashFloat(hash, species.preferredMoisture);
    for (const value of species.mountainInfluenceRange) hash = hashFloat(hash, value);
    hash = hashFloat(hash, species.preferredMountainInfluence);
    hash = hashFloat(hash, species.maximumSlope);
    hash = hashFloat(hash, species.relativeAbundance);
    hash = hashFloat(hash, species.densityMultiplier);
    hash = hashFloat(hash, species.waterEdgeAbundanceMultiplier);
    hash = hashFloat(hash, species.ecotoneWavelengthMetres);
    for (const palette of species.palettes) {
      hash = hashText(hash, palette.key);
      hash = hashText(hash, palette.assetRecipeId);
      for (const value of palette.geometryBounds.minimum) hash = hashFloat(hash, value);
      for (const value of palette.geometryBounds.maximum) hash = hashFloat(hash, value);
      hash = hashFloat(hash, palette.relativeAbundance);
    }
  }
  hash = hashUint32(hash, treeCommunityProfile.version);
  hash = hashFloat(hash, treeCommunityProfile.standParentsPerSuitableSquareKilometre);
  for (const value of treeCommunityProfile.standRadiusMetres) hash = hashFloat(hash, value);
  for (const value of treeCommunityProfile.standAspectRatio) hash = hashFloat(hash, value);
  for (const value of treeCommunityProfile.standBoundaryWarpMetres) hash = hashFloat(hash, value);
  for (const value of treeCommunityProfile.speciesPatchRadiusMetres) hash = hashFloat(hash, value);
  hash = hashFloat(hash, treeCommunityProfile.macroGroveLinkDistanceMetres);
  hash = hashUint32(hash, treeCommunityProfile.macroMinimumTreesPerGrove);
  hash = hashFloat(hash, treeCommunityProfile.groveCandidateDensityMultiplier);
  for (const value of treeCommunityProfile.groveSpacingMetres) hash = hashFloat(hash, value);
  hash = hashFloat(hash, treeCommunityProfile.treeUniformScale);
  for (const value of treeCommunityProfile.speciesPurity) hash = hashFloat(hash, value);
  for (const value of treeCommunityProfile.palettePurity) hash = hashFloat(hash, value);
  hash = hashFloat(hash, treeCommunityProfile.gapsPerStandSquareKilometre);
  for (const value of treeCommunityProfile.gapRadiusMetres) hash = hashFloat(hash, value);
  for (const value of treeCommunityProfile.gapAspectRatio) hash = hashFloat(hash, value);
  for (const value of treeCommunityProfile.gapBoundaryWarpMetres) hash = hashFloat(hash, value);
  for (const anchor of treeCommunityProfile.groveAnchors) {
    hash = hashText(hash, anchor.key);
    for (const value of anchor.supportRangeMetres) hash = hashFloat(hash, value);
    for (const value of anchor.fullInfluenceRangeMetres) hash = hashFloat(hash, value);
    hash = hashFloat(hash, anchor.weight);
    hash = hashFloat(hash, anchor.densityMultiplier);
  }
  hash = hashFloat(hash, treeCommunityProfile.riparianMoisture.minimumMoisture);
  hash = hashFloat(hash, treeCommunityProfile.riparianMoisture.fullInfluenceMoisture);
  hash = hashFloat(hash, treeCommunityProfile.riparianMoisture.fullInfluenceRiverDistanceMetres);
  hash = hashFloat(hash, treeCommunityProfile.riparianMoisture.maximumRiverDistanceMetres);
  hash = hashFloat(hash, treeCommunityProfile.riparianMoisture.parentRankMultiplier);
  hash = hashFloat(hash, treeCommunityProfile.riparianMoisture.additionalParentMinimumInfluence);
  hash = hashFloat(hash, treeCommunityProfile.riparianMoisture.additionalParentSpacingMetres);
  hash = hashFloat(hash, treeCommunityProfile.riparianMoisture.standDensityMultiplier);
  hash = hashFloat(hash, treeCommunityProfile.rockySlope.minimumWeight);
  hash = hashFloat(hash, treeCommunityProfile.rockySlope.fullInfluenceWeight);
  hash = hashFloat(hash, treeCommunityProfile.rockySlope.anchorWeight);
  hash = hashFloat(hash, treeCommunityProfile.rockySlope.densityMultiplier);
  hash = hashFloat(hash, treeCommunityProfile.rockySlope.maximumProximityMetres);
  hash = hashFloat(hash, treeCommunityProfile.ninetyDegreeSlopeDensityMultiplier);
  hash = hashFloat(hash, treeCommunityProfile.backgroundDensityMultiplier);
  hash = hashFloat(hash, treeCommunityProfile.standCoreDensityMultiplier);
  hash = hashFloat(hash, treeCommunityProfile.canopyGapRetention);
  hash = hashFloat(hash, treeCommunityProfile.densityNormalization);
  hash = hashFloat(hash, treeCommunityProfile.groveLinkDistanceMetres);
  hash = hashUint32(hash, treeCommunityProfile.minimumTreesPerGrove);
  hash = hashUint32(hash, treeCommunityProfile.maximumTreesPerGrove);
  for (const cohort of treeCommunityProfile.cohorts) {
    hash = hashText(hash, cohort.key);
    hash = hashFloat(hash, cohort.populationWeight);
    for (const value of cohort.scaleRange) hash = hashFloat(hash, value);
    for (const value of cohort.minimumSpacingMetres) hash = hashFloat(hash, value);
    hash = hashFloat(hash, cohort.standInteriorWeight);
    hash = hashFloat(hash, cohort.gapEdgeWeight);
  }
  for (const rule of vegetationRules) {
    hash = hashText(hash, rule.category);
    hash = hashText(hash, rule.profileKey);
    hash = hashFloat(hash, rule.targetDensityPerSquareMetre);
    hash = hashFloat(hash, rule.minimumQualifiedDensity);
    hash = hashUint32(hash, rule.candidatesPerCell);
    hash = hashFloat(hash, rule.clusterWavelengthMetres);
    hash = hashFloat(hash, rule.clusterContrast);
    hash = hashFloat(hash, rule.forestWeight);
    hash = hashFloat(hash, rule.grasslandWeight);
    for (const value of rule.moistureRange) hash = hashFloat(hash, value);
    hash = hashFloat(hash, rule.maximumSlope);
  }
  for (const operation of treeScatterOperations) {
    hash = hashText(hash, operation.id);
    hash = hashText(hash, operation.category);
    hash = hashText(hash, operation.prototypeFamily);
    hash = hashText(hash, operation.distribution);
    if (operation.distribution === "local-brush") {
      hash = hashText(hash, operation.authoringBrushId);
      hash = hashFloat(hash, operation.center.x);
      hash = hashFloat(hash, operation.center.y);
      hash = hashFloat(hash, operation.radiusMetres);
      hash = hashUint32(hash, operation.exactInstanceCount ?? 0);
      hash = hashText(hash, operation.exactPlacement ?? "density");
    }
    hash = hashFloat(hash, operation.densityPerSquareMetre);
    hash = hashFloat(hash, operation.minimumHeightMetres);
    hash = hashFloat(hash, operation.maximumHeightMetres);
    hash = hashUint32(hash, Number(operation.lockWidthToHeight));
    hash = hashUint32(hash, Number(operation.randomRotation));
    hash = hashFloat(hash, operation.colorVariation);
    hash = hashUint32(hash, operation.seed);
  }
  for (const operation of detailBrushOperations) {
    hash = hashText(hash, operation.id);
    hash = hashText(hash, operation.category);
    hash = hashText(hash, operation.brushMaskKey);
    hash = hashText(hash, operation.prototypeFamily);
    hash = hashText(hash, operation.distribution);
    if (operation.distribution === "local-brush") {
      hash = hashFloat(hash, operation.center.x);
      hash = hashFloat(hash, operation.center.y);
      hash = hashFloat(hash, operation.radiusMetres);
      for (const mask of operation.aquaticHabitatMasks ?? []) {
        hash = hashText(hash, mask.kind);
        if (mask.kind === "radial") {
          hash = hashFloat(hash, mask.center.x);
          hash = hashFloat(hash, mask.center.y);
          hash = hashFloat(hash, mask.radiusMetres);
          hash = hashText(hash, mask.featureKind);
          hash = hashUint32(hash, mask.shorelineIrregularityPermille);
          hash = hashUint32(hash, mask.seed);
        } else {
          hash = hashFloat(hash, mask.halfWidthMetres);
          for (const point of mask.points) {
            hash = hashFloat(hash, point.x);
            hash = hashFloat(hash, point.y);
          }
        }
      }
    }
    hash = hashFloat(hash, operation.opacity);
    hash = hashFloat(hash, operation.targetDensityPerSquareMetre);
    hash = hashUint32(hash, operation.seed);
  }
  for (const instance of treeInstances) {
    hash = hashText(hash, instance.id);
    hash = hashText(hash, instance.category);
    if (instance.authoringBrushId) hash = hashText(hash, instance.authoringBrushId);
    hash = hashFloat(hash, instance.normalizedPosition.x);
    hash = hashFloat(hash, instance.normalizedPosition.y);
    hash = hashUint32(hash, instance.prototypeRank);
    if (instance.treeSpeciesProfileKey) hash = hashText(hash, instance.treeSpeciesProfileKey);
    if (instance.treeCohortProfileKey) hash = hashText(hash, instance.treeCohortProfileKey);
    if (instance.assetRecipeId) hash = hashText(hash, instance.assetRecipeId);
    if (instance.treeCommunityId) hash = hashText(hash, instance.treeCommunityId);
    if (instance.treeClusterId) hash = hashText(hash, instance.treeClusterId);
    if (instance.treePaletteKey) hash = hashText(hash, instance.treePaletteKey);
    hash = hashFloat(hash, instance.yawRadians);
    hash = hashFloat(hash, instance.colorVariation);
    for (const scale of instance.scale) hash = hashFloat(hash, scale);
  }
  for (const field of detailDensityFields) {
    hash = hashText(hash, field.prototypeFamily);
    hash = hashUint32(hash, field.resolution);
    hash = hashFloat(hash, field.maximumDensityPerSquareMetre);
    hash = hashUint32(hash, field.hash);
  }
  return hash >>> 0;
}

function compileTreeScatterInstances(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rockDecorations: readonly SeedWorldDecorationInstance[]
): readonly SeedWorldPopulationInstance[] {
  const densityInstances: SeedWorldPopulationInstance[] = [];
  const groveCandidateInstances: SeedWorldPopulationInstance[] = [];
  const localOperationsByBrush = new Map<
    string,
    Extract<SeedWorldTreeScatterOperation, { distribution: "local-brush" }>[]
  >();
  const naturalTreeInstanceIds = new Set<string>();
  const groveTreeInstanceIds = new Set<string>();
  for (const operation of plan.treeScatterOperations) {
    if (operation.distribution === "local-brush") {
      const operations = localOperationsByBrush.get(operation.authoringBrushId);
      if (operations) operations.push(operation);
      else localOperationsByBrush.set(operation.authoringBrushId, [operation]);
      continue;
    }
    const rule = plan.vegetationRules.find((candidate) => candidate.category === operation.category);
    if (!rule) throw new RangeError(`Seed World is missing a ${operation.category} vegetation rule`);
    const candidateAreaSquareMetres = plan.sizeMetres * plan.sizeMetres;
    const candidateCount = Math.ceil(candidateAreaSquareMetres * operation.densityPerSquareMetre);
    for (let ordinal = 0; ordinal < candidateCount; ordinal++) {
      const instance = compileTreeScatterCandidate(plan, fields, rockDecorations, operation, rule, ordinal);
      if (!instance) continue;
      densityInstances.push(instance);
      if (operation.category === "tree" && operation.distribution === "habitat-fill") {
        naturalTreeInstanceIds.add(instance.id);
      }
    }
    if (operation.category === "tree" && operation.distribution === "habitat-fill") {
      const groveCandidateCount = Math.ceil(candidateCount * plan.treeCommunityProfile.groveCandidateDensityMultiplier);
      for (let ordinal = 0; ordinal < groveCandidateCount; ordinal++) {
        const instance = compileTreeScatterCandidate(plan, fields, rockDecorations, operation, rule, ordinal, {
          identitySuffix: `grove:${ordinal}`,
          assignTreeCluster: true
        });
        if (!instance) continue;
        groveCandidateInstances.push(instance);
        groveTreeInstanceIds.add(instance.id);
      }
    }
  }
  const competedDensityInstances = applySeedWorldTreeCompetition(plan, densityInstances, new Set<string>());
  const macroInstances = retainSeedWorldMacroTreeGroves(plan, competedDensityInstances, naturalTreeInstanceIds);
  const competedGroveInstances = applySeedWorldTreeCompetition(plan, groveCandidateInstances, groveTreeInstanceIds);
  const smallGroveInstances = retainSeedWorldTreeClusters(plan, fields, competedGroveInstances, groveTreeInstanceIds);
  const targetTrees = [...macroInstances, ...smallGroveInstances].filter((instance) => instance.category === "tree");
  const packedTrees = packSeedWorldTreeInstancesByBounds(
    plan,
    fields,
    targetTrees,
    [...densityInstances, ...groveCandidateInstances].filter((instance) => instance.category === "tree")
  ).instances;
  const naturalInstances = Object.freeze([
    ...macroInstances.filter((instance) => instance.category !== "tree"),
    ...packedTrees
  ]);
  const instances = [...naturalInstances];
  const naturalObstacleIds = new Set(
    naturalInstances.filter(({ category }) => category === "tree").map(({ id }) => id)
  );
  for (const brushId of localOperationsByBrush.keys()) {
    const operations = localOperationsByBrush.get(brushId)!;
    const additions = compileSeedWorldLocalTreeScatterOperations(
      plan,
      fields,
      operations,
      instances,
      naturalObstacleIds,
      rockDecorations
    );
    instances.push(...additions);
  }
  return Object.freeze(instances);
}

function appendExactTreeScatterOperations(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rockDecorations: readonly SeedWorldDecorationInstance[],
  operations: readonly Extract<SeedWorldTreeScatterOperation, { distribution: "local-brush" }>[],
  instances: SeedWorldPopulationInstance[],
  clearance: PopulationInstanceClearanceIndex
): void {
  for (const operation of operations) {
    const targetCount = operation.exactInstanceCount!;
    if (
      !Number.isInteger(targetCount) ||
      targetCount <= 0 ||
      targetCount > SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES
    ) {
      throw new RangeError(
        `Exact vegetation operation '${operation.id}' requires an integer count between 1 and ` +
          `${SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES}`
      );
    }
    const rule = plan.vegetationRules.find((candidate) => candidate.category === operation.category);
    if (!rule) throw new RangeError(`Seed World is missing a ${operation.category} vegetation rule`);
    if (operation.category === "shrub") {
      for (let ordinal = 0; ordinal < targetCount; ordinal++) {
        const instance = compileTreeScatterCandidate(plan, fields, rockDecorations, operation, rule, ordinal);
        if (!instance) {
          throw new Error(`Authored shrub operation '${operation.id}' could not resolve its in-bounds centre`);
        }
        instances.push(instance);
        clearance.add(instance);
      }
      continue;
    }
    const candidatePositions = compileExactVegetationCandidatePositions(plan, operation, rule, targetCount);
    let realizedCount = 0;
    for (let ordinal = 0; ordinal < candidatePositions.length && realizedCount < targetCount; ordinal++) {
      const instance = compileTreeScatterCandidate(plan, fields, rockDecorations, operation, rule, ordinal, {
        worldPosition: candidatePositions[ordinal]
      });
      if (!instance || clearance.overlaps(instance)) continue;
      instances.push(instance);
      clearance.add(instance);
      realizedCount++;
    }
    if (realizedCount !== targetCount) {
      throw new RangeError(
        `VEGETATION_CAPACITY_EXCEEDED: '${operation.id}' requested ${targetCount} ${operation.category} instances ` +
          `inside radius ${operation.radiusMetres}m, but only ${realizedCount} valid non-overlapping placements exist ` +
          `across ${candidatePositions.length} deterministic layout slots`
      );
    }
  }
}

interface TreeScatterCandidateOptions {
  readonly worldPosition?: readonly [worldX: number, worldZ: number];
  readonly identitySuffix?: string;
  readonly assignTreeCluster?: boolean;
}

function compileTreeScatterCandidate(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rockDecorations: readonly SeedWorldDecorationInstance[],
  operation: SeedWorldTreeScatterOperation,
  rule: SeedWorldVegetationRule,
  ordinal: number,
  options: TreeScatterCandidateOptions = {}
): SeedWorldPopulationInstance | undefined {
  const identitySuffix = options.identitySuffix ?? `${ordinal}`;
  const candidateSeed = deriveSeedWorldNamedSeed(operation.seed, `candidate:${identitySuffix}`);
  const authoredShrub = operation.distribution === "local-brush" && operation.category === "shrub";
  let [worldX, worldZ] = options.worldPosition ?? sampleTreeScatterCandidate(plan, operation, candidateSeed);
  let sample = sampleSeedWorldPopulation(plan, fields, worldX, worldZ);
  if (!sample && authoredShrub) {
    worldX = (operation.center.x - 0.5) * plan.sizeMetres;
    worldZ = (operation.center.y - 0.5) * plan.sizeMetres;
    sample = sampleSeedWorldPopulation(plan, fields, worldX, worldZ);
  }
  if (!sample || (!authoredShrub && operation.category !== "tree" && sample.water)) {
    return undefined;
  }
  const treeCommunity =
    operation.category === "tree"
      ? sampleSeedWorldTreeCommunityAtSite(plan, fields, worldX, worldZ, sample)
      : undefined;
  const treeSpecies =
    operation.category === "tree"
      ? (selectSeedWorldTreeSpecies(plan, fields, sample, worldX, worldZ, treeCommunity!, candidateSeed) ??
        (operation.distribution === "local-brush" ? selectAuthoredTreeSpecies(plan, candidateSeed) : undefined))
      : undefined;
  if (operation.category === "tree" && !treeSpecies) return undefined;
  const treeCohort = treeCommunity ? selectSeedWorldTreeCohort(plan, candidateSeed, treeCommunity) : undefined;
  if (operation.distribution === "habitat-fill") {
    const coverWeight = operation.category === "tree" ? 1 : sample.landCover === SeedWorldLandCover.Wetland ? 0 : 1;
    const moisture =
      operation.category === "shrub"
        ? moistureFieldDensity(sample.moisture, rule.moistureRange)
        : moistureDensitySuitability(sample.moisture, rule.moistureRange);
    const terrainDensityMultiplier =
      operation.category === "tree"
        ? 1
        : (1 - smoothstep(rule.maximumSlope * 0.72, rule.maximumSlope, sample.slope)) * (1 - sample.rockySlopeWeight);
    const maximumSpeciesDensityMultiplier =
      operation.category === "tree"
        ? Math.max(1, ...plan.treeSpeciesProfiles.map((profile) => profile.densityMultiplier))
        : 1;
    const speciesDensityMultiplier = treeSpecies?.densityMultiplier ?? 1;
    const habitatSuitability =
      coverWeight *
      moisture *
      terrainDensityMultiplier *
      (speciesDensityMultiplier / maximumSpeciesDensityMultiplier) *
      (treeCommunity?.densityMultiplier ?? 1);
    if (habitatSuitability <= 0 || unitFloat(candidateSeed, "habitat-accept") >= habitatSuitability) return undefined;
  }
  const resolvedPlacement = resolveSeedWorldAssetPlacement(
    compilePopulationTransformIntent(plan, rule, sample, worldX, worldZ, candidateSeed, treeSpecies, treeCohort),
    { lockWidthToHeight: operation.lockWidthToHeight }
  );
  const scaledPlacement =
    operation.category === "tree" ? applySeedWorldTreeUniformScale(plan, resolvedPlacement) : resolvedPlacement;
  const treeAppearance = treeSpecies
    ? compileSeedWorldTreeAppearance(plan, treeSpecies, treeCommunity!, candidateSeed)
    : undefined;
  const placement = treeAppearance
    ? applySeedWorldTreeGeometryFootprint(plan, scaledPlacement, treeAppearance.assetRecipeId)
    : scaledPlacement;
  const yawRadians = operation.randomRotation ? unitFloat(candidateSeed, "yaw") * Math.PI * 2 : 0;
  if (
    !authoredShrub &&
    !seedWorldPopulationPositionHasExactClearanceWithRule(plan, fields, rule, worldX, worldZ, placement, sample)
  ) {
    return undefined;
  }
  const footprintRadiusMetres = Math.max(placement.footprintMetres[0], placement.footprintMetres[1]) * 0.5;
  if (
    !authoredShrub &&
    populationFootprintOverlapsLargeRock(plan, rockDecorations, worldX, worldZ, footprintRadiusMetres)
  ) {
    return undefined;
  }
  const cellX = Math.min(
    populationCellCount(plan.sizeMetres) - 1,
    Math.max(0, Math.floor((worldX + plan.sizeMetres * 0.5) / SEED_WORLD_POPULATION_CELL_METRES))
  );
  const cellZ = Math.min(
    populationCellCount(plan.sizeMetres) - 1,
    Math.max(0, Math.floor((worldZ + plan.sizeMetres * 0.5) / SEED_WORLD_POPULATION_CELL_METRES))
  );
  return Object.freeze({
    id: `population:${operation.id}:${identitySuffix}`,
    category: operation.category,
    sourceCellId: `cell-${cellX}-${cellZ}`,
    ordinal,
    ...(operation.distribution === "local-brush" ? { authoringBrushId: operation.authoringBrushId } : {}),
    normalizedPosition: Object.freeze({
      x: worldX / plan.sizeMetres + 0.5,
      y: worldZ / plan.sizeMetres + 0.5
    }),
    intent: placement.intent,
    profileVersion: placement.profileVersion,
    prototypeFamily: placement.prototypeFamily as "tree" | "shrub",
    prototypeRank: deriveSeedWorldNamedSeed(candidateSeed, "prototype-rank"),
    ...(treeSpecies
      ? {
          treeSpeciesProfileKey: treeSpecies.key,
          treeCohortProfileKey: treeCohort!.key,
          ...treeAppearance!,
          ...(operation.distribution === "habitat-fill" && options.assignTreeCluster
            ? { treeClusterId: treeCommunity!.communityId }
            : {})
        }
      : {}),
    scale: placement.scale,
    footprintMetres: placement.footprintMetres,
    yawRadians,
    colorVariation: (unitFloat(candidateSeed, "color") * 2 - 1) * operation.colorVariation
  });
}

/**
 * Builds a finite deterministic layout domain for one exact cluster.
 *
 * Unlike the former rejection loop, this solver has two explicit contracts:
 * (1) an area-based upper bound rejects geometrically impossible requests
 * before sampling terrain, and (2) the remaining work is bounded by a small
 * constant multiple of the requested count. Terrain, water, roads, rocks and
 * existing vegetation still participate in the final acceptance gate.
 */
export function compileExactVegetationCandidatePositions(
  plan: Pick<SeedWorldPlan, "sizeMetres">,
  operation: Pick<
    Extract<SeedWorldTreeScatterOperation, { distribution: "local-brush" }>,
    "id" | "category" | "center" | "radiusMetres" | "exactPlacement" | "seed" | "lockWidthToHeight"
  >,
  rule: Pick<SeedWorldVegetationRule, "profileKey">,
  targetCount: number
): readonly (readonly [worldX: number, worldZ: number])[] {
  const minimumFootprintRadiusMetres = minimumExactVegetationFootprintRadiusMetres(operation, rule);
  const geometricCapacity = Math.max(
    1,
    Math.floor(((operation.radiusMetres + minimumFootprintRadiusMetres) / minimumFootprintRadiusMetres) ** 2)
  );
  if (targetCount > geometricCapacity) {
    throw new RangeError(
      `VEGETATION_CAPACITY_EXCEEDED: '${operation.id}' requested ${targetCount} ${operation.category} instances ` +
        `inside radius ${operation.radiusMetres}m, whose geometric capacity is at most ${geometricCapacity}`
    );
  }

  const desiredSlotBudget = Math.max(128, targetCount * 12);
  // A centre placement needs nearby search hypotheses even though only one
  // instance can fit geometrically at once. Scatter placement keeps its former
  // non-overlapping candidate budget. Final separation is enforced by the
  // PopulationInstanceClearanceIndex in both cases.
  const slotBudget =
    operation.exactPlacement === "center" ? desiredSlotBudget : Math.min(geometricCapacity, desiredSlotBudget);
  const budgetSpacingMetres = operation.radiusMetres * Math.sqrt((2 * Math.PI) / (Math.sqrt(3) * slotBudget));
  const spacingMetres =
    operation.exactPlacement === "center"
      ? budgetSpacingMetres
      : Math.max(minimumFootprintRadiusMetres * 2, budgetSpacingMetres);
  const rowSpacingMetres = spacingMetres * Math.sqrt(3) * 0.5;
  const rowExtent = Math.ceil(operation.radiusMetres / rowSpacingMetres);
  const columnExtent = Math.ceil(operation.radiusMetres / spacingMetres) + 1;
  const centerX = (operation.center.x - 0.5) * plan.sizeMetres;
  const centerZ = (operation.center.y - 0.5) * plan.sizeMetres;
  const rotation = unitFloat(operation.seed, "exact-layout-rotation") * Math.PI * 2;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const candidates: Array<{
    readonly position: readonly [worldX: number, worldZ: number];
    readonly distanceSquared: number;
    readonly rank: number;
  }> = [];
  let slotOrdinal = 0;
  for (let row = -rowExtent; row <= rowExtent; row++) {
    const localZ = row * rowSpacingMetres;
    const rowOffset = (Math.abs(row) % 2) * spacingMetres * 0.5;
    for (let column = -columnExtent; column <= columnExtent; column++) {
      const localX = column * spacingMetres + rowOffset;
      if (Math.hypot(localX, localZ) > operation.radiusMetres + 1e-9) continue;
      const rotatedX = localX * cosine - localZ * sine;
      const rotatedZ = localX * sine + localZ * cosine;
      candidates.push({
        position: Object.freeze([centerX + rotatedX, centerZ + rotatedZ] as const),
        distanceSquared: localX * localX + localZ * localZ,
        rank: deriveSeedWorldNamedSeed(operation.seed, `exact-layout-slot:${slotOrdinal++}`)
      });
    }
  }
  candidates.sort((left, right) =>
    operation.exactPlacement === "center"
      ? left.distanceSquared - right.distanceSquared || left.rank - right.rank
      : left.rank - right.rank
  );
  return Object.freeze(candidates.slice(0, slotBudget).map(({ position }) => position));
}

function minimumExactVegetationFootprintRadiusMetres(
  operation: Pick<Extract<SeedWorldTreeScatterOperation, { distribution: "local-brush" }>, "lockWidthToHeight">,
  rule: Pick<SeedWorldVegetationRule, "profileKey">
): number {
  const profile = getSeedWorldAssetPlacementProfile(rule.profileKey);
  const fieldRange = profile.roleScale.field;
  if (!fieldRange) throw new RangeError(`Vegetation profile '${profile.key}' has no field scale range`);
  const shapeMinimum = operation.lockWidthToHeight ? 1 : 0.82;
  return (
    Math.max(profile.geometry.footprintMetres[0], profile.geometry.footprintMetres[1]) *
    fieldRange.minimum *
    shapeMinimum *
    0.5
  );
}

function sampleTreeScatterCandidate(
  plan: SeedWorldPlan,
  operation: SeedWorldTreeScatterOperation,
  candidateSeed: number
): readonly [worldX: number, worldZ: number] {
  if (operation.distribution === "habitat-fill") {
    return [
      (unitFloat(candidateSeed, "x") - 0.5) * plan.sizeMetres,
      (unitFloat(candidateSeed, "z") - 0.5) * plan.sizeMetres
    ];
  }
  if (operation.exactPlacement === "center") {
    return [(operation.center.x - 0.5) * plan.sizeMetres, (operation.center.y - 0.5) * plan.sizeMetres];
  }
  const radius = Math.sqrt(unitFloat(candidateSeed, "radius")) * operation.radiusMetres;
  const angle = unitFloat(candidateSeed, "angle") * Math.PI * 2;
  return [
    (operation.center.x - 0.5) * plan.sizeMetres + Math.cos(angle) * radius,
    (operation.center.y - 0.5) * plan.sizeMetres + Math.sin(angle) * radius
  ];
}

function compileDetailDensityFields(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  detailSpeciesProfiles: readonly SeedWorldDetailSpeciesProfile[],
  rockDecorations: readonly SeedWorldDecorationInstance[]
): readonly SeedWorldDetailDensityField[] {
  const resolution = fields.surfaceResolution;
  const rockCoverage = compileLargeRockDetailCoverage(plan, fields, rockDecorations);
  const riparianVegetationWeights = new Map<SeedWorldDetailSpeciesProfile["category"], Float32Array>();
  const densityByPrototype = new Map<string, Float32Array>();
  for (const profile of detailSpeciesProfiles) {
    if (densityByPrototype.has(profile.key))
      throw new RangeError(`Duplicate Seed World Detail species "${profile.key}"`);
    densityByPrototype.set(profile.key, new Float32Array(resolution * resolution));
  }
  const suitabilityByConstraints = new Map<string, Float32Array>();
  const roadWeightsByCategory = new Map<SeedWorldDetailSpeciesProfile["category"], Float32Array>();
  for (const operation of plan.detailBrushOperations) {
    const profile = getSeedWorldDetailSpeciesProfile(detailSpeciesProfiles, operation.prototypeFamily);
    if (profile.category !== operation.category) {
      throw new RangeError(`Seed World Detail operation "${operation.id}" category does not match its species profile`);
    }
    const densities = densityByPrototype.get(operation.prototypeFamily)!;
    let riparianVegetationWeight = riparianVegetationWeights.get(profile.category);
    if (!riparianVegetationWeight) {
      riparianVegetationWeight = compileDetailRiparianVegetationWeight(plan, fields, profile.category);
      riparianVegetationWeights.set(profile.category, riparianVegetationWeight);
    }
    let roadVegetationWeights = roadWeightsByCategory.get(profile.category);
    if (profile.category !== "grass" && !roadVegetationWeights) {
      roadVegetationWeights = compileSeedWorldRoadVegetationWeights(
        plan,
        resolution,
        detailRoadBoundaryClearanceMetres(profile, fields.sizeMetres / resolution)
      );
      roadWeightsByCategory.set(profile.category, roadVegetationWeights);
    }
    const suitabilityKey = detailBaseSuitabilityKey(operation, profile);
    let baseSuitability = suitabilityByConstraints.get(suitabilityKey);
    if (!baseSuitability) {
      baseSuitability = compileDetailBaseSuitability(
        plan,
        fields,
        operation,
        profile,
        roadVegetationWeights,
        riparianVegetationWeight,
        rockCoverage
      );
      suitabilityByConstraints.set(suitabilityKey, baseSuitability);
    }
    const distributionMultiplier =
      profile.distribution.kind === "uniform-habitat"
        ? undefined
        : compileSeedWorldDetailDistribution(plan.sizeMetres, resolution, operation.seed, profile, baseSuitability);
    const bounds = detailBrushSampleBounds(operation, plan.sizeMetres, resolution);
    const { minimumX, maximumX, minimumY, maximumY } = bounds;
    for (let y = minimumY; y <= maximumY; y++) {
      for (let x = minimumX; x <= maximumX; x++) {
        const index = y * resolution + x;
        const density =
          operation.opacity *
          operation.targetDensityPerSquareMetre *
          baseSuitability[index]! *
          (distributionMultiplier?.[index] ?? 1);
        densities[index] =
          operation.distribution === "local-brush" && profile.habitat !== "aquatic"
            ? densities[index]! + density
            : Math.max(densities[index]!, density);
      }
    }
  }
  return Object.freeze(
    detailSpeciesProfiles.map((profile) =>
      createSeedWorldDetailDensityField(profile, resolution, densityByPrototype.get(profile.key)!)
    )
  );
}

function detailBaseSuitabilityKey(
  operation: SeedWorldDetailBrushOperation,
  profile: SeedWorldDetailSpeciesProfile
): string {
  const brush =
    operation.distribution === "local-brush"
      ? `${operation.center.x}:${operation.center.y}:${operation.radiusMetres}:${operation.id}`
      : "world";
  return [
    profile.category,
    operation.distribution,
    operation.brushMaskKey,
    brush,
    profile.category,
    profile.habitat,
    profile.grasslandWeight,
    profile.forestWeight,
    profile.moistureRange[0],
    profile.moistureRange[1],
    profile.maximumSlope
  ].join(":");
}

function compileDetailBaseSuitability(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  operation: SeedWorldDetailBrushOperation,
  profile: SeedWorldDetailSpeciesProfile,
  roadVegetationWeights: Float32Array | undefined,
  riparianVegetationWeight: Float32Array,
  rockCoverage: Uint8Array
): Float32Array {
  const resolution = fields.surfaceResolution;
  const suitability = new Float32Array(resolution * resolution);
  const bounds = detailBrushSampleBounds(operation, plan.sizeMetres, resolution);
  for (let y = bounds.minimumY; y <= bounds.maximumY; y++) {
    const worldZ = ((y + 0.5) / resolution - 0.5) * plan.sizeMetres;
    for (let x = bounds.minimumX; x <= bounds.maximumX; x++) {
      const worldX = ((x + 0.5) / resolution - 0.5) * plan.sizeMetres;
      if (
        operation.distribution === "local-brush" &&
        !detailBrushContains(operation, plan.sizeMetres, worldX, worldZ, (plan.sizeMetres / resolution) * Math.SQRT1_2)
      ) {
        continue;
      }
      const index = y * resolution + x;
      if (profile.habitat === "aquatic") {
        suitability[index] = aquaticHabitatWeight(operation, fields, index, worldX, worldZ);
        continue;
      }
      if (operation.distribution === "local-brush") {
        suitability[index] = 1;
        continue;
      }
      // Grass keeps the Terrain-owned surface coverage in its DensityField and
      // lets the GPU turn that same coverage into continuous clump scale. A
      // second road-clearance curve would recreate the sparse, detached fringe.
      const roadVegetationWeight = roadVegetationWeights?.[index] ?? 1;
      if (roadVegetationWeight <= 0) continue;
      const riparianWeight = riparianVegetationWeight[index]!;
      if (riparianWeight <= 0) continue;
      const naturalSurfaceWeight = detailVegetationSurfaceWeight(fields, index, profile.category);
      const vegetationSurfaceWeight = naturalSurfaceWeight;
      if (vegetationSurfaceWeight <= 0) continue;
      // Grass is continuous ground cover. Let it extend beneath rocks so the raster texel fringe
      // cannot become visible before the actual mesh boundary; discrete vegetation keeps clearance.
      const rockClearanceWeight = profile.category === "grass" ? 1 : 1 - rockCoverage[index]! / 255;
      if (rockClearanceWeight <= 0) continue;
      const habitatMultiplier =
        fields.habitat[index] === SeedWorldLandCover.Forest ? profile.forestWeight : profile.grasslandWeight;
      suitability[index] =
        vegetationSurfaceWeight *
        roadVegetationWeight *
        riparianWeight *
        rockClearanceWeight *
        habitatMultiplier *
        detailMoistureDensity(fields.wetness[index]! / 255, profile);
    }
  }
  return suitability;
}

function detailVegetationSurfaceWeight(
  fields: SeedWorldFields,
  index: number,
  category: SeedWorldDetailSpeciesProfile["category"]
): number {
  const grassSurfaceWeight = resolveSeedWorldGrassSurfaceWeight(fields, index);
  if (category !== "flower") return grassSurfaceWeight / 255;
  // On dry terrain the wetland material is moist soil, not Water. Flowers may occupy both
  // natural ground channels; the authoritative WaterMask has already rejected submerged texels.
  return Math.min(255, grassSurfaceWeight + fields.materialWeights[index * 4 + 1]!) / 255;
}

function detailRoadBoundaryClearanceMetres(
  profile: SeedWorldDetailSpeciesProfile,
  coverageTexelMetres: number
): number {
  const placement = getSeedWorldAssetPlacementProfile(profile.category);
  const maximumScale = placement.roleScale.field!.maximum;
  const renderedFootprintRadiusMetres =
    Math.max(placement.geometry.footprintMetres[0], placement.geometry.footprintMetres[1]) * maximumScale * 1.18 * 0.5;
  return coverageTexelMetres * Math.SQRT1_2 + renderedFootprintRadiusMetres;
}

function aquaticHabitatWeight(
  operation: SeedWorldDetailBrushOperation,
  fields: SeedWorldFields,
  sampleIndex: number,
  worldX: number,
  worldZ: number
): number {
  const naturalWaterWeight = fields.waterMask[sampleIndex]! / 255;
  if (naturalWaterWeight > 0) return naturalWaterWeight;
  if (operation.distribution !== "local-brush") return 0;
  for (const mask of operation.aquaticHabitatMasks ?? []) {
    if (aquaticHabitatMaskContains(mask, fields.sizeMetres, worldX, worldZ)) return 1;
  }
  return 0;
}

function aquaticHabitatMaskContains(
  mask: SeedWorldAquaticHabitatMask,
  sizeMetres: number,
  worldX: number,
  worldZ: number
): boolean {
  if (mask.kind === "radial") {
    const worldSizeMillimetres = Math.round(sizeMetres * 1_000);
    const profile = sampleSeedWorldWaterBasinProfileV1(
      {
        kind: "radial-water-basin",
        featureKind: mask.featureKind,
        centerXOffsetMillimetres: Math.round(mask.center.x * worldSizeMillimetres),
        centerZOffsetMillimetres: Math.round(mask.center.y * worldSizeMillimetres),
        radiusMillimetres: Math.round(mask.radiusMetres * 1_000),
        depthMillimetres: 1,
        shorelineIrregularityPermille: mask.shorelineIrregularityPermille,
        canonicalWaterLevelMillimetres: 0,
        surfaceLevelOffsetMillimetres: 0,
        seed: mask.seed
      },
      Math.round((worldX + sizeMetres * 0.5) * 1_000),
      Math.round((worldZ + sizeMetres * 0.5) * 1_000)
    );
    // The authored Water runtime keeps its surface below the former ground plane.
    // A basin profile at or below this threshold is shoreline terrain, not submerged habitat.
    return profile > 0.18;
  }
  for (let index = 1; index < mask.points.length; index++) {
    const start = mask.points[index - 1]!;
    const end = mask.points[index]!;
    if (
      distanceToLineSegment(
        worldX,
        worldZ,
        (start.x - 0.5) * sizeMetres,
        (start.y - 0.5) * sizeMetres,
        (end.x - 0.5) * sizeMetres,
        (end.y - 0.5) * sizeMetres
      ) <= mask.halfWidthMetres
    ) {
      return true;
    }
  }
  return false;
}

function distanceToLineSegment(
  x: number,
  z: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number
): number {
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const ratio =
    lengthSquared <= Number.EPSILON
      ? 0
      : Math.min(1, Math.max(0, ((x - startX) * deltaX + (z - startZ) * deltaZ) / lengthSquared));
  return Math.hypot(x - (startX + deltaX * ratio), z - (startZ + deltaZ * ratio));
}

function compileLargeRockDetailCoverage(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rocks: readonly SeedWorldDecorationInstance[]
): Uint8Array {
  const resolution = fields.surfaceResolution;
  const cellMetres = fields.sizeMetres / resolution;
  const halfTexelDiagonalMetres = cellMetres * Math.SQRT1_2;
  const coverage = new Uint8Array(resolution * resolution);
  for (const rock of rocks) {
    const centerX = (rock.normalizedPosition.x - 0.5) * plan.sizeMetres;
    const centerZ = (rock.normalizedPosition.y - 0.5) * plan.sizeMetres;
    const cosine = Math.cos(rock.yawRadians);
    const sine = Math.sin(rock.yawRadians);
    const halfWidth = rock.footprintMetres[0] * 0.5;
    const halfDepth = rock.footprintMetres[1] * 0.5;
    const extentX = Math.abs(cosine) * halfWidth + Math.abs(sine) * halfDepth + halfTexelDiagonalMetres;
    const extentZ = Math.abs(sine) * halfWidth + Math.abs(cosine) * halfDepth + halfTexelDiagonalMetres;
    const minimumX = Math.max(0, Math.floor((centerX - extentX + fields.sizeMetres * 0.5) / cellMetres));
    const maximumX = Math.min(resolution - 1, Math.floor((centerX + extentX + fields.sizeMetres * 0.5) / cellMetres));
    const minimumZ = Math.max(0, Math.floor((centerZ - extentZ + fields.sizeMetres * 0.5) / cellMetres));
    const maximumZ = Math.min(resolution - 1, Math.floor((centerZ + extentZ + fields.sizeMetres * 0.5) / cellMetres));
    for (let z = minimumZ; z <= maximumZ; z++) {
      const worldZ = (z + 0.5) * cellMetres - fields.sizeMetres * 0.5;
      for (let x = minimumX; x <= maximumX; x++) {
        const worldX = (x + 0.5) * cellMetres - fields.sizeMetres * 0.5;
        const signedDistanceMetres = pointToOrientedRectangleSignedDistance(
          worldX,
          worldZ,
          centerX,
          centerZ,
          halfWidth,
          halfDepth,
          cosine,
          sine
        );
        const rockCoverage = 1 - smoothstep(-halfTexelDiagonalMetres, halfTexelDiagonalMetres, signedDistanceMetres);
        const index = z * resolution + x;
        coverage[index] = Math.max(coverage[index]!, Math.round(rockCoverage * 255));
      }
    }
  }
  return coverage;
}

function compileDetailRiparianVegetationWeight(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  category: SeedWorldDetailSpeciesProfile["category"]
): Float32Array {
  const resolution = fields.surfaceResolution;
  const weights = new Float32Array(resolution * resolution);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const index = y * resolution + x;
      if (fields.waterMask[index] !== 0) continue;
      const normalizedPosition = { x: (x + 0.5) / resolution, y: (y + 0.5) / resolution };
      const coastDistanceMetres = sampleSeedWorldCoastSignedFieldMetres(plan.coastShape, normalizedPosition);
      const signedWaterDistanceMetres = Math.min(coastDistanceMetres, fields.riverBankDistanceMetres[index]!);
      const weight =
        category === "flower"
          ? resolveSeedWorldRiparianFlowerWeight(signedWaterDistanceMetres)
          : resolveSeedWorldRiparianVegetationWeight(signedWaterDistanceMetres);
      weights[index] = category === "flower" ? weight : Math.round(weight * 255) / 255;
    }
  }
  return weights;
}

function detailMoistureDensity(moisture: number, profile: SeedWorldDetailSpeciesProfile): number {
  if (profile.category === "flower" && profile.moistureRange[1] >= 1 && moisture >= profile.preferredMoisture) {
    return 1;
  }
  return moistureFieldDensity(moisture, profile.moistureRange, profile.preferredMoisture);
}

function pointToOrientedRectangleSignedDistance(
  worldX: number,
  worldZ: number,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
  cosine: number,
  sine: number
): number {
  const offsetX = worldX - centerX;
  const offsetZ = worldZ - centerZ;
  const localX = Math.abs(offsetX * cosine + offsetZ * sine) - halfWidth;
  const localZ = Math.abs(-offsetX * sine + offsetZ * cosine) - halfDepth;
  const outsideDistance = Math.hypot(Math.max(localX, 0), Math.max(localZ, 0));
  return outsideDistance + Math.min(Math.max(localX, localZ), 0);
}

function populationFootprintOverlapsLargeRock(
  plan: SeedWorldPlan,
  rocks: readonly SeedWorldDecorationInstance[],
  worldX: number,
  worldZ: number,
  radiusMetres: number
): boolean {
  for (const rock of rocks) {
    const centerX = (rock.normalizedPosition.x - 0.5) * plan.sizeMetres;
    const centerZ = (rock.normalizedPosition.y - 0.5) * plan.sizeMetres;
    if (
      circleOverlapsOrientedRectangle(
        worldX,
        worldZ,
        radiusMetres,
        centerX,
        centerZ,
        rock.footprintMetres[0] * 0.5,
        rock.footprintMetres[1] * 0.5,
        Math.cos(rock.yawRadians),
        Math.sin(rock.yawRadians)
      )
    ) {
      return true;
    }
  }
  return false;
}

export function circleOverlapsOrientedRectangle(
  worldX: number,
  worldZ: number,
  radiusMetres: number,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
  cosine: number,
  sine: number
): boolean {
  const offsetX = worldX - centerX;
  const offsetZ = worldZ - centerZ;
  const localX = offsetX * cosine + offsetZ * sine;
  const localZ = -offsetX * sine + offsetZ * cosine;
  const outsideX = Math.max(Math.abs(localX) - halfWidth, 0);
  const outsideZ = Math.max(Math.abs(localZ) - halfDepth, 0);
  return Math.hypot(outsideX, outsideZ) <= radiusMetres;
}

function moistureDensitySuitability(
  moisture: number,
  range: readonly [minimum: number, maximum: number],
  preferredMoisture = (range[0] + range[1]) * 0.5
): number {
  const transition = Math.min(0.1, (range[1] - range[0]) * 0.2);
  const support = intervalSuitability(moisture, range[0], range[1], transition);
  const distance = Math.abs(moisture - preferredMoisture);
  const sideWidth = moisture < preferredMoisture ? preferredMoisture - range[0] : range[1] - preferredMoisture;
  const normalizedDistance = distance / (Math.max(sideWidth, Number.EPSILON) + transition);
  const preference = 1 - smoothstep(0, 1, normalizedDistance);
  return support * mix(0.25, 1, preference);
}

function moistureFieldDensity(
  moisture: number,
  range: readonly [minimum: number, maximum: number],
  fullDensityMoisture = (range[0] + range[1]) * 0.5
): number {
  const minimumSuitableDensity = 0.32;
  const transition = Math.min(0.1, (range[1] - range[0]) * 0.2);
  if (range[0] <= 0 && range[1] >= 1) return 1;
  const lowerSupport = smoothstep(range[0] - transition, range[0] + transition, moisture);
  const upperSupport = range[1] >= 1 ? 1 : 1 - smoothstep(range[1] - transition, range[1] + transition, moisture);
  const support = lowerSupport * upperSupport;
  const distance = Math.abs(moisture - fullDensityMoisture);
  const sideWidth = moisture < fullDensityMoisture ? fullDensityMoisture - range[0] : range[1] - fullDensityMoisture;
  const preference = 1 - smoothstep(0, 1, distance / Math.max(sideWidth, Number.EPSILON));
  return support * mix(minimumSuitableDensity, 1, preference);
}

function detailBrushSampleBounds(
  operation: SeedWorldDetailBrushOperation,
  worldSizeMetres: number,
  resolution: number
): Readonly<{ minimumX: number; maximumX: number; minimumY: number; maximumY: number }> {
  if (operation.distribution === "habitat-fill") {
    return { minimumX: 0, maximumX: resolution - 1, minimumY: 0, maximumY: resolution - 1 };
  }
  const normalizedRadius = operation.radiusMetres / worldSizeMetres;
  return {
    minimumX: Math.max(0, Math.floor((operation.center.x - normalizedRadius) * resolution)),
    maximumX: Math.min(resolution - 1, Math.ceil((operation.center.x + normalizedRadius) * resolution)),
    minimumY: Math.max(0, Math.floor((operation.center.y - normalizedRadius) * resolution)),
    maximumY: Math.min(resolution - 1, Math.ceil((operation.center.y + normalizedRadius) * resolution))
  };
}

function detailBrushContains(
  operation: Extract<SeedWorldDetailBrushOperation, { distribution: "local-brush" }>,
  worldSizeMetres: number,
  worldX: number,
  worldZ: number,
  rasterCoveragePaddingMetres = 0
): boolean {
  return (
    Math.hypot(
      worldX - (operation.center.x - 0.5) * worldSizeMetres,
      worldZ - (operation.center.y - 0.5) * worldSizeMetres
    ) <=
    operation.radiusMetres + rasterCoveragePaddingMetres
  );
}

function evaluatePopulationCandidate(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldVegetationRule,
  categorySeed: number,
  cellSeed: number,
  ordinal: number,
  cellMinimumWorldX: number,
  cellMinimumWorldZ: number,
  cellWidth: number,
  cellDepth: number
): {
  readonly seed: number;
  readonly worldX: number;
  readonly worldZ: number;
  readonly placement?: SeedWorldResolvedAssetPlacement<"tree" | "shrub" | "flower" | "grass">;
  readonly treeSpecies?: SeedWorldTreeSpeciesProfile;
  readonly treeCohort?: SeedWorldTreeCohortProfile;
  readonly treeCommunity?: SeedWorldTreeCommunitySample;
  readonly density: number;
  readonly accepted: boolean;
} {
  const seed = deriveSeedWorldNamedSeed(cellSeed, `candidate:${ordinal}`);
  const worldX = cellMinimumWorldX + unitFloat(seed, "x") * cellWidth;
  const worldZ = cellMinimumWorldZ + unitFloat(seed, "z") * cellDepth;
  const sample = sampleSeedWorldPopulation(plan, fields, worldX, worldZ);
  if (!sample) {
    return { seed, worldX, worldZ, density: 0, accepted: false };
  }
  const treeCommunity =
    rule.category === "tree" ? sampleSeedWorldTreeCommunityAtSite(plan, fields, worldX, worldZ, sample) : undefined;
  const treeSpecies =
    rule.category === "tree"
      ? selectSeedWorldTreeSpecies(plan, fields, sample, worldX, worldZ, treeCommunity!, seed)
      : undefined;
  if (rule.category === "tree" && !treeSpecies) {
    return { seed, worldX, worldZ, density: 0, accepted: false };
  }
  const treeCohort = treeCommunity ? selectSeedWorldTreeCohort(plan, seed, treeCommunity) : undefined;
  const resolvedPlacement = resolveSeedWorldAssetPlacement(
    compilePopulationTransformIntent(plan, rule, sample, worldX, worldZ, seed, treeSpecies, treeCohort)
  );
  const scaledPlacement =
    rule.category === "tree" ? applySeedWorldTreeUniformScale(plan, resolvedPlacement) : resolvedPlacement;
  const treeAppearance = treeSpecies
    ? compileSeedWorldTreeAppearance(plan, treeSpecies, treeCommunity!, seed)
    : undefined;
  const placement = treeAppearance
    ? applySeedWorldTreeGeometryFootprint(plan, scaledPlacement, treeAppearance.assetRecipeId)
    : scaledPlacement;
  const density = sampleVegetationDensity(rule, sample, worldX, worldZ, categorySeed, treeCommunity);
  const expectedCount = rule.targetDensityPerSquareMetre * cellWidth * cellDepth;
  const probability = Math.min(
    1,
    (expectedCount / rule.candidatesPerCell) * density * (treeSpecies?.densityMultiplier ?? 1)
  );
  const acceptedBySeed = unitFloat(seed, "accept") < probability;
  return {
    seed,
    worldX,
    worldZ,
    placement,
    treeSpecies,
    treeCohort,
    treeCommunity,
    density,
    accepted:
      acceptedBySeed &&
      seedWorldPopulationPositionHasExactClearanceWithRule(plan, fields, rule, worldX, worldZ, placement, sample)
  };
}

/**
 * Checks the final accepted population point against continuous coast, road, and river geometry.
 * Coarse habitat fields may reject early, but they never authorize a point which fails this exact gate.
 * @param plan Authoritative coast and road geometry.
 * @param fields Canonical river curves and water ownership for the same world.
 * @param category Population category whose physical clearance applies.
 * @param worldX Candidate X in world metres.
 * @param worldZ Candidate Z in world metres.
 * @param placement Exact shared placement whose resolved footprint is tested.
 * @returns Whether the point is on dry land and outside road and river clearances.
 */
export function seedWorldPopulationPositionHasExactClearance(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  category: SeedWorldVegetationRule["category"],
  worldX: number,
  worldZ: number,
  placement: Pick<SeedWorldResolvedAssetPlacement, "footprintMetres">
): boolean {
  const rule = plan.vegetationRules.find((candidate) => candidate.category === category);
  if (!rule) return false;
  return seedWorldPopulationPositionHasExactClearanceWithRule(plan, fields, rule, worldX, worldZ, placement);
}

function seedWorldPopulationPositionHasExactClearanceWithRule(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldVegetationRule,
  worldX: number,
  worldZ: number,
  placement: Pick<SeedWorldResolvedAssetPlacement, "footprintMetres">,
  precomputedSample?: SeedWorldPopulationSample
): boolean {
  const category = rule.category;
  const footprintRadiusMetres = Math.max(placement.footprintMetres[0], placement.footprintMetres[1]) * 0.5;
  const normalizedPosition = { x: worldX / plan.sizeMetres + 0.5, y: worldZ / plan.sizeMetres + 0.5 };
  const shorelineTree = category === "tree";
  if (
    !shorelineTree &&
    sampleSeedWorldCoastSignedFieldMetres(plan.coastShape, normalizedPosition) < footprintRadiusMetres
  ) {
    return false;
  }
  const sample = precomputedSample ?? sampleSeedWorldPopulation(plan, fields, worldX, worldZ);
  const footprintOverlapsWater = populationFootprintOverlapsWater(fields, worldX, worldZ, footprintRadiusMetres);
  const shorelineTreeTouchesLand =
    shorelineTree && populationFootprintTouchesDryLand(fields, worldX, worldZ, footprintRadiusMetres);
  if (
    !sample ||
    (sample.water && !shorelineTreeTouchesLand) ||
    (category !== "tree" && sample.rockySlopeWeight >= 1) ||
    (footprintOverlapsWater && !shorelineTree)
  ) {
    return false;
  }
  if (
    !seedWorldRoadPointHasClearance(
      plan,
      worldX,
      worldZ,
      categoryRoadBoundaryClearance(category) + footprintRadiusMetres
    )
  ) {
    return false;
  }
  return (
    shorelineTree ||
    seedWorldRiverBankPointHasClearance(
      fields,
      worldX,
      worldZ,
      categoryRiverClearance(category) + footprintRadiusMetres
    )
  );
}

export function populationFootprintTouchesDryLand(
  fields: Pick<SeedWorldFields, "sizeMetres" | "surfaceResolution" | "waterMask">,
  worldX: number,
  worldZ: number,
  radiusMetres: number
): boolean {
  const cellMetres = fields.sizeMetres / fields.surfaceResolution;
  const searchRadius = Math.max(0, radiusMetres) + cellMetres * Math.SQRT1_2;
  const minimumX = Math.max(0, Math.floor((worldX - searchRadius + fields.sizeMetres * 0.5) / cellMetres));
  const maximumX = Math.min(
    fields.surfaceResolution - 1,
    Math.floor((worldX + searchRadius + fields.sizeMetres * 0.5) / cellMetres)
  );
  const minimumZ = Math.max(0, Math.floor((worldZ - searchRadius + fields.sizeMetres * 0.5) / cellMetres));
  const maximumZ = Math.min(
    fields.surfaceResolution - 1,
    Math.floor((worldZ + searchRadius + fields.sizeMetres * 0.5) / cellMetres)
  );
  for (let z = minimumZ; z <= maximumZ; z++) {
    const sampleZ = (z + 0.5) * cellMetres - fields.sizeMetres * 0.5;
    for (let x = minimumX; x <= maximumX; x++) {
      if (fields.waterMask[z * fields.surfaceResolution + x] !== 0) continue;
      const sampleX = (x + 0.5) * cellMetres - fields.sizeMetres * 0.5;
      if (Math.hypot(sampleX - worldX, sampleZ - worldZ) <= searchRadius) return true;
    }
  }
  return false;
}

function populationFootprintOverlapsWater(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  radiusMetres: number
): boolean {
  if (radiusMetres <= 0) return false;
  const cellMetres = fields.sizeMetres / fields.surfaceResolution;
  const minimumX = Math.max(0, Math.floor((worldX - radiusMetres + fields.sizeMetres * 0.5) / cellMetres));
  const maximumX = Math.min(
    fields.surfaceResolution - 1,
    Math.floor((worldX + radiusMetres + fields.sizeMetres * 0.5) / cellMetres)
  );
  const minimumZ = Math.max(0, Math.floor((worldZ - radiusMetres + fields.sizeMetres * 0.5) / cellMetres));
  const maximumZ = Math.min(
    fields.surfaceResolution - 1,
    Math.floor((worldZ + radiusMetres + fields.sizeMetres * 0.5) / cellMetres)
  );
  for (let z = minimumZ; z <= maximumZ; z++) {
    const sampleZ = (z + 0.5) * cellMetres - fields.sizeMetres * 0.5;
    for (let x = minimumX; x <= maximumX; x++) {
      if (fields.waterMask[z * fields.surfaceResolution + x] === 0) continue;
      const sampleX = (x + 0.5) * cellMetres - fields.sizeMetres * 0.5;
      if (Math.hypot(sampleX - worldX, sampleZ - worldZ) <= radiusMetres + cellMetres * Math.SQRT1_2) return true;
    }
  }
  return false;
}

/** Deterministic stand and canopy-gap response sampled at one world-space position. */
export interface SeedWorldTreeCommunitySample {
  /** Stable identity of the dominant deterministic community at this position. */
  readonly communityId: string;
  /** Stable community seed shared by species, palette, and purity decisions. */
  readonly communitySeed: number;
  /** Dominant community centre in world metres. */
  readonly communityCenter: SeedWorldPoint;
  /** Dominant community's authored radius in world metres. */
  readonly communityRadiusMetres: number;
  /** Continuous stand-interior influence in the normalized `[0, 1]` range. */
  readonly standInfluence: number;
  /** Continuous canopy-gap interior influence in the normalized `[0, 1]` range. */
  readonly gapInfluence: number;
  /** Continuous response concentrated around the transition of a canopy gap. */
  readonly gapEdgeInfluence: number;
  /** Combined lake-bank, roadside, and foothill affinity in the normalized `[0, 1]` range. */
  readonly anchorInfluence: number;
  /** Lake-, sea-, or river-bank affinity before overlap with lower-priority anchors. */
  readonly waterEdgeInfluence: number;
  /** Roadside affinity after water-edge classification retains priority. */
  readonly roadEdgeInfluence: number;
  /** Rocky-substrate affinity before slope-density attenuation. */
  readonly rockySlopeInfluence: number;
  /** River-adjacent moisture-field response in the normalized `[0, 1]` range. */
  readonly riparianMoistureInfluence: number;
  /** Final local slope response in the normalized `(0, 1]` range. */
  readonly slopeDensityMultiplier: number;
  /** Final tree-density modulation after stand, gap, anchor, and site-capacity responses. */
  readonly densityMultiplier: number;
}

interface SeedWorldTreeGroveParent {
  readonly seed: number;
  readonly worldX: number;
  readonly worldZ: number;
  readonly habitatStrength: number;
  readonly anchorInfluence: number;
  readonly riparianMoistureInfluence: number;
}

interface SeedWorldTreeGroveParentCandidate extends SeedWorldTreeGroveParent {
  readonly rockySlopeInfluence: number;
  readonly rank: number;
}

interface SeedWorldTreeCommunityShape {
  readonly radiusMetres: number;
  readonly cosine: number;
  readonly sine: number;
  readonly aspectRatio: number;
  readonly phase: number;
  readonly boundaryWarpMetres: number;
}

interface SeedWorldTreeGroveParentEvaluation extends SeedWorldTreeGroveParent {
  readonly shape: SeedWorldTreeCommunityShape;
}

interface SeedWorldTreeSpeciesPatch {
  readonly id: string;
  readonly seed: number;
  readonly center: SeedWorldPoint;
  readonly radiusMetres: number;
}

interface SeedWorldTreeGapCell {
  readonly centerX: number;
  readonly centerZ: number;
  readonly shape: SeedWorldTreeCommunityShape;
}

interface SeedWorldTreeCommunityCache {
  readonly groveParents: readonly SeedWorldTreeGroveParentEvaluation[];
  readonly speciesPatches: Map<string, SeedWorldTreeSpeciesPatch>;
  readonly gapCells: Map<string, SeedWorldTreeGapCell | null>;
  readonly speciesResponsesByCommunity: Map<string, readonly SeedWorldTreeSpeciesResponse[]>;
}

const treeCommunityCachesByFields = new WeakMap<SeedWorldFields, WeakMap<SeedWorldPlan, SeedWorldTreeCommunityCache>>();
const rockyDistanceFieldsByFields = new WeakMap<SeedWorldFields, Map<number, Uint16Array>>();

/**
 * Samples deterministic forest stands and canopy gaps without consuming sequential random state.
 * @param plan Authoritative community profile, terrain intent, and Vegetation stream.
 * @param fields Final terrain, moisture, and water fields which constrain recruitment.
 * @param worldX World X in metres.
 * @param worldZ World Z in metres.
 * @returns Continuous stand, gap, and density responses for tree placement.
 */
export function sampleSeedWorldTreeCommunity(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number
): SeedWorldTreeCommunitySample {
  return sampleSeedWorldTreeCommunityAtSite(
    plan,
    fields,
    worldX,
    worldZ,
    sampleSeedWorldPopulation(plan, fields, worldX, worldZ)
  );
}

function sampleSeedWorldTreeCommunityAtSite(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  site: SeedWorldPopulationSample | undefined
): SeedWorldTreeCommunitySample {
  const profile = plan.treeCommunityProfile;
  const cache = getSeedWorldTreeCommunityCache(plan, fields);
  const standInfluence = sampleTreeCommunityStandField(plan, cache, worldX, worldZ);
  const speciesPatch = sampleTreeSpeciesPatch(plan, cache, worldX, worldZ);
  const gap = sampleTreeCommunityGapField(plan, cache, worldX, worldZ);
  const groveHabitat = sampleTreeGroveHabitat(plan, fields, site, worldX, worldZ);
  const slopeDensityMultiplier = site ? resolveSeedWorldTreeSlopeDensityMultiplier(profile, site.slope) : 0;
  const standDensity = mix(profile.backgroundDensityMultiplier, profile.standCoreDensityMultiplier, standInfluence);
  const gapInfluence = gap.interior * standInfluence;
  const gapEdgeInfluence = gap.edge * standInfluence;
  const gapRetention = mix(1, profile.canopyGapRetention, gapInfluence);
  const riparianDensityMultiplier = mix(
    1,
    profile.riparianMoisture.standDensityMultiplier,
    standInfluence * groveHabitat.riparianMoistureInfluence
  );
  return Object.freeze({
    communityId: speciesPatch.id,
    communitySeed: speciesPatch.seed,
    communityCenter: speciesPatch.center,
    communityRadiusMetres: speciesPatch.radiusMetres,
    standInfluence,
    gapInfluence,
    gapEdgeInfluence,
    anchorInfluence: groveHabitat.anchorInfluence,
    waterEdgeInfluence: groveHabitat.waterEdgeInfluence,
    roadEdgeInfluence: groveHabitat.roadEdgeInfluence,
    rockySlopeInfluence: groveHabitat.rockySlopeInfluence,
    riparianMoistureInfluence: groveHabitat.riparianMoistureInfluence,
    slopeDensityMultiplier,
    densityMultiplier:
      profile.densityNormalization *
      standDensity *
      gapRetention *
      mix(0.45, 1, groveHabitat.anchorInfluence) *
      groveHabitat.anchorDensityMultiplier *
      riparianDensityMultiplier *
      slopeDensityMultiplier *
      mix(0.35, 1, moistureDensitySuitability(site?.moisture ?? 0, [0.02, 0.98], 0.55))
  });
}

function sampleTreeCommunityGapField(
  plan: SeedWorldPlan,
  cache: SeedWorldTreeCommunityCache,
  worldX: number,
  worldZ: number
): Readonly<{ interior: number; edge: number }> {
  const profile = plan.treeCommunityProfile;
  const maximumRadius = profile.gapRadiusMetres[1];
  const cellSizeMetres = maximumRadius * 2;
  const centerCellX = Math.floor(worldX / cellSizeMetres);
  const centerCellZ = Math.floor(worldZ / cellSizeMetres);
  const activeProbability = Math.min(
    0.92,
    (profile.gapsPerStandSquareKilometre * cellSizeMetres * cellSizeMetres) / 1_000_000
  );
  let interior = 0;
  let edge = 0;
  for (let cellZ = centerCellZ - 1; cellZ <= centerCellZ + 1; cellZ++) {
    for (let cellX = centerCellX - 1; cellX <= centerCellX + 1; cellX++) {
      const key = `${cellX}:${cellZ}`;
      let cell = cache.gapCells.get(key);
      if (cell === undefined && !cache.gapCells.has(key)) {
        const seed = deriveSeedWorldNamedSeed(plan.generationStreams.vegetation, `tree-community:gap:${key}`);
        if (unitFloat(seed, "active") >= activeProbability) {
          cache.gapCells.set(key, null);
          continue;
        }
        const radius = mix(profile.gapRadiusMetres[0], maximumRadius, unitFloat(seed, "radius"));
        cell = Object.freeze({
          centerX: (cellX + unitFloat(seed, "x")) * cellSizeMetres,
          centerZ: (cellZ + unitFloat(seed, "z")) * cellSizeMetres,
          shape: compileTreeCommunityShape(seed, radius, profile.gapAspectRatio, profile.gapBoundaryWarpMetres)
        });
        cache.gapCells.set(key, cell);
      }
      if (!cell) continue;
      const normalizedDistance = treeCommunityNormalizedDistance(
        cell.shape,
        worldX - cell.centerX,
        worldZ - cell.centerZ
      );
      interior = Math.max(interior, 1 - smoothstep(0.12, 1, normalizedDistance));
      edge = Math.max(edge, 1 - smoothstep(0.04, 0.42, Math.abs(normalizedDistance - 1)));
    }
  }
  return Object.freeze({ interior, edge });
}

function sampleTreeCommunityStandField(
  plan: SeedWorldPlan,
  cache: SeedWorldTreeCommunityCache,
  worldX: number,
  worldZ: number
): number {
  const profile = plan.treeCommunityProfile;
  const maximumRadius = profile.standRadiusMetres[1];
  let influence = 0;
  for (const parent of cache.groveParents) {
    const deltaX = worldX - parent.worldX;
    const deltaZ = worldZ - parent.worldZ;
    if (Math.abs(deltaX) > maximumRadius * 1.25 || Math.abs(deltaZ) > maximumRadius * 1.25) continue;
    const normalizedDistance = treeCommunityNormalizedDistance(parent.shape, deltaX, deltaZ);
    influence = Math.max(
      influence,
      (1 - smoothstep(0.08, 1, normalizedDistance)) * parent.habitatStrength * mix(0.72, 1, parent.anchorInfluence)
    );
  }
  return influence;
}

/**
 * Assigns an accepted legacy tree point to a small deterministic Voronoi patch.
 * This field owns only species and palette continuity; it never changes whether
 * a tree exists, so the original wetland and large-stand distribution remains intact.
 */
function sampleTreeSpeciesPatch(
  plan: SeedWorldPlan,
  cache: SeedWorldTreeCommunityCache,
  worldX: number,
  worldZ: number
): Readonly<{
  id: string;
  seed: number;
  center: SeedWorldPoint;
  radiusMetres: number;
}> {
  const radiusRange = plan.treeCommunityProfile.speciesPatchRadiusMetres;
  const cellMetres = radiusRange[1] * 2;
  const originCellX = Math.floor(worldX / cellMetres);
  const originCellZ = Math.floor(worldZ / cellMetres);
  let best: SeedWorldTreeSpeciesPatch | undefined;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let cellZ = originCellZ - 1; cellZ <= originCellZ + 1; cellZ++) {
    for (let cellX = originCellX - 1; cellX <= originCellX + 1; cellX++) {
      const key = `${cellX}:${cellZ}`;
      let patch = cache.speciesPatches.get(key);
      if (!patch) {
        const seed = deriveSeedWorldNamedSeed(plan.generationStreams.vegetation, `tree-appearance-community:${key}`);
        patch = Object.freeze({
          id: `appearance-${cellX}-${cellZ}`,
          seed,
          center: Object.freeze({
            x: (cellX + mix(0.2, 0.8, unitFloat(seed, "center-x"))) * cellMetres,
            y: (cellZ + mix(0.2, 0.8, unitFloat(seed, "center-z"))) * cellMetres
          }),
          radiusMetres: mix(radiusRange[0], radiusRange[1], unitFloat(seed, "radius"))
        });
        cache.speciesPatches.set(key, patch);
      }
      const deltaX = worldX - patch.center.x;
      const deltaZ = worldZ - patch.center.y;
      const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
      if (distanceSquared < bestDistanceSquared) {
        best = patch;
        bestDistanceSquared = distanceSquared;
      }
    }
  }
  return best!;
}

function getSeedWorldTreeCommunityCache(plan: SeedWorldPlan, fields: SeedWorldFields): SeedWorldTreeCommunityCache {
  let cachesByPlan = treeCommunityCachesByFields.get(fields);
  if (!cachesByPlan) {
    cachesByPlan = new WeakMap();
    treeCommunityCachesByFields.set(fields, cachesByPlan);
  }
  const cached = cachesByPlan.get(plan);
  if (cached) return cached;
  const profile = plan.treeCommunityProfile;
  const groveParents = Object.freeze(
    compileSeedWorldTreeGroveParents(plan, fields).map((parent) =>
      Object.freeze({
        ...parent,
        shape: compileTreeCommunityShape(
          parent.seed,
          mix(profile.standRadiusMetres[0], profile.standRadiusMetres[1], unitFloat(parent.seed, "radius")),
          profile.standAspectRatio,
          profile.standBoundaryWarpMetres
        )
      })
    )
  );
  const cache = {
    groveParents,
    speciesPatches: new Map(),
    gapCells: new Map(),
    speciesResponsesByCommunity: new Map()
  } satisfies SeedWorldTreeCommunityCache;
  cachesByPlan.set(plan, cache);
  return cache;
}

function compileSeedWorldTreeGroveParents(
  plan: SeedWorldPlan,
  fields: SeedWorldFields
): readonly SeedWorldTreeGroveParent[] {
  const targetRegionMetres = Math.sqrt(1_000_000 / plan.treeCommunityProfile.standParentsPerSuitableSquareKilometre);
  const regionsPerSide = Math.max(1, Math.ceil(plan.sizeMetres / targetRegionMetres));
  const regionMetres = plan.sizeMetres / regionsPerSide;
  const surfaceCellMetres = fields.sizeMetres / fields.surfaceResolution;
  const probeTargetMetres = Math.min(SEED_WORLD_POPULATION_CELL_METRES, surfaceCellMetres * 2);
  const probesPerRegion = Math.max(1, Math.ceil(regionMetres / probeTargetMetres));
  const probeMetres = regionMetres / probesPerRegion;
  const worldMinimum = plan.sizeMetres * -0.5;
  const parents: SeedWorldTreeGroveParent[] = [];
  for (let regionZ = 0; regionZ < regionsPerSide; regionZ++) {
    for (let regionX = 0; regionX < regionsPerSide; regionX++) {
      const seed = deriveSeedWorldNamedSeed(
        plan.generationStreams.vegetation,
        `tree-community:stand-region:${regionX}:${regionZ}`
      );
      let anchoredCandidate: SeedWorldTreeGroveParentCandidate | undefined;
      let fallbackCandidate: SeedWorldTreeGroveParentCandidate | undefined;
      const riparianCandidates: SeedWorldTreeGroveParentCandidate[] = [];
      const rockyCandidates: SeedWorldTreeGroveParentCandidate[] = [];
      for (let probeZ = 0; probeZ < probesPerRegion; probeZ++) {
        const worldZ = worldMinimum + regionZ * regionMetres + (probeZ + 0.5) * probeMetres;
        for (let probeX = 0; probeX < probesPerRegion; probeX++) {
          const worldX = worldMinimum + regionX * regionMetres + (probeX + 0.5) * probeMetres;
          const site = sampleSeedWorldPopulation(plan, fields, worldX, worldZ);
          const habitatStrength = treeCommunityParentHabitatStrength(site);
          if (habitatStrength <= 0) continue;
          const groveHabitat = sampleTreeGroveHabitat(plan, fields, site, worldX, worldZ);
          const probeSeed = deriveSeedWorldNamedSeed(seed, `probe:${probeX}:${probeZ}`);
          const rankNoise = mix(0.84, 1, unitFloat(probeSeed, "rank"));
          const candidate = Object.freeze({
            seed,
            worldX,
            worldZ,
            habitatStrength,
            anchorInfluence: groveHabitat.anchorInfluence,
            riparianMoistureInfluence: groveHabitat.riparianMoistureInfluence,
            rockySlopeInfluence: groveHabitat.rockySlopeInfluence,
            rank:
              habitatStrength *
              rankNoise *
              mix(
                1,
                plan.treeCommunityProfile.riparianMoisture.parentRankMultiplier,
                groveHabitat.riparianMoistureInfluence
              )
          });
          if (!fallbackCandidate || candidate.rank > fallbackCandidate.rank) fallbackCandidate = candidate;
          if (
            candidate.riparianMoistureInfluence >=
            plan.treeCommunityProfile.riparianMoisture.additionalParentMinimumInfluence
          ) {
            riparianCandidates.push(candidate);
          }
          if (candidate.rockySlopeInfluence >= 0.5) rockyCandidates.push(candidate);
          const anchoredRank = candidate.rank * candidate.anchorInfluence;
          if (
            candidate.anchorInfluence > 0.08 &&
            (!anchoredCandidate || anchoredRank > anchoredCandidate.rank * anchoredCandidate.anchorInfluence)
          ) {
            anchoredCandidate = candidate;
          }
        }
      }
      const parent = anchoredCandidate ?? fallbackCandidate;
      if (!parent) continue;
      parents.push(toTreeGroveParent(parent, parent.seed));
      const riparianParent = riparianCandidates
        .filter(
          (candidate) =>
            Math.hypot(candidate.worldX - parent.worldX, candidate.worldZ - parent.worldZ) >=
            plan.treeCommunityProfile.riparianMoisture.additionalParentSpacingMetres
        )
        .sort(
          (left, right) => right.rank * right.riparianMoistureInfluence - left.rank * left.riparianMoistureInfluence
        )[0];
      if (riparianParent) {
        parents.push(toTreeGroveParent(riparianParent, deriveSeedWorldNamedSeed(parent.seed, "riparian-companion")));
      }
      const rockyParentSpacingMetres = plan.treeCommunityProfile.standRadiusMetres[0] * 0.5;
      const rockyParent = rockyCandidates
        .filter(
          (candidate) =>
            Math.hypot(candidate.worldX - parent.worldX, candidate.worldZ - parent.worldZ) >=
              rockyParentSpacingMetres &&
            (!riparianParent ||
              Math.hypot(candidate.worldX - riparianParent.worldX, candidate.worldZ - riparianParent.worldZ) >=
                rockyParentSpacingMetres)
        )
        .sort((left, right) => right.rank * right.rockySlopeInfluence - left.rank * left.rockySlopeInfluence)[0];
      if (rockyParent) {
        parents.push(toTreeGroveParent(rockyParent, deriveSeedWorldNamedSeed(parent.seed, "rocky-companion")));
      }
    }
  }
  return Object.freeze(parents);
}

function toTreeGroveParent(candidate: SeedWorldTreeGroveParentCandidate, seed: number): SeedWorldTreeGroveParent {
  return Object.freeze({
    seed,
    worldX: candidate.worldX,
    worldZ: candidate.worldZ,
    habitatStrength: candidate.habitatStrength,
    anchorInfluence: candidate.anchorInfluence,
    riparianMoistureInfluence: candidate.riparianMoistureInfluence
  });
}

function sampleTreeGroveHabitat(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  sample: SeedWorldPopulationSample | undefined,
  worldX: number,
  worldZ: number
): Readonly<{
  anchorInfluence: number;
  waterEdgeInfluence: number;
  roadEdgeInfluence: number;
  rockySlopeInfluence: number;
  anchorDensityMultiplier: number;
  riparianMoistureInfluence: number;
}> {
  if (!sample) {
    return Object.freeze({
      anchorInfluence: 0,
      waterEdgeInfluence: 0,
      roadEdgeInfluence: 0,
      rockySlopeInfluence: 0,
      anchorDensityMultiplier: 1,
      riparianMoistureInfluence: 0
    });
  }
  const normalizedPoint = Object.freeze({ x: worldX / plan.sizeMetres + 0.5, y: worldZ / plan.sizeMetres + 0.5 });
  const distances = Object.freeze({
    "water-edge": sample.waterBoundaryDistanceMetres,
    "road-edge": sample.roadDistanceMetres,
    foothill: sampleSeedWorldMountainFoothillSignedDistanceMetres(plan, normalizedPoint)
  });
  let influence = 0;
  let waterEdgeInfluence = 0;
  let roadEdgeInfluence = 0;
  let anchorDensityMultiplier = 1;
  let waterEdgeEntranceInfluence = 0;
  for (const anchor of plan.treeCommunityProfile.groveAnchors) {
    const distance = distances[anchor.key];
    const entrance = smoothstep(anchor.supportRangeMetres[0], anchor.fullInfluenceRangeMetres[0], distance);
    const exit = 1 - smoothstep(anchor.fullInfluenceRangeMetres[1], anchor.supportRangeMetres[1], distance);
    const anchorInfluence = entrance * exit * anchor.weight;
    influence = Math.max(influence, anchorInfluence);
    anchorDensityMultiplier = Math.max(anchorDensityMultiplier, mix(1, anchor.densityMultiplier, entrance * exit));
    if (anchor.key === "water-edge") {
      waterEdgeInfluence = Math.max(waterEdgeInfluence, entrance * exit);
      waterEdgeEntranceInfluence = Math.max(waterEdgeEntranceInfluence, entrance * anchor.weight);
    } else if (anchor.key === "road-edge") {
      roadEdgeInfluence = Math.max(roadEdgeInfluence, entrance * exit);
    }
  }
  const rockyProfile = plan.treeCommunityProfile.rockySlope;
  const directRockySlopeInfluence = smoothstep(
    rockyProfile.minimumWeight,
    rockyProfile.fullInfluenceWeight,
    sample.rockySlopeWeight
  );
  const rockyDistanceCells = getSeedWorldRockyDistanceField(fields, rockyProfile.minimumWeight);
  const normalizedX = worldX / fields.sizeMetres + 0.5;
  const normalizedZ = worldZ / fields.sizeMetres + 0.5;
  const surfaceX = Math.min(
    fields.surfaceResolution - 1,
    Math.max(0, Math.floor(normalizedX * fields.surfaceResolution))
  );
  const surfaceZ = Math.min(
    fields.surfaceResolution - 1,
    Math.max(0, Math.floor(normalizedZ * fields.surfaceResolution))
  );
  const rockyDistanceMetres =
    rockyDistanceCells[surfaceZ * fields.surfaceResolution + surfaceX]! *
    (fields.sizeMetres / fields.surfaceResolution);
  const rockyProximityInfluence = 1 - smoothstep(0, rockyProfile.maximumProximityMetres, rockyDistanceMetres);
  const rockySlopeInfluence = Math.max(directRockySlopeInfluence, rockyProximityInfluence);
  influence = Math.max(influence, rockySlopeInfluence * rockyProfile.anchorWeight);
  anchorDensityMultiplier = Math.max(
    anchorDensityMultiplier,
    mix(1, rockyProfile.densityMultiplier, rockySlopeInfluence)
  );
  const moistureProfile = plan.treeCommunityProfile.riparianMoisture;
  const moistureInfluence = smoothstep(
    moistureProfile.minimumMoisture,
    moistureProfile.fullInfluenceMoisture,
    sample.moisture
  );
  const riverDistanceInfluence =
    1 -
    smoothstep(
      moistureProfile.fullInfluenceRiverDistanceMetres,
      moistureProfile.maximumRiverDistanceMetres,
      sample.waterBoundaryDistanceMetres
    );
  return Object.freeze({
    anchorInfluence: clamp01(influence),
    waterEdgeInfluence: clamp01(waterEdgeInfluence),
    roadEdgeInfluence: clamp01(roadEdgeInfluence * (1 - waterEdgeInfluence)),
    rockySlopeInfluence: clamp01(rockySlopeInfluence),
    anchorDensityMultiplier,
    riparianMoistureInfluence: clamp01(waterEdgeEntranceInfluence * riverDistanceInfluence * moistureInfluence)
  });
}

function getSeedWorldRockyDistanceField(fields: SeedWorldFields, fullInfluenceWeight: number): Uint16Array {
  let fieldsByThreshold = rockyDistanceFieldsByFields.get(fields);
  if (!fieldsByThreshold) {
    fieldsByThreshold = new Map();
    rockyDistanceFieldsByFields.set(fields, fieldsByThreshold);
  }
  const threshold = Math.round(clamp01(fullInfluenceWeight) * 255);
  const cached = fieldsByThreshold.get(threshold);
  if (cached) return cached;
  const resolution = fields.surfaceResolution;
  const distances = new Uint16Array(fields.rockySlopeWeight.length);
  distances.fill(0xffff);
  const queue = new Int32Array(distances.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < distances.length; index++) {
    if (fields.rockySlopeWeight[index]! < threshold) continue;
    distances[index] = 0;
    queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % resolution;
    const z = Math.floor(index / resolution);
    const nextDistance = Math.min(0xffff, distances[index]! + 1);
    for (const [offsetX, offsetZ] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ] as const) {
      const nextX = x + offsetX;
      const nextZ = z + offsetZ;
      if (nextX < 0 || nextZ < 0 || nextX >= resolution || nextZ >= resolution) continue;
      const nextIndex = nextZ * resolution + nextX;
      if (nextDistance >= distances[nextIndex]!) continue;
      distances[nextIndex] = nextDistance;
      queue[tail++] = nextIndex;
    }
  }
  fieldsByThreshold.set(threshold, distances);
  return distances;
}

function treeCommunityParentHabitatStrength(sample: SeedWorldPopulationSample | undefined): number {
  if (
    !sample ||
    sample.water ||
    sample.landCover === SeedWorldLandCover.Wetland ||
    sample.roadDistanceMetres < categoryRoadClearance("tree") ||
    sample.riverDistanceMetres < categoryRiverClearance("tree")
  ) {
    return 0;
  }
  return moistureDensitySuitability(sample.moisture, [0.02, 0.98], 0.55);
}

function compileTreeCommunityShape(
  seed: number,
  radiusMetres: number,
  aspectRatioRange: readonly [minimum: number, maximum: number],
  boundaryWarpRange: readonly [minimum: number, maximum: number]
): SeedWorldTreeCommunityShape {
  const rotation = unitFloat(seed, "rotation") * Math.PI * 2;
  return Object.freeze({
    radiusMetres,
    cosine: Math.cos(rotation),
    sine: Math.sin(rotation),
    aspectRatio: mix(aspectRatioRange[0], aspectRatioRange[1], unitFloat(seed, "aspect")),
    phase: unitFloat(seed, "warp-phase") * Math.PI * 2,
    boundaryWarpMetres: mix(boundaryWarpRange[0], boundaryWarpRange[1], unitFloat(seed, "warp-amplitude"))
  });
}

function treeCommunityNormalizedDistance(shape: SeedWorldTreeCommunityShape, deltaX: number, deltaZ: number): number {
  const localX = deltaX * shape.cosine + deltaZ * shape.sine;
  const localZ = -deltaX * shape.sine + deltaZ * shape.cosine;
  const aspectRatio = shape.aspectRatio;
  const ellipseDistance = Math.hypot(localX, localZ / aspectRatio);
  const theta = Math.atan2(localZ, localX);
  const phase = shape.phase;
  const boundarySignal = Math.sin(theta * 3 + phase) * 0.62 + Math.sin(theta * 5 - phase * 0.73) * 0.38;
  return ellipseDistance / Math.max(1, shape.radiusMetres + boundarySignal * shape.boundaryWarpMetres);
}

function selectSeedWorldTreeCohort(
  plan: Pick<SeedWorldPlan, "treeCommunityProfile">,
  candidateSeed: number,
  community: SeedWorldTreeCommunitySample
): SeedWorldTreeCohortProfile {
  let selected = plan.treeCommunityProfile.cohorts[0]!;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (const cohort of plan.treeCommunityProfile.cohorts) {
    const weight =
      cohort.populationWeight *
      mix(1, cohort.standInteriorWeight, community.standInfluence) *
      mix(1, cohort.gapEdgeWeight, community.gapEdgeInfluence);
    const sample = Math.max(unitFloat(candidateSeed, `tree-cohort:${cohort.key}`), Number.EPSILON);
    const score = Math.log(sample) / Math.max(weight, Number.EPSILON);
    if (score > selectedScore) {
      selected = cohort;
      selectedScore = score;
    }
  }
  return selected;
}

function applySeedWorldTreeCompetition(
  plan: Pick<SeedWorldPlan, "sizeMetres" | "generationStreams" | "treeCommunityProfile">,
  instances: readonly SeedWorldPopulationInstance[],
  naturalTreeInstanceIds: ReadonlySet<string>,
  protectedInstanceIds: ReadonlySet<string> = new Set()
): readonly SeedWorldPopulationInstance[] {
  const cohortPriority: Readonly<Record<SeedWorldTreeCohortKey, number>> = Object.freeze({
    dominant: 0,
    canopy: 1,
    juvenile: 2
  });
  const maximumSpacingMetres = Math.max(
    plan.treeCommunityProfile.groveSpacingMetres[1],
    ...plan.treeCommunityProfile.cohorts.map((cohort) => cohort.minimumSpacingMetres[1])
  );
  const candidates = instances
    .filter((instance) => instance.category === "tree")
    .map((instance) => {
      const cohort = plan.treeCommunityProfile.cohorts.find(
        (candidate) => candidate.key === instance.treeCohortProfileKey
      )!;
      const seed = deriveSeedWorldNamedSeed(plan.generationStreams.vegetation, `tree-competition:${instance.id}`);
      const naturalTree = naturalTreeInstanceIds.has(instance.id);
      const spacingRange = naturalTree ? plan.treeCommunityProfile.groveSpacingMetres : cohort.minimumSpacingMetres;
      return Object.freeze({
        instance,
        cohort,
        seed,
        protected: protectedInstanceIds.has(instance.id),
        worldX: (instance.normalizedPosition.x - 0.5) * plan.sizeMetres,
        worldZ: (instance.normalizedPosition.y - 0.5) * plan.sizeMetres,
        spacingMetres: naturalTree ? spacingRange[0] : mix(spacingRange[0], spacingRange[1], unitFloat(seed, "spacing"))
      });
    })
    .sort((left, right) => {
      const protectedPriority = Number(right.protected) - Number(left.protected);
      if (protectedPriority !== 0) return protectedPriority;
      const priority = cohortPriority[left.cohort.key] - cohortPriority[right.cohort.key];
      return priority || right.seed - left.seed || left.instance.id.localeCompare(right.instance.id);
    });
  const acceptedIds = new Set<string>();
  const grid = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const cellX = Math.floor(candidate.worldX / maximumSpacingMetres);
    const cellZ = Math.floor(candidate.worldZ / maximumSpacingMetres);
    let blocked = false;
    for (let offsetZ = -1; offsetZ <= 1 && !blocked; offsetZ++) {
      for (let offsetX = -1; offsetX <= 1 && !blocked; offsetX++) {
        const neighbors = grid.get(`${cellX + offsetX}:${cellZ + offsetZ}`);
        if (!neighbors) continue;
        for (const neighbor of neighbors) {
          if (
            Math.hypot(candidate.worldX - neighbor.worldX, candidate.worldZ - neighbor.worldZ) <
            Math.max(candidate.spacingMetres, neighbor.spacingMetres)
          ) {
            blocked = true;
            break;
          }
        }
      }
    }
    if (blocked && !candidate.protected) continue;
    acceptedIds.add(candidate.instance.id);
    const key = `${cellX}:${cellZ}`;
    const cell = grid.get(key);
    if (cell) cell.push(candidate);
    else grid.set(key, [candidate]);
  }
  return Object.freeze(instances.filter((instance) => instance.category !== "tree" || acceptedIds.has(instance.id)));
}

/** Evidence returned by the physical tree-crown packing pass. */
export interface SeedWorldTreeBoundsPackingDiagnostics extends SeedWorldTreeBoundsIndexDiagnostics {
  readonly targetCount: number;
  readonly candidateCount: number;
  readonly preferredAcceptedCount: number;
  readonly replacementAcceptedCount: number;
  readonly overlapRejectedCount: number;
  readonly finalCount: number;
}

/** Immutable physical packing result used by the final Population preview. */
export interface SeedWorldTreeBoundsPackingResult {
  readonly instances: readonly SeedWorldPopulationInstance[];
  readonly diagnostics: SeedWorldTreeBoundsPackingDiagnostics;
}

/**
 * Packs each biological crown layer against real four-LOD tree Bounds, then fills rejected places from the same
 * habitat-qualified reservoir. Trees in one height layer retain strict plan-view crown separation, while different
 * layers may interlock above the trunk-spacing contract established by `applySeedWorldTreeCompetition`. Species and
 * biological-layer totals remain bounded by the former ecological result whenever enough physical capacity exists;
 * no new habitat or uniform world-space scatter is introduced.
 */
export function packSeedWorldTreeInstancesByBounds(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  targetInstances: readonly SeedWorldPopulationInstance[],
  reservoirInstances: readonly SeedWorldPopulationInstance[]
): SeedWorldTreeBoundsPackingResult {
  const targets = targetInstances.filter((instance) => instance.category === "tree");
  const targetIds = new Set(targets.map(({ id }) => id));
  const targetCompositionCounts = countTreePackingKeys(targets, treePackingCompositionKey);
  const targetLayerCounts = countTreePackingKeys(targets, treePackingLayerKey);
  const targetCohortCounts = countTreePackingKeys(targets, treePackingCohortKey);
  const targetClusterCounts = countTreePackingKeys(
    targets.filter(({ treeClusterId }) => treeClusterId !== undefined),
    (instance) => instance.treeClusterId!
  );
  const candidatesById = new Map<string, SeedWorldPopulationInstance>();
  const preferred = [...targets].sort((left, right) => compareTreeBoundsPackingCandidates(plan, left, right));
  for (const candidate of preferred) candidatesById.set(candidate.id, candidate);
  const reservoir = reservoirInstances
    .filter((instance) => instance.category === "tree" && !targetIds.has(instance.id))
    .map((instance) => normalizeTreePackingCandidateCluster(plan, fields, instance, targetClusterCounts))
    .sort((left, right) => compareTreeBoundsPackingCandidates(plan, left, right));
  for (const candidate of reservoir) {
    if (!candidatesById.has(candidate.id)) candidatesById.set(candidate.id, candidate);
  }
  const candidates = [...candidatesById.values()].sort((left, right) =>
    compareTreeBoundsPackingCandidates(plan, left, right)
  );
  const targetCount = targets.length;
  const indexesByCohort = new Map<string, SeedWorldTreeBoundsIndex>();
  const accepted: SeedWorldPopulationInstance[] = [];
  const acceptedIds = new Set<string>();
  const acceptedCompositionCounts = new Map<string, number>();
  const acceptedLayerCounts = new Map<string, number>();
  const acceptedCohortCounts = new Map<string, number>();
  const acceptedClusterCounts = new Map<string, number>();
  const overlapRejectedIds = new Set<string>();
  let preferredAcceptedCount = 0;

  const tryAccept = (source: SeedWorldPopulationInstance): boolean => {
    if (accepted.length >= targetCount || acceptedIds.has(source.id)) return false;
    const compositionKey = treePackingCompositionKey(source);
    const layerKey = treePackingLayerKey(source);
    if ((acceptedLayerCounts.get(layerKey) ?? 0) >= (targetLayerCounts.get(layerKey) ?? 0)) return false;
    let candidate = source;
    if (
      candidate.treeClusterId &&
      (acceptedClusterCounts.get(candidate.treeClusterId) ?? 0) >=
        (targetClusterCounts.get(candidate.treeClusterId) ?? 0)
    ) {
      candidate = withoutSeedWorldTreeCluster(candidate);
    }
    const cohortKey = treePackingCohortKey(candidate);
    let index = indexesByCohort.get(cohortKey);
    if (!index) {
      index = new SeedWorldTreeBoundsIndex();
      indexesByCohort.set(cohortKey, index);
    }
    const bounds = resolveSeedWorldTreeGeometryBounds(plan.treeSpeciesProfiles, candidate.assetRecipeId!);
    const footprint = projectSeedWorldTreeFootprintObb(plan.sizeMetres, candidate, bounds);
    if (index.overlaps(footprint)) {
      overlapRejectedIds.add(candidate.id);
      return false;
    }
    index.add(footprint);
    accepted.push(candidate);
    acceptedIds.add(candidate.id);
    acceptedCompositionCounts.set(compositionKey, (acceptedCompositionCounts.get(compositionKey) ?? 0) + 1);
    acceptedLayerCounts.set(layerKey, (acceptedLayerCounts.get(layerKey) ?? 0) + 1);
    acceptedCohortCounts.set(cohortKey, (acceptedCohortCounts.get(cohortKey) ?? 0) + 1);
    if (candidate.treeClusterId) {
      acceptedClusterCounts.set(candidate.treeClusterId, (acceptedClusterCounts.get(candidate.treeClusterId) ?? 0) + 1);
    }
    if (targetIds.has(candidate.id)) preferredAcceptedCount++;
    return true;
  };

  const candidatesByLayer = new Map<string, SeedWorldPopulationInstance[]>();
  for (const candidate of candidates) {
    const key = treePackingLayerKey(candidate);
    if (!targetLayerCounts.has(key)) continue;
    const group = candidatesByLayer.get(key) ?? [];
    group.push(candidate);
    candidatesByLayer.set(key, group);
  }
  const nextCandidateByLayer = new Map<string, number>();
  while (accepted.length < targetCount) {
    const compositionKey = [...targetCompositionCounts.keys()]
      .filter((key) => (acceptedCompositionCounts.get(key) ?? 0) < targetCompositionCounts.get(key)!)
      .sort((left, right) => {
        const progress =
          (acceptedCompositionCounts.get(left) ?? 0) / targetCompositionCounts.get(left)! -
          (acceptedCompositionCounts.get(right) ?? 0) / targetCompositionCounts.get(right)!;
        return progress || left.localeCompare(right);
      })[0];
    if (!compositionKey) break;
    const layerKeys = [...targetLayerCounts.keys()]
      .filter(
        (layerKey) =>
          layerKey.startsWith(`${compositionKey}:`) &&
          (acceptedLayerCounts.get(layerKey) ?? 0) < targetLayerCounts.get(layerKey)! &&
          (nextCandidateByLayer.get(layerKey) ?? 0) < (candidatesByLayer.get(layerKey)?.length ?? 0)
      )
      .sort((left, right) => {
        const leftCohort = left.slice(left.lastIndexOf(":") + 1);
        const rightCohort = right.slice(right.lastIndexOf(":") + 1);
        const progress =
          (acceptedCohortCounts.get(leftCohort) ?? 0) / targetCohortCounts.get(leftCohort)! -
          (acceptedCohortCounts.get(rightCohort) ?? 0) / targetCohortCounts.get(rightCohort)!;
        if (progress) return progress;
        const leftCandidate = candidatesByLayer.get(left)![nextCandidateByLayer.get(left) ?? 0]!;
        const rightCandidate = candidatesByLayer.get(right)![nextCandidateByLayer.get(right) ?? 0]!;
        return compareTreeBoundsPackingCandidates(plan, leftCandidate, rightCandidate);
      });
    let acceptedFromComposition = false;
    for (const layerKey of layerKeys) {
      const group = candidatesByLayer.get(layerKey)!;
      let candidateIndex = nextCandidateByLayer.get(layerKey) ?? 0;
      while (candidateIndex < group.length) {
        const candidate = group[candidateIndex++]!;
        nextCandidateByLayer.set(layerKey, candidateIndex);
        if (!tryAccept(candidate)) continue;
        acceptedFromComposition = true;
        break;
      }
      if (acceptedFromComposition) break;
    }
    if (!acceptedFromComposition) break;
  }
  const instances = normalizeSeedWorldTreeClusterIdentities(plan, accepted);
  const broadPhase = [...indexesByCohort.values()].reduce<SeedWorldTreeBoundsIndexDiagnostics>(
    (sum, index) =>
      Object.freeze({
        acceptedCount: sum.acceptedCount + index.diagnostics.acceptedCount,
        exactIntersectionTests: sum.exactIntersectionTests + index.diagnostics.exactIntersectionTests
      }),
    Object.freeze({ acceptedCount: 0, exactIntersectionTests: 0 })
  );
  return Object.freeze({
    instances,
    diagnostics: Object.freeze({
      targetCount,
      candidateCount: candidates.length,
      preferredAcceptedCount,
      replacementAcceptedCount: accepted.length - preferredAcceptedCount,
      overlapRejectedCount: overlapRejectedIds.size,
      finalCount: accepted.length,
      acceptedCount: broadPhase.acceptedCount,
      exactIntersectionTests: broadPhase.exactIntersectionTests
    })
  });
}

function compareTreeBoundsPackingCandidates(
  plan: Pick<SeedWorldPlan, "generationStreams" | "treeSpeciesProfiles">,
  left: SeedWorldPopulationInstance,
  right: SeedWorldPopulationInstance
): number {
  const cohortPriority: Readonly<Record<SeedWorldTreeCohortKey, number>> = Object.freeze({
    dominant: 0,
    canopy: 1,
    juvenile: 2
  });
  const priority = cohortPriority[left.treeCohortProfileKey!] - cohortPriority[right.treeCohortProfileKey!];
  if (priority) return priority;
  const leftBounds = resolveSeedWorldTreeGeometryBounds(plan.treeSpeciesProfiles, left.assetRecipeId!);
  const rightBounds = resolveSeedWorldTreeGeometryBounds(plan.treeSpeciesProfiles, right.assetRecipeId!);
  const leftFootprint = resolveSeedWorldTreeFootprintMetres(leftBounds, left.scale);
  const rightFootprint = resolveSeedWorldTreeFootprintMetres(rightBounds, right.scale);
  const footprintPriority = rightFootprint[0] * rightFootprint[1] - leftFootprint[0] * leftFootprint[1];
  if (footprintPriority) return footprintPriority;
  const leftRank = deriveSeedWorldNamedSeed(plan.generationStreams.vegetation, `tree-bounds-pack:${left.id}`);
  const rightRank = deriveSeedWorldNamedSeed(plan.generationStreams.vegetation, `tree-bounds-pack:${right.id}`);
  return rightRank - leftRank || left.id.localeCompare(right.id);
}

function treePackingCompositionKey(instance: SeedWorldPopulationInstance): string {
  return instance.treeSpeciesProfileKey ?? "unknown";
}

function treePackingLayerKey(instance: SeedWorldPopulationInstance): string {
  return `${treePackingCompositionKey(instance)}:${treePackingCohortKey(instance)}`;
}

function treePackingCohortKey(instance: SeedWorldPopulationInstance): string {
  return instance.treeCohortProfileKey ?? "unknown";
}

function countTreePackingKeys(
  instances: readonly SeedWorldPopulationInstance[],
  keyForInstance: (instance: SeedWorldPopulationInstance) => string
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const instance of instances) {
    const key = keyForInstance(instance);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function normalizeTreePackingCandidateCluster(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldPopulationInstance,
  targetClusterCounts: ReadonlyMap<string, number>
): SeedWorldPopulationInstance {
  if (!instance.treeClusterId || !targetClusterCounts.has(instance.treeClusterId)) {
    return withoutSeedWorldTreeCluster(instance);
  }
  const worldX = (instance.normalizedPosition.x - 0.5) * plan.sizeMetres;
  const worldZ = (instance.normalizedPosition.y - 0.5) * plan.sizeMetres;
  const community = sampleSeedWorldTreeCommunity(plan, fields, worldX, worldZ);
  return community.communityId === instance.treeClusterId &&
    Math.hypot(worldX - community.communityCenter.x, worldZ - community.communityCenter.y) <=
      community.communityRadiusMetres
    ? instance
    : withoutSeedWorldTreeCluster(instance);
}

function normalizeSeedWorldTreeClusterIdentities(
  plan: SeedWorldPlan,
  instances: readonly SeedWorldPopulationInstance[]
): readonly SeedWorldPopulationInstance[] {
  const clusters = new Map<string, SeedWorldPopulationInstance[]>();
  for (const instance of instances) {
    if (!instance.treeClusterId) continue;
    const cluster = clusters.get(instance.treeClusterId) ?? [];
    cluster.push(instance);
    clusters.set(instance.treeClusterId, cluster);
  }
  const retainedIds = new Set<string>();
  for (const cluster of clusters.values()) {
    const components = connectedTreePackingComponents(
      plan,
      cluster,
      plan.treeCommunityProfile.groveLinkDistanceMetres
    ).sort((left, right) => right.length - left.length || left[0]!.id.localeCompare(right[0]!.id));
    const retained = components.find(
      (component) =>
        component.length >= plan.treeCommunityProfile.minimumTreesPerGrove &&
        component.length <= plan.treeCommunityProfile.maximumTreesPerGrove
    );
    for (const instance of retained ?? []) retainedIds.add(instance.id);
  }
  return Object.freeze(instances.filter((instance) => !instance.treeClusterId || retainedIds.has(instance.id)));
}

function connectedTreePackingComponents(
  plan: SeedWorldPlan,
  instances: readonly SeedWorldPopulationInstance[],
  linkMetres: number
): SeedWorldPopulationInstance[][] {
  const centers = new Map(
    instances.map(
      (instance) =>
        [
          instance.id,
          Object.freeze({
            x: (instance.normalizedPosition.x - 0.5) * plan.sizeMetres,
            z: (instance.normalizedPosition.y - 0.5) * plan.sizeMetres
          })
        ] as const
    )
  );
  const components: SeedWorldPopulationInstance[][] = [];
  const visited = new Set<string>();
  for (const root of instances) {
    if (visited.has(root.id)) continue;
    visited.add(root.id);
    const component: SeedWorldPopulationInstance[] = [];
    const queue = [root];
    while (queue.length > 0) {
      const current = queue.pop()!;
      component.push(current);
      const currentCenter = centers.get(current.id)!;
      for (const neighbor of instances) {
        if (visited.has(neighbor.id)) continue;
        const neighborCenter = centers.get(neighbor.id)!;
        if (Math.hypot(currentCenter.x - neighborCenter.x, currentCenter.z - neighborCenter.z) > linkMetres) {
          continue;
        }
        visited.add(neighbor.id);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

function withoutSeedWorldTreeCluster(instance: SeedWorldPopulationInstance): SeedWorldPopulationInstance {
  if (!instance.treeClusterId) return instance;
  const { treeClusterId: _treeClusterId, ...tree } = instance;
  return Object.freeze(tree);
}

/** Retains the pre-existing broad forest components without applying small-grove caps to them. */
function retainSeedWorldMacroTreeGroves(
  plan: Pick<SeedWorldPlan, "sizeMetres" | "treeCommunityProfile">,
  instances: readonly SeedWorldPopulationInstance[],
  naturalTreeInstanceIds: ReadonlySet<string>
): readonly SeedWorldPopulationInstance[] {
  const linkMetres = plan.treeCommunityProfile.macroGroveLinkDistanceMetres;
  const minimumTrees = plan.treeCommunityProfile.macroMinimumTreesPerGrove;
  const candidates = instances
    .filter((instance) => naturalTreeInstanceIds.has(instance.id))
    .map((instance) =>
      Object.freeze({
        instance,
        worldX: (instance.normalizedPosition.x - 0.5) * plan.sizeMetres,
        worldZ: (instance.normalizedPosition.y - 0.5) * plan.sizeMetres
      })
    );
  const grid = new Map<string, number[]>();
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]!;
    const key = `${Math.floor(candidate.worldX / linkMetres)}:${Math.floor(candidate.worldZ / linkMetres)}`;
    const cell = grid.get(key);
    if (cell) cell.push(index);
    else grid.set(key, [index]);
  }
  const retainedIds = new Set<string>();
  const visited = new Uint8Array(candidates.length);
  for (let start = 0; start < candidates.length; start++) {
    if (visited[start]) continue;
    visited[start] = 1;
    const component: number[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const index = stack.pop()!;
      const candidate = candidates[index]!;
      component.push(index);
      const cellX = Math.floor(candidate.worldX / linkMetres);
      const cellZ = Math.floor(candidate.worldZ / linkMetres);
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          for (const neighborIndex of grid.get(`${cellX + offsetX}:${cellZ + offsetZ}`) ?? []) {
            if (visited[neighborIndex]) continue;
            const neighbor = candidates[neighborIndex]!;
            if (Math.hypot(candidate.worldX - neighbor.worldX, candidate.worldZ - neighbor.worldZ) > linkMetres) {
              continue;
            }
            visited[neighborIndex] = 1;
            stack.push(neighborIndex);
          }
        }
      }
    }
    if (component.length < minimumTrees) continue;
    for (const index of component) retainedIds.add(candidates[index]!.instance.id);
  }
  return Object.freeze(
    instances.filter((instance) => !naturalTreeInstanceIds.has(instance.id) || retainedIds.has(instance.id))
  );
}

function retainSeedWorldTreeClusters(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instances: readonly SeedWorldPopulationInstance[],
  naturalTreeInstanceIds: ReadonlySet<string>
): readonly SeedWorldPopulationInstance[] {
  const linkMetres = plan.treeCommunityProfile.groveLinkDistanceMetres;
  const minimumTrees = plan.treeCommunityProfile.minimumTreesPerGrove;
  const maximumTrees = plan.treeCommunityProfile.maximumTreesPerGrove;
  const clusters = new Map<
    string,
    Array<
      Readonly<{
        instance: SeedWorldPopulationInstance;
        worldX: number;
        worldZ: number;
        community: SeedWorldTreeCommunitySample;
      }>
    >
  >();
  for (const instance of instances) {
    if (!naturalTreeInstanceIds.has(instance.id) || !instance.treeClusterId) continue;
    const worldX = (instance.normalizedPosition.x - 0.5) * plan.sizeMetres;
    const worldZ = (instance.normalizedPosition.y - 0.5) * plan.sizeMetres;
    const community = sampleSeedWorldTreeCommunity(plan, fields, worldX, worldZ);
    if (
      Math.hypot(worldX - community.communityCenter.x, worldZ - community.communityCenter.y) >
      community.communityRadiusMetres
    ) {
      continue;
    }
    const candidates = clusters.get(instance.treeClusterId) ?? [];
    candidates.push(Object.freeze({ instance, worldX, worldZ, community }));
    clusters.set(instance.treeClusterId, candidates);
  }
  const retainedIds = new Set<string>();
  for (const candidates of clusters.values()) {
    const adjacency = candidates.map(() => [] as number[]);
    for (let left = 0; left < candidates.length; left++) {
      for (let right = left + 1; right < candidates.length; right++) {
        if (
          Math.hypot(
            candidates[left]!.worldX - candidates[right]!.worldX,
            candidates[left]!.worldZ - candidates[right]!.worldZ
          ) > linkMetres
        ) {
          continue;
        }
        adjacency[left]!.push(right);
        adjacency[right]!.push(left);
      }
    }
    const visited = new Uint8Array(candidates.length);
    const components: number[][] = [];
    for (let start = 0; start < candidates.length; start++) {
      if (visited[start]) continue;
      visited[start] = 1;
      const component: number[] = [];
      const stack = [start];
      while (stack.length > 0) {
        const index = stack.pop()!;
        component.push(index);
        for (const neighbor of adjacency[index]!) {
          if (visited[neighbor]) continue;
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
      components.push(component);
    }
    const component = components.sort(
      (left, right) =>
        right.length - left.length ||
        candidates[left[0]!]!.instance.id.localeCompare(candidates[right[0]!]!.instance.id)
    )[0];
    if (!component || component.length < minimumTrees) continue;
    const waterInfluence = Math.max(...component.map((index) => candidates[index]!.community.waterEdgeInfluence));
    const roadInfluence = Math.max(...component.map((index) => candidates[index]!.community.roadEdgeInfluence));
    const standInfluence =
      component.reduce((sum, index) => sum + candidates[index]!.community.standInfluence, 0) / component.length;
    const targetSignal = clamp01(Math.max(waterInfluence, roadInfluence * 0.72, standInfluence * 0.35));
    const targetCount = Math.min(
      component.length,
      minimumTrees + Math.round((maximumTrees - minimumTrees) * targetSignal)
    );
    const root = component.slice().sort((left, right) => {
      const leftCandidate = candidates[left]!;
      const rightCandidate = candidates[right]!;
      const center = leftCandidate.community.communityCenter;
      return (
        Math.hypot(leftCandidate.worldX - center.x, leftCandidate.worldZ - center.y) -
          Math.hypot(rightCandidate.worldX - center.x, rightCandidate.worldZ - center.y) ||
        leftCandidate.instance.id.localeCompare(rightCandidate.instance.id)
      );
    })[0]!;
    const componentIds = new Set(component);
    const selected = new Set<number>([root]);
    const queue = [root];
    while (queue.length > 0 && selected.size < targetCount) {
      const index = queue.shift()!;
      const neighbors = adjacency[index]!.filter(
        (neighbor) => componentIds.has(neighbor) && !selected.has(neighbor)
      ).sort((left, right) => candidates[left]!.instance.id.localeCompare(candidates[right]!.instance.id));
      for (const neighbor of neighbors) {
        selected.add(neighbor);
        queue.push(neighbor);
        if (selected.size >= targetCount) break;
      }
    }
    for (const index of selected) retainedIds.add(candidates[index]!.instance.id);
  }
  return Object.freeze(
    instances.filter((instance) => !naturalTreeInstanceIds.has(instance.id) || retainedIds.has(instance.id))
  );
}

function sampleVegetationDensity(
  rule: SeedWorldVegetationRule,
  sample: SeedWorldPopulationSample,
  worldX: number,
  worldZ: number,
  categorySeed: number,
  treeCommunity?: SeedWorldTreeCommunitySample
): number {
  if (sample.water) return 0;
  const roadClearance = categoryRoadClearance(rule.category);
  const riverClearance = categoryRiverClearance(rule.category);
  if (sample.roadDistanceMetres < roadClearance || sample.riverDistanceMetres < riverClearance) return 0;
  const cover = sample.landCover === SeedWorldLandCover.Wetland ? 0 : 1;
  if (cover <= 0) return 0;
  const moisture =
    rule.category === "tree"
      ? moistureDensitySuitability(sample.moisture, rule.moistureRange)
      : moistureFieldDensity(sample.moisture, rule.moistureRange);
  const terrainDensityMultiplier =
    rule.category === "tree"
      ? 1
      : (1 - smoothstep(rule.maximumSlope * 0.72, rule.maximumSlope, sample.slope)) * (1 - sample.rockySlopeWeight);
  const habitat = cover * moisture * terrainDensityMultiplier;
  if (rule.category === "tree" && treeCommunity) {
    return mix(rule.minimumQualifiedDensity, 1, habitat) * treeCommunity.densityMultiplier;
  }
  if (habitat <= 0.12) return 0;
  const cluster = valueNoise(
    worldX / rule.clusterWavelengthMetres,
    worldZ / rule.clusterWavelengthMetres,
    categorySeed
  );
  const clustered = clamp01((cluster - (1 - rule.clusterContrast)) / Math.max(rule.clusterContrast, 0.001));
  const ecologicalStrength = clamp01(habitat * 0.45 + clustered * 0.55);
  return mix(rule.minimumQualifiedDensity, 1, ecologicalStrength);
}

function categoryRoadClearance(category: SeedWorldVegetationRule["category"]): number {
  if (category === "tree") return 18;
  if (category === "shrub") return 13;
  if (category === "flower") return 9;
  return 6;
}

export function categoryRoadBoundaryClearance(category: SeedWorldVegetationRule["category"]): number {
  if (category === "tree") return 10;
  if (category === "shrub") return 5;
  if (category === "flower") return 1;
  return 0.5;
}

function categoryRiverClearance(category: SeedWorldVegetationRule["category"]): number {
  // Tree clearance is owned by the resolved Seed World-scaled footprint below; a second
  // fixed setback created an artificial empty strip around otherwise valid banks.
  if (category === "tree") return 0;
  if (category === "shrub") return 1.5;
  return 0.5;
}

function compilePopulationTransformIntent(
  plan: SeedWorldPlan,
  rule: SeedWorldVegetationRule,
  sample: SeedWorldPopulationSample,
  worldX: number,
  worldZ: number,
  candidateSeed: number,
  treeSpecies?: SeedWorldTreeSpeciesProfile,
  treeCohort?: SeedWorldTreeCohortProfile
): SeedWorldTransformIntent<"tree" | "shrub" | "flower" | "grass"> {
  const profile = getSeedWorldAssetPlacementProfile(rule.profileKey);
  const vegetation = profile.vegetation;
  const fieldRange = profile.roleScale.field;
  if (!vegetation || !fieldRange) {
    throw new RangeError(`Seed World population profile "${profile.key}" does not define a field growth policy`);
  }
  const localHeight = profile.geometry.verticalBoundsMetres[1] - profile.geometry.verticalBoundsMetres[0];
  if (localHeight <= 0) {
    throw new RangeError(`Seed World population profile "${profile.key}" requires positive authored height`);
  }
  const habitat = sample.landCover === SeedWorldLandCover.Wetland ? 0 : 1;
  const moisture = moistureDensitySuitability(sample.moisture, rule.moistureRange);
  const soil = clamp01(
    (1 - sample.slope) * 0.42 + (1 - Math.abs(sample.curvature)) * 0.28 + Math.min(1, sample.flow * 0.1) * 0.3
  );
  const growthSeed = deriveSeedWorldNamedSeed(plan.generationStreams.vegetation, `growth:${rule.category}`);
  const lowFrequency = valueNoise(
    worldX / vegetation.growthFieldWavelengthMetres,
    worldZ / vegetation.growthFieldWavelengthMetres,
    growthSeed
  );
  const regionalSignal = clamp01(lowFrequency * 0.45 + habitat * 0.25 + moisture * 0.15 + soil * 0.15);
  const regionalGrowth = mix(vegetation.regionalGrowthRange[0], vegetation.regionalGrowthRange[1], regionalSignal);
  const individualGrowth = sampleClampedLogNormal(
    candidateSeed,
    vegetation.individualLogNormalSigma,
    vegetation.individualGrowthRange
  );
  const individualGrowthSignal = clamp01(
    (individualGrowth - vegetation.individualGrowthRange[0]) /
      (vegetation.individualGrowthRange[1] - vegetation.individualGrowthRange[0])
  );
  const targetScale =
    treeSpecies && treeCohort
      ? mix(
          treeCohort.scaleRange[0],
          treeCohort.scaleRange[1],
          clamp01(regionalSignal * 0.45 + individualGrowthSignal * 0.55)
        )
      : (vegetation.baselineSpeciesHeightMetres * regionalGrowth * individualGrowth) / localHeight;
  const sizeRank = clamp01((targetScale - fieldRange.minimum) / (fieldRange.maximum - fieldRange.minimum));
  return Object.freeze({
    profileKey: rule.profileKey,
    role: "field",
    sizeRank,
    shapeVariationKey: deriveSeedWorldNamedSeed(candidateSeed, "shape-variation")
  });
}

function applySeedWorldTreeUniformScale(
  plan: Pick<SeedWorldPlan, "treeCommunityProfile">,
  placement: SeedWorldResolvedAssetPlacement<"tree" | "shrub" | "flower" | "grass">
): SeedWorldResolvedAssetPlacement<"tree" | "shrub" | "flower" | "grass"> {
  const multiplier = plan.treeCommunityProfile.treeUniformScale;
  if (!(multiplier > 0) || !Number.isFinite(multiplier)) {
    throw new RangeError("Seed World tree uniform scale must be finite and positive");
  }
  return Object.freeze({
    ...placement,
    scale: Object.freeze(placement.scale.map((value) => value * multiplier) as [number, number, number]),
    footprintMetres: Object.freeze(placement.footprintMetres.map((value) => value * multiplier) as [number, number])
  });
}

/** Replaces the semantic tree placeholder footprint with the selected recipe's real visible-geometry Bounds. */
function applySeedWorldTreeGeometryFootprint(
  plan: Pick<SeedWorldPlan, "treeSpeciesProfiles">,
  placement: SeedWorldResolvedAssetPlacement<"tree" | "shrub" | "flower" | "grass">,
  assetRecipeId: string
): SeedWorldResolvedAssetPlacement<"tree" | "shrub" | "flower" | "grass"> {
  const bounds = resolveSeedWorldTreeGeometryBounds(plan.treeSpeciesProfiles, assetRecipeId);
  return Object.freeze({
    ...placement,
    footprintMetres: resolveSeedWorldTreeFootprintMetres(bounds, placement.scale)
  });
}

function resolveSeedWorldTreeGeometryBounds(
  speciesProfiles: readonly SeedWorldTreeSpeciesProfile[],
  assetRecipeId: string
): SeedWorldTreePaletteProfile["geometryBounds"] {
  for (const species of speciesProfiles) {
    for (const palette of species.palettes) {
      if (palette.assetRecipeId === assetRecipeId) return palette.geometryBounds;
    }
  }
  throw new RangeError(`Seed World tree recipe "${assetRecipeId}" has no planned visible-geometry Bounds`);
}

function sampleClampedLogNormal(
  candidateSeed: number,
  sigma: number,
  range: readonly [minimum: number, maximum: number]
): number {
  const heightSeed = deriveSeedWorldNamedSeed(candidateSeed, "height");
  const first = Math.max(Number.MIN_VALUE, unitFloat(heightSeed, "normal-a"));
  const second = unitFloat(heightSeed, "normal-b");
  const standardNormal = Math.sqrt(-2 * Math.log(first)) * Math.cos(Math.PI * 2 * second);
  const logNormal = Math.exp(sigma * standardNormal - 0.5 * sigma * sigma);
  return Math.min(range[1], Math.max(range[0], logNormal));
}

function validateCellRequest(plan: SeedWorldPlan, fields: SeedWorldFields, cellX: number, cellZ: number): void {
  validatePlanAndFields(plan, fields);
  const cellCount = populationCellCount(plan.sizeMetres);
  if (
    !Number.isInteger(cellX) ||
    !Number.isInteger(cellZ) ||
    cellX < 0 ||
    cellZ < 0 ||
    cellX >= cellCount ||
    cellZ >= cellCount
  ) {
    throw new RangeError("Seed World Population Cell coordinates are outside the world");
  }
}

function validatePlanAndFields(plan: SeedWorldPlan, fields: SeedWorldFields): void {
  if (plan.rootSeed !== fields.rootSeed || plan.sizeMetres !== fields.sizeMetres) {
    throw new RangeError("Seed World population requires Plan and WorldFields from the same world");
  }
}

function populationCellCount(sizeMetres: number): number {
  return Math.ceil(sizeMetres / SEED_WORLD_POPULATION_CELL_METRES);
}

/** One normalized competitive response used to select an exact tree species. */
export interface SeedWorldTreeSpeciesResponse {
  /** Stable species catalog key. */
  readonly key: SeedWorldTreeSpeciesKey;
  /** Final non-negative competitive weight after moisture, terrain, slope, and ecotone responses. */
  readonly weight: number;
}

/**
 * Evaluates the smooth species competition field at one world-space point.
 * Overlapping moisture and mountain ranges plus low-frequency named noise form an ecotone instead of a hard biome boundary.
 * @param plan Authoritative tree-species catalog and mountain intent.
 * @param sample Final terrain and habitat sample at the point.
 * @param worldX World X in metres.
 * @param worldZ World Z in metres.
 * @returns Stable per-species competitive weights in catalog order.
 */
export function sampleSeedWorldTreeSpeciesResponses(
  plan: Pick<
    SeedWorldPlan,
    | "sizeMetres"
    | "coastShape"
    | "spawnReserve"
    | "mountainRidges"
    | "generationStreams"
    | "treeSpeciesProfiles"
    | "treeCommunityProfile"
  >,
  sample: Pick<SeedWorldPopulationSample, "moisture" | "slope" | "rockySlopeWeight">,
  worldX: number,
  worldZ: number
): readonly SeedWorldTreeSpeciesResponse[] {
  const normalizedPoint = Object.freeze({ x: worldX / plan.sizeMetres + 0.5, y: worldZ / plan.sizeMetres + 0.5 });
  const mountainInfluence = clamp01(
    sampleSeedWorldMountainUpliftMetres(plan, normalizedPoint) / SEED_WORLD_MAXIMUM_MOUNTAIN_UPLIFT_METRES
  );
  return Object.freeze(
    plan.treeSpeciesProfiles.map((profile) => {
      const moisture = peakedIntervalSuitability(
        sample.moisture,
        profile.moistureRange,
        profile.preferredMoisture,
        0.09
      );
      const mountain = peakedIntervalSuitability(
        mountainInfluence,
        profile.mountainInfluenceRange,
        profile.preferredMountainInfluence,
        0.1
      );
      const slopeDensityMultiplier = resolveSeedWorldTreeSlopeDensityMultiplier(
        plan.treeCommunityProfile,
        sample.slope
      );
      const ecotoneSeed = deriveSeedWorldNamedSeed(plan.generationStreams.vegetation, `tree-ecotone:${profile.key}`);
      const ecotone = valueNoise(
        worldX / profile.ecotoneWavelengthMetres,
        worldZ / profile.ecotoneWavelengthMetres,
        ecotoneSeed
      );
      return Object.freeze({
        key: profile.key,
        weight: profile.relativeAbundance * moisture * mountain * slopeDensityMultiplier * mix(0.82, 1.18, ecotone)
      });
    })
  );
}

function selectSeedWorldTreeSpecies(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  sample: SeedWorldPopulationSample,
  worldX: number,
  worldZ: number,
  community: SeedWorldTreeCommunitySample,
  candidateSeed: number
): SeedWorldTreeSpeciesProfile | undefined {
  const cache = getSeedWorldTreeCommunityCache(plan, fields);
  let communityResponses = cache.speciesResponsesByCommunity.get(community.communityId);
  if (!communityResponses) {
    const communitySample = sampleSeedWorldPopulation(
      plan,
      fields,
      community.communityCenter.x,
      community.communityCenter.y
    );
    communityResponses = sampleSeedWorldTreeSpeciesResponses(
      plan,
      communitySample ?? sample,
      community.communityCenter.x,
      community.communityCenter.y
    );
    if (communitySample) cache.speciesResponsesByCommunity.set(community.communityId, communityResponses);
  }
  const waterEdgeInfluence = Math.max(community.waterEdgeInfluence, community.riparianMoistureInfluence);
  const primary = selectWeightedTreeSpecies(
    plan,
    applySeedWorldTreeWaterEdgeSpeciesResponse(plan, communityResponses, waterEdgeInfluence),
    community.communitySeed,
    "primary"
  );
  if (!primary) return undefined;
  const purity = mix(
    plan.treeCommunityProfile.speciesPurity[0],
    plan.treeCommunityProfile.speciesPurity[1],
    unitFloat(community.communitySeed, "species-purity")
  );
  if (unitFloat(candidateSeed, "community-species") < purity) return primary;
  const localResponses = applySeedWorldTreeWaterEdgeSpeciesResponse(
    plan,
    sampleSeedWorldTreeSpeciesResponses(plan, sample, worldX, worldZ),
    waterEdgeInfluence
  );
  return selectWeightedTreeSpecies(plan, localResponses, candidateSeed, "associate") ?? primary;
}

function applySeedWorldTreeWaterEdgeSpeciesResponse(
  plan: Pick<SeedWorldPlan, "treeSpeciesProfiles">,
  responses: readonly SeedWorldTreeSpeciesResponse[],
  waterEdgeInfluence: number
): readonly SeedWorldTreeSpeciesResponse[] {
  return Object.freeze(
    responses.map((response) => {
      const species = plan.treeSpeciesProfiles.find(({ key }) => key === response.key)!;
      return Object.freeze({
        ...response,
        weight: response.weight * mix(1, species.waterEdgeAbundanceMultiplier, clamp01(waterEdgeInfluence))
      });
    })
  );
}

/**
 * Resolves an authored tree prototype without using ecological suitability as an acceptance gate.
 * Habitat may still influence the preferred species above; this fallback guarantees that a physically valid
 * authored placement is not rejected merely because the natural generator assigned zero local species weight.
 */
function selectAuthoredTreeSpecies(
  plan: Pick<SeedWorldPlan, "treeSpeciesProfiles">,
  candidateSeed: number
): SeedWorldTreeSpeciesProfile | undefined {
  return selectWeightedTreeSpecies(
    plan,
    plan.treeSpeciesProfiles.map((profile) => Object.freeze({ key: profile.key, weight: profile.relativeAbundance })),
    candidateSeed,
    "authored"
  );
}

function selectWeightedTreeSpecies(
  plan: Pick<SeedWorldPlan, "treeSpeciesProfiles">,
  responses: readonly SeedWorldTreeSpeciesResponse[],
  seed: number,
  namespace: string
): SeedWorldTreeSpeciesProfile | undefined {
  let selectedIndex = -1;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < responses.length; index++) {
    const response = responses[index]!;
    if (response.weight <= Number.EPSILON) continue;
    const sample = Math.max(unitFloat(seed, `tree-species:${namespace}:${response.key}`), Number.EPSILON);
    const score = Math.log(sample) / response.weight;
    if (score > selectedScore) {
      selectedIndex = index;
      selectedScore = score;
    }
  }
  return selectedIndex >= 0 ? plan.treeSpeciesProfiles[selectedIndex] : undefined;
}

function compileSeedWorldTreeAppearance(
  plan: Pick<SeedWorldPlan, "treeCommunityProfile">,
  species: SeedWorldTreeSpeciesProfile,
  community: SeedWorldTreeCommunitySample,
  candidateSeed: number
): Readonly<{
  assetRecipeId: string;
  treeCommunityId: string;
  treePaletteKey: SeedWorldTreePaletteKey;
}> {
  const primaryPalette = selectWeightedTreePalette(species.palettes, community.communitySeed, "primary")!;
  const purity = mix(
    plan.treeCommunityProfile.palettePurity[0],
    plan.treeCommunityProfile.palettePurity[1],
    unitFloat(community.communitySeed, `palette-purity:${species.key}`)
  );
  const palette =
    unitFloat(candidateSeed, "community-palette") < purity
      ? primaryPalette
      : (selectWeightedTreePalette(
          species.palettes.map((candidate) =>
            candidate.key === primaryPalette.key ? Object.freeze({ ...candidate, relativeAbundance: 0 }) : candidate
          ),
          candidateSeed,
          "associate"
        ) ?? primaryPalette);
  return Object.freeze({
    assetRecipeId: palette.assetRecipeId,
    treeCommunityId: community.communityId,
    treePaletteKey: palette.key
  });
}

function selectWeightedTreePalette(
  palettes: readonly SeedWorldTreePaletteProfile[],
  seed: number,
  namespace: string
): SeedWorldTreePaletteProfile | undefined {
  let selected: SeedWorldTreePaletteProfile | undefined;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (const palette of palettes) {
    if (palette.relativeAbundance <= Number.EPSILON) continue;
    const sample = Math.max(unitFloat(seed, `tree-palette:${namespace}:${palette.key}`), Number.EPSILON);
    const score = Math.log(sample) / palette.relativeAbundance;
    if (score > selectedScore) {
      selected = palette;
      selectedScore = score;
    }
  }
  return selected;
}

function peakedIntervalSuitability(
  value: number,
  range: readonly [minimum: number, maximum: number],
  preferred: number,
  transition: number
): number {
  const support = intervalSuitability(value, range[0], range[1], transition);
  if (support <= 0) return 0;
  const halfSpan = Math.max(preferred - range[0], range[1] - preferred, transition);
  const preference = 1 - smoothstep(0.35, 1, Math.abs(value - preferred) / halfSpan);
  return support * mix(0.46, 1, preference);
}

function intervalSuitability(value: number, minimum: number, maximum: number, transition: number): number {
  return (
    smoothstep(minimum - transition, minimum + transition, value) *
    (1 - smoothstep(maximum - transition, maximum + transition, value))
  );
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = quintic(x - x0);
  const ty = quintic(y - y0);
  const top = mix(unitFloat(seed, `noise:${x0}:${y0}`), unitFloat(seed, `noise:${x0 + 1}:${y0}`), tx);
  const bottom = mix(unitFloat(seed, `noise:${x0}:${y0 + 1}`), unitFloat(seed, `noise:${x0 + 1}:${y0 + 1}`), tx);
  return mix(top, bottom, ty);
}

function unitFloat(seed: number, namespace: string): number {
  return deriveSeedWorldNamedSeed(seed, namespace) / 0x1_0000_0000;
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const amount = clamp01((value - minimum) / Math.max(maximum - minimum, Number.EPSILON));
  return amount * amount * (3 - 2 * amount);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hashText(hash: number, value: string): number {
  for (let index = 0; index < value.length; index++) hash = hashUint32(hash, value.charCodeAt(index));
  return hash;
}

function hashFloat(hash: number, value: number): number {
  return hashUint32(hash, Math.round(value * 1_000_000));
}

function hashUint32(hash: number, value: number): number {
  return Math.imul(hash ^ value, 0x0100_0193) >>> 0;
}
