import { sampleSeedWorldHeight, sampleSeedWorldPopulation, type SeedWorldFields } from "../runtime/SeedWorldFields.ts";
import {
  deriveSeedWorldNamedSeed,
  sampleSeedWorldCoastSignedFieldMetres,
  sampleSeedWorldMountainUpliftMetres,
  SeedWorldLandCover,
  SEED_WORLD_WETLAND_MAXIMUM_MOUNTAIN_UPLIFT_METRES,
  type SeedWorldCountRange,
  type SeedWorldMountainBrush,
  type SeedWorldMushroomDecorationRule,
  type SeedWorldPlan,
  type SeedWorldPoint,
  type SeedWorldRockDecorationRule,
  type SeedWorldStoneDecorationRule
} from "./SeedWorldPlanner";
import { sampleSeedWorldRiverCurve, seedWorldRiverBankRadius } from "../runtime/SeedWorldRiverCurves.ts";
import {
  getSeedWorldAssetPlacementProfile,
  resolveSeedWorldAssetPlacement,
  SEED_WORLD_ROCK_CLIF_1_LOCAL_BOUNDS,
  type SeedWorldResolvedAssetPlacement,
  type SeedWorldTransformIntent
} from "./SeedWorldAssetPlacementProfile";
import {
  sampleSeedWorldRiverBankSignedDistanceMetres,
  sampleSeedWorldRoadSignedDistanceMetres,
  seedWorldRiverToOrientedBoxSignedDistanceMetres,
  seedWorldRoadToOrientedBoxSignedDistanceMetres,
  type SeedWorldOrientedBox
} from "./SeedWorldFeatureGeometry";
import type { SeedWorldHydrologyWaterBody } from "../runtime/SeedWorldHydrologyBake.ts";

const ROCK_ROAD_CENTERLINE_CLEARANCE_METRES = 14;
const ROCK_ROAD_BOUNDARY_CLEARANCE_METRES = 6;
const ROADSIDE_ROCK_MAXIMUM_FOOTPRINT_OVERLAP_RATIO = 0.5;
const SMALL_ROCK_ROAD_CENTERLINE_CLEARANCE_METRES = 10;
const SMALL_ROCK_ROAD_BOUNDARY_CLEARANCE_METRES = 2;
const SMALL_ROCK_PARENT_CLEARANCE_METRES = 0.35;
const DEBRIS_COLLISION_CELL_SIZE_METRES = 32;
const MUSHROOM_PARENT_CLEARANCE_METRES = 0.01;
const ROCK_RIVER_CLEARANCE_METRES = 8;
const ROADSIDE_ROCK_MAXIMUM_SLOPE_DEGREES = 42;
const ROCK_MINIMUM_CLUSTER_SPACING_FACTOR = 1.35;
const ROCK_CANDIDATES_PER_MOUNTAIN_BRUSH = 96;
const ROCK_WETLAND_COMPONENT_MINIMUM_CELLS = 3;
const ROCK_WETLAND_BOUNDARY_WEIGHT = 64;
const ROCK_WETLAND_BOUNDARY_WEIGHT_TOLERANCE = 20;

/** Maximum deterministic RockLab-canonical pitch which raises the authored Clif1 pointed end. */
export const SEED_WORLD_LAKE_OUTCROP_MAXIMUM_TIP_PITCH_RADIANS = (30 * Math.PI) / 180;

/** Exact source feature class which caused one rock instance to exist. */
export type SeedWorldRockSourceKind = "mountain" | "wetland" | "riverbank" | "river" | "roadside" | "lake-outcrop";

/** Natural feature class which owns one exact small-stone instance. */
export type SeedWorldSmallRockSourceKind = "riverbank" | "river" | "land" | "roadside";

/** Terrain substrate which resolves the authored rock material without changing its feature ownership. */
export type SeedWorldRockSurfaceKind = "grass" | "soil" | "rock";

/** Exact feature-bound decoration shared by the 2D plan and 3D renderer. */
export interface SeedWorldDecorationInstance {
  /** Stable identity derived from source feature and ordinals. */
  readonly id: string;
  /** Implemented discrete-decoration category. */
  readonly category: "rock";
  /** Natural feature class which owns this instance. */
  readonly sourceKind: SeedWorldRockSourceKind;
  /** Exact surface substrate at the shared X-Z marker. */
  readonly surfaceKind: SeedWorldRockSurfaceKind;
  /** Stable mountain-brush, hydrology-body, road, or wetland-component identity. */
  readonly sourceFeatureId: string;
  /** Stable identity shared by every rock in the same visual cluster. */
  readonly visualClusterId: string;
  /** Asset-independent semantic transform selection. */
  readonly intent: SeedWorldTransformIntent<"cliff-rock">;
  /** Version of the profile that resolved the exact transform. */
  readonly profileVersion: number;
  /** Exact normalized world X-Z location consumed by both 2D and 3D. */
  readonly normalizedPosition: SeedWorldPoint;
  /** Exact accepted authored family selected by the shared profile resolver. */
  readonly prototypeFamily: "rock-clif-1";
  /** Exact local X-Y-Z instance scale. */
  readonly scale: readonly [number, number, number];
  /** Exact scaled X-Z footprint used for shared OBB validation and 2D drawing. */
  readonly footprintMetres: readonly [width: number, depth: number];
  /** Exact rotation about terrain normal. */
  readonly yawRadians: number;
  /** Exact residual local X-Z tilt applied after terrain-normal alignment. */
  readonly tiltResidualRadians: readonly [number, number];
  /** Optional source-owned fraction of fitted rock height retained above Hfinal. */
  readonly visibleHeightRatio?: number;
}

/** Exact ordinary stone placed around one accepted parent rock. */
export interface SeedWorldStoneInstance {
  /** Stable identity derived from the parent rock and ordinal. */
  readonly id: string;
  /** Discrete decoration category. */
  readonly category: "stone";
  /** Parent-rock feature class owning this stone. */
  readonly sourceKind: Exclude<SeedWorldRockSourceKind, "wetland"> | "land";
  /** Stable upstream feature identity. */
  readonly sourceFeatureId: string;
  /** Exact parent rock whose footprint owns this radial placement. */
  readonly parentDecorationId: string;
  /** Stable ordinal within the parent. */
  readonly ordinal: number;
  /** Asset-independent ordinary-stone transform intent. */
  readonly intent: SeedWorldTransformIntent<"feature-stone">;
  /** Version of the profile resolving the exact transform. */
  readonly profileVersion: number;
  /** Exact normalized X-Z position consumed by 2D and 3D. */
  readonly normalizedPosition: SeedWorldPoint;
  /** Accepted authored ordinary-stone variant. */
  readonly prototypeFamily: "stone-1" | "stone-2" | "stone-3" | "stone-4";
  /** Exact local X-Y-Z scale. */
  readonly scale: readonly [number, number, number];
  /** Exact scaled X-Z footprint. */
  readonly footprintMetres: readonly [width: number, depth: number];
  /** Exact rotation about terrain normal. */
  readonly yawRadians: number;
  /** Exact residual local X-Z tilt. */
  readonly tiltResidualRadians: readonly [number, number];
}

/** Exact low-count small-stone instance shared by 2D and 3D consumers. */
export interface SeedWorldSmallRockInstance {
  /** Stable identity derived from category, feature, cluster, and ordinal. */
  readonly id: string;
  /** Discrete decoration category. */
  readonly category: "small-rock";
  /** Natural feature class which owns this instance. */
  readonly sourceKind: SeedWorldSmallRockSourceKind;
  /** Stable upstream feature or visual-cluster identity. */
  readonly sourceFeatureId: string;
  /** Exact large-rock parent whose footprint sheds this stone cluster. */
  readonly parentDecorationId: string;
  /** Stable ordinal within the source feature. */
  readonly ordinal: number;
  /** Exact normalized world X-Z location consumed by both 2D and 3D. */
  readonly normalizedPosition: SeedWorldPoint;
  /** Asset-independent semantic transform selection. */
  readonly intent: SeedWorldTransformIntent<"small-stone">;
  /** Version of the profile that resolved the exact transform. */
  readonly profileVersion: number;
  /** Accepted authored four-pebble debris family. */
  readonly prototypeFamily: "stones";
  /** Exact local X-Y-Z instance scale. */
  readonly scale: readonly [number, number, number];
  /** Exact scaled X-Z footprint used for shared OBB validation and 2D drawing. */
  readonly footprintMetres: readonly [width: number, depth: number];
  /** Exact rotation about terrain normal. */
  readonly yawRadians: number;
}

/** Exact sparse mushroom instance compiled around one accepted parent-rock footprint. */
export interface SeedWorldMushroomInstance {
  /** Stable identity derived from the independent mushroom stream and parent rock. */
  readonly id: string;
  /** Discrete decoration category. */
  readonly category: "mushroom";
  /** Parent habitat grammar. */
  readonly sourceKind: "rock-edge";
  /** Exact parent rock which owns the cluster. */
  readonly sourceFeatureId: string;
  /** Exact parent decoration used for footprint exclusion. */
  readonly parentDecorationId: string;
  /** Stable ordinal inside the parent cluster. */
  readonly ordinal: number;
  /** Exact normalized world X-Z location. */
  readonly normalizedPosition: SeedWorldPoint;
  /** Asset-independent authored transform intent. */
  readonly intent: SeedWorldTransformIntent<"mushroom">;
  /** Profile version resolving this transform. */
  readonly profileVersion: number;
  /** Accepted authored mushroom family. */
  readonly prototypeFamily: "mushroom-1";
  /** Exact resolved X-Y-Z scale. */
  readonly scale: readonly [number, number, number];
  /** Exact resolved X-Z footprint. */
  readonly footprintMetres: readonly [width: number, depth: number];
  /** Exact rotation around world up. */
  readonly yawRadians: number;
}

/** Exact authorized lotus instance owned by one Artifact Lake's main-storage shoreline. */
export interface SeedWorldLotusInstance {
  readonly id: string;
  readonly category: "lotus";
  readonly sourceKind: "lake-shore";
  readonly sourceFeatureId: string;
  readonly bodySourceHash: string;
  readonly ordinal: number;
  readonly normalizedPosition: SeedWorldPoint;
  readonly prototypeFamily: "lotus" | "lotus-group-1" | "lotus-group-2";
  readonly scale: readonly [number, number, number];
  readonly footprintMetres: readonly [width: number, depth: number];
  readonly yawRadians: number;
  readonly waterLevelMetres: number;
  readonly waterDepthMetres: number;
  /** Artifact Lake signed distance inside the canonical shoreline, in metres. */
  readonly shoreDistanceMetres: number;
  /** Requested Lake-surface area budget derived from `patchAreaRatio`. */
  readonly requestedPatchAreaSquareMetres: number;
  /** Requested fraction of the authoritative Lake surface. */
  readonly requestedPatchAreaRatio: number;
  /** Deterministic sampled area of the legal single-anchor patch envelope. */
  readonly achievedPatchAreaSquareMetres: number;
  /** Achieved legal patch area divided by the authoritative Lake area. */
  readonly achievedPatchAreaRatio: number;
  /** Final single-anchor radial envelope selected by the area solver. */
  readonly patchRadiusMetres: number;
  /** Final adaptive inland limit selected after exhausting the preferred 8 m shore band. */
  readonly patchMaximumShoreDistanceMetres: number;
  /** Final adaptive depth limit coupled to the inland expansion. */
  readonly patchMaximumWaterDepthMetres: number;
  /** Fixed offset from canonical Water Y; the current positive value keeps pads above the render-underlapped plane. */
  readonly surfaceOffsetMetres: number;
}

/** Every low-count feature-bound instance published by the vector plan. */
export type SeedWorldFeatureDecorationInstance =
  | SeedWorldDecorationInstance
  | SeedWorldStoneInstance
  | SeedWorldSmallRockInstance
  | SeedWorldMushroomInstance;

/** Complete render-facing exact decoration stream, including Artifact-derived Lake flora. */
export type SeedWorldPresentationDecorationInstance = SeedWorldFeatureDecorationInstance | SeedWorldLotusInstance;

interface DecorationCandidate {
  readonly position: SeedWorldPoint;
  readonly score: number;
}

interface WetlandFeature {
  readonly id: string;
  readonly cells: readonly number[];
}

interface OrientedFootprint {
  readonly box: SeedWorldOrientedBox;
  readonly boundingRadiusMetres: number;
}

interface DebrisFootprintIndex {
  readonly footprintsByCell: Map<string, OrientedFootprint[]>;
  footprintCount: number;
}

/**
 * Compiles exact feature-bound rock instances from one plan and its canonical runtime fields.
 * The returned X-Z position, yaw, scale, and cluster identity are final; 3D may only add
 * Hfinal Y, terrain-normal alignment, material selection, and footprint burial.
 * @param plan Authoritative semantic plan and Root-Seed generation streams.
 * @param fields Canonical height, water, road, and habitat fields for the same plan.
 * @param hydrologyWaterBodies Connected lake-and-river bodies owning the complete shoreline geometry.
 * @returns Stable exact decoration instances shared by the 2D and 3D consumers.
 * @throws {RangeError} When the plan, fields, and hydrology geometry do not describe the same world.
 */
export function compileSeedWorldDecorations(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  hydrologyWaterBodies?: readonly SeedWorldHydrologyWaterBody[]
): readonly SeedWorldDecorationInstance[] {
  if (plan.rootSeed !== fields.rootSeed || plan.sizeMetres !== fields.sizeMetres) {
    throw new RangeError("Seed World decorations require Plan and WorldFields from the same world");
  }

  const instances: SeedWorldDecorationInstance[] = [];
  const mountainRule = findRockRule(plan, "mountain");
  if (mountainRule?.mountainProfileBand) {
    for (const ridge of plan.mountainRidges) {
      for (const brush of ridge.brushes) {
        const featureId = `${ridge.id}/${brush.id}`;
        const candidates = compileMountainCandidates(plan, fields, mountainRule, brush, featureId);
        appendFeatureClusters(
          instances,
          plan,
          fields,
          mountainRule,
          featureId,
          candidates,
          (position) => mountainPositionIsValid(plan, fields, mountainRule, brush, position),
          undefined,
          (instance) => rockFootprintIsValid(plan, fields, instance)
        );
      }
    }
  }

  const riverbankRule = findRockRule(plan, "riverbank");
  if (riverbankRule?.riverBankOffsetMetres) {
    const shorelineFeatures = hydrologyWaterBodies ?? fields.riverCurves;
    for (const feature of shorelineFeatures) {
      const isHydrologyBody = "signedDistanceMetres" in feature;
      if (isHydrologyBody && feature.geometryHash !== fields.hydrologyGeometryHash) {
        throw new RangeError(`Hydrology body '${feature.id}' does not match the compiled WorldFields geometry`);
      }
      const candidates = isHydrologyBody
        ? compileHydrologyShoreCandidates(plan, fields, riverbankRule, feature)
        : compileRiverbankCandidates(plan, fields, riverbankRule, feature.id);
      const positionIsValid = isHydrologyBody
        ? (position: SeedWorldPoint) => hydrologyShorePositionIsValid(plan, fields, riverbankRule, feature, position)
        : (position: SeedWorldPoint) => riverbankPositionIsValid(plan, fields, position);
      appendFeatureClusters(
        instances,
        plan,
        fields,
        riverbankRule,
        feature.id,
        candidates,
        positionIsValid,
        undefined,
        (instance) => riverbankRockFootprintIsValid(plan, fields, instance, positionIsValid)
      );
    }
  }

  const lakeOutcropRule = findRockRule(plan, "lake-outcrop");
  if (
    hydrologyWaterBodies &&
    lakeOutcropRule?.lakeInteriorDistanceMetres &&
    lakeOutcropRule.lakeOutcropAreaPerClusterSquareMetres
  ) {
    for (const body of hydrologyWaterBodies) {
      if (body.geometryHash !== fields.hydrologyGeometryHash) {
        throw new RangeError(`Hydrology body '${body.id}' does not match the compiled WorldFields geometry`);
      }
      if (body.areaSquareMetres < (lakeOutcropRule.minimumWaterAreaSquareMetres ?? 0)) continue;
      const clusterCount = lakeOutcropClusterCount(lakeOutcropRule, body.areaSquareMetres);
      const candidates = compileLakeOutcropCandidates(plan, fields, lakeOutcropRule, body);
      const positionIsValid = (position: SeedWorldPoint) =>
        lakeOutcropPositionIsValid(plan, fields, lakeOutcropRule, body, position);
      appendFeatureClusters(
        instances,
        plan,
        fields,
        lakeOutcropRule,
        body.id,
        candidates,
        positionIsValid,
        undefined,
        (instance) => lakeOutcropRockFootprintIsValid(plan, fields, lakeOutcropRule, body, instance),
        clusterCount,
        Math.sqrt(body.areaSquareMetres / (clusterCount * Math.PI))
      );
    }
  }

  const riverRule = findRockRule(plan, "river");
  if (riverRule?.riverChannelOffsetRatio) {
    for (const curve of fields.riverCurves) {
      const candidates = compileRiverCandidates(plan, fields, riverRule, curve.id);
      appendFeatureClusters(
        instances,
        plan,
        fields,
        riverRule,
        curve.id,
        candidates,
        (position) => riverPositionIsValid(plan, fields, position),
        undefined,
        (instance) => riverRockFootprintIsValid(plan, fields, instance)
      );
    }
  }

  const roadsideRule = findRockRule(plan, "roadside");
  if (roadsideRule?.roadsideOffsetMetres) {
    for (const road of plan.roads) {
      const candidates = compileRoadsideCandidates(plan, fields, roadsideRule, road.id);
      appendFeatureClusters(
        instances,
        plan,
        fields,
        roadsideRule,
        road.id,
        candidates,
        (position) => roadsidePositionIsValid(plan, fields, position),
        undefined,
        (instance) => roadsideRockFootprintIsValid(plan, fields, instance),
        roadsideClusterCount(road.points, plan.sizeMetres, roadsideRule.spacingMetres)
      );
    }
  }

  const wetlandFeatures = findWetlandFeatures(plan, fields);
  const wetlandRule = findRockRule(plan, "wetland");
  if (wetlandRule?.wetlandDistanceMetres) {
    for (const feature of wetlandFeatures) {
      const candidates = compileWetlandCandidates(plan, fields, wetlandRule, feature);
      appendFeatureClusters(
        instances,
        plan,
        fields,
        wetlandRule,
        feature.id,
        candidates,
        (position) => wetlandPositionIsValid(plan, fields, wetlandRule, position),
        (position) => projectToWetlandBoundary(fields, position, wetlandRule.wetlandDistanceMetres!.maximum),
        (instance) => rockFootprintIsValid(plan, fields, instance)
      );
    }
  }

  instances.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze(instances);
}

/**
 * Compiles every authored debris variant through one radial parent-rock grammar.
 * @param plan Authoritative semantic plan and named generation streams.
 * @param fields Canonical terrain, water, and clearance fields.
 * @param parentRocks Exact parent-rock array shared by 2D and 3D.
 * @param hydrologyWaterBodies Connected water bodies used to keep lake stones supported and visible.
 * @returns Stable Stone 1–4 and four-pebble transforms with identical placement semantics.
 * @throws {RangeError} When the plan and fields describe different worlds.
 */
export function compileSeedWorldDebrisDecorations(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  parentRocks: readonly SeedWorldDecorationInstance[],
  hydrologyWaterBodies?: readonly SeedWorldHydrologyWaterBody[]
): readonly (SeedWorldStoneInstance | SeedWorldSmallRockInstance)[] {
  if (plan.rootSeed !== fields.rootSeed || plan.sizeMetres !== fields.sizeMetres) {
    throw new RangeError("Seed World debris requires Plan and WorldFields from the same world");
  }
  const rules = plan.featureDecorationRules.filter(
    (candidate): candidate is SeedWorldStoneDecorationRule => candidate.category === "debris"
  );
  const parentFootprints = parentRocks.map((rock) =>
    orientedFootprint(decorationOrientedBox(plan, rock, rock.footprintMetres[0], rock.footprintMetres[1]))
  );
  const hydrologyBodyById = new Map(hydrologyWaterBodies?.map((body) => [body.id, body] as const));
  const result: (SeedWorldStoneInstance | SeedWorldSmallRockInstance)[] = [];
  const acceptedDebrisFootprints: DebrisFootprintIndex = { footprintsByCell: new Map(), footprintCount: 0 };
  for (const rule of rules) {
    const parents = parentRocks.filter(
      (rock) =>
        rock.sourceKind === rule.sourceKind && (rule.sourceKind !== "lake-outcrop" || rock.id.endsWith(":piece-0"))
    );
    const categorySeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, `debris:${rule.sourceKind}:parents`);
    for (const parent of parents) {
      const supportRocks =
        rule.sourceKind === "lake-outcrop"
          ? parentRocks.filter((rock) => rock.visualClusterId === parent.visualClusterId)
          : [parent];
      const parentSeed = deriveSeedWorldNamedSeed(categorySeed, parent.id);
      if (unitFloat(parentSeed, "coverage") >= rule.parentCoverage) continue;
      const pieceCount = integerInRange(rule.piecesPerParent, parentSeed, "piece-count");
      for (let ordinal = 0; ordinal < pieceCount; ordinal++) {
        for (let terrainAttempt = 0; terrainAttempt < 20; terrainAttempt++) {
          const seed = deriveSeedWorldNamedSeed(parentSeed, `piece:${ordinal}:attempt:${terrainAttempt}`);
          const profileKey = rule.profileKeys[Math.floor(unitFloat(seed, "profile") * rule.profileKeys.length)];
          const intent = Object.freeze({
            profileKey,
            role:
              rule.sourceKind !== "lake-outcrop" && ordinal === 0 && profileSupportsRole(profileKey, "cluster")
                ? "cluster"
                : "field",
            sizeRank: unitFloat(seed, "size-rank"),
            ...(rule.sizeMultiplierRange
              ? {
                  sizeMultiplier: mix(
                    rule.sizeMultiplierRange[0],
                    rule.sizeMultiplierRange[1],
                    unitFloat(seed, "size-multiplier")
                  )
                }
              : {}),
            shapeVariationKey: deriveSeedWorldNamedSeed(seed, "shape-variation")
          } as const);
          const placement = resolveSeedWorldAssetPlacement(intent, {
            maximumFootprintMetres:
              Math.max(parent.footprintMetres[0], parent.footprintMetres[1]) *
              getSeedWorldAssetPlacementProfile(intent.profileKey).maximumParentFootprintRatio!
          });
          const yawRadians = unitFloat(seed, "yaw") * Math.PI * 2;
          const debrisScatter = resolveGroupedDebrisScatter(rule, parentSeed, ordinal, seed);
          const preferredPosition = sampleStoneAroundParent(
            plan,
            parent,
            placement.footprintMetres,
            yawRadians,
            rule.radialOffsetMetres,
            rule.parentSupportRadiusRatio ?? 1,
            supportRocks,
            seed,
            debrisScatter,
            undefined
          );
          const preferredInstance = createSeedWorldDebrisInstance(
            rule,
            parent,
            ordinal,
            seed,
            intent,
            placement,
            preferredPosition,
            yawRadians
          );
          if (decorationOverlapsAnyFootprint(plan, parentFootprints, preferredInstance)) {
            continue;
          }
          const hydrologyBody = hydrologyBodyById.get(preferredInstance.sourceFeatureId);
          if (!stoneFootprintIsValid(plan, fields, preferredInstance, rule.maximumSlopeDegrees, hydrologyBody)) {
            continue;
          }
          let instance = preferredInstance;
          let footprint = orientedFootprint(
            decorationOrientedBox(plan, instance, instance.footprintMetres[0], instance.footprintMetres[1])
          );
          if (debrisFootprintOverlapsIndex(acceptedDebrisFootprints, footprint)) {
            const normalizedPosition = sampleStoneAroundParent(
              plan,
              parent,
              placement.footprintMetres,
              yawRadians,
              rule.radialOffsetMetres,
              rule.parentSupportRadiusRatio ?? 1,
              supportRocks,
              seed,
              debrisScatter,
              acceptedDebrisFootprints
            );
            instance = createSeedWorldDebrisInstance(
              rule,
              parent,
              ordinal,
              seed,
              intent,
              placement,
              normalizedPosition,
              yawRadians
            );
            footprint = orientedFootprint(
              decorationOrientedBox(plan, instance, instance.footprintMetres[0], instance.footprintMetres[1])
            );
            if (debrisFootprintOverlapsIndex(acceptedDebrisFootprints, footprint)) break;
            if (decorationOverlapsAnyFootprint(plan, parentFootprints, instance)) {
              break;
            }
            if (!stoneFootprintIsValid(plan, fields, instance, rule.maximumSlopeDegrees, hydrologyBody)) break;
          }
          result.push(instance);
          indexDebrisFootprint(acceptedDebrisFootprints, footprint);
          break;
        }
      }
    }
  }
  result.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze(result);
}

function createSeedWorldDebrisInstance(
  rule: SeedWorldStoneDecorationRule,
  parent: SeedWorldDecorationInstance,
  ordinal: number,
  seed: number,
  intent: SeedWorldTransformIntent<"feature-stone" | "small-stone">,
  placement: ReturnType<typeof resolveSeedWorldAssetPlacement>,
  normalizedPosition: SeedWorldPoint,
  yawRadians: number
): SeedWorldStoneInstance | SeedWorldSmallRockInstance {
  const common = {
    id: `debris:${rule.sourceKind}:${parent.id}:piece-${ordinal}`,
    sourceFeatureId: parent.sourceFeatureId,
    parentDecorationId: parent.id,
    ordinal,
    profileVersion: placement.profileVersion,
    normalizedPosition,
    scale: placement.scale,
    footprintMetres: placement.footprintMetres,
    yawRadians
  } as const;
  if (intent.profileKey === "small-stone") {
    if (rule.sourceKind === "lake-outcrop") {
      throw new RangeError("Lake outcrop debris requires authored Stone 1-4 variants");
    }
    const smallStoneIntent = Object.freeze({
      profileKey: "small-stone",
      role: intent.role,
      sizeRank: intent.sizeRank,
      ...(intent.sizeMultiplier !== undefined ? { sizeMultiplier: intent.sizeMultiplier } : {}),
      shapeVariationKey: intent.shapeVariationKey
    } as const);
    return Object.freeze({
      ...common,
      category: "small-rock",
      sourceKind: rule.sourceKind === "mountain" ? "land" : rule.sourceKind,
      intent: smallStoneIntent,
      prototypeFamily: placement.prototypeFamily as "stones"
    } satisfies SeedWorldSmallRockInstance);
  }
  const featureStoneIntent = Object.freeze({
    profileKey: "feature-stone",
    role: intent.role,
    sizeRank: intent.sizeRank,
    ...(intent.sizeMultiplier !== undefined ? { sizeMultiplier: intent.sizeMultiplier } : {}),
    shapeVariationKey: intent.shapeVariationKey
  } as const);
  return Object.freeze({
    ...common,
    category: "stone",
    sourceKind: rule.sourceKind,
    intent: featureStoneIntent,
    prototypeFamily: placement.prototypeFamily as SeedWorldStoneInstance["prototypeFamily"],
    tiltResidualRadians: Object.freeze([
      mix(-0.08, 0.08, unitFloat(seed, "tilt-x")),
      mix(-0.08, 0.08, unitFloat(seed, "tilt-z"))
    ] as const)
  } satisfies SeedWorldStoneInstance);
}

/**
 * Compiles every feature-bound decoration without changing the legacy rock-only 3D adapter.
 * Small-stone transforms are final and can be consumed directly by a category-specific renderer.
 * @param plan Authoritative semantic plan and named generation streams.
 * @param fields Canonical fields for the same world.
 * @param hydrologyWaterBodies Connected lake-and-river bodies owning shoreline-bound decorations.
 * @returns Stable rock, stone, small-stone, and mushroom instances shared by vector and 3D consumers.
 * @throws {RangeError} When the plan, fields, and hydrology geometry do not describe the same world.
 */
export function compileSeedWorldFeatureDecorations(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  hydrologyWaterBodies?: readonly SeedWorldHydrologyWaterBody[]
): readonly SeedWorldFeatureDecorationInstance[] {
  const rocks = compileSeedWorldDecorations(plan, fields, hydrologyWaterBodies);
  const debris = compileSeedWorldDebrisDecorations(plan, fields, rocks, hydrologyWaterBodies);
  const mushrooms = compileSeedWorldMushroomDecorations(plan, fields, rocks);
  return Object.freeze([...rocks, ...debris, ...mushrooms].sort((left, right) => left.id.localeCompare(right.id)));
}

/**
 * Hashes exact shared decoration transforms for persistence and producer-consumer diagnostics.
 * @param decorations Stable feature-bound instances in compiler order.
 * @returns Unsigned 32-bit FNV-1a hash covering identity, source, position, rotation, and scale.
 */
export function hashSeedWorldFeatureDecorations(
  decorations: readonly SeedWorldPresentationDecorationInstance[]
): number {
  let hash = 0x811c_9dc5;
  for (const decoration of decorations) {
    hash = hashText(hash, decoration.id);
    hash = hashText(hash, decoration.category);
    hash = hashText(hash, decoration.sourceKind);
    hash = hashText(hash, decoration.sourceFeatureId);
    hash = hashText(hash, decoration.prototypeFamily);
    if (decoration.category === "rock") {
      hash = hashText(hash, decoration.surfaceKind);
      hash = hashText(hash, decoration.visualClusterId);
      hash = hashText(hash, decoration.intent.profileKey);
      hash = hashText(hash, decoration.intent.role);
      hash = hashFloat(hash, decoration.intent.sizeRank);
      hash = hashUint32(hash, decoration.intent.shapeVariationKey);
      hash = hashUint32(hash, decoration.profileVersion);
      hash = hashFloat(hash, decoration.tiltResidualRadians[0]);
      hash = hashFloat(hash, decoration.tiltResidualRadians[1]);
      hash = hashFloat(hash, decoration.visibleHeightRatio ?? 0.35);
    } else if (decoration.category !== "mushroom") {
      hash = hashUint32(hash, decoration.ordinal);
    }
    hash = hashFloat(hash, decoration.normalizedPosition.x);
    hash = hashFloat(hash, decoration.normalizedPosition.y);
    hash = hashFloat(hash, decoration.yawRadians);
    for (const scale of decoration.scale) hash = hashFloat(hash, scale);
    if (decoration.category === "small-rock") {
      hash = hashText(hash, decoration.parentDecorationId);
      hash = hashText(hash, decoration.intent.profileKey);
      hash = hashText(hash, decoration.intent.role);
      hash = hashFloat(hash, decoration.intent.sizeRank);
      hash = hashFloat(hash, decoration.intent.sizeMultiplier ?? 1);
      hash = hashUint32(hash, decoration.intent.shapeVariationKey);
      hash = hashUint32(hash, decoration.profileVersion);
      hash = hashFloat(hash, decoration.footprintMetres[0]);
      hash = hashFloat(hash, decoration.footprintMetres[1]);
    }
    if (decoration.category === "stone") {
      hash = hashText(hash, decoration.parentDecorationId);
      hash = hashText(hash, decoration.intent.profileKey);
      hash = hashText(hash, decoration.intent.role);
      hash = hashFloat(hash, decoration.intent.sizeRank);
      hash = hashFloat(hash, decoration.intent.sizeMultiplier ?? 1);
      hash = hashUint32(hash, decoration.intent.shapeVariationKey);
      hash = hashUint32(hash, decoration.profileVersion);
      hash = hashFloat(hash, decoration.footprintMetres[0]);
      hash = hashFloat(hash, decoration.footprintMetres[1]);
      hash = hashFloat(hash, decoration.tiltResidualRadians[0]);
      hash = hashFloat(hash, decoration.tiltResidualRadians[1]);
    }
    if (decoration.category === "mushroom") {
      hash = hashText(hash, decoration.parentDecorationId);
      hash = hashUint32(hash, decoration.ordinal);
      hash = hashText(hash, decoration.intent.profileKey);
      hash = hashText(hash, decoration.intent.role);
      hash = hashFloat(hash, decoration.intent.sizeRank);
      hash = hashUint32(hash, decoration.intent.shapeVariationKey);
      hash = hashUint32(hash, decoration.profileVersion);
      hash = hashFloat(hash, decoration.footprintMetres[0]);
      hash = hashFloat(hash, decoration.footprintMetres[1]);
    }
    if (decoration.category === "lotus") {
      hash = hashText(hash, decoration.bodySourceHash);
      hash = hashUint32(hash, decoration.ordinal);
      hash = hashFloat(hash, decoration.waterLevelMetres);
      hash = hashFloat(hash, decoration.waterDepthMetres);
      hash = hashFloat(hash, decoration.shoreDistanceMetres);
      hash = hashFloat(hash, decoration.requestedPatchAreaSquareMetres);
      hash = hashFloat(hash, decoration.requestedPatchAreaRatio);
      hash = hashFloat(hash, decoration.achievedPatchAreaSquareMetres);
      hash = hashFloat(hash, decoration.achievedPatchAreaRatio);
      hash = hashFloat(hash, decoration.patchRadiusMetres);
      hash = hashFloat(hash, decoration.patchMaximumShoreDistanceMetres);
      hash = hashFloat(hash, decoration.patchMaximumWaterDepthMetres);
      hash = hashFloat(hash, decoration.surfaceOffsetMetres);
      hash = hashFloat(hash, decoration.footprintMetres[0]);
      hash = hashFloat(hash, decoration.footprintMetres[1]);
    }
  }
  return hash >>> 0;
}

/**
 * Returns the authored X-Z footprint used by the exact 2D rock marker.
 * @returns Width and depth in metres for the primary accepted large-rock LOD0.
 */
export function seedWorldRockFootprintMetres(): Readonly<{ width: number; depth: number }> {
  const footprint = getSeedWorldAssetPlacementProfile("cliff-rock").geometry.footprintMetres;
  return Object.freeze({ width: footprint[0], depth: footprint[1] });
}

/**
 * Returns the authored X-Z footprint used by exact small-stone markers.
 * @returns Width and depth in metres for the accepted four-pebble debris LOD0.
 */
export function seedWorldSmallRockFootprintMetres(): Readonly<{ width: number; depth: number }> {
  const footprint = getSeedWorldAssetPlacementProfile("small-stone").geometry.footprintMetres;
  return Object.freeze({ width: footprint[0], depth: footprint[1] });
}

function findRockRule(
  plan: SeedWorldPlan,
  sourceKind: SeedWorldRockSourceKind
): SeedWorldRockDecorationRule | undefined {
  return plan.featureDecorationRules.find(
    (rule): rule is SeedWorldRockDecorationRule => rule.category === "rock" && rule.sourceKind === sourceKind
  );
}

function compileMountainCandidates(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  brush: SeedWorldMountainBrush,
  featureId: string
): readonly DecorationCandidate[] {
  const candidates: DecorationCandidate[] = [];
  const band = rule.mountainProfileBand;
  if (!band) return candidates;
  const featureSeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, `rock:mountain:${featureId}`);
  for (let index = 0; index < ROCK_CANDIDATES_PER_MOUNTAIN_BRUSH; index++) {
    const candidateSeed = deriveSeedWorldNamedSeed(featureSeed, `candidate:${index}`);
    const angle = Math.PI * 2 * unitFloat(candidateSeed, "angle");
    const distance = mix(band[0], band[1], Math.pow(unitFloat(candidateSeed, "radius"), 1.8));
    const position = mountainPoint(brush, plan.sizeMetres, angle, distance);
    if (!mountainPositionIsValid(plan, fields, rule, brush, position)) continue;
    const noise = valueNoise(
      (position.x * plan.sizeMetres) / Math.max(rule.spacingMetres * 3, 1),
      (position.y * plan.sizeMetres) / Math.max(rule.spacingMetres * 3, 1),
      featureSeed
    );
    candidates.push({ position, score: noise * 0.72 + unitFloat(candidateSeed, "rank") * 0.28 });
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function compileWetlandCandidates(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  feature: WetlandFeature
): readonly DecorationCandidate[] {
  const candidates: DecorationCandidate[] = [];
  const distanceRange = rule.wetlandDistanceMetres;
  if (!distanceRange) return candidates;
  const featureSeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, `rock:${rule.sourceKind}:${feature.id}`);
  for (const cell of wetlandBoundaryCells(feature.cells, plan.resolution)) {
    const column = cell % plan.resolution;
    const row = Math.floor(cell / plan.resolution);
    for (let ordinal = 0; ordinal < 4; ordinal++) {
      const candidateSeed = deriveSeedWorldNamedSeed(featureSeed, `cell:${cell}:${ordinal}`);
      const angle = Math.PI * 2 * unitFloat(candidateSeed, "angle");
      const radialOffsetMetres = distanceRange.preferredMaximum * 1.5 * unitFloat(candidateSeed, "radius");
      const unprojectedPosition = Object.freeze({
        x:
          (column + 0.2 + unitFloat(candidateSeed, "x") * 0.6) / plan.resolution +
          (Math.cos(angle) * radialOffsetMetres) / plan.sizeMetres,
        y:
          (row + 0.2 + unitFloat(candidateSeed, "z") * 0.6) / plan.resolution +
          (Math.sin(angle) * radialOffsetMetres) / plan.sizeMetres
      });
      const position = projectToWetlandBoundary(fields, unprojectedPosition, distanceRange.maximum);
      if (!position) continue;
      if (!wetlandPositionIsValid(plan, fields, rule, position)) continue;
      const noise = valueNoise(
        (position.x * plan.sizeMetres) / Math.max(rule.spacingMetres * 3, 1),
        (position.y * plan.sizeMetres) / Math.max(rule.spacingMetres * 3, 1),
        featureSeed
      );
      candidates.push({
        position,
        score: noise * 0.72 + unitFloat(candidateSeed, "rank") * 0.28
      });
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function compileRiverbankCandidates(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  curveId: string
): readonly DecorationCandidate[] {
  const offsetRange = rule.riverBankOffsetMetres;
  const curve = fields.riverCurves.find((candidate) => candidate.id === curveId);
  if (!offsetRange || !curve) return [];
  const samples = sampleSeedWorldRiverCurve(curve, plan.sizeMetres, Math.max(12, rule.spacingMetres * 0.7));
  if (samples.length < 3) return [];
  const featureSeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, `rock:riverbank:${curveId}`);
  const candidates: DecorationCandidate[] = [];
  for (let index = 1; index < samples.length - 1; index++) {
    const previous = samples[index - 1];
    const sample = samples[index];
    const next = samples[index + 1];
    const tangentLength = Math.hypot(next.x - previous.x, next.z - previous.z);
    if (tangentLength <= Number.EPSILON) continue;
    const normalX = -(next.z - previous.z) / tangentLength;
    const normalZ = (next.x - previous.x) / tangentLength;
    for (const side of [-1, 1] as const) {
      const candidateSeed = deriveSeedWorldNamedSeed(featureSeed, `sample:${index}:side:${side}`);
      const bankOffset =
        seedWorldRiverBankRadius(sample.widthMetres, sample.bankFeatherMetres) +
        mix(offsetRange[0], offsetRange[1], unitFloat(candidateSeed, "bank-offset"));
      const alongJitter = (unitFloat(candidateSeed, "along") * 2 - 1) * rule.lateralJitterMetres;
      const tangentX = (next.x - previous.x) / tangentLength;
      const tangentZ = (next.z - previous.z) / tangentLength;
      const worldX = sample.x + normalX * bankOffset * side + tangentX * alongJitter;
      const worldZ = sample.z + normalZ * bankOffset * side + tangentZ * alongJitter;
      const position = Object.freeze({
        x: worldX / plan.sizeMetres + 0.5,
        y: worldZ / plan.sizeMetres + 0.5
      });
      if (!riverbankPositionIsValid(plan, fields, position)) continue;
      const cluster = valueNoise(
        worldX / Math.max(rule.spacingMetres * 2.5, 1),
        worldZ / Math.max(rule.spacingMetres * 2.5, 1),
        featureSeed
      );
      candidates.push({ position, score: cluster * 0.68 + unitFloat(candidateSeed, "rank") * 0.32 });
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function compileHydrologyShoreCandidates(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  body: SeedWorldHydrologyWaterBody
): readonly DecorationCandidate[] {
  const offsetRange = rule.riverBankOffsetMetres;
  if (!offsetRange) return [];
  if (
    !Number.isInteger(body.resolution) ||
    body.resolution < 2 ||
    body.wetMask.length !== body.resolution ** 2 ||
    body.signedDistanceMetres.length !== body.resolution ** 2
  ) {
    throw new RangeError(`Hydrology body '${body.id}' has invalid shoreline fields`);
  }
  const featureSeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, `rock:riverbank:${body.id}`);
  const cellMetres = plan.sizeMetres / body.resolution;
  const candidates: DecorationCandidate[] = [];
  for (let row = 1; row < body.resolution - 1; row++) {
    for (let column = 1; column < body.resolution - 1; column++) {
      const index = row * body.resolution + column;
      if (body.wetMask[index] !== 0 || !dryCellTouchesWater(body.wetMask, body.resolution, column, row)) continue;
      const candidateSeed = deriveSeedWorldNamedSeed(featureSeed, `shore-cell:${column}:${row}`);
      const centerX = -plan.sizeMetres * 0.5 + (column + 0.5) * cellMetres;
      const centerZ = -plan.sizeMetres * 0.5 + (row + 0.5) * cellMetres;
      const bankOffset = mix(offsetRange[0], offsetRange[1], unitFloat(candidateSeed, "bank-offset"));
      const alongJitter = (unitFloat(candidateSeed, "along") * 2 - 1) * rule.lateralJitterMetres;
      const projected = projectHydrologyShorePosition(
        body,
        plan.sizeMetres,
        centerX,
        centerZ,
        bankOffset,
        cellMetres,
        dryCellOutwardNormal(body.wetMask, body.resolution, column, row)
      );
      const tangentX = -projected.normalZ;
      const tangentZ = projected.normalX;
      const jittered = projectHydrologyShorePosition(
        body,
        plan.sizeMetres,
        projected.worldX + tangentX * alongJitter,
        projected.worldZ + tangentZ * alongJitter,
        bankOffset,
        cellMetres,
        projected
      );
      const position = Object.freeze({
        x: jittered.worldX / plan.sizeMetres + 0.5,
        y: jittered.worldZ / plan.sizeMetres + 0.5
      });
      if (!hydrologyShorePositionIsValid(plan, fields, rule, body, position)) continue;
      const cluster = valueNoise(
        jittered.worldX / Math.max(rule.spacingMetres * 2.5, 1),
        jittered.worldZ / Math.max(rule.spacingMetres * 2.5, 1),
        featureSeed
      );
      candidates.push({ position, score: cluster * 0.68 + unitFloat(candidateSeed, "rank") * 0.32 });
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function projectHydrologyShorePosition(
  body: SeedWorldHydrologyWaterBody,
  worldSizeMetres: number,
  initialWorldX: number,
  initialWorldZ: number,
  targetDistanceMetres: number,
  cellMetres: number,
  fallbackNormal: Readonly<{ x: number; z: number }> | Readonly<{ normalX: number; normalZ: number }>
): Readonly<{ worldX: number; worldZ: number; normalX: number; normalZ: number }> {
  let worldX = initialWorldX;
  let worldZ = initialWorldZ;
  let normalX = "normalX" in fallbackNormal ? fallbackNormal.normalX : fallbackNormal.x;
  let normalZ = "normalZ" in fallbackNormal ? fallbackNormal.normalZ : fallbackNormal.z;
  const derivativeStepMetres = Math.max(0.5, cellMetres * 0.25);
  for (let iteration = 0; iteration < 6; iteration++) {
    const position = Object.freeze({ x: worldX / worldSizeMetres + 0.5, y: worldZ / worldSizeMetres + 0.5 });
    const distance = sampleHydrologyBodySignedDistance(body, position);
    const gradientX =
      (sampleHydrologyBodySignedDistance(
        body,
        Object.freeze({ x: (worldX + derivativeStepMetres) / worldSizeMetres + 0.5, y: position.y })
      ) -
        sampleHydrologyBodySignedDistance(
          body,
          Object.freeze({ x: (worldX - derivativeStepMetres) / worldSizeMetres + 0.5, y: position.y })
        )) /
      (derivativeStepMetres * 2);
    const gradientZ =
      (sampleHydrologyBodySignedDistance(
        body,
        Object.freeze({ x: position.x, y: (worldZ + derivativeStepMetres) / worldSizeMetres + 0.5 })
      ) -
        sampleHydrologyBodySignedDistance(
          body,
          Object.freeze({ x: position.x, y: (worldZ - derivativeStepMetres) / worldSizeMetres + 0.5 })
        )) /
      (derivativeStepMetres * 2);
    const gradientSquared = gradientX * gradientX + gradientZ * gradientZ;
    if (gradientSquared <= 1e-8) break;
    const gradientLength = Math.sqrt(gradientSquared);
    normalX = gradientX / gradientLength;
    normalZ = gradientZ / gradientLength;
    const correction = clamp((distance - targetDistanceMetres) / gradientSquared, -cellMetres, cellMetres);
    worldX -= gradientX * correction;
    worldZ -= gradientZ * correction;
    if (Math.abs(distance - targetDistanceMetres) <= 0.1) break;
  }
  return Object.freeze({ worldX, worldZ, normalX, normalZ });
}

function dryCellTouchesWater(mask: Uint8Array, resolution: number, column: number, row: number): boolean {
  const index = row * resolution + column;
  return (
    mask[index - 1] !== 0 || mask[index + 1] !== 0 || mask[index - resolution] !== 0 || mask[index + resolution] !== 0
  );
}

function dryCellOutwardNormal(
  mask: Uint8Array,
  resolution: number,
  column: number,
  row: number
): Readonly<{ x: number; z: number }> {
  const index = row * resolution + column;
  const x = Number(mask[index - 1] !== 0) - Number(mask[index + 1] !== 0);
  const z = Number(mask[index - resolution] !== 0) - Number(mask[index + resolution] !== 0);
  const length = Math.hypot(x, z);
  return length > Number.EPSILON ? Object.freeze({ x: x / length, z: z / length }) : Object.freeze({ x: 1, z: 0 });
}

function compileLakeOutcropCandidates(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  body: SeedWorldHydrologyWaterBody
): readonly DecorationCandidate[] {
  const interiorDistance = rule.lakeInteriorDistanceMetres;
  if (!interiorDistance) return [];
  const featureSeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, `rock:lake-outcrop:${body.id}`);
  const cellMetres = plan.sizeMetres / body.resolution;
  const candidates: DecorationCandidate[] = [];
  for (let row = 1; row < body.resolution - 1; row++) {
    for (let column = 1; column < body.resolution - 1; column++) {
      const index = row * body.resolution + column;
      const shoreDistanceMetres = -body.signedDistanceMetres[index]!;
      if (body.wetMask[index] === 0 || shoreDistanceMetres < interiorDistance[0]) continue;
      const candidateSeed = deriveSeedWorldNamedSeed(featureSeed, `water-cell:${column}:${row}`);
      const position = Object.freeze({ x: (column + 0.5) / body.resolution, y: (row + 0.5) / body.resolution });
      if (!lakeOutcropPositionIsValid(plan, fields, rule, body, position)) continue;
      const interiorWeight = clamp(
        (shoreDistanceMetres - interiorDistance[0]) / Math.max(1, interiorDistance[1] - interiorDistance[0]),
        0,
        1
      );
      const worldX = (position.x - 0.5) * plan.sizeMetres;
      const worldZ = (position.y - 0.5) * plan.sizeMetres;
      const cluster = valueNoise(
        worldX / Math.max(interiorDistance[1] * 1.5, cellMetres),
        worldZ / Math.max(interiorDistance[1] * 1.5, cellMetres),
        featureSeed
      );
      candidates.push({
        position,
        score: interiorWeight * 0.5 + cluster * 0.3 + unitFloat(candidateSeed, "rank") * 0.2
      });
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function lakeOutcropClusterCount(rule: SeedWorldRockDecorationRule, areaSquareMetres: number): number {
  return clamp(
    Math.round(areaSquareMetres / rule.lakeOutcropAreaPerClusterSquareMetres!),
    rule.clustersPerFeature.minimum,
    rule.clustersPerFeature.maximum
  );
}

function compileRiverCandidates(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  curveId: string
): readonly DecorationCandidate[] {
  const offsetRatio = rule.riverChannelOffsetRatio;
  const curve = fields.riverCurves.find((candidate) => candidate.id === curveId);
  if (!offsetRatio || !curve) return [];
  const samples = sampleSeedWorldRiverCurve(curve, plan.sizeMetres, Math.max(8, rule.spacingMetres * 0.55));
  if (samples.length < 3) return [];
  const featureSeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, `rock:river:${curveId}`);
  const candidates: DecorationCandidate[] = [];
  for (let index = 1; index < samples.length - 1; index++) {
    const previous = samples[index - 1];
    const sample = samples[index];
    const next = samples[index + 1];
    const tangentLength = Math.hypot(next.x - previous.x, next.z - previous.z);
    if (tangentLength <= Number.EPSILON) continue;
    const normalX = -(next.z - previous.z) / tangentLength;
    const normalZ = (next.x - previous.x) / tangentLength;
    const tangentX = (next.x - previous.x) / tangentLength;
    const tangentZ = (next.z - previous.z) / tangentLength;
    for (const side of [-1, 1] as const) {
      const candidateSeed = deriveSeedWorldNamedSeed(featureSeed, `sample:${index}:side:${side}`);
      const offset =
        sample.widthMetres * 0.5 * mix(offsetRatio[0], offsetRatio[1], unitFloat(candidateSeed, "channel-offset"));
      const along = (unitFloat(candidateSeed, "along") * 2 - 1) * rule.lateralJitterMetres;
      const worldX = sample.x + normalX * offset * side + tangentX * along;
      const worldZ = sample.z + normalZ * offset * side + tangentZ * along;
      const position = Object.freeze({
        x: worldX / plan.sizeMetres + 0.5,
        y: worldZ / plan.sizeMetres + 0.5
      });
      if (!riverPositionIsValid(plan, fields, position)) continue;
      candidates.push({
        position,
        score:
          valueNoise(
            worldX / Math.max(rule.spacingMetres * 2, 1),
            worldZ / Math.max(rule.spacingMetres * 2, 1),
            featureSeed
          ) *
            0.7 +
          unitFloat(candidateSeed, "rank") * 0.3
      });
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function compileRoadsideCandidates(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  roadId: string
): readonly DecorationCandidate[] {
  const offsetRange = rule.roadsideOffsetMetres;
  const road = plan.roads.find((candidate) => candidate.id === roadId);
  if (!offsetRange || !road || road.points.length < 2) return [];
  const featureSeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, `rock:roadside:${roadId}`);
  const candidates: DecorationCandidate[] = [];
  const sampleSpacingMetres = Math.max(8, rule.spacingMetres * 0.55);
  for (let segmentIndex = 0; segmentIndex < road.points.length - 1; segmentIndex++) {
    const start = road.points[segmentIndex];
    const end = road.points[segmentIndex + 1];
    if (start.bridge || end.bridge) continue;
    const tangentX = (end.x - start.x) * plan.sizeMetres;
    const tangentZ = (end.y - start.y) * plan.sizeMetres;
    const segmentLength = Math.hypot(tangentX, tangentZ);
    if (segmentLength <= Number.EPSILON) continue;
    const unitTangentX = tangentX / segmentLength;
    const unitTangentZ = tangentZ / segmentLength;
    const normalX = -unitTangentZ;
    const normalZ = unitTangentX;
    const sampleCount = Math.max(1, Math.ceil(segmentLength / sampleSpacingMetres));
    for (let sampleOrdinal = 0; sampleOrdinal < sampleCount; sampleOrdinal++) {
      const alongSegment = (sampleOrdinal + 0.5) / sampleCount;
      const centerX = mix(start.x, end.x, alongSegment);
      const centerZ = mix(start.y, end.y, alongSegment);
      const roadSupport =
        mix(start.coreHalfWidthMetres, end.coreHalfWidthMetres, alongSegment) +
        mix(start.shoulderWidthMetres, end.shoulderWidthMetres, alongSegment);
      for (const side of [-1, 1] as const) {
        const candidateSeed = deriveSeedWorldNamedSeed(
          featureSeed,
          `segment:${segmentIndex}:sample:${sampleOrdinal}:side:${side}`
        );
        const lateralOffset = roadSupport + mix(offsetRange[0], offsetRange[1], unitFloat(candidateSeed, "offset"));
        const alongOffset = (unitFloat(candidateSeed, "along") * 2 - 1) * rule.lateralJitterMetres;
        const worldX = (centerX - 0.5) * plan.sizeMetres + normalX * lateralOffset * side + unitTangentX * alongOffset;
        const worldZ = (centerZ - 0.5) * plan.sizeMetres + normalZ * lateralOffset * side + unitTangentZ * alongOffset;
        const position = Object.freeze({ x: worldX / plan.sizeMetres + 0.5, y: worldZ / plan.sizeMetres + 0.5 });
        if (!roadsidePositionIsValid(plan, fields, position)) continue;
        if (
          plan.pois.some(
            (poi) => distanceMetres(poi.position, position, plan.sizeMetres) < Math.max(28, lateralOffset * 1.25)
          )
        ) {
          continue;
        }
        const cluster = valueNoise(
          worldX / Math.max(rule.spacingMetres * 1.8, 1),
          worldZ / Math.max(rule.spacingMetres * 1.8, 1),
          featureSeed
        );
        candidates.push({ position, score: cluster * 0.72 + unitFloat(candidateSeed, "rank") * 0.28 });
      }
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function appendFeatureClusters(
  target: SeedWorldDecorationInstance[],
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  featureId: string,
  candidates: readonly DecorationCandidate[],
  positionIsValid: (position: SeedWorldPoint) => boolean,
  projectPosition: (position: SeedWorldPoint) => SeedWorldPoint | undefined = (position) => position,
  instanceIsValid: (instance: SeedWorldDecorationInstance) => boolean = () => true,
  clusterCountOverride?: number,
  minimumClusterSpacingMetresOverride?: number
): void {
  if (candidates.length === 0) return;
  const featureSeed = deriveSeedWorldNamedSeed(
    plan.generationStreams.decor,
    `rock:${rule.sourceKind}:${featureId}:clusters`
  );
  const clusterCount = clusterCountOverride ?? integerInRange(rule.clustersPerFeature, featureSeed, "count");
  if (clusterCount === 0) return;
  const minimumSpacing =
    minimumClusterSpacingMetresOverride ?? rule.spacingMetres * ROCK_MINIMUM_CLUSTER_SPACING_FACTOR;
  const anchors: SeedWorldPoint[] = [];
  for (const candidate of candidates) {
    if (anchors.some((anchor) => distanceMetres(anchor, candidate.position, plan.sizeMetres) < minimumSpacing))
      continue;
    const clusterOrdinal = anchors.length;
    const anchorRequiresInstanceValidation =
      rule.sourceKind === "lake-outcrop" ||
      (rule.sourceKind === "mountain" && clusterOrdinal === 0 && profileSupportsRole(rule.profileKey, "hero"));
    if (anchorRequiresInstanceValidation) {
      const clusterSeed = deriveSeedWorldNamedSeed(featureSeed, `cluster:${clusterOrdinal}`);
      const visualClusterId = `rock:${rule.sourceKind}:${featureId}:cluster-${clusterOrdinal}`;
      if (rule.sourceKind === "lake-outcrop") {
        const acceptedPieces: SeedWorldPoint[] = [];
        const pieceCount = integerInRange(rule.piecesPerCluster, clusterSeed, "pieces");
        for (let pieceOrdinal = 0; pieceOrdinal < pieceCount; pieceOrdinal++) {
          const position = findClusterPiecePosition(
            plan,
            rule,
            candidate.position,
            clusterSeed,
            clusterOrdinal,
            pieceOrdinal,
            acceptedPieces,
            positionIsValid,
            projectPosition,
            (candidatePosition) =>
              instanceIsValid(
                createRockInstance(
                  fields,
                  rule,
                  featureId,
                  visualClusterId,
                  candidatePosition,
                  clusterSeed,
                  clusterOrdinal,
                  pieceOrdinal
                )
              )
          );
          if (!position) break;
          acceptedPieces.push(position);
        }
        if (acceptedPieces.length !== pieceCount) continue;
      } else {
        const instance = createRockInstance(
          fields,
          rule,
          featureId,
          visualClusterId,
          candidate.position,
          clusterSeed,
          clusterOrdinal,
          0
        );
        if (!instanceIsValid(instance)) continue;
      }
    }
    anchors.push(candidate.position);
    if (anchors.length >= clusterCount) break;
  }

  for (let clusterOrdinal = 0; clusterOrdinal < anchors.length; clusterOrdinal++) {
    const visualClusterId = `rock:${rule.sourceKind}:${featureId}:cluster-${clusterOrdinal}`;
    const clusterSeed = deriveSeedWorldNamedSeed(featureSeed, `cluster:${clusterOrdinal}`);
    const pieceCount = integerInRange(rule.piecesPerCluster, clusterSeed, "pieces");
    const acceptedPieces: SeedWorldPoint[] = [];
    for (let pieceOrdinal = 0; pieceOrdinal < pieceCount; pieceOrdinal++) {
      const position = findClusterPiecePosition(
        plan,
        rule,
        anchors[clusterOrdinal],
        clusterSeed,
        clusterOrdinal,
        pieceOrdinal,
        acceptedPieces,
        positionIsValid,
        projectPosition,
        (candidatePosition) =>
          instanceIsValid(
            createRockInstance(
              fields,
              rule,
              featureId,
              visualClusterId,
              candidatePosition,
              clusterSeed,
              clusterOrdinal,
              pieceOrdinal
            )
          )
      );
      if (!position) continue;
      acceptedPieces.push(position);
      const instance = createRockInstance(
        fields,
        rule,
        featureId,
        visualClusterId,
        position,
        clusterSeed,
        clusterOrdinal,
        pieceOrdinal
      );
      target.push(instance);
    }
  }
}

function roadsideClusterCount(
  points: SeedWorldPlan["roads"][number]["points"],
  worldSizeMetres: number,
  spacingMetres: number
): number {
  let lengthMetres = 0;
  for (let index = 1; index < points.length; index++) {
    lengthMetres += distanceMetres(points[index - 1], points[index], worldSizeMetres);
  }
  return Math.ceil(lengthMetres / Math.max(480, spacingMetres * 6));
}

type ResolvedRockAppearance = Readonly<{
  intent: SeedWorldTransformIntent<"cliff-rock">;
  placement: SeedWorldResolvedAssetPlacement<"cliff-rock">;
  yawRadians: number;
  tiltResidualRadians: readonly [number, number];
  visibleHeightRatio: number | undefined;
}>;

function findClusterPiecePosition(
  plan: SeedWorldPlan,
  rule: SeedWorldRockDecorationRule,
  anchor: SeedWorldPoint,
  clusterSeed: number,
  clusterOrdinal: number,
  pieceOrdinal: number,
  acceptedPieces: readonly SeedWorldPoint[],
  positionIsValid: (position: SeedWorldPoint) => boolean,
  projectPosition: (position: SeedWorldPoint) => SeedWorldPoint | undefined,
  instancePositionIsValid: (position: SeedWorldPoint) => boolean
): SeedWorldPoint | undefined {
  if (rockPlacementRole(rule, clusterOrdinal, pieceOrdinal) === "hero") {
    return positionIsValid(anchor) && instancePositionIsValid(anchor) ? anchor : undefined;
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const seed = deriveSeedWorldNamedSeed(clusterSeed, `piece:${pieceOrdinal}:attempt:${attempt}`);
    const stackedRoadsidePiece =
      rule.sourceKind === "roadside" && pieceOrdinal === 1 && unitFloat(seed, "stacked-pair") < 0.42;
    const angle = Math.PI * 2 * unitFloat(seed, "angle") + pieceOrdinal * 2.399963;
    const nominalRadius =
      pieceOrdinal === 0
        ? 0
        : stackedRoadsidePiece
          ? mix(0.35, 1.4, unitFloat(seed, "stacked-radius"))
          : rule.spacingMetres * (0.2 + 0.12 * Math.sqrt(pieceOrdinal));
    const radialJitter =
      rule.sourceKind === "lake-outcrop" && pieceOrdinal === 0
        ? 0
        : stackedRoadsidePiece
          ? 0.35
          : rule.lateralJitterMetres;
    const radius = Math.max(0, nominalRadius + (unitFloat(seed, "radius") * 2 - 1) * radialJitter);
    const offsetX = Math.cos(angle) * radius;
    const offsetZ = Math.sin(angle) * radius;
    const unprojectedPosition = Object.freeze({
      x: anchor.x + offsetX / plan.sizeMetres,
      y: anchor.y + offsetZ / plan.sizeMetres
    });
    const position = projectPosition(unprojectedPosition);
    if (!position) continue;
    if (!positionIsValid(position)) continue;
    if (!instancePositionIsValid(position)) continue;
    if (
      !stackedRoadsidePiece &&
      acceptedPieces.some((piece) => distanceMetres(piece, position, plan.sizeMetres) < rule.spacingMetres * 0.18)
    ) {
      continue;
    }
    return position;
  }
  return undefined;
}

function createRockInstance(
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  featureId: string,
  visualClusterId: string,
  position: SeedWorldPoint,
  clusterSeed: number,
  clusterOrdinal: number,
  pieceOrdinal: number
): SeedWorldDecorationInstance {
  const appearance = resolveRockAppearance(rule, clusterSeed, clusterOrdinal, pieceOrdinal);
  const footprintMetres =
    rule.sourceKind === "lake-outcrop"
      ? resolveLakeOutcropProjectedFootprintMetres(appearance)
      : appearance.placement.footprintMetres;
  return Object.freeze({
    id: `${visualClusterId}:piece-${pieceOrdinal}`,
    category: "rock",
    sourceKind: rule.sourceKind,
    surfaceKind: sampleSeedWorldRockSurfaceKind(fields, position),
    sourceFeatureId: featureId,
    visualClusterId,
    intent: appearance.intent,
    profileVersion: appearance.placement.profileVersion,
    normalizedPosition: position,
    prototypeFamily: appearance.placement.prototypeFamily as SeedWorldDecorationInstance["prototypeFamily"],
    scale: appearance.placement.scale,
    footprintMetres,
    yawRadians: appearance.yawRadians,
    tiltResidualRadians: appearance.tiltResidualRadians,
    ...(appearance.visibleHeightRatio !== undefined ? { visibleHeightRatio: appearance.visibleHeightRatio } : {})
  });
}

function resolveRockAppearance(
  rule: SeedWorldRockDecorationRule,
  clusterSeed: number,
  clusterOrdinal: number,
  pieceOrdinal: number
): ResolvedRockAppearance {
  const appearanceSeed = deriveSeedWorldNamedSeed(clusterSeed, `appearance:${pieceOrdinal}`);
  const authoredSizeRank = unitFloat(appearanceSeed, "size-rank");
  const sizeRank = rule.sourceKind === "lake-outcrop" ? mix(0.72, 1, authoredSizeRank) : authoredSizeRank;
  const sizeMultiplier = rule.sizeMultiplierRange
    ? mix(rule.sizeMultiplierRange[0], rule.sizeMultiplierRange[1], unitFloat(appearanceSeed, "size-multiplier"))
    : undefined;
  const intent = Object.freeze({
    profileKey: rule.profileKey,
    role: rockPlacementRole(rule, clusterOrdinal, pieceOrdinal),
    sizeRank,
    ...(sizeMultiplier !== undefined ? { sizeMultiplier } : {}),
    shapeVariationKey: deriveSeedWorldNamedSeed(appearanceSeed, "shape-variation")
  } as const);
  const placement: SeedWorldResolvedAssetPlacement<"cliff-rock"> = resolveSeedWorldAssetPlacement(intent);
  const tiltResidualRadians =
    rule.sourceKind === "lake-outcrop"
      ? Object.freeze([
          unitFloat(appearanceSeed, "tip-pitch") * SEED_WORLD_LAKE_OUTCROP_MAXIMUM_TIP_PITCH_RADIANS,
          0
        ] as const)
      : Object.freeze([
          mix(-0.14, 0.14, unitFloat(appearanceSeed, "tilt-x")),
          mix(-0.14, 0.14, unitFloat(appearanceSeed, "tilt-z"))
        ] as const);
  return Object.freeze({
    intent,
    placement,
    yawRadians: unitFloat(appearanceSeed, "yaw") * Math.PI * 2,
    tiltResidualRadians,
    visibleHeightRatio: rule.visibleHeightRatio
  });
}

function resolveLakeOutcropProjectedFootprintMetres(
  appearance: ResolvedRockAppearance
): readonly [widthMetres: number, depthMetres: number] {
  const { minimum, maximum } = SEED_WORLD_ROCK_CLIF_1_LOCAL_BOUNDS;
  const authoredWidth = maximum[0] - minimum[0];
  const authoredHeight = maximum[1] - minimum[1];
  const authoredDepth = maximum[2] - minimum[2];
  const [scaleX, scaleY, scaleZ] = appearance.placement.scale;
  const pitchRadians = appearance.tiltResidualRadians[0];
  return Object.freeze([
    authoredWidth * scaleX,
    authoredDepth * scaleZ * Math.cos(pitchRadians) + authoredHeight * scaleY * Math.sin(pitchRadians)
  ] as const);
}

/**
 * Resolves the visible rock-top material from the same Terrain Layer weights used by 3D.
 * @param fields Canonical surface fields owning grass, river-soil, rocky-slope, and road coverage.
 * @param position Exact normalized rock marker shared by 2D and 3D.
 * @returns Authored rock material family matching the dominant substrate at the marker.
 */
export function sampleSeedWorldRockSurfaceKind(
  fields: SeedWorldFields,
  position: SeedWorldPoint
): SeedWorldRockSurfaceKind {
  const grassBase = sampleSurfaceField(fields, position, fields.materialWeights, 4, 0);
  const soil = sampleSurfaceField(fields, position, fields.materialWeights, 4, 1);
  const road = sampleSurfaceField(fields, position, fields.materialWeights, 4, 3);
  const rockySlope = sampleSurfaceField(fields, position, fields.rockySlopeWeight, 1, 0) / 255;
  const rock = grassBase * rockySlope;
  const grass = grassBase - rock;
  if (rock >= grass && rock >= soil && rock >= road) return "rock";
  if (soil >= grass && soil >= rock) return "soil";
  return "grass";
}

function rockPlacementRole(
  rule: SeedWorldRockDecorationRule,
  clusterOrdinal: number,
  pieceOrdinal: number
): "field" | "cluster" | "accent" | "outcrop" | "hero" {
  if (
    rule.sourceKind === "mountain" &&
    clusterOrdinal === 0 &&
    pieceOrdinal === 0 &&
    profileSupportsRole(rule.profileKey, "hero")
  ) {
    return "hero";
  }
  if (rule.sourceKind === "mountain") return "outcrop";
  if (rule.sourceKind === "lake-outcrop" && pieceOrdinal > 0) return "accent";
  if (rule.sourceKind === "lake-outcrop") return "cluster";
  if (rule.sourceKind === "riverbank") return "field";
  const clusteredRoadsideLandmark = rule.sourceKind === "roadside" && clusterOrdinal % 5 === 0;
  if (
    pieceOrdinal === 0 &&
    (rule.sourceKind !== "roadside" || clusteredRoadsideLandmark) &&
    profileSupportsRole(rule.profileKey, "cluster")
  ) {
    return "cluster";
  }
  return "field";
}

function profileSupportsRole(
  profileKey: "cliff-rock" | "feature-stone" | "small-stone",
  role: "field" | "cluster" | "outcrop" | "hero"
): boolean {
  return getSeedWorldAssetPlacementProfile(profileKey).roleScale[role] !== undefined;
}

function mountainPositionIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  brush: SeedWorldMountainBrush,
  position: SeedWorldPoint
): boolean {
  const band = rule.mountainProfileBand;
  if (!band || !normalizedPointIsInside(position)) return false;
  const distance = mountainDistance(brush, plan.sizeMetres, position);
  if (distance < band[0] || distance > band[1]) return false;
  if (
    distanceMetres(position, plan.spawnReserve.center, plan.sizeMetres) <
    plan.spawnReserve.protectedRadiusMetres + 22
  ) {
    return false;
  }
  const sample = populationSampleAt(plan, fields, position);
  return (
    sample !== undefined &&
    !sample.water &&
    (rule.maximumSlopeDegrees === undefined || sample.slope * 90 <= rule.maximumSlopeDegrees) &&
    sample.landCover !== SeedWorldLandCover.Wetland &&
    sample.roadDistanceMetres >= ROCK_ROAD_CENTERLINE_CLEARANCE_METRES &&
    sample.riverDistanceMetres >= ROCK_RIVER_CLEARANCE_METRES
  );
}

function wetlandPositionIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  position: SeedWorldPoint
): boolean {
  const range = rule.wetlandDistanceMetres;
  if (!range || !normalizedPointIsInside(position)) return false;
  const sample = populationSampleAt(plan, fields, position);
  if (
    !sample ||
    sample.water ||
    sample.roadDistanceMetres < ROCK_ROAD_CENTERLINE_CLEARANCE_METRES ||
    sampleSeedWorldMountainUpliftMetres(plan, position) > SEED_WORLD_WETLAND_MAXIMUM_MOUNTAIN_UPLIFT_METRES
  ) {
    return false;
  }
  return (
    Math.abs(sampleWetlandWeight(fields, position) - ROCK_WETLAND_BOUNDARY_WEIGHT) <=
    ROCK_WETLAND_BOUNDARY_WEIGHT_TOLERANCE
  );
}

function riverbankPositionIsValid(plan: SeedWorldPlan, fields: SeedWorldFields, position: SeedWorldPoint): boolean {
  if (!normalizedPointIsInside(position)) return false;
  if (distanceMetres(position, plan.spawnReserve.center, plan.sizeMetres) < plan.spawnReserve.protectedRadiusMetres) {
    return false;
  }
  const sample = populationSampleAt(plan, fields, position);
  return (
    sample !== undefined &&
    !sample.water &&
    sample.roadDistanceMetres >= ROCK_ROAD_CENTERLINE_CLEARANCE_METRES &&
    sampleSeedWorldRiverBankSignedDistanceMetres(
      fields,
      (position.x - 0.5) * fields.sizeMetres,
      (position.y - 0.5) * fields.sizeMetres
    ) >= 0.5
  );
}

function hydrologyShorePositionIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  body: SeedWorldHydrologyWaterBody,
  position: SeedWorldPoint
): boolean {
  const offsetRange = rule.riverBankOffsetMetres;
  if (!offsetRange || !normalizedPointIsInside(position)) return false;
  if (distanceMetres(position, plan.spawnReserve.center, plan.sizeMetres) < plan.spawnReserve.protectedRadiusMetres) {
    return false;
  }
  const sample = populationSampleAt(plan, fields, position);
  if (!sample || sample.water || sample.roadDistanceMetres < ROCK_ROAD_CENTERLINE_CLEARANCE_METRES) return false;
  const shorelineDistance = sampleHydrologyBodySignedDistance(body, position);
  const maximumDistance = Math.max(24, offsetRange[1] + rule.lateralJitterMetres + rule.spacingMetres * 0.5);
  return shorelineDistance >= 0.5 && shorelineDistance <= maximumDistance;
}

function lakeOutcropPositionIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  body: SeedWorldHydrologyWaterBody,
  position: SeedWorldPoint
): boolean {
  const interiorDistance = rule.lakeInteriorDistanceMetres;
  if (!interiorDistance || !normalizedPointIsInside(position)) return false;
  if (distanceMetres(position, plan.spawnReserve.center, plan.sizeMetres) < plan.spawnReserve.protectedRadiusMetres) {
    return false;
  }
  const sample = populationSampleAt(plan, fields, position);
  if (!sample?.water || sample.roadDistanceMetres < ROCK_ROAD_CENTERLINE_CLEARANCE_METRES) return false;
  const worldX = (position.x - 0.5) * plan.sizeMetres;
  const worldZ = (position.y - 0.5) * plan.sizeMetres;
  const terrainHeight = sampleSeedWorldHeight(fields, worldX, worldZ);
  if (terrainHeight === undefined) return false;
  const depthMetres = body.waterLevelMetres - terrainHeight;
  return (
    sampleHydrologyBodySignedDistance(body, position) <= -interiorDistance[0] &&
    depthMetres > 0.25 &&
    depthMetres <= (rule.maximumWaterDepthMetres ?? Number.POSITIVE_INFINITY)
  );
}

function riverPositionIsValid(plan: SeedWorldPlan, fields: SeedWorldFields, position: SeedWorldPoint): boolean {
  if (!normalizedPointIsInside(position)) return false;
  if (distanceMetres(position, plan.spawnReserve.center, plan.sizeMetres) < plan.spawnReserve.protectedRadiusMetres) {
    return false;
  }
  const sample = populationSampleAt(plan, fields, position);
  return sample !== undefined && sample.water && sample.roadDistanceMetres >= ROCK_ROAD_CENTERLINE_CLEARANCE_METRES;
}

function roadsidePositionIsValid(plan: SeedWorldPlan, fields: SeedWorldFields, position: SeedWorldPoint): boolean {
  if (!normalizedPointIsInside(position)) return false;
  if (distanceMetres(position, plan.spawnReserve.center, plan.sizeMetres) < plan.spawnReserve.protectedRadiusMetres) {
    return false;
  }
  const worldX = (position.x - 0.5) * plan.sizeMetres;
  const worldZ = (position.y - 0.5) * plan.sizeMetres;
  const sample = populationSampleAt(plan, fields, position);
  return (
    sample !== undefined &&
    !sample.water &&
    sample.slope * 90 <= ROADSIDE_ROCK_MAXIMUM_SLOPE_DEGREES &&
    sampleSeedWorldRoadSignedDistanceMetres(plan, worldX, worldZ) >= 0 &&
    sampleSeedWorldRiverBankSignedDistanceMetres(fields, worldX, worldZ) >= ROCK_RIVER_CLEARANCE_METRES
  );
}

function roadsideRockFootprintIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldDecorationInstance
): boolean {
  const box = decorationOrientedBox(plan, instance, instance.footprintMetres[0], instance.footprintMetres[1]);
  const maximumRoadOverlapMetres =
    Math.min(instance.footprintMetres[0], instance.footprintMetres[1]) * ROADSIDE_ROCK_MAXIMUM_FOOTPRINT_OVERLAP_RATIO;
  if (
    pointToOrientedBoxDistance(plan.spawnReserve.center, plan.sizeMetres, box) < plan.spawnReserve.protectedRadiusMetres
  ) {
    return false;
  }
  if (seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) < -maximumRoadOverlapMetres) return false;
  if (seedWorldRiverToOrientedBoxSignedDistanceMetres(fields, box) < ROCK_RIVER_CLEARANCE_METRES) return false;
  if (!orientedBoxIsOnLand(plan, box) || orientedBoxOverlapsWater(fields, box)) return false;
  return roadsidePositionIsValid(plan, fields, instance.normalizedPosition);
}

function rockFootprintIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldDecorationInstance
): boolean {
  return seedWorldDecorationFootprintIsClear(plan, fields, instance);
}

function riverbankRockFootprintIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldDecorationInstance,
  positionIsValid: (position: SeedWorldPoint) => boolean = (position) =>
    riverbankPositionIsValid(plan, fields, position)
): boolean {
  const box = decorationOrientedBox(plan, instance, instance.footprintMetres[0], instance.footprintMetres[1]);
  if (
    pointToOrientedBoxDistance(plan.spawnReserve.center, plan.sizeMetres, box) < plan.spawnReserve.protectedRadiusMetres
  ) {
    return false;
  }
  if (seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) < ROCK_ROAD_BOUNDARY_CLEARANCE_METRES) return false;
  if (!orientedBoxIsOnLand(plan, box)) return false;
  return positionIsValid(instance.normalizedPosition);
}

function lakeOutcropRockFootprintIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  rule: SeedWorldRockDecorationRule,
  body: SeedWorldHydrologyWaterBody,
  instance: SeedWorldDecorationInstance
): boolean {
  const box = decorationOrientedBox(plan, instance, instance.footprintMetres[0], instance.footprintMetres[1]);
  if (
    pointToOrientedBoxDistance(plan.spawnReserve.center, plan.sizeMetres, box) < plan.spawnReserve.protectedRadiusMetres
  ) {
    return false;
  }
  if (seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) < ROCK_ROAD_BOUNDARY_CLEARANCE_METRES) return false;
  if (!orientedBoxIsOnLand(plan, box) || !orientedBoxIsWithinHydrologyBody(plan, body, box, 0.5)) return false;
  const terrainHeight = sampleSeedWorldHeight(fields, box.centerX, box.centerZ);
  if (terrainHeight === undefined) return false;
  const authoredHeightMetres =
    SEED_WORLD_ROCK_CLIF_1_LOCAL_BOUNDS.maximum[1] - SEED_WORLD_ROCK_CLIF_1_LOCAL_BOUNDS.minimum[1];
  const authoredDepthMetres =
    SEED_WORLD_ROCK_CLIF_1_LOCAL_BOUNDS.maximum[2] - SEED_WORLD_ROCK_CLIF_1_LOCAL_BOUNDS.minimum[2];
  const pitchRadians = instance.tiltResidualRadians[0];
  const transformedWorldHeightMetres =
    authoredHeightMetres * instance.scale[1] * Math.cos(pitchRadians) +
    authoredDepthMetres * instance.scale[2] * Math.sin(pitchRadians);
  const visibleHeightMetres = transformedWorldHeightMetres * (instance.visibleHeightRatio ?? 0.35);
  return terrainHeight + visibleHeightMetres >= body.waterLevelMetres + 0.35;
}

function riverRockFootprintIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldDecorationInstance
): boolean {
  const box = decorationOrientedBox(plan, instance, instance.footprintMetres[0], instance.footprintMetres[1]);
  if (
    pointToOrientedBoxDistance(plan.spawnReserve.center, plan.sizeMetres, box) < plan.spawnReserve.protectedRadiusMetres
  ) {
    return false;
  }
  if (seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) < ROCK_ROAD_BOUNDARY_CLEARANCE_METRES) return false;
  if (!orientedBoxIsOnLand(plan, box)) return false;
  return riverPositionIsValid(plan, fields, instance.normalizedPosition);
}

function sampleStoneAroundParent(
  plan: SeedWorldPlan,
  parent: SeedWorldDecorationInstance,
  footprintMetres: readonly [width: number, depth: number],
  yawRadians: number,
  radialOffsetMetres: readonly [minimum: number, maximum: number],
  parentSupportRadiusRatio: number,
  supportRocks: readonly SeedWorldDecorationInstance[],
  seed: number,
  scatter: Readonly<{ localAngleRadians: number; radialOffsetMetres: number }> | undefined,
  acceptedDebrisFootprints: DebrisFootprintIndex | undefined
): SeedWorldPoint {
  const localAngle = scatter?.localAngleRadians ?? unitFloat(seed, "radial-angle") * Math.PI * 2;
  const worldAngle = parent.yawRadians + localAngle;
  const directionX = Math.cos(worldAngle);
  const directionZ = Math.sin(worldAngle);
  const parentWorldX = (parent.normalizedPosition.x - 0.5) * plan.sizeMetres;
  const parentWorldZ = (parent.normalizedPosition.y - 0.5) * plan.sizeMetres;
  const parentSupportRadius = Math.max(
    ...supportRocks.map((rock) => {
      const localRockAngle = worldAngle - rock.yawRadians;
      const rockSupportRadius =
        Math.abs(Math.cos(localRockAngle)) * rock.footprintMetres[0] * 0.5 +
        Math.abs(Math.sin(localRockAngle)) * rock.footprintMetres[1] * 0.5;
      const rockWorldX = (rock.normalizedPosition.x - 0.5) * plan.sizeMetres;
      const rockWorldZ = (rock.normalizedPosition.y - 0.5) * plan.sizeMetres;
      return (rockWorldX - parentWorldX) * directionX + (rockWorldZ - parentWorldZ) * directionZ + rockSupportRadius;
    })
  );
  const stoneLocalAngle = worldAngle - yawRadians;
  const stoneSupportRadius =
    Math.abs(Math.cos(stoneLocalAngle)) * footprintMetres[0] * 0.5 +
    Math.abs(Math.sin(stoneLocalAngle)) * footprintMetres[1] * 0.5;
  const offset =
    scatter?.radialOffsetMetres ?? mix(radialOffsetMetres[0], radialOffsetMetres[1], unitFloat(seed, "radial-offset"));
  const preferredRadius =
    parentSupportRadius * parentSupportRadiusRatio + stoneSupportRadius + SMALL_ROCK_PARENT_CLEARANCE_METRES + offset;
  const radius = resolveDebrisCollisionFreeRadius(
    parentWorldX,
    parentWorldZ,
    directionX,
    directionZ,
    preferredRadius,
    footprintMetres,
    yawRadians,
    acceptedDebrisFootprints
  );
  return Object.freeze({
    x: 0.5 + (parentWorldX + directionX * radius) / plan.sizeMetres,
    y: 0.5 + (parentWorldZ + directionZ * radius) / plan.sizeMetres
  });
}

function resolveDebrisCollisionFreeRadius(
  parentWorldX: number,
  parentWorldZ: number,
  directionX: number,
  directionZ: number,
  preferredRadius: number,
  footprintMetres: readonly [width: number, depth: number],
  yawRadians: number,
  acceptedDebrisFootprints: DebrisFootprintIndex | undefined
): number {
  if (!acceptedDebrisFootprints || acceptedDebrisFootprints.footprintCount === 0) return preferredRadius;
  const radialAxis = { x: directionX, z: directionZ };
  const candidateBox = {
    centerX: parentWorldX + directionX * preferredRadius,
    centerZ: parentWorldZ + directionZ * preferredRadius,
    halfWidth: footprintMetres[0] * 0.5,
    halfDepth: footprintMetres[1] * 0.5,
    yawRadians
  };
  const candidateAxes = orientedBoxAxes(yawRadians);
  const candidateRadialSupport = orientedBoxProjectionRadius(candidateBox, candidateAxes, radialAxis);
  const candidateBoundingRadius = Math.hypot(candidateBox.halfWidth, candidateBox.halfDepth);
  let radius = preferredRadius;
  for (let pass = 0; pass <= acceptedDebrisFootprints.footprintCount; pass++) {
    let moved = false;
    for (const accepted of queryDebrisFootprints(acceptedDebrisFootprints, candidateBox, candidateBoundingRadius)) {
      const centerOffsetX = candidateBox.centerX - accepted.box.centerX;
      const centerOffsetZ = candidateBox.centerZ - accepted.box.centerZ;
      const boundingDistance = candidateBoundingRadius + accepted.boundingRadiusMetres;
      if (centerOffsetX * centerOffsetX + centerOffsetZ * centerOffsetZ >= boundingDistance * boundingDistance) {
        continue;
      }
      if (!orientedBoxesOverlap(candidateBox, accepted.box, 0)) continue;
      const acceptedAxes = orientedBoxAxes(accepted.box.yawRadians);
      const acceptedRadialSupport = orientedBoxProjectionRadius(accepted.box, acceptedAxes, radialAxis);
      const acceptedCenterRadius =
        (accepted.box.centerX - parentWorldX) * radialAxis.x + (accepted.box.centerZ - parentWorldZ) * radialAxis.z;
      radius = Math.max(radius, acceptedCenterRadius + acceptedRadialSupport + candidateRadialSupport);
      candidateBox.centerX = parentWorldX + directionX * radius;
      candidateBox.centerZ = parentWorldZ + directionZ * radius;
      moved = true;
    }
    if (!moved) break;
  }
  return radius;
}

function resolveGroupedDebrisScatter(
  rule: SeedWorldStoneDecorationRule,
  parentSeed: number,
  ordinal: number,
  seed: number
): Readonly<{ localAngleRadians: number; radialOffsetMetres: number }> {
  const groupCount = 2 + Math.floor(unitFloat(parentSeed, "scatter-group-count") * 2);
  const outlier = ordinal >= groupCount && unitFloat(seed, "scatter-outlier") < 0.2;
  const groupOrdinal = ordinal % groupCount;
  const groupSeed = deriveSeedWorldNamedSeed(parentSeed, `scatter-group:${groupOrdinal}`);
  const localAngleRadians = outlier
    ? unitFloat(seed, "scatter-outlier-angle") * Math.PI * 2
    : unitFloat(groupSeed, "scatter-angle") * Math.PI * 2 + mix(-0.42, 0.42, unitFloat(seed, "scatter-angle-jitter"));
  const radialRank = outlier
    ? mix(0.55, 1, unitFloat(seed, "scatter-outlier-radius"))
    : Math.min(
        1,
        Math.max(
          0,
          mix(0.12, 0.72, unitFloat(groupSeed, "scatter-radius")) +
            mix(-0.18, 0.18, unitFloat(seed, "scatter-radius-jitter"))
        )
      );
  return Object.freeze({
    localAngleRadians,
    radialOffsetMetres: mix(rule.radialOffsetMetres[0], rule.radialOffsetMetres[1], radialRank)
  });
}

function stoneFootprintIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldStoneInstance | SeedWorldSmallRockInstance,
  maximumSlopeDegrees: number,
  hydrologyBody?: SeedWorldHydrologyWaterBody
): boolean {
  const sample = populationSampleAt(plan, fields, instance.normalizedPosition);
  if (!sample || sample.slope * 90 > maximumSlopeDegrees) return false;
  if (instance.category === "small-rock") {
    if (instance.sourceKind === "river") {
      return riverSmallRockFootprintIsValid(plan, fields, instance, maximumSlopeDegrees);
    }
    if (instance.sourceKind === "roadside") return roadsideSmallRockFootprintIsValid(plan, fields, instance);
    if (instance.sourceKind === "land") return landSmallRockFootprintIsValid(plan, fields, instance);
    return smallRockFootprintIsValid(plan, fields, instance);
  }
  const box = decorationOrientedBox(plan, instance, instance.footprintMetres[0], instance.footprintMetres[1]);
  if (
    pointToOrientedBoxDistance(plan.spawnReserve.center, plan.sizeMetres, box) < plan.spawnReserve.protectedRadiusMetres
  ) {
    return false;
  }
  if (!orientedBoxIsOnLand(plan, box)) return false;
  if (instance.sourceKind === "lake-outcrop") {
    if (!hydrologyBody) return false;
    if (!orientedBoxIsWithinHydrologyBody(plan, hydrologyBody, box, 0.25)) return false;
    if (seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) < SMALL_ROCK_ROAD_BOUNDARY_CLEARANCE_METRES) {
      return false;
    }
    const terrainHeight = sampleSeedWorldHeight(fields, box.centerX, box.centerZ);
    if (terrainHeight === undefined) return false;
    const profile = getSeedWorldAssetPlacementProfile(instance.intent.profileKey);
    const geometry =
      profile.variants?.find((variant) => variant.prototypeFamily === instance.prototypeFamily)?.geometry ??
      profile.geometry;
    const transformedHeightMetres =
      (geometry.verticalBoundsMetres[1] - geometry.verticalBoundsMetres[0]) * instance.scale[1];
    const heightAboveWater = terrainHeight + transformedHeightMetres - hydrologyBody.waterLevelMetres;
    return heightAboveWater >= 0.65 && heightAboveWater <= 2;
  }
  if (instance.sourceKind === "river") {
    return seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) >= SMALL_ROCK_ROAD_BOUNDARY_CLEARANCE_METRES;
  }
  if (orientedBoxOverlapsWater(fields, box)) return false;
  if (instance.sourceKind === "roadside") {
    const overlap = Math.min(instance.footprintMetres[0], instance.footprintMetres[1]) * 0.35;
    return seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) >= -overlap;
  }
  return seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) >= SMALL_ROCK_ROAD_BOUNDARY_CLEARANCE_METRES;
}

/**
 * Compiles sparse, moisture-qualified mushroom clusters immediately outside accepted rock footprints.
 * @param plan Authoritative named streams and feature rules.
 * @param fields Canonical height, moisture, road, and water fields.
 * @param parentRocks Exact parent-rock array already shared by 2D and 3D.
 * @returns Stable mushroom transforms from an independent named category stream.
 */
export function compileSeedWorldMushroomDecorations(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  parentRocks: readonly SeedWorldDecorationInstance[]
): readonly SeedWorldMushroomInstance[] {
  const rule = plan.featureDecorationRules.find(
    (candidate): candidate is SeedWorldMushroomDecorationRule => candidate.category === "mushroom"
  );
  if (!rule) return Object.freeze([]);
  const result: SeedWorldMushroomInstance[] = [];
  const parentFootprints = parentRocks.map((rock) =>
    orientedFootprint(decorationOrientedBox(plan, rock, rock.footprintMetres[0], rock.footprintMetres[1]))
  );
  const categorySeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, "mushroom:rock-edge");
  for (const parent of parentRocks) {
    const parentSeed = deriveSeedWorldNamedSeed(categorySeed, parent.id);
    if (unitFloat(parentSeed, "coverage") >= rule.parentCoverage) continue;
    const pieceCount = integerInRange(rule.piecesPerCluster, parentSeed, "piece-count");
    for (let ordinal = 0; ordinal < pieceCount; ordinal++) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const seed = deriveSeedWorldNamedSeed(parentSeed, `piece:${ordinal}:attempt:${attempt}`);
        const intent = Object.freeze({
          profileKey: rule.profileKey,
          role: "cluster",
          sizeRank: unitFloat(seed, "size-rank"),
          shapeVariationKey: deriveSeedWorldNamedSeed(seed, "shape-variation")
        } as const);
        const placement = resolveSeedWorldAssetPlacement(intent);
        const yawRadians = unitFloat(seed, "yaw") * Math.PI * 2;
        const normalizedPosition = sampleMushroomAroundRock(
          plan,
          parent,
          rule,
          seed,
          placement.footprintMetres,
          yawRadians
        );
        const sample = populationSampleAt(plan, fields, normalizedPosition);
        if (
          !sample ||
          sample.water ||
          sample.moisture < rule.minimumMoisture ||
          sample.slope > rule.maximumSlope ||
          sample.roadDistanceMetres < 2
        ) {
          continue;
        }
        const instance = Object.freeze({
          id: `mushroom:${parent.id}:piece-${ordinal}`,
          category: "mushroom",
          sourceKind: "rock-edge",
          sourceFeatureId: parent.sourceFeatureId,
          parentDecorationId: parent.id,
          ordinal,
          normalizedPosition,
          intent,
          profileVersion: placement.profileVersion,
          prototypeFamily: placement.prototypeFamily as "mushroom-1",
          scale: placement.scale,
          footprintMetres: placement.footprintMetres,
          yawRadians
        } satisfies SeedWorldMushroomInstance);
        if (decorationOverlapsAnyFootprint(plan, parentFootprints, instance, MUSHROOM_PARENT_CLEARANCE_METRES)) {
          continue;
        }
        const box = decorationOrientedBox(plan, instance, instance.footprintMetres[0], instance.footprintMetres[1]);
        if (
          pointToOrientedBoxDistance(plan.spawnReserve.center, plan.sizeMetres, box) <
            plan.spawnReserve.protectedRadiusMetres ||
          !orientedBoxIsOnLand(plan, box) ||
          orientedBoxOverlapsWater(fields, box) ||
          seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) < 1
        ) {
          continue;
        }
        result.push(instance);
        break;
      }
    }
  }
  result.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze(result);
}

function sampleMushroomAroundRock(
  plan: SeedWorldPlan,
  parent: SeedWorldDecorationInstance,
  rule: SeedWorldMushroomDecorationRule,
  seed: number,
  footprintMetres: readonly [width: number, depth: number],
  yawRadians: number
): SeedWorldPoint {
  const halfWidth = parent.footprintMetres[0] * 0.5;
  const halfDepth = parent.footprintMetres[1] * 0.5;
  const perimeter = (halfWidth + halfDepth) * 4;
  const perimeterPosition = unitFloat(seed, "angle") * perimeter;
  let localX: number;
  let localZ: number;
  let normalX: number;
  let normalZ: number;
  if (perimeterPosition < halfWidth * 2) {
    localX = -halfWidth + perimeterPosition;
    localZ = -halfDepth;
    normalX = 0;
    normalZ = -1;
  } else if (perimeterPosition < halfWidth * 2 + halfDepth * 2) {
    localX = halfWidth;
    localZ = -halfDepth + (perimeterPosition - halfWidth * 2);
    normalX = 1;
    normalZ = 0;
  } else if (perimeterPosition < halfWidth * 4 + halfDepth * 2) {
    localX = halfWidth - (perimeterPosition - halfWidth * 2 - halfDepth * 2);
    localZ = halfDepth;
    normalX = 0;
    normalZ = 1;
  } else {
    localX = -halfWidth;
    localZ = halfDepth - (perimeterPosition - halfWidth * 4 - halfDepth * 2);
    normalX = -1;
    normalZ = 0;
  }
  const worldNormalAngle = parent.yawRadians + Math.atan2(normalZ, normalX);
  const mushroomLocalAngle = worldNormalAngle - yawRadians;
  const mushroomSupportRadius =
    Math.abs(Math.cos(mushroomLocalAngle)) * footprintMetres[0] * 0.5 +
    Math.abs(Math.sin(mushroomLocalAngle)) * footprintMetres[1] * 0.5;
  const edgeOffset = mix(rule.edgeOffsetMetres[0], rule.edgeOffsetMetres[1], unitFloat(seed, "edge-offset"));
  localX += normalX * (mushroomSupportRadius + edgeOffset);
  localZ += normalZ * (mushroomSupportRadius + edgeOffset);
  const cosine = Math.cos(parent.yawRadians);
  const sine = Math.sin(parent.yawRadians);
  const parentWorldX = (parent.normalizedPosition.x - 0.5) * plan.sizeMetres;
  const parentWorldZ = (parent.normalizedPosition.y - 0.5) * plan.sizeMetres;
  return Object.freeze({
    x: 0.5 + (parentWorldX + localX * cosine - localZ * sine) / plan.sizeMetres,
    y: 0.5 + (parentWorldZ + localX * sine + localZ * cosine) / plan.sizeMetres
  });
}

function decorationOverlapsAnyFootprint(
  plan: SeedWorldPlan,
  parentFootprints: readonly OrientedFootprint[],
  smallRock: SeedWorldStoneInstance | SeedWorldSmallRockInstance | SeedWorldMushroomInstance,
  clearanceMetres = SMALL_ROCK_PARENT_CLEARANCE_METRES
): boolean {
  const smallRockFootprint = orientedFootprint(
    decorationOrientedBox(plan, smallRock, smallRock.footprintMetres[0], smallRock.footprintMetres[1])
  );
  for (const parentFootprint of parentFootprints) {
    const offsetX = smallRockFootprint.box.centerX - parentFootprint.box.centerX;
    const offsetZ = smallRockFootprint.box.centerZ - parentFootprint.box.centerZ;
    const maximumOverlapDistance =
      parentFootprint.boundingRadiusMetres + smallRockFootprint.boundingRadiusMetres + clearanceMetres;
    if (offsetX * offsetX + offsetZ * offsetZ >= maximumOverlapDistance * maximumOverlapDistance) continue;
    if (orientedBoxesOverlap(parentFootprint.box, smallRockFootprint.box, clearanceMetres)) {
      return true;
    }
  }
  return false;
}

function orientedBoxesOverlap(
  left: SeedWorldOrientedBox,
  right: SeedWorldOrientedBox,
  clearanceMetres: number
): boolean {
  const offsetX = right.centerX - left.centerX;
  const offsetZ = right.centerZ - left.centerZ;
  const maximumOverlapDistance =
    Math.hypot(left.halfWidth, left.halfDepth) + Math.hypot(right.halfWidth, right.halfDepth) + clearanceMetres;
  if (offsetX * offsetX + offsetZ * offsetZ >= maximumOverlapDistance * maximumOverlapDistance) return false;
  const leftAxes = orientedBoxAxes(left.yawRadians);
  const rightAxes = orientedBoxAxes(right.yawRadians);
  for (const axis of [...leftAxes, ...rightAxes]) {
    const centerDistance = Math.abs(offsetX * axis.x + offsetZ * axis.z);
    const leftRadius = orientedBoxProjectionRadius(left, leftAxes, axis) + clearanceMetres;
    const rightRadius = orientedBoxProjectionRadius(right, rightAxes, axis);
    if (centerDistance >= leftRadius + rightRadius) return false;
  }
  return true;
}

function orientedBoxAxes(
  yawRadians: number
): readonly [Readonly<{ x: number; z: number }>, Readonly<{ x: number; z: number }>] {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  return Object.freeze([Object.freeze({ x: cosine, z: sine }), Object.freeze({ x: -sine, z: cosine })]);
}

function orientedBoxProjectionRadius(
  box: SeedWorldOrientedBox,
  axes: ReturnType<typeof orientedBoxAxes>,
  axis: Readonly<{ x: number; z: number }>
): number {
  return (
    box.halfWidth * Math.abs(axes[0].x * axis.x + axes[0].z * axis.z) +
    box.halfDepth * Math.abs(axes[1].x * axis.x + axes[1].z * axis.z)
  );
}

function smallRockFootprintIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldSmallRockInstance
): boolean {
  return seedWorldDecorationFootprintIsClear(plan, fields, instance);
}

function roadsideSmallRockFootprintIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldSmallRockInstance
): boolean {
  return seedWorldDecorationFootprintIsClear(plan, fields, instance);
}

function landSmallRockFootprintIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldSmallRockInstance
): boolean {
  return seedWorldDecorationFootprintIsClear(plan, fields, instance);
}

function riverSmallRockFootprintIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldSmallRockInstance,
  maximumSlopeDegrees: number
): boolean {
  const box = decorationOrientedBox(plan, instance, instance.footprintMetres[0], instance.footprintMetres[1]);
  if (seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) < SMALL_ROCK_ROAD_BOUNDARY_CLEARANCE_METRES) {
    return false;
  }
  return (
    orientedBoxIsOnLand(plan, box) &&
    riverSmallRockPositionIsValid(plan, fields, instance.normalizedPosition, maximumSlopeDegrees)
  );
}

/**
 * Validates a complete rotated rock footprint against continuous feature geometry and raster water ownership.
 * Wetland rocks may cross the dry wetland boundary. Roadside rocks may overlap at most half of their footprint with
 * the canonical road; every other rock avoids road, ocean, water, and unrelated river banks. Large rocks and
 * river-bank stones also avoid the protected spawn disc; land-scattered small stones remain valid there because
 * they do not obstruct the camera.
 * @param plan Authoritative coast, road, and spawn geometry.
 * @param fields Canonical river curves and water ownership for the same world.
 * @param instance Exact shared large-, ordinary-, or small-rock transform.
 * @returns Whether the complete footprint satisfies every hard clearance.
 */
export function seedWorldDecorationFootprintIsClear(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  instance: SeedWorldDecorationInstance | SeedWorldStoneInstance | SeedWorldSmallRockInstance
): boolean {
  const box = decorationOrientedBox(plan, instance, instance.footprintMetres[0], instance.footprintMetres[1]);
  const roadClearance =
    instance.category === "rock" ? ROCK_ROAD_BOUNDARY_CLEARANCE_METRES : SMALL_ROCK_ROAD_BOUNDARY_CLEARANCE_METRES;
  const minimumRoadDistance =
    instance.sourceKind === "roadside" && (instance.category === "rock" || instance.category === "small-rock")
      ? -Math.min(instance.footprintMetres[0], instance.footprintMetres[1]) *
        ROADSIDE_ROCK_MAXIMUM_FOOTPRINT_OVERLAP_RATIO
      : roadClearance;
  const riverClearance = instance.sourceKind === "riverbank" ? 1 : instance.category === "rock" ? 8 : 6;
  if (
    (instance.category !== "small-rock" || instance.sourceKind !== "land") &&
    pointToOrientedBoxDistance(plan.spawnReserve.center, plan.sizeMetres, box) < plan.spawnReserve.protectedRadiusMetres
  ) {
    return false;
  }
  if (seedWorldRoadToOrientedBoxSignedDistanceMetres(plan, box) < minimumRoadDistance) return false;
  if (seedWorldRiverToOrientedBoxSignedDistanceMetres(fields, box) < riverClearance) return false;
  if (!orientedBoxIsOnLand(plan, box)) return false;
  return !orientedBoxOverlapsWater(fields, box);
}

function riverSmallRockPositionIsValid(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  position: SeedWorldPoint,
  maximumSlopeDegrees: number
): boolean {
  if (!normalizedPointIsInside(position)) return false;
  if (distanceMetres(position, plan.spawnReserve.center, plan.sizeMetres) < plan.spawnReserve.protectedRadiusMetres) {
    return false;
  }
  const sample = populationSampleAt(plan, fields, position);
  const riverBankDistanceMetres = sampleSeedWorldRiverBankSignedDistanceMetres(
    fields,
    (position.x - 0.5) * fields.sizeMetres,
    (position.y - 0.5) * fields.sizeMetres
  );
  return (
    sample !== undefined &&
    (sample.water || riverBankDistanceMetres <= 6) &&
    sample.slope * 90 <= maximumSlopeDegrees &&
    sample.roadDistanceMetres >= SMALL_ROCK_ROAD_CENTERLINE_CLEARANCE_METRES
  );
}

function populationSampleAt(plan: SeedWorldPlan, fields: SeedWorldFields, position: SeedWorldPoint) {
  return sampleSeedWorldPopulation(
    plan,
    fields,
    (position.x - 0.5) * plan.sizeMetres,
    (position.y - 0.5) * plan.sizeMetres
  );
}

function projectToWetlandBoundary(
  fields: SeedWorldFields,
  position: SeedWorldPoint,
  maximumDistanceMetres: number
): SeedWorldPoint | undefined {
  const sampleStep = 1 / fields.surfaceResolution;
  let x = position.x;
  let y = position.y;
  for (let iteration = 0; iteration < 10; iteration++) {
    const current = sampleWetlandWeight(fields, { x, y });
    const error = current - ROCK_WETLAND_BOUNDARY_WEIGHT;
    if (Math.abs(error) <= 1) break;
    const gradientX =
      (sampleWetlandWeight(fields, { x: x + sampleStep, y }) - sampleWetlandWeight(fields, { x: x - sampleStep, y })) /
      (sampleStep * 2);
    const gradientY =
      (sampleWetlandWeight(fields, { x, y: y + sampleStep }) - sampleWetlandWeight(fields, { x, y: y - sampleStep })) /
      (sampleStep * 2);
    const gradientLengthSquared = gradientX * gradientX + gradientY * gradientY;
    if (gradientLengthSquared < 1) return undefined;
    const correction = error / gradientLengthSquared;
    const correctionX = gradientX * correction;
    const correctionY = gradientY * correction;
    const correctionLength = Math.hypot(correctionX, correctionY);
    const maximumStep = sampleStep * 1.5;
    const stepScale = correctionLength > maximumStep ? maximumStep / correctionLength : 1;
    x = clamp01(x - correctionX * stepScale);
    y = clamp01(y - correctionY * stepScale);
  }
  const projected = Object.freeze({ x, y });
  if (distanceMetres(position, projected, fields.sizeMetres) > maximumDistanceMetres) return undefined;
  return projected;
}

function sampleWetlandWeight(fields: SeedWorldFields, position: SeedWorldPoint): number {
  const sampleX = clamp(position.x * fields.surfaceResolution - 0.5, 0, fields.surfaceResolution - 1);
  const sampleY = clamp(position.y * fields.surfaceResolution - 0.5, 0, fields.surfaceResolution - 1);
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = Math.min(fields.surfaceResolution - 1, x0 + 1);
  const y1 = Math.min(fields.surfaceResolution - 1, y0 + 1);
  const tx = sampleX - x0;
  const ty = sampleY - y0;
  const top = mix(
    fields.wetlandWeight[y0 * fields.surfaceResolution + x0],
    fields.wetlandWeight[y0 * fields.surfaceResolution + x1],
    tx
  );
  const bottom = mix(
    fields.wetlandWeight[y1 * fields.surfaceResolution + x0],
    fields.wetlandWeight[y1 * fields.surfaceResolution + x1],
    tx
  );
  return mix(top, bottom, ty);
}

function sampleSurfaceField(
  fields: SeedWorldFields,
  position: SeedWorldPoint,
  samples: Uint8Array,
  stride: number,
  channel: number
): number {
  const sampleX = clamp(position.x * fields.surfaceResolution - 0.5, 0, fields.surfaceResolution - 1);
  const sampleY = clamp(position.y * fields.surfaceResolution - 0.5, 0, fields.surfaceResolution - 1);
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = Math.min(fields.surfaceResolution - 1, x0 + 1);
  const y1 = Math.min(fields.surfaceResolution - 1, y0 + 1);
  const tx = sampleX - x0;
  const ty = sampleY - y0;
  const at = (x: number, y: number): number => samples[(y * fields.surfaceResolution + x) * stride + channel]!;
  return mix(mix(at(x0, y0), at(x1, y0), tx), mix(at(x0, y1), at(x1, y1), tx), ty);
}

function surfacePointIsDryWetland(fields: SeedWorldFields, position: SeedWorldPoint): boolean {
  if (!normalizedPointIsInside(position)) return false;
  const x = Math.min(fields.surfaceResolution - 1, Math.floor(position.x * fields.surfaceResolution));
  const y = Math.min(fields.surfaceResolution - 1, Math.floor(position.y * fields.surfaceResolution));
  const index = y * fields.surfaceResolution + x;
  return fields.wetlandWeight[index] >= ROCK_WETLAND_BOUNDARY_WEIGHT && fields.waterMask[index] === 0;
}

function wetlandBoundaryCells(cells: readonly number[], resolution: number): readonly number[] {
  const featureCells = new Set(cells);
  return cells.filter((cell) => {
    const x = cell % resolution;
    const y = Math.floor(cell / resolution);
    return (
      x === 0 ||
      y === 0 ||
      x === resolution - 1 ||
      y === resolution - 1 ||
      !featureCells.has(cell - 1) ||
      !featureCells.has(cell + 1) ||
      !featureCells.has(cell - resolution) ||
      !featureCells.has(cell + resolution)
    );
  });
}

function findWetlandFeatures(plan: SeedWorldPlan, fields: SeedWorldFields): readonly WetlandFeature[] {
  const visited = new Uint8Array(plan.landCover.length);
  const features: WetlandFeature[] = [];
  for (let start = 0; start < plan.landCover.length; start++) {
    if (visited[start] !== 0 || !coarseCellIsDryWetland(plan, fields, start)) continue;
    const queue = [start];
    const cells: number[] = [];
    visited[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      cells.push(cell);
      const x = cell % plan.resolution;
      const y = Math.floor(cell / plan.resolution);
      for (const [offsetX, offsetY] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1]
      ] as const) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextY < 0 || nextX >= plan.resolution || nextY >= plan.resolution) continue;
        const next = nextY * plan.resolution + nextX;
        if (visited[next] !== 0 || !coarseCellIsDryWetland(plan, fields, next)) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    if (cells.length >= ROCK_WETLAND_COMPONENT_MINIMUM_CELLS) {
      features.push(Object.freeze({ id: `wetland-${features.length}`, cells: Object.freeze(cells) }));
    }
  }
  return Object.freeze(features);
}

function coarseCellIsDryWetland(plan: SeedWorldPlan, fields: SeedWorldFields, cell: number): boolean {
  const column = cell % plan.resolution;
  const row = Math.floor(cell / plan.resolution);
  return surfacePointIsDryWetland(fields, {
    x: (column + 0.5) / plan.resolution,
    y: (row + 0.5) / plan.resolution
  });
}

function mountainPoint(
  brush: SeedWorldMountainBrush,
  worldSizeMetres: number,
  angle: number,
  distance: number
): SeedWorldPoint {
  const localX = (Math.cos(angle) * brush.majorRadiusMetres * distance) / worldSizeMetres;
  const localZ = (Math.sin(angle) * brush.minorRadiusMetres * distance) / worldSizeMetres;
  const cosine = Math.cos(brush.angleRadians);
  const sine = Math.sin(brush.angleRadians);
  return Object.freeze({
    x: brush.center.x + localX * cosine - localZ * sine,
    y: brush.center.y + localX * sine + localZ * cosine
  });
}

function mountainDistance(brush: SeedWorldMountainBrush, worldSizeMetres: number, position: SeedWorldPoint): number {
  const cosine = Math.cos(brush.angleRadians);
  const sine = Math.sin(brush.angleRadians);
  const offsetX = (position.x - brush.center.x) * worldSizeMetres;
  const offsetZ = (position.y - brush.center.y) * worldSizeMetres;
  const localX = (offsetX * cosine + offsetZ * sine) / brush.majorRadiusMetres;
  const localZ = (-offsetX * sine + offsetZ * cosine) / brush.minorRadiusMetres;
  return Math.hypot(localX, localZ);
}

function decorationOrientedBox(
  plan: SeedWorldPlan,
  instance:
    | SeedWorldDecorationInstance
    | SeedWorldStoneInstance
    | SeedWorldSmallRockInstance
    | SeedWorldMushroomInstance,
  footprintWidthMetres: number,
  footprintDepthMetres: number
): SeedWorldOrientedBox {
  return {
    centerX: (instance.normalizedPosition.x - 0.5) * plan.sizeMetres,
    centerZ: (instance.normalizedPosition.y - 0.5) * plan.sizeMetres,
    halfWidth: footprintWidthMetres * 0.5,
    halfDepth: footprintDepthMetres * 0.5,
    yawRadians: instance.yawRadians
  };
}

function orientedFootprint(box: SeedWorldOrientedBox): OrientedFootprint {
  return { box, boundingRadiusMetres: Math.hypot(box.halfWidth, box.halfDepth) };
}

function indexDebrisFootprint(index: DebrisFootprintIndex, footprint: OrientedFootprint): void {
  const minimumColumn = Math.floor(
    (footprint.box.centerX - footprint.boundingRadiusMetres) / DEBRIS_COLLISION_CELL_SIZE_METRES
  );
  const maximumColumn = Math.floor(
    (footprint.box.centerX + footprint.boundingRadiusMetres) / DEBRIS_COLLISION_CELL_SIZE_METRES
  );
  const minimumRow = Math.floor(
    (footprint.box.centerZ - footprint.boundingRadiusMetres) / DEBRIS_COLLISION_CELL_SIZE_METRES
  );
  const maximumRow = Math.floor(
    (footprint.box.centerZ + footprint.boundingRadiusMetres) / DEBRIS_COLLISION_CELL_SIZE_METRES
  );
  for (let row = minimumRow; row <= maximumRow; row++) {
    for (let column = minimumColumn; column <= maximumColumn; column++) {
      const key = `${column}:${row}`;
      const cell = index.footprintsByCell.get(key);
      if (cell) cell.push(footprint);
      else index.footprintsByCell.set(key, [footprint]);
    }
  }
  index.footprintCount++;
}

function queryDebrisFootprints(
  index: DebrisFootprintIndex,
  box: SeedWorldOrientedBox,
  boundingRadiusMetres: number
): readonly OrientedFootprint[] {
  const minimumColumn = Math.floor((box.centerX - boundingRadiusMetres) / DEBRIS_COLLISION_CELL_SIZE_METRES);
  const maximumColumn = Math.floor((box.centerX + boundingRadiusMetres) / DEBRIS_COLLISION_CELL_SIZE_METRES);
  const minimumRow = Math.floor((box.centerZ - boundingRadiusMetres) / DEBRIS_COLLISION_CELL_SIZE_METRES);
  const maximumRow = Math.floor((box.centerZ + boundingRadiusMetres) / DEBRIS_COLLISION_CELL_SIZE_METRES);
  const result = new Set<OrientedFootprint>();
  for (let row = minimumRow; row <= maximumRow; row++) {
    for (let column = minimumColumn; column <= maximumColumn; column++) {
      for (const footprint of index.footprintsByCell.get(`${column}:${row}`) ?? []) result.add(footprint);
    }
  }
  return [...result];
}

function debrisFootprintOverlapsIndex(index: DebrisFootprintIndex, footprint: OrientedFootprint): boolean {
  return queryDebrisFootprints(index, footprint.box, footprint.boundingRadiusMetres).some((accepted) =>
    orientedBoxesOverlap(footprint.box, accepted.box, 0)
  );
}

function pointToOrientedBoxDistance(point: SeedWorldPoint, worldSizeMetres: number, box: SeedWorldOrientedBox): number {
  const worldX = (point.x - 0.5) * worldSizeMetres;
  const worldZ = (point.y - 0.5) * worldSizeMetres;
  const cosine = Math.cos(box.yawRadians);
  const sine = Math.sin(box.yawRadians);
  const offsetX = worldX - box.centerX;
  const offsetZ = worldZ - box.centerZ;
  const localX = offsetX * cosine + offsetZ * sine;
  const localZ = -offsetX * sine + offsetZ * cosine;
  return Math.hypot(Math.max(Math.abs(localX) - box.halfWidth, 0), Math.max(Math.abs(localZ) - box.halfDepth, 0));
}

function orientedBoxIsOnLand(plan: SeedWorldPlan, box: SeedWorldOrientedBox): boolean {
  const sampleSpacingMetres = 1;
  const columns = Math.max(1, Math.ceil((box.halfWidth * 2) / sampleSpacingMetres));
  const rows = Math.max(1, Math.ceil((box.halfDepth * 2) / sampleSpacingMetres));
  const cosine = Math.cos(box.yawRadians);
  const sine = Math.sin(box.yawRadians);
  const minimumClearanceMetres = Math.SQRT1_2 * sampleSpacingMetres;
  for (let row = 0; row <= rows; row++) {
    const localZ = mix(-box.halfDepth, box.halfDepth, row / rows);
    for (let column = 0; column <= columns; column++) {
      const localX = mix(-box.halfWidth, box.halfWidth, column / columns);
      const worldX = box.centerX + localX * cosine - localZ * sine;
      const worldZ = box.centerZ + localX * sine + localZ * cosine;
      const normalizedPosition = {
        x: worldX / plan.sizeMetres + 0.5,
        y: worldZ / plan.sizeMetres + 0.5
      };
      if (!normalizedPointIsInside(normalizedPosition)) return false;
      const coastDistance = sampleSeedWorldCoastSignedFieldMetres(plan.coastShape, normalizedPosition);
      if (coastDistance < minimumClearanceMetres) return false;
    }
  }
  return true;
}

function orientedBoxIsWithinHydrologyBody(
  plan: SeedWorldPlan,
  body: SeedWorldHydrologyWaterBody,
  box: SeedWorldOrientedBox,
  shorelineClearanceMetres: number
): boolean {
  const sampleSpacingMetres = 2;
  const columns = Math.max(1, Math.ceil((box.halfWidth * 2) / sampleSpacingMetres));
  const rows = Math.max(1, Math.ceil((box.halfDepth * 2) / sampleSpacingMetres));
  const cosine = Math.cos(box.yawRadians);
  const sine = Math.sin(box.yawRadians);
  for (let row = 0; row <= rows; row++) {
    const localZ = mix(-box.halfDepth, box.halfDepth, row / rows);
    for (let column = 0; column <= columns; column++) {
      const localX = mix(-box.halfWidth, box.halfWidth, column / columns);
      const position = Object.freeze({
        x: (box.centerX + localX * cosine - localZ * sine) / plan.sizeMetres + 0.5,
        y: (box.centerZ + localX * sine + localZ * cosine) / plan.sizeMetres + 0.5
      });
      if (!normalizedPointIsInside(position)) return false;
      if (sampleHydrologyBodySignedDistance(body, position) > -shorelineClearanceMetres) return false;
    }
  }
  return true;
}

function orientedBoxOverlapsWater(fields: SeedWorldFields, box: SeedWorldOrientedBox): boolean {
  const cosine = Math.cos(box.yawRadians);
  const sine = Math.sin(box.yawRadians);
  const extentX = Math.abs(cosine) * box.halfWidth + Math.abs(sine) * box.halfDepth;
  const extentZ = Math.abs(sine) * box.halfWidth + Math.abs(cosine) * box.halfDepth;
  const cellMetres = fields.sizeMetres / fields.surfaceResolution;
  const minimumX = clamp(
    Math.floor((box.centerX - extentX + fields.sizeMetres * 0.5) / cellMetres),
    0,
    fields.surfaceResolution - 1
  );
  const maximumX = clamp(
    Math.floor((box.centerX + extentX + fields.sizeMetres * 0.5) / cellMetres),
    0,
    fields.surfaceResolution - 1
  );
  const minimumZ = clamp(
    Math.floor((box.centerZ - extentZ + fields.sizeMetres * 0.5) / cellMetres),
    0,
    fields.surfaceResolution - 1
  );
  const maximumZ = clamp(
    Math.floor((box.centerZ + extentZ + fields.sizeMetres * 0.5) / cellMetres),
    0,
    fields.surfaceResolution - 1
  );
  for (let z = minimumZ; z <= maximumZ; z++) {
    for (let x = minimumX; x <= maximumX; x++) {
      if (fields.waterMask[z * fields.surfaceResolution + x] === 0) continue;
      const cellCenterX = -fields.sizeMetres * 0.5 + (x + 0.5) * cellMetres;
      const cellCenterZ = -fields.sizeMetres * 0.5 + (z + 0.5) * cellMetres;
      if (orientedBoxOverlapsAxisAlignedCell(box, cellCenterX, cellCenterZ, cellMetres * 0.5, cosine, sine)) {
        return true;
      }
    }
  }
  return false;
}

function orientedBoxOverlapsAxisAlignedCell(
  box: SeedWorldOrientedBox,
  cellCenterX: number,
  cellCenterZ: number,
  cellHalfExtent: number,
  cosine: number,
  sine: number
): boolean {
  const offsetX = cellCenterX - box.centerX;
  const offsetZ = cellCenterZ - box.centerZ;
  const boxRadiusX = Math.abs(cosine) * box.halfWidth + Math.abs(sine) * box.halfDepth;
  const boxRadiusZ = Math.abs(sine) * box.halfWidth + Math.abs(cosine) * box.halfDepth;
  if (Math.abs(offsetX) > boxRadiusX + cellHalfExtent || Math.abs(offsetZ) > boxRadiusZ + cellHalfExtent) {
    return false;
  }
  const localOffsetX = offsetX * cosine + offsetZ * sine;
  const localOffsetZ = -offsetX * sine + offsetZ * cosine;
  const cellRadiusOnLocalAxis = cellHalfExtent * (Math.abs(cosine) + Math.abs(sine));
  return (
    Math.abs(localOffsetX) <= box.halfWidth + cellRadiusOnLocalAxis &&
    Math.abs(localOffsetZ) <= box.halfDepth + cellRadiusOnLocalAxis
  );
}

function sampleHydrologyBodySignedDistance(body: SeedWorldHydrologyWaterBody, position: SeedWorldPoint): number {
  const sampleX = clamp(position.x * body.resolution - 0.5, 0, body.resolution - 1);
  const sampleY = clamp(position.y * body.resolution - 0.5, 0, body.resolution - 1);
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = Math.min(body.resolution - 1, x0 + 1);
  const y1 = Math.min(body.resolution - 1, y0 + 1);
  const tx = sampleX - x0;
  const ty = sampleY - y0;
  return mix(
    mix(
      body.signedDistanceMetres[y0 * body.resolution + x0]!,
      body.signedDistanceMetres[y0 * body.resolution + x1]!,
      tx
    ),
    mix(
      body.signedDistanceMetres[y1 * body.resolution + x0]!,
      body.signedDistanceMetres[y1 * body.resolution + x1]!,
      tx
    ),
    ty
  );
}

function integerInRange(range: SeedWorldCountRange, seed: number, namespace: string): number {
  if (range.maximum <= range.minimum) return range.minimum;
  return range.minimum + Math.floor(unitFloat(seed, namespace) * (range.maximum - range.minimum + 1));
}

function unitFloat(seed: number, namespace: string): number {
  return deriveSeedWorldNamedSeed(seed, namespace) / 0x1_0000_0000;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = quintic(x - x0);
  const ty = quintic(y - y0);
  const top = mix(latticeNoise(x0, y0, seed), latticeNoise(x0 + 1, y0, seed), tx);
  const bottom = mix(latticeNoise(x0, y0 + 1, seed), latticeNoise(x0 + 1, y0 + 1, seed), tx);
  return mix(top, bottom, ty);
}

function latticeNoise(x: number, y: number, seed: number): number {
  return unitFloat(seed, `lattice:${x}:${y}`);
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function distanceMetres(left: SeedWorldPoint, right: SeedWorldPoint, worldSizeMetres: number): number {
  return Math.hypot(left.x - right.x, left.y - right.y) * worldSizeMetres;
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

function normalizedPointIsInside(point: SeedWorldPoint): boolean {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
