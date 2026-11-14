import type { SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import {
  seedWorldDecorationFootprintIsClear,
  type SeedWorldPresentationDecorationInstance,
  type SeedWorldStoneInstance
} from "@galacean/engine-world-planning/world/SeedWorldDecorations";
import {
  getSeedWorldAssetPlacementProfile,
  resolveSeedWorldAssetPlacement,
  type SeedWorldTransformIntent
} from "@galacean/engine-world-planning/world/SeedWorldAssetPlacementProfile";
import type { SeedWorldPopulationInstance, SeedWorldPopulationPreview } from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";
import { deriveSeedWorldNamedSeed, type SeedWorldPlan, type SeedWorldPoint } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import {
  projectSeedWorldRockObbToGround,
  seedWorldFootprintOverlapsProjectedRock,
  type SeedWorldProjectedRockObb
} from "./SeedWorldRockObbClearance.ts";
import type { SeedWorldSolvedRockObb } from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";

const MINIMUM_PIECES_PER_ROCK = 24;
const MAXIMUM_PIECES_PER_ROCK = 64;
const TARGET_PERIMETER_METRES_PER_PIECE = 16;
const TARGET_PIECES_PER_CLUSTER = 6;
const MINIMUM_CLUSTER_COUNT = 4;
const MAXIMUM_CLUSTER_COUNT = 12;
const MINIMUM_CLUSTER_HALF_SPAN_METRES = 4;
const MAXIMUM_CLUSTER_HALF_SPAN_METRES = 9;
const ATTEMPTS_PER_PIECE = 20;
const MINIMUM_OBB_GAP_METRES = 0.35;
const MAXIMUM_OBB_GAP_METRES = 5.5;
const MINIMUM_EYE_HEIGHT_RATIO = 0.1;
const MAXIMUM_EYE_HEIGHT_RATIO = 0.38;
const SIZE_DISTRIBUTION_EXPONENT = 1.6;
const CLUSTER_ANCHOR_MINIMUM_SIZE_RANK = 0.82;
const ASSET_TO_ASSET_CLEARANCE_METRES = 0.2;
const FEATURE_STONE_FIELD_MINIMUM_EXTENT_METRES = resolveFeatureStoneFieldMinimumExtentMetres();

type Point2 = readonly [x: number, z: number];

interface OccupiedFootprint {
  readonly x: number;
  readonly z: number;
  readonly radiusMetres: number;
}

/**
 * Adds a restrained layer of varied individual stones around the final published rock OBBs.
 * This is intentionally downstream of layout and rock planning: OBBs own the boundary,
 * while the presentation adapter owns optional debris and never edits either upstream result.
 * The caller injects the authoritative spawn eye height so physical debris scale follows world stature.
 */
export function compileSeedWorldRockObbDebris(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  finalRocks: readonly SeedWorldSolvedRockObb[],
  existingDecorations: readonly SeedWorldPresentationDecorationInstance[],
  population: SeedWorldPopulationPreview,
  referenceEyeHeightMetres: number
): readonly SeedWorldStoneInstance[] {
  if (!Number.isFinite(referenceEyeHeightMetres) || referenceEyeHeightMetres <= 0) {
    throw new RangeError("Seed World rock OBB debris requires a positive finite reference eye height");
  }
  // The complete final OBB is the 3D publication contract. A terrain-height slice can keep a
  // candidate clear at foot level while still leaving it under a high tilted overhang, which
  // reads as debris embedded in the rock from ROAM. Generate from, and reject against, the same
  // complete ground projection so every stone remains just outside the visible OBB silhouette.
  const projectedRocks = finalRocks.map(projectSeedWorldRockObbToGround);
  const occupied = [
    ...existingDecorations
      .filter((instance) => !seedWorldFootprintOverlapsProjectedRock(instance, plan.sizeMetres, projectedRocks))
      .map((instance) => occupiedFootprint(plan.sizeMetres, instance)),
    ...population.treeInstances
      .filter((instance) => !seedWorldFootprintOverlapsProjectedRock(instance, plan.sizeMetres, projectedRocks))
      .map((instance) => occupiedFootprint(plan.sizeMetres, instance))
  ];
  const result: SeedWorldStoneInstance[] = [];

  for (const rock of [...projectedRocks].sort((left, right) => left.rockId.localeCompare(right.rockId))) {
    const perimeterMetres = polygonPerimeter(rock.polygon);
    const targetCount = clampInteger(
      Math.round(perimeterMetres / TARGET_PERIMETER_METRES_PER_PIECE),
      MINIMUM_PIECES_PER_ROCK,
      MAXIMUM_PIECES_PER_ROCK
    );
    const rockSeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, `rock-obb-debris:${rock.rockId}`);
    const clusterCount = clampInteger(
      Math.round(targetCount / TARGET_PIECES_PER_CLUSTER),
      MINIMUM_CLUSTER_COUNT,
      MAXIMUM_CLUSTER_COUNT
    );
    for (let ordinal = 0; ordinal < targetCount; ordinal++) {
      const clusterIndex = ordinal % clusterCount;
      for (let attempt = 0; attempt < ATTEMPTS_PER_PIECE; attempt++) {
        const seed = deriveSeedWorldNamedSeed(rockSeed, `piece:${ordinal}:attempt:${attempt}`);
        const memberLayer = Math.floor(ordinal / clusterCount);
        const randomSizeRank = unitFloat(seed, "size-rank");
        const sizeRank =
          memberLayer === 0
            ? mix(CLUSTER_ANCHOR_MINIMUM_SIZE_RANK, 1, randomSizeRank)
            : Math.pow(randomSizeRank, SIZE_DISTRIBUTION_EXPONENT);
        const targetMaximumExtentMetres = mix(
          referenceEyeHeightMetres * MINIMUM_EYE_HEIGHT_RATIO,
          referenceEyeHeightMetres * MAXIMUM_EYE_HEIGHT_RATIO,
          sizeRank
        );
        const intent = Object.freeze({
          profileKey: "feature-stone",
          role: "field",
          // Resolve every authored Stone variant against the same human-scale target. The first
          // member of every patch is a calf-scale visual anchor which remains legible through the
          // unmasked grass layer; the remaining members retain the shoe-to-shin-biased distribution.
          sizeRank: 0,
          sizeMultiplier: targetMaximumExtentMetres / FEATURE_STONE_FIELD_MINIMUM_EXTENT_METRES,
          shapeVariationKey: deriveSeedWorldNamedSeed(seed, "shape-variation")
        } as const satisfies SeedWorldTransformIntent<"feature-stone">);
        const placement = resolveSeedWorldAssetPlacement(intent);
        const yawRadians = unitFloat(seed, "yaw") * Math.PI * 2;
        // A uniformly sparse ring leaves shoe-sized pieces tens of metres apart around these very large
        // projected OBBs. Keep the same restrained total count, but collect it into independently seeded
        // patches so a ROAM landing sees a varied group instead of one isolated, easy-to-miss stone.
        // If one patch is already occupied by retained ecology, later attempts spill into another seeded
        // patch around the same parent OBB instead of abandoning the stone or reverting to a uniform ring.
        const candidateClusterIndex =
          attempt < 12 ? clusterIndex : (clusterIndex + 1 + attempt - 12) % clusterCount;
        const clusterSeed = deriveSeedWorldNamedSeed(rockSeed, `cluster:${candidateClusterIndex}`);
        const clusterBoundaryDistance =
          (candidateClusterIndex + unitFloat(clusterSeed, "boundary-within-segment")) / clusterCount;
        const clusterHalfSpanMetres = mix(
          MINIMUM_CLUSTER_HALF_SPAN_METRES,
          MAXIMUM_CLUSTER_HALF_SPAN_METRES,
          unitFloat(clusterSeed, "half-span")
        );
        const alongClusterMetres =
          ((unitFloat(seed, "cluster-along-a") - 0.5) + (unitFloat(seed, "cluster-along-b") - 0.5)) *
          clusterHalfSpanMetres;
        const boundary = samplePolygonBoundary(
          rock,
          wrapUnitInterval(clusterBoundaryDistance + alongClusterMetres / perimeterMetres)
        );
        const supportRadiusMetres = orientedRectangleSupportRadius(
          placement.footprintMetres,
          yawRadians,
          boundary.outwardNormal
        );
        const gapMetres = mix(MINIMUM_OBB_GAP_METRES, MAXIMUM_OBB_GAP_METRES, unitFloat(seed, "obb-gap"));
        const worldX = boundary.point[0] + boundary.outwardNormal[0] * (supportRadiusMetres + gapMetres);
        const worldZ = boundary.point[1] + boundary.outwardNormal[1] * (supportRadiusMetres + gapMetres);
        const normalizedPosition = normalizeWorldPosition(plan.sizeMetres, worldX, worldZ);
        if (!normalizedPosition) continue;

        const candidate = Object.freeze({
          id: `rock-obb-debris:${rock.rockId}:piece-${ordinal}`,
          category: "stone",
          sourceKind: "land",
          sourceFeatureId: rock.rockId,
          parentDecorationId: rock.rockId,
          ordinal,
          normalizedPosition,
          intent,
          profileVersion: placement.profileVersion,
          prototypeFamily: placement.prototypeFamily as SeedWorldStoneInstance["prototypeFamily"],
          scale: placement.scale,
          footprintMetres: placement.footprintMetres,
          yawRadians,
          tiltResidualRadians: Object.freeze([
            mix(-0.12, 0.12, unitFloat(seed, "tilt-x")),
            mix(-0.12, 0.12, unitFloat(seed, "tilt-z"))
          ] as const)
        } satisfies SeedWorldStoneInstance);
        if (!seedWorldDecorationFootprintIsClear(plan, fields, candidate)) continue;
        if (seedWorldFootprintOverlapsProjectedRock(candidate, plan.sizeMetres, projectedRocks)) continue;
        const candidateOccupancy = occupiedFootprint(plan.sizeMetres, candidate);
        if (occupied.some((other) => occupiedFootprintsOverlap(candidateOccupancy, other))) continue;

        result.push(candidate);
        occupied.push(candidateOccupancy);
        break;
      }
    }
  }

  return Object.freeze(result);
}

function samplePolygonBoundary(
  rock: SeedWorldProjectedRockObb,
  normalizedDistance: number
): Readonly<{ point: Point2; outwardNormal: Point2 }> {
  const edgeLengths = rock.polygon.map((point, index) =>
    distance(point, rock.polygon[(index + 1) % rock.polygon.length]!)
  );
  let remaining = normalizedDistance * edgeLengths.reduce((sum, length) => sum + length, 0);
  for (let index = 0; index < rock.polygon.length; index++) {
    const start = rock.polygon[index]!;
    const end = rock.polygon[(index + 1) % rock.polygon.length]!;
    const edgeLength = edgeLengths[index]!;
    if (remaining > edgeLength && index < rock.polygon.length - 1) {
      remaining -= edgeLength;
      continue;
    }
    const ratio = edgeLength > 0 ? Math.min(1, remaining / edgeLength) : 0;
    const edgeX = end[0] - start[0];
    const edgeZ = end[1] - start[1];
    return Object.freeze({
      point: Object.freeze([mix(start[0], end[0], ratio), mix(start[1], end[1], ratio)] as const),
      // Convex hull vertices are counter-clockwise, so the right-hand edge normal points outward.
      outwardNormal: Object.freeze([edgeZ / edgeLength, -edgeX / edgeLength] as const)
    });
  }
  throw new RangeError(`Seed World projected rock "${rock.rockId}" has no usable boundary`);
}

function orientedRectangleSupportRadius(
  footprintMetres: readonly [width: number, depth: number],
  yawRadians: number,
  direction: Point2
): number {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  const widthProjection = Math.abs(direction[0] * cosine + direction[1] * sine) * footprintMetres[0] * 0.5;
  const depthProjection = Math.abs(direction[0] * -sine + direction[1] * cosine) * footprintMetres[1] * 0.5;
  return widthProjection + depthProjection;
}

function occupiedFootprint(
  worldSizeMetres: number,
  instance: Pick<SeedWorldPopulationInstance, "normalizedPosition" | "footprintMetres">
): OccupiedFootprint {
  return Object.freeze({
    x: (instance.normalizedPosition.x - 0.5) * worldSizeMetres,
    z: (instance.normalizedPosition.y - 0.5) * worldSizeMetres,
    // The circumscribed circle is conservative for every yaw and therefore cannot admit a rectangle overlap.
    radiusMetres: Math.hypot(instance.footprintMetres[0], instance.footprintMetres[1]) * 0.5
  });
}

function occupiedFootprintsOverlap(left: OccupiedFootprint, right: OccupiedFootprint): boolean {
  return (
    Math.hypot(left.x - right.x, left.z - right.z) <
    left.radiusMetres + right.radiusMetres + ASSET_TO_ASSET_CLEARANCE_METRES
  );
}

function normalizeWorldPosition(sizeMetres: number, worldX: number, worldZ: number): SeedWorldPoint | undefined {
  const x = worldX / sizeMetres + 0.5;
  const y = worldZ / sizeMetres + 0.5;
  if (x < 0 || x > 1 || y < 0 || y > 1) return undefined;
  return Object.freeze({ x, y });
}

function polygonPerimeter(polygon: readonly Point2[]): number {
  let perimeter = 0;
  for (let index = 0; index < polygon.length; index++) {
    perimeter += distance(polygon[index]!, polygon[(index + 1) % polygon.length]!);
  }
  return perimeter;
}

function distance(left: Point2, right: Point2): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

function unitFloat(seed: number, namespace: string): number {
  return deriveSeedWorldNamedSeed(seed, namespace) / 0x1_0000_0000;
}

function mix(left: number, right: number, t: number): number {
  return left + (right - left) * t;
}

function wrapUnitInterval(value: number): number {
  return ((value % 1) + 1) % 1;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function resolveFeatureStoneFieldMinimumExtentMetres(): number {
  const size = getSeedWorldAssetPlacementProfile("feature-stone").roleSizeMetres?.field;
  if (!size) throw new Error("Seed World feature-stone field size profile is missing");
  return size.minimum;
}
