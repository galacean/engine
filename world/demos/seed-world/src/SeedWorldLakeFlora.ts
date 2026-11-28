import { seedWorldRoadToOrientedBoxSignedDistanceMetres, type SeedWorldOrientedBox } from "@galacean/engine-world-planning/world/SeedWorldFeatureGeometry";
import { sampleSeedWorldHeight, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { SeedWorldLakeShorePlacementBodyV1 } from "./SeedWorldFieldWorkerProtocol.ts";
import type { SeedWorldHydrologyWaterBody } from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyBake";
import { deriveSeedWorldNamedSeed, type SeedWorldPlan, type SeedWorldPoint } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import type { SeedWorldFeatureDecorationInstance, SeedWorldLotusInstance } from "@galacean/engine-world-planning/world/SeedWorldDecorations";

/** Area-budgeted habitat contract for authorized Lake-shore lotus placement. */
export const SEED_WORLD_LAKE_FLORA_RULE = Object.freeze({
  minimumShoreDistanceMetres: 0.6,
  preferredMaximumShoreDistanceMetres: 8,
  maximumShoreDistanceMetres: 40,
  minimumWaterDepthMetres: 0.15,
  preferredMaximumWaterDepthMetres: 2.5,
  maximumWaterDepthMetres: 6,
  candidatesPerCell: 15,
  roadBoundaryClearanceMetres: 1.5,
  poiClearanceMetres: 20,
  existingDecorationClearanceMetres: 2,
  spawnInfluenceDistanceMetres: 110,
  roadInfluenceDistanceMetres: 45,
  anchorNoiseScaleMetres: 52,
  patchNoiseScaleMetres: 24,
  anchorSpawnWeight: 0.55,
  anchorRoadWeight: 0.35,
  anchorSeedWeight: 0.1,
  patchRadialWeight: 0.3,
  patchSeedWeight: 0.7,
  patchAreaRatio: 0.1,
  minimumPatchRadiusMetres: 4,
  maximumBasePatchRadiusMetres: 64,
  patchExpansionMultipliers: Object.freeze([1, 1.25, 1.5, 2, 2.5] as const),
  minimumSpacingMetres: 1,
  minimumPerLake: 40,
  maximumPerLake: 640,
  areaPerPatchInstanceSquareMetres: 5,
  maximumWorldCount: 1920,
  variantSelectionWeights: Object.freeze({
    lotus: 0.2,
    "lotus-group-1": 0.5,
    "lotus-group-2": 0.3
  }),
  scaleRange: Object.freeze([0.85, 1.15] as const),
  // The imported asset root is the authored source water plane. Seed World's
  // rendered Lake surface sits 0.04 m below the canonical hydrology level.
  // Keeping the root 0.02 m above authority leaves the thin pads about 0.06 m
  // above the rendered surface instead of letting transparent water cover them.
  surfaceOffsetMetres: 0.02
});

const EXISTING_DECORATION_INDEX_MINIMUM_CELL_SIZE_METRES = 16;

interface LotusCandidate {
  readonly placementBody: SeedWorldLakeShorePlacementBodyV1;
  readonly normalizedPosition: SeedWorldPoint;
  readonly worldX: number;
  readonly worldZ: number;
  readonly row: number;
  readonly column: number;
  readonly sampleIndex: number;
  readonly anchorNoise: number;
  readonly patchNoise: number;
  readonly roadBoundaryDistanceMetres: number;
  readonly spawnBoundaryDistanceMetres: number;
  readonly prototypeFamily: SeedWorldLotusInstance["prototypeFamily"];
  readonly scale: number;
  readonly footprintMetres: SeedWorldLotusInstance["footprintMetres"];
  readonly yawRadians: number;
  readonly waterDepthMetres: number;
  readonly shoreDistanceMetres: number;
}

interface LotusPatchEnvelope {
  readonly requestedAreaSquareMetres: number;
  readonly achievedAreaSquareMetres: number;
  readonly radiusMetres: number;
  readonly maximumShoreDistanceMetres: number;
  readonly maximumWaterDepthMetres: number;
}

interface AcceptedLotusCandidate {
  readonly candidate: LotusCandidate;
  readonly patch: LotusPatchEnvelope;
}

interface ExistingDecorationFootprint {
  readonly position: SeedWorldPoint;
  readonly radiusMetres: number;
}

interface ExistingDecorationFootprintIndex {
  readonly rows: ReadonlyMap<number, ReadonlyMap<number, readonly ExistingDecorationFootprint[]>>;
  readonly cellSizeNormalized: number;
  readonly maximumRadiusMetres: number;
}

interface AnchoredLotusCandidate {
  readonly candidate: LotusCandidate;
  readonly anchorDistanceMetres: number;
}

/**
 * Compiles deterministic lotus patches only from Artifact-proven Lake shoreline support.
 * Missing Lake descriptors deliberately produce zero lotus; no legacy water mask or Ocean fallback exists.
 */
export function compileSeedWorldLakeFloraDecorations(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  hydrologyWaterBodies: readonly SeedWorldHydrologyWaterBody[] | undefined,
  lakePlacementBodies: readonly SeedWorldLakeShorePlacementBodyV1[] | undefined,
  occupiedDecorations: readonly SeedWorldFeatureDecorationInstance[]
): readonly SeedWorldLotusInstance[] {
  if (!hydrologyWaterBodies || !lakePlacementBodies || lakePlacementBodies.length === 0) return Object.freeze([]);
  if (plan.rootSeed !== fields.rootSeed || plan.sizeMetres !== fields.sizeMetres) {
    throw new RangeError("Seed World Lake flora requires Plan and WorldFields from the same world");
  }
  const bodyById = new Map(hydrologyWaterBodies.map((body) => [body.id, body]));
  const occupiedFootprintIndex = createExistingDecorationFootprintIndex(occupiedDecorations, plan.sizeMetres);
  const accepted: AcceptedLotusCandidate[] = [];
  for (const placementBody of [...lakePlacementBodies].sort((left, right) =>
    left.bodySourceHash.localeCompare(right.bodySourceHash)
  )) {
    const body = bodyById.get(placementBody.basinId);
    if (!body) throw new Error(`Lake flora body '${placementBody.basinId}' has no planned Hydrology geometry.`);
    validateLakePlacementBody(fields, body, placementBody);
    const requestedPatchAreaSquareMetres = body.areaSquareMetres * SEED_WORLD_LAKE_FLORA_RULE.patchAreaRatio;
    const candidates = compileCandidates(plan, fields, body, placementBody, occupiedFootprintIndex);
    if (candidates.length === 0) continue;
    const preferredAnchorCandidates = candidates.filter(
      (candidate) =>
        candidate.shoreDistanceMetres <= SEED_WORLD_LAKE_FLORA_RULE.preferredMaximumShoreDistanceMetres &&
        candidate.waterDepthMetres <= SEED_WORLD_LAKE_FLORA_RULE.preferredMaximumWaterDepthMetres
    );
    const patchAnchor = selectPatchAnchor(
      plan,
      preferredAnchorCandidates.length > 0 ? preferredAnchorCandidates : candidates
    );
    const anchoredCandidates = candidates.map((candidate) => ({
      candidate,
      anchorDistanceMetres: candidateDistance(candidate, patchAnchor)
    }));
    const patch = resolvePatchEnvelope(plan, body, anchoredCandidates, requestedPatchAreaSquareMetres);
    const countAreaSquareMetres = Math.min(patch.requestedAreaSquareMetres, patch.achievedAreaSquareMetres);
    const targetCount = clamp(
      Math.round(countAreaSquareMetres / SEED_WORLD_LAKE_FLORA_RULE.areaPerPatchInstanceSquareMetres),
      SEED_WORLD_LAKE_FLORA_RULE.minimumPerLake,
      SEED_WORLD_LAKE_FLORA_RULE.maximumPerLake
    );
    const adaptiveSpacingMetres = Math.max(
      SEED_WORLD_LAKE_FLORA_RULE.minimumSpacingMetres,
      Math.sqrt(countAreaSquareMetres / Math.max(targetCount, 1))
    );
    const rankedPatchCandidates = anchoredCandidates
      .filter((anchored) => candidateIsInsidePatchEnvelope(anchored, patch))
      .map((anchored) => ({
        ...anchored,
        patchScore: patchCandidateScore(anchored.candidate, anchored.anchorDistanceMetres, patch.radiusMetres)
      }))
      .sort(
        (left, right) =>
          right.patchScore - left.patchScore ||
          left.candidate.row - right.candidate.row ||
          left.candidate.column - right.candidate.column ||
          left.candidate.sampleIndex - right.candidate.sampleIndex
      )
      .map((ranked) => ranked.candidate);
    const acceptedCandidateKeys = new Set<string>();
    let acceptedForBody = 0;
    for (const minimumSpacingMetres of [adaptiveSpacingMetres, SEED_WORLD_LAKE_FLORA_RULE.minimumSpacingMetres]) {
      for (const candidate of rankedPatchCandidates) {
        if (acceptedForBody >= targetCount || accepted.length >= SEED_WORLD_LAKE_FLORA_RULE.maximumWorldCount) {
          break;
        }
        const key = `${candidate.row}:${candidate.column}:${candidate.sampleIndex}`;
        if (acceptedCandidateKeys.has(key)) continue;
        if (candidateOverlapsAccepted(candidate, accepted, minimumSpacingMetres)) continue;
        accepted.push({ candidate, patch });
        acceptedCandidateKeys.add(key);
        acceptedForBody++;
      }
      if (acceptedForBody >= targetCount || accepted.length >= SEED_WORLD_LAKE_FLORA_RULE.maximumWorldCount) {
        break;
      }
    }
    if (accepted.length >= SEED_WORLD_LAKE_FLORA_RULE.maximumWorldCount) break;
  }
  return Object.freeze(
    accepted
      .map(({ candidate, patch }, ordinal) =>
        Object.freeze({
          id: `lotus:${candidate.placementBody.bodySourceHash.slice(0, 16)}:${candidate.row}:${candidate.column}:${candidate.sampleIndex}`,
          category: "lotus" as const,
          sourceKind: "lake-shore" as const,
          sourceFeatureId: candidate.placementBody.basinId,
          bodySourceHash: candidate.placementBody.bodySourceHash,
          ordinal,
          normalizedPosition: candidate.normalizedPosition,
          prototypeFamily: candidate.prototypeFamily,
          scale: Object.freeze([candidate.scale, candidate.scale, candidate.scale] as const),
          footprintMetres: candidate.footprintMetres,
          yawRadians: candidate.yawRadians,
          waterLevelMetres: candidate.placementBody.waterLevelMetres,
          waterDepthMetres: candidate.waterDepthMetres,
          shoreDistanceMetres: candidate.shoreDistanceMetres,
          requestedPatchAreaSquareMetres: patch.requestedAreaSquareMetres,
          requestedPatchAreaRatio: SEED_WORLD_LAKE_FLORA_RULE.patchAreaRatio,
          achievedPatchAreaSquareMetres: patch.achievedAreaSquareMetres,
          achievedPatchAreaRatio:
            patch.achievedAreaSquareMetres / bodyById.get(candidate.placementBody.basinId)!.areaSquareMetres,
          patchRadiusMetres: patch.radiusMetres,
          patchMaximumShoreDistanceMetres: patch.maximumShoreDistanceMetres,
          patchMaximumWaterDepthMetres: patch.maximumWaterDepthMetres,
          surfaceOffsetMetres: SEED_WORLD_LAKE_FLORA_RULE.surfaceOffsetMetres
        } satisfies SeedWorldLotusInstance)
      )
      .sort((left, right) => left.id.localeCompare(right.id))
  );
}

function validateLakePlacementBody(
  fields: SeedWorldFields,
  body: SeedWorldHydrologyWaterBody,
  placementBody: SeedWorldLakeShorePlacementBodyV1
): void {
  if (
    body.geometryHash !== fields.hydrologyGeometryHash ||
    placementBody.schemaVersion !== 1 ||
    placementBody.resolution !== body.resolution ||
    placementBody.eligibleMask.length !== body.resolution ** 2 ||
    body.wetMask.length !== body.resolution ** 2 ||
    body.signedDistanceMetres.length !== body.resolution ** 2 ||
    Math.abs(placementBody.waterLevelMetres - body.waterLevelMetres) > 0.001
  ) {
    throw new Error(`Lake flora body '${body.id}' differs from its Artifact authority.`);
  }
}

function compileCandidates(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  body: SeedWorldHydrologyWaterBody,
  placementBody: SeedWorldLakeShorePlacementBodyV1,
  occupiedFootprintIndex: ExistingDecorationFootprintIndex
): readonly LotusCandidate[] {
  const rule = SEED_WORLD_LAKE_FLORA_RULE;
  const cellMetres = plan.sizeMetres / body.resolution;
  const featureSeed = deriveSeedWorldNamedSeed(plan.generationStreams.decor, `lotus:${placementBody.bodySourceHash}`);
  const candidates: LotusCandidate[] = [];
  for (let row = 1; row < body.resolution - 1; row++) {
    for (let column = 1; column < body.resolution - 1; column++) {
      const cell = row * body.resolution + column;
      if (placementBody.eligibleMask[cell] === 0 || body.wetMask[cell] === 0) continue;
      const cellShoreDistanceMetres = -body.signedDistanceMetres[cell]!;
      const jitterMarginMetres = cellMetres * Math.SQRT1_2;
      if (
        cellShoreDistanceMetres < rule.minimumShoreDistanceMetres - jitterMarginMetres ||
        cellShoreDistanceMetres > rule.maximumShoreDistanceMetres + jitterMarginMetres
      ) {
        continue;
      }
      for (let sampleIndex = 0; sampleIndex < rule.candidatesPerCell; sampleIndex++) {
        const candidateSeed = deriveSeedWorldNamedSeed(featureSeed, `cell:${column}:${row}:sample:${sampleIndex}`);
        const worldX =
          -plan.sizeMetres * 0.5 + (column + 0.5 + signedUnit(candidateSeed, "jitter-x") * 0.45) * cellMetres;
        const worldZ = -plan.sizeMetres * 0.5 + (row + 0.5 + signedUnit(candidateSeed, "jitter-z") * 0.45) * cellMetres;
        const normalizedPosition = Object.freeze({
          x: worldX / plan.sizeMetres + 0.5,
          y: worldZ / plan.sizeMetres + 0.5
        });
        const shoreDistanceMetres = -sampleBodySignedDistance(body, normalizedPosition);
        if (
          shoreDistanceMetres < rule.minimumShoreDistanceMetres ||
          shoreDistanceMetres > rule.maximumShoreDistanceMetres
        ) {
          continue;
        }
        const terrainHeight = sampleSeedWorldHeight(fields, worldX, worldZ);
        if (terrainHeight === undefined) continue;
        const waterDepthMetres = placementBody.waterLevelMetres - terrainHeight;
        if (waterDepthMetres < rule.minimumWaterDepthMetres || waterDepthMetres > rule.maximumWaterDepthMetres) {
          continue;
        }
        if (
          plan.pois.some(
            (poi) => distanceToPoint(poi.position, normalizedPosition, plan.sizeMetres) < rule.poiClearanceMetres
          )
        ) {
          continue;
        }

        const prototypeFamily = lotusVariant(unitFloat(candidateSeed, "variant"));
        const scale = mix(rule.scaleRange[0], rule.scaleRange[1], unitFloat(candidateSeed, "scale"));
        const footprintMetres = scaledFootprint(prototypeFamily, scale);
        const yawRadians = unitFloat(candidateSeed, "yaw") * Math.PI * 2;
        if (!footprintIsEligible(placementBody, normalizedPosition, footprintMetres, yawRadians, plan.sizeMetres)) {
          continue;
        }
        const footprint = orientedFootprint(worldX, worldZ, footprintMetres, yawRadians);
        const roadBoundaryDistanceMetres = seedWorldRoadToOrientedBoxSignedDistanceMetres(
          plan,
          footprint,
          Math.max(rule.roadBoundaryClearanceMetres, rule.roadInfluenceDistanceMetres)
        );
        if (roadBoundaryDistanceMetres < rule.roadBoundaryClearanceMetres) continue;
        if (
          pointToOrientedBoxDistance(plan.spawnReserve.center, plan.sizeMetres, footprint) <
          plan.spawnReserve.protectedRadiusMetres
        ) {
          continue;
        }
        if (overlapsExistingDecoration(normalizedPosition, footprintMetres, occupiedFootprintIndex, plan.sizeMetres)) {
          continue;
        }
        candidates.push({
          placementBody,
          normalizedPosition,
          worldX,
          worldZ,
          row,
          column,
          sampleIndex,
          anchorNoise: valueNoise(
            worldX / rule.anchorNoiseScaleMetres,
            worldZ / rule.anchorNoiseScaleMetres,
            featureSeed
          ),
          patchNoise: valueNoise(worldX / rule.patchNoiseScaleMetres, worldZ / rule.patchNoiseScaleMetres, featureSeed),
          roadBoundaryDistanceMetres,
          spawnBoundaryDistanceMetres: Math.max(
            0,
            distanceToPoint(plan.spawnReserve.center, normalizedPosition, plan.sizeMetres) -
              plan.spawnReserve.protectedRadiusMetres
          ),
          prototypeFamily,
          scale,
          footprintMetres,
          yawRadians,
          waterDepthMetres,
          shoreDistanceMetres
        });
      }
    }
  }
  return candidates;
}

function selectPatchAnchor(plan: SeedWorldPlan, candidates: readonly LotusCandidate[]): LotusCandidate {
  const hasSpawnTarget = plan.spawnReserve.protectedRadiusMetres > 0;
  const hasRoadTarget = plan.roads.some((road) => road.points.length >= 2);
  let selected = candidates[0]!;
  let selectedScore = patchAnchorScore(selected, hasSpawnTarget, hasRoadTarget);
  for (let index = 1; index < candidates.length; index++) {
    const candidate = candidates[index]!;
    const candidateScore = patchAnchorScore(candidate, hasSpawnTarget, hasRoadTarget);
    if (candidateScore > selectedScore) {
      selected = candidate;
      selectedScore = candidateScore;
      continue;
    }
    if (candidateScore < selectedScore) continue;
    if (
      candidate.row < selected.row ||
      (candidate.row === selected.row && candidate.column < selected.column) ||
      (candidate.row === selected.row &&
        candidate.column === selected.column &&
        candidate.sampleIndex < selected.sampleIndex)
    ) {
      selected = candidate;
    }
  }
  return selected;
}

function patchAnchorScore(candidate: LotusCandidate, hasSpawnTarget: boolean, hasRoadTarget: boolean): number {
  const rule = SEED_WORLD_LAKE_FLORA_RULE;
  const spawnProximity = hasSpawnTarget
    ? proximityScore(candidate.spawnBoundaryDistanceMetres, rule.spawnInfluenceDistanceMetres)
    : 0;
  const roadProximity = hasRoadTarget
    ? proximityScore(candidate.roadBoundaryDistanceMetres, rule.roadInfluenceDistanceMetres)
    : 0;
  return (
    spawnProximity * rule.anchorSpawnWeight +
    roadProximity * rule.anchorRoadWeight +
    candidate.anchorNoise * rule.anchorSeedWeight
  );
}

function patchCandidateScore(
  candidate: LotusCandidate,
  anchorDistanceMetres: number,
  maximumPatchRadiusMetres: number
): number {
  const radialScore = 1 - clamp(anchorDistanceMetres / maximumPatchRadiusMetres, 0, 1);
  return (
    radialScore * SEED_WORLD_LAKE_FLORA_RULE.patchRadialWeight +
    candidate.patchNoise * SEED_WORLD_LAKE_FLORA_RULE.patchSeedWeight
  );
}

function resolvePatchEnvelope(
  plan: SeedWorldPlan,
  body: SeedWorldHydrologyWaterBody,
  anchoredCandidates: readonly AnchoredLotusCandidate[],
  requestedAreaSquareMetres: number
): LotusPatchEnvelope {
  const rule = SEED_WORLD_LAKE_FLORA_RULE;
  const baseRadiusMetres = clamp(
    Math.sqrt(requestedAreaSquareMetres / Math.PI),
    rule.minimumPatchRadiusMetres,
    rule.maximumBasePatchRadiusMetres
  );
  const sampleAreaSquareMetres = (plan.sizeMetres / body.resolution) ** 2 / rule.candidatesPerCell;
  let fallback = createPatchEnvelope(
    requestedAreaSquareMetres,
    baseRadiusMetres,
    rule.maximumShoreDistanceMetres,
    rule.maximumWaterDepthMetres,
    0
  );
  for (const expansion of rule.patchExpansionMultipliers) {
    const radiusMetres = baseRadiusMetres * expansion;
    const preferredAreaSquareMetres = estimatePatchAreaSquareMetres(
      anchoredCandidates,
      radiusMetres,
      rule.preferredMaximumShoreDistanceMetres,
      rule.preferredMaximumWaterDepthMetres,
      sampleAreaSquareMetres
    );
    if (preferredAreaSquareMetres >= requestedAreaSquareMetres) {
      return createPatchEnvelope(
        requestedAreaSquareMetres,
        radiusMetres,
        rule.preferredMaximumShoreDistanceMetres,
        rule.preferredMaximumWaterDepthMetres,
        preferredAreaSquareMetres
      );
    }
    const maximumAreaSquareMetres = estimatePatchAreaSquareMetres(
      anchoredCandidates,
      radiusMetres,
      rule.maximumShoreDistanceMetres,
      rule.maximumWaterDepthMetres,
      sampleAreaSquareMetres
    );
    fallback = createPatchEnvelope(
      requestedAreaSquareMetres,
      radiusMetres,
      rule.maximumShoreDistanceMetres,
      rule.maximumWaterDepthMetres,
      maximumAreaSquareMetres
    );
    if (maximumAreaSquareMetres < requestedAreaSquareMetres) continue;

    let lower = 0;
    let upper = 1;
    let achievedAreaSquareMetres = maximumAreaSquareMetres;
    for (let iteration = 0; iteration < 16; iteration++) {
      const amount = (lower + upper) * 0.5;
      const maximumShoreDistanceMetres = mix(
        rule.preferredMaximumShoreDistanceMetres,
        rule.maximumShoreDistanceMetres,
        amount
      );
      const maximumWaterDepthMetres = mix(rule.preferredMaximumWaterDepthMetres, rule.maximumWaterDepthMetres, amount);
      const areaSquareMetres = estimatePatchAreaSquareMetres(
        anchoredCandidates,
        radiusMetres,
        maximumShoreDistanceMetres,
        maximumWaterDepthMetres,
        sampleAreaSquareMetres
      );
      if (areaSquareMetres >= requestedAreaSquareMetres) {
        upper = amount;
        achievedAreaSquareMetres = areaSquareMetres;
      } else {
        lower = amount;
      }
    }
    return createPatchEnvelope(
      requestedAreaSquareMetres,
      radiusMetres,
      mix(rule.preferredMaximumShoreDistanceMetres, rule.maximumShoreDistanceMetres, upper),
      mix(rule.preferredMaximumWaterDepthMetres, rule.maximumWaterDepthMetres, upper),
      achievedAreaSquareMetres
    );
  }
  return fallback;
}

function createPatchEnvelope(
  requestedAreaSquareMetres: number,
  radiusMetres: number,
  maximumShoreDistanceMetres: number,
  maximumWaterDepthMetres: number,
  achievedAreaSquareMetres: number
): LotusPatchEnvelope {
  return {
    requestedAreaSquareMetres,
    achievedAreaSquareMetres,
    radiusMetres,
    maximumShoreDistanceMetres,
    maximumWaterDepthMetres
  };
}

function estimatePatchAreaSquareMetres(
  anchoredCandidates: readonly AnchoredLotusCandidate[],
  radiusMetres: number,
  maximumShoreDistanceMetres: number,
  maximumWaterDepthMetres: number,
  sampleAreaSquareMetres: number
): number {
  let validSampleCount = 0;
  for (const { candidate, anchorDistanceMetres } of anchoredCandidates) {
    if (
      anchorDistanceMetres <= radiusMetres &&
      candidate.shoreDistanceMetres <= maximumShoreDistanceMetres &&
      candidate.waterDepthMetres <= maximumWaterDepthMetres
    ) {
      validSampleCount++;
    }
  }
  return validSampleCount * sampleAreaSquareMetres;
}

function candidateIsInsidePatchEnvelope(anchored: AnchoredLotusCandidate, patch: LotusPatchEnvelope): boolean {
  const { candidate, anchorDistanceMetres } = anchored;
  return (
    anchorDistanceMetres <= patch.radiusMetres &&
    candidate.shoreDistanceMetres <= patch.maximumShoreDistanceMetres &&
    candidate.waterDepthMetres <= patch.maximumWaterDepthMetres
  );
}

function candidateDistance(left: LotusCandidate, right: LotusCandidate): number {
  return Math.hypot(left.worldX - right.worldX, left.worldZ - right.worldZ);
}

function proximityScore(distanceMetres: number, influenceDistanceMetres: number): number {
  if (!Number.isFinite(distanceMetres)) return 0;
  return 1 - clamp(distanceMetres / influenceDistanceMetres, 0, 1);
}

function footprintIsEligible(
  placementBody: SeedWorldLakeShorePlacementBodyV1,
  center: SeedWorldPoint,
  footprint: readonly [number, number],
  yawRadians: number,
  worldSizeMetres: number
): boolean {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  const halfWidth = footprint[0] * 0.5;
  const halfDepth = footprint[1] * 0.5;
  const samples = [
    [0, 0],
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
    [0, -halfDepth],
    [halfWidth, 0],
    [0, halfDepth],
    [-halfWidth, 0]
  ] as const;
  return samples.every(([localX, localZ]) => {
    const worldOffsetX = localX * cosine - localZ * sine;
    const worldOffsetZ = localX * sine + localZ * cosine;
    const point = {
      x: center.x + worldOffsetX / worldSizeMetres,
      y: center.y + worldOffsetZ / worldSizeMetres
    };
    return sampleMask(placementBody, point) !== 0;
  });
}

function overlapsExistingDecoration(
  position: SeedWorldPoint,
  footprint: readonly [number, number],
  occupiedFootprintIndex: ExistingDecorationFootprintIndex,
  worldSizeMetres: number
): boolean {
  const radius = Math.hypot(footprint[0], footprint[1]) * 0.5;
  const maximumSearchDistanceNormalized =
    (radius +
      occupiedFootprintIndex.maximumRadiusMetres +
      SEED_WORLD_LAKE_FLORA_RULE.existingDecorationClearanceMetres) /
    worldSizeMetres;
  const minimumColumn = Math.floor(
    (position.x - maximumSearchDistanceNormalized) / occupiedFootprintIndex.cellSizeNormalized
  );
  const maximumColumn = Math.floor(
    (position.x + maximumSearchDistanceNormalized) / occupiedFootprintIndex.cellSizeNormalized
  );
  const minimumRow = Math.floor(
    (position.y - maximumSearchDistanceNormalized) / occupiedFootprintIndex.cellSizeNormalized
  );
  const maximumRow = Math.floor(
    (position.y + maximumSearchDistanceNormalized) / occupiedFootprintIndex.cellSizeNormalized
  );
  for (let row = minimumRow; row <= maximumRow; row++) {
    const columns = occupiedFootprintIndex.rows.get(row);
    if (!columns) continue;
    for (let column = minimumColumn; column <= maximumColumn; column++) {
      const occupiedFootprints = columns.get(column);
      if (!occupiedFootprints) continue;
      for (const occupied of occupiedFootprints) {
        if (
          distanceToPoint(position, occupied.position, worldSizeMetres) <
          radius + occupied.radiusMetres + SEED_WORLD_LAKE_FLORA_RULE.existingDecorationClearanceMetres
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function createExistingDecorationFootprintIndex(
  occupiedDecorations: readonly SeedWorldFeatureDecorationInstance[],
  worldSizeMetres: number
): ExistingDecorationFootprintIndex {
  const footprints = occupiedDecorations.map((decoration) => ({
    position: decoration.normalizedPosition,
    radiusMetres: Math.hypot(decoration.footprintMetres[0], decoration.footprintMetres[1]) * 0.5
  }));
  const maximumRadiusMetres = footprints.reduce((maximum, footprint) => Math.max(maximum, footprint.radiusMetres), 0);
  const cellSizeMetres = Math.max(EXISTING_DECORATION_INDEX_MINIMUM_CELL_SIZE_METRES, maximumRadiusMetres * 2);
  const cellSizeNormalized = cellSizeMetres / worldSizeMetres;
  const rows = new Map<number, Map<number, ExistingDecorationFootprint[]>>();
  for (const footprint of footprints) {
    const row = Math.floor(footprint.position.y / cellSizeNormalized);
    const column = Math.floor(footprint.position.x / cellSizeNormalized);
    let columns = rows.get(row);
    if (!columns) {
      columns = new Map();
      rows.set(row, columns);
    }
    let cell = columns.get(column);
    if (!cell) {
      cell = [];
      columns.set(column, cell);
    }
    cell.push(footprint);
  }
  return { rows, cellSizeNormalized, maximumRadiusMetres };
}

function candidateOverlapsAccepted(
  candidate: LotusCandidate,
  accepted: readonly AcceptedLotusCandidate[],
  minimumSpacingMetres: number
): boolean {
  return accepted.some(
    ({ candidate: other }) =>
      Math.hypot(candidate.worldX - other.worldX, candidate.worldZ - other.worldZ) < minimumSpacingMetres
  );
}

function lotusVariant(rank: number): SeedWorldLotusInstance["prototypeFamily"] {
  const weights = SEED_WORLD_LAKE_FLORA_RULE.variantSelectionWeights;
  if (rank < weights.lotus) return "lotus";
  if (rank < weights.lotus + weights["lotus-group-1"]) return "lotus-group-1";
  return "lotus-group-2";
}

function orientedFootprint(
  worldX: number,
  worldZ: number,
  footprintMetres: readonly [number, number],
  yawRadians: number
): SeedWorldOrientedBox {
  return {
    centerX: worldX,
    centerZ: worldZ,
    halfWidth: footprintMetres[0] * 0.5,
    halfDepth: footprintMetres[1] * 0.5,
    yawRadians
  };
}

function pointToOrientedBoxDistance(point: SeedWorldPoint, worldSizeMetres: number, box: SeedWorldOrientedBox): number {
  const offsetX = (point.x - 0.5) * worldSizeMetres - box.centerX;
  const offsetZ = (point.y - 0.5) * worldSizeMetres - box.centerZ;
  const cosine = Math.cos(box.yawRadians);
  const sine = Math.sin(box.yawRadians);
  const localX = offsetX * cosine + offsetZ * sine;
  const localZ = -offsetX * sine + offsetZ * cosine;
  return Math.hypot(Math.max(Math.abs(localX) - box.halfWidth, 0), Math.max(Math.abs(localZ) - box.halfDepth, 0));
}

function scaledFootprint(
  family: SeedWorldLotusInstance["prototypeFamily"],
  scale: number
): SeedWorldLotusInstance["footprintMetres"] {
  const authored = family === "lotus" ? ([0.7, 0.7] as const) : ([3.55, 2.65] as const);
  return Object.freeze([authored[0] * scale, authored[1] * scale]);
}

function sampleBodySignedDistance(body: SeedWorldHydrologyWaterBody, position: SeedWorldPoint): number {
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

function sampleMask(body: SeedWorldLakeShorePlacementBodyV1, position: SeedWorldPoint): number {
  if (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) return 0;
  const column = Math.min(body.resolution - 1, Math.floor(position.x * body.resolution));
  const row = Math.min(body.resolution - 1, Math.floor(position.y * body.resolution));
  return body.eligibleMask[row * body.resolution + column]!;
}

function distanceToPoint(left: SeedWorldPoint, right: SeedWorldPoint, worldSizeMetres: number): number {
  return Math.hypot(left.x - right.x, left.y - right.y) * worldSizeMetres;
}

function signedUnit(seed: number, namespace: string): number {
  return unitFloat(seed, namespace) * 2 - 1;
}

function unitFloat(seed: number, namespace: string): number {
  return deriveSeedWorldNamedSeed(seed, namespace) / 0x1_0000_0000;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = quintic(x - x0);
  const ty = quintic(y - y0);
  return mix(
    mix(latticeNoise(x0, y0, seed), latticeNoise(x0 + 1, y0, seed), tx),
    mix(latticeNoise(x0, y0 + 1, seed), latticeNoise(x0 + 1, y0 + 1, seed), tx),
    ty
  );
}

function latticeNoise(x: number, y: number, seed: number): number {
  let value = (x * 0x1f12_3bb5) ^ (y * 0x5f35_6495) ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x45d9_f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9_f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffff_ffff;
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
