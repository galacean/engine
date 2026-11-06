import { sampleSeedWorldHeight, type SeedWorldFields } from "./SeedWorldFields.ts";
import {
  SEED_WORLD_CANYON_BANK_PAIR_MAXIMUM_GUIDE_DELTA,
  sampleSeedWorldGeologyCurve,
  type SeedWorldGeologyCanyon,
  type SeedWorldGeologyHill,
  type SeedWorldGeologyLayout
} from "./SeedWorldGeologyLayout.ts";

/** Stable local frame derived from final terrain and layout-owned geological directions. */
export interface SeedWorldRockSurfaceFrame {
  /** Direction from the crest down the selected shoulder, clockwise from positive world Z. */
  readonly downhillBearingRadians: number;
  /** Direction in which a cliff asset rises toward the crest. */
  readonly uphillBearingRadians: number;
  /** Signed direction along the shoulder used for front/back assembly offsets. */
  readonly shoulderTangentBearingRadians: number;
  /** Unit final-Heightmap normal at the selected shoulder socket. */
  readonly surfaceNormal: readonly [x: number, y: number, z: number];
  /** Maximum sampled slope between the crest and shoulder foot. */
  readonly maximumSlopeDegrees: number;
  /** Source of the downhill constraint selected by the rock compiler. */
  readonly source: "canyon-exterior" | "terrain-gradient";
  /** Owning canyon whose guide produced this final-terrain bank target. */
  readonly canyonId?: string;
  /** Directed bank side scanned from the ordered canyon guide. */
  readonly bankSide?: "left" | "right";
  /** Normalized location on the ordered canyon centreline. */
  readonly canyonGuideParameter?: number;
  /** Nearest canyon centreline point retained only to delimit the owning bank half-plane. */
  readonly canyonAnchor?: readonly [x: number, z: number];
  /** Physical distance from the canyon centreline to the bank edge. */
  readonly canyonHalfWidthMetres?: number;
  /** Direction from the canyon centreline toward the owning terrain crest. */
  readonly canyonOutwardBearingRadians?: number;
}

/** One merged final-terrain convexity and its mandatory rock-bearing shoulder. */
export interface SeedWorldRockCoverageTarget {
  /** Stable identity derived from the merged convexity. */
  readonly id: string;
  /** Terrain hill identities contributing the same final summit basin, when hill-derived. */
  readonly sourceHillIds: readonly string[];
  /** Final world-space crest position. */
  readonly crest: readonly [x: number, y: number, z: number];
  /** Final world-space foot of the selected shoulder. */
  readonly shoulderFoot: readonly [x: number, y: number, z: number];
  /** Crest height minus selected shoulder-foot height. */
  readonly prominenceMetres: number;
  /** Searchable distance along the downhill axis. */
  readonly shoulderSpanMetres: number;
  /** Searchable distance along the signed shoulder tangent. */
  readonly tangentSpanMetres: number;
  /** Diameter of the broadest layout-owned influence supporting this final convexity. */
  readonly regionalInfluenceSpanMetres: number;
  /** Complete physical shoulder owned by layout analysis before any asset fitting. */
  readonly rockPlanShoulder: SeedWorldRockPlanShoulder;
  /** Terrain frame used later by asset-neutral OBB assembly solving. */
  readonly frame: SeedWorldRockSurfaceFrame;
}

/** Complete physical shoulder shape consumed by asset fitting and global coverage policy. */
export interface SeedWorldRockPlanShoulder {
  /** Crest-relative plan offsets sampled across the complete physical shoulder. */
  readonly sampleOffsets: readonly (readonly [x: number, z: number])[];
  readonly minimumDownhillProjectionMetres: number;
  readonly maximumDownhillProjectionMetres: number;
  readonly minimumTangentProjectionMetres: number;
  readonly maximumTangentProjectionMetres: number;
}

/** Evidence that two layout hills do or do not represent one final summit basin. */
export interface SeedWorldRockConvexityRelation {
  /** First stable terrain hill identity. */
  readonly firstHillId: string;
  /** Second stable terrain hill identity. */
  readonly secondHillId: string;
  /** Final summit separation divided by the smaller body-minor radius. */
  readonly normalizedPeakSeparation: number;
  /** Saddle height retained between the two final summits. */
  readonly saddleRetention: number;
  /** Whether the two sources collapse into one coverage target. */
  readonly sameConvexity: boolean;
}

/** Final-terrain targets which inherit one layout-owned opposing canyon-bank pair. */
export interface SeedWorldRockCanyonPair {
  /** Stable layout pair identity. */
  readonly id: string;
  /** Ordered canyon guide shared by both targets. */
  readonly canyonId: string;
  /** Layout-authored cross-section parameter. */
  readonly guideParameter: number;
  /** Left physical hill position on the ordered canyon guide. */
  readonly leftGuideParameter: number;
  /** Right physical hill position on the ordered canyon guide. */
  readonly rightGuideParameter: number;
  /** Final convexity on the left bank. */
  readonly leftTargetId: string;
  /** Final convexity on the right bank. */
  readonly rightTargetId: string;
  /** Layout-owned pointed-end direction for the left composition. */
  readonly leftUphillBearingRadians: number;
  /** Layout-owned pointed-end direction for the right composition. */
  readonly rightUphillBearingRadians: number;
}

/** Complete terrain-only input interpretation owned by the rock compiler. */
export interface SeedWorldRockTerrainAnalysis {
  /** Immutable rock-bearing convexities in stable identity order. */
  readonly targets: readonly SeedWorldRockCoverageTarget[];
  /** All final-terrain convexities before the rock-need gate, retained for quantitative diagnostics. */
  readonly candidates?: readonly SeedWorldRockCoverageTarget[];
  /** Pairwise evidence used to deduplicate hills without losing distinct convexities. */
  readonly relations: readonly SeedWorldRockConvexityRelation[];
  /** Opposing canyon-bank targets inherited from the layout before asset fitting. */
  readonly canyonPairs: readonly SeedWorldRockCanyonPair[];
}

interface MeasuredHill {
  readonly hill: SeedWorldGeologyHill;
  readonly crest: Readonly<{ x: number; y: number; z: number }>;
  readonly shoulder: MeasuredShoulder;
  readonly canyonRelation?: MeasuredCanyonRelation;
}

interface MeasuredCanyonRelation {
  readonly canyon: SeedWorldGeologyCanyon;
  readonly side: "left" | "right";
  readonly guideParameter: number;
  readonly anchor: Readonly<{ x: number; z: number }>;
}

interface MeasuredShoulder {
  readonly foot: Readonly<{ x: number; y: number; z: number }>;
  readonly downhillBearingRadians: number;
  readonly shoulderTangentBearingRadians: number;
  readonly maximumSlopeDegrees: number;
  readonly surfaceNormal: readonly [x: number, y: number, z: number];
  readonly spanMetres: number;
  readonly source: "canyon-exterior" | "terrain-gradient";
  readonly canyon?: SeedWorldGeologyCanyon;
}

const PEAK_SEARCH_RING_RATIOS = Object.freeze([0, 0.07, 0.14, 0.21] as const);
const PEAK_SEARCH_ORDINALS = 24;
const SHOULDER_DIRECTION_ORDINALS = 32;
const SHOULDER_PROFILE_SAMPLES = 13;
const CANYON_DIRECTION_LIMIT_RADIANS = Math.PI / 3;
const CANYON_NEAREST_SEGMENTS = 64;
const MAXIMUM_DUPLICATE_PEAK_SEPARATION_RATIO = 0.45;
const MINIMUM_DUPLICATE_SADDLE_RETENTION = 0.6;
const MINIMUM_ROCK_PROMINENCE_SPAN_RATIO = 0.16;
const MINIMUM_ROCK_SHOULDER_SLOPE_DEGREES = 17;
const MINIMUM_CANYON_BANK_EXTERIOR_WIDTH_RATIO = 0.14;
const MINIMUM_DISTINCT_ROCK_CREST_SEPARATION_METRES = 16;

/**
 * Detects final-terrain convexities and selects one exterior shoulder for every merged summit.
 * @param layout Pure terrain topology and hill contribution data.
 * @param fields Final post-Hydrology Heightmap sampled by the runtime terrain.
 * @returns Immutable coverage targets and hill-deduplication evidence.
 * @throws {RangeError} When inputs describe different world extents.
 */
export function analyzeSeedWorldRockTerrain(
  layout: SeedWorldGeologyLayout,
  fields: SeedWorldFields
): SeedWorldRockTerrainAnalysis {
  validateInputs(layout, fields);
  const measured = layout.hills.map((hill) => measureHill(layout, fields, hill));
  const relations = measureRelations(fields, measured);
  const groups = groupDuplicateSummits(measured, relations);
  const rawCandidates = groups
    .map((group) => makeCoverageTarget(fields, group, measured))
    .sort((left, right) => left.id.localeCompare(right.id));
  const canyonPairCandidates = resolveRockCanyonPairs(layout, rawCandidates);
  const selectedTargets = selectCoverageTargets(rawCandidates, canyonPairCandidates);
  const targets = attachPhysicalRockShoulders(selectedTargets);
  const selectedById = new Map(targets.map((target) => [target.id, target] as const));
  const selectedTargetIds = new Set(selectedById.keys());
  const canyonPairs = Object.freeze(
    canyonPairCandidates.filter(
      (pair) => selectedTargetIds.has(pair.leftTargetId) && selectedTargetIds.has(pair.rightTargetId)
    )
  );
  const candidates = rawCandidates.map((target) => selectedById.get(target.id) ?? target);
  return Object.freeze({
    targets: Object.freeze(targets),
    candidates: Object.freeze(candidates),
    relations: Object.freeze(relations),
    canyonPairs
  });
}

function attachPhysicalRockShoulders(
  targets: readonly SeedWorldRockCoverageTarget[]
): readonly SeedWorldRockCoverageTarget[] {
  return Object.freeze(
    targets.map((target) =>
      Object.freeze({
        ...target,
        rockPlanShoulder: makeRockPlanShoulder(target)
      })
    )
  );
}

function makeRockPlanShoulder(
  target: Pick<SeedWorldRockCoverageTarget, "shoulderSpanMetres" | "tangentSpanMetres" | "frame">
): SeedWorldRockPlanShoulder {
  const downhill = bearingVector(target.frame.downhillBearingRadians);
  const tangent = bearingVector(target.frame.shoulderTangentBearingRadians);
  const sampleOffsets = Object.freeze(
    ([0.04, 0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88] as const).flatMap((downhillRatio) => {
      const halfWidthRatio = 0.42 * Math.sqrt(Math.max(0, 1 - downhillRatio * downhillRatio));
      return ([-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1] as const).map((tangentRatio) =>
        Object.freeze([
          downhill[0] * target.shoulderSpanMetres * downhillRatio +
            tangent[0] * target.tangentSpanMetres * halfWidthRatio * tangentRatio,
          downhill[1] * target.shoulderSpanMetres * downhillRatio +
            tangent[1] * target.tangentSpanMetres * halfWidthRatio * tangentRatio
        ] as const)
      );
    })
  );
  const downhillProjections = sampleOffsets.map((offset) => offset[0] * downhill[0] + offset[1] * downhill[1]);
  const tangentProjections = sampleOffsets.map((offset) => offset[0] * tangent[0] + offset[1] * tangent[1]);
  return Object.freeze({
    sampleOffsets,
    minimumDownhillProjectionMetres: Math.min(...downhillProjections),
    maximumDownhillProjectionMetres: Math.max(...downhillProjections),
    minimumTangentProjectionMetres: Math.min(...tangentProjections),
    maximumTangentProjectionMetres: Math.max(...tangentProjections)
  });
}

function bearingVector(bearingRadians: number): readonly [x: number, z: number] {
  return Object.freeze([Math.sin(bearingRadians), Math.cos(bearingRadians)] as const);
}

function resolveRockCanyonPairs(
  layout: SeedWorldGeologyLayout,
  candidates: readonly SeedWorldRockCoverageTarget[]
): readonly SeedWorldRockCanyonPair[] {
  const targetByHillId = new Map(
    candidates.flatMap((target) => target.sourceHillIds.map((hillId) => [hillId, target] as const))
  );
  return Object.freeze(
    layout.canyonBankPairs.flatMap((pair) => {
      const left = targetByHillId.get(pair.leftHillId);
      const right = targetByHillId.get(pair.rightHillId);
      if (
        !left ||
        !right ||
        left.id === right.id ||
        left.frame.canyonId !== pair.canyonId ||
        left.frame.bankSide !== "left" ||
        right.frame.canyonId !== pair.canyonId ||
        right.frame.bankSide !== "right"
      )
        return [];
      return [
        Object.freeze({
          id: pair.id,
          canyonId: pair.canyonId,
          guideParameter: pair.guideParameter,
          leftGuideParameter: pair.leftGuideParameter,
          rightGuideParameter: pair.rightGuideParameter,
          leftTargetId: left.id,
          rightTargetId: right.id,
          leftUphillBearingRadians: pair.leftUphillBearingRadians,
          rightUphillBearingRadians: pair.rightUphillBearingRadians
        })
      ];
    })
  );
}

function selectCoverageTargets(
  candidates: readonly SeedWorldRockCoverageTarget[],
  canyonPairs: readonly SeedWorldRockCanyonPair[]
): readonly SeedWorldRockCoverageTarget[] {
  const mandatoryCanyonTargetIds = new Set(canyonPairs.flatMap((pair) => [pair.leftTargetId, pair.rightTargetId]));
  const mandatory = candidates
    .filter((target) => mandatoryCanyonTargetIds.has(target.id))
    .slice()
    .sort((left, right) => rockCoveragePriority(right) - rockCoveragePriority(left) || left.id.localeCompare(right.id));
  const retained: SeedWorldRockCoverageTarget[] = [];
  for (const target of mandatory) {
    // Two crests lying on each other's usable shoulder describe one physical coverage region,
    // even when separate canyon-guide identities happened to nominate both. Keeping both would
    // make the later OBB problem geometrically contradictory: either one assembly becomes tiny,
    // or the two hill-owned compositions penetrate. Terrain analysis therefore keeps the more
    // prominent owner and lets the remaining explicit canyon pairs describe the view relation.
    if (retained.some((owner) => targetsSharePhysicalShoulder(target, owner))) continue;
    retained.push(target);
  }
  const retainedMandatoryIds = new Set(retained.map((target) => target.id));
  const pairedRetainedIds = new Set(
    canyonPairs
      .filter((pair) => retainedMandatoryIds.has(pair.leftTargetId) && retainedMandatoryIds.has(pair.rightTargetId))
      .flatMap((pair) => [pair.leftTargetId, pair.rightTargetId])
  );
  for (let index = retained.length - 1; index >= 0; index--) {
    if (!pairedRetainedIds.has(retained[index]!.id)) retained.splice(index, 1);
  }
  const optional = candidates
    .filter((target) => !mandatoryCanyonTargetIds.has(target.id) && requiresRockCoverage(target))
    .slice()
    .sort((left, right) => rockCoveragePriority(right) - rockCoveragePriority(left) || left.id.localeCompare(right.id));
  for (const target of optional) {
    if (retained.some((owner) => targetCrestLiesOnShoulder(target, owner))) continue;
    retained.push(target);
  }
  const selectedIds = new Set(retained.map((target) => target.id));
  return Object.freeze(candidates.filter((target) => selectedIds.has(target.id)));
}

function targetsSharePhysicalShoulder(
  first: SeedWorldRockCoverageTarget,
  second: SeedWorldRockCoverageTarget
): boolean {
  return targetCrestLiesOnShoulder(first, second) && targetCrestLiesOnShoulder(second, first);
}

function targetCrestLiesOnShoulder(
  candidate: SeedWorldRockCoverageTarget,
  owner: SeedWorldRockCoverageTarget
): boolean {
  const downhill = bearingVector(owner.frame.downhillBearingRadians);
  const tangent = bearingVector(owner.frame.shoulderTangentBearingRadians);
  const deltaX = candidate.crest[0] - owner.crest[0];
  const deltaZ = candidate.crest[2] - owner.crest[2];
  const downhillRatio = (deltaX * downhill[0] + deltaZ * downhill[1]) / Math.max(1, owner.shoulderSpanMetres);
  const tangentRatio = (deltaX * tangent[0] + deltaZ * tangent[1]) / Math.max(1, owner.tangentSpanMetres);
  return downhillRatio >= -0.08 && downhillRatio <= 0.9 && Math.abs(tangentRatio) <= 0.44;
}

function rockCoveragePriority(target: SeedWorldRockCoverageTarget): number {
  return target.prominenceMetres * Math.sqrt(Math.max(1, target.tangentSpanMetres));
}

function requiresRockCoverage(target: SeedWorldRockCoverageTarget): boolean {
  const prominenceSpanRatio = target.prominenceMetres / Math.max(1, target.shoulderSpanMetres);
  return (
    prominenceSpanRatio >= MINIMUM_ROCK_PROMINENCE_SPAN_RATIO &&
    target.frame.maximumSlopeDegrees >= MINIMUM_ROCK_SHOULDER_SLOPE_DEGREES
  );
}

function measureHill(
  layout: SeedWorldGeologyLayout,
  fields: SeedWorldFields,
  hill: SeedWorldGeologyHill
): MeasuredHill {
  const crest = findLocalCrest(fields, hill);
  const canyonRelation = resolveCanyonRelation(layout, hill);
  const shoulder = selectShoulder(fields, hill, crest, canyonRelation);
  return Object.freeze({ hill, crest, shoulder, ...(canyonRelation ? { canyonRelation } : {}) });
}

function resolveCanyonRelation(
  layout: SeedWorldGeologyLayout,
  hill: SeedWorldGeologyHill
): MeasuredCanyonRelation | undefined {
  const relation = hill.canyonBank;
  if (!relation) return undefined;
  const canyon = layout.canyons.find((candidate) => candidate.id === relation.canyonId);
  if (!canyon) throw new Error(`Missing canyon ${relation.canyonId} for ${hill.id}`);
  return Object.freeze({
    canyon,
    side: relation.side,
    guideParameter: relation.guideParameter,
    anchor: Object.freeze({ x: relation.bankAnchor.x, z: relation.bankAnchor.z })
  });
}

function nearestPointOnCanyon(
  worldX: number,
  worldZ: number,
  canyon: SeedWorldGeologyCanyon
): Readonly<{
  anchor: Readonly<{ x: number; z: number }>;
  guideParameter: number;
  distanceMetres: number;
}> {
  let selectedAnchor = sampleSeedWorldGeologyCurve(canyon.points, 0);
  let selectedParameter = 0;
  let selectedDistance = Math.hypot(worldX - selectedAnchor.x, worldZ - selectedAnchor.z);
  let previous = selectedAnchor;
  for (let ordinal = 1; ordinal <= CANYON_NEAREST_SEGMENTS; ordinal++) {
    const parameter = ordinal / CANYON_NEAREST_SEGMENTS;
    const current = sampleSeedWorldGeologyCurve(canyon.points, parameter);
    const deltaX = current.x - previous.x;
    const deltaZ = current.z - previous.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    const segmentAmount =
      lengthSquared <= 1e-9
        ? 0
        : clamp(((worldX - previous.x) * deltaX + (worldZ - previous.z) * deltaZ) / lengthSquared, 0, 1);
    const anchor = Object.freeze({ x: previous.x + deltaX * segmentAmount, z: previous.z + deltaZ * segmentAmount });
    const distance = Math.hypot(worldX - anchor.x, worldZ - anchor.z);
    if (distance < selectedDistance) {
      selectedAnchor = anchor;
      selectedParameter = (ordinal - 1 + segmentAmount) / CANYON_NEAREST_SEGMENTS;
      selectedDistance = distance;
    }
    previous = current;
  }
  return Object.freeze({
    anchor: Object.freeze({ x: selectedAnchor.x, z: selectedAnchor.z }),
    guideParameter: selectedParameter,
    distanceMetres: selectedDistance
  });
}

function findLocalCrest(
  fields: SeedWorldFields,
  hill: SeedWorldGeologyHill
): Readonly<{ x: number; y: number; z: number }> {
  const cosine = Math.cos(hill.rotationRadians);
  const sine = Math.sin(hill.rotationRadians);
  let crest = pointWithHeight(fields, hill.center.x, hill.center.z);
  for (const radiusRatio of PEAK_SEARCH_RING_RATIOS) {
    if (radiusRatio === 0) continue;
    for (let ordinal = 0; ordinal < PEAK_SEARCH_ORDINALS; ordinal++) {
      const angle = (ordinal / PEAK_SEARCH_ORDINALS) * Math.PI * 2;
      const localX = Math.cos(angle) * hill.bodyRadiusMetres.major * radiusRatio;
      const localZ = Math.sin(angle) * hill.bodyRadiusMetres.minor * radiusRatio;
      const candidate = pointWithHeight(
        fields,
        hill.center.x + localX * cosine - localZ * sine,
        hill.center.z + localX * sine + localZ * cosine
      );
      if (candidate.y > crest.y) crest = candidate;
    }
  }
  return crest;
}

function selectShoulder(
  fields: SeedWorldFields,
  hill: SeedWorldGeologyHill,
  crest: Readonly<{ x: number; y: number; z: number }>,
  canyonRelation: MeasuredCanyonRelation | undefined
): MeasuredShoulder {
  const preferredBearing = hill.usableShoulder.preferredExteriorBearingRadians;
  const minimumDistance = hill.bodyRadiusMetres.minor * hill.usableShoulder.minimumBodyMinorRatio;
  const maximumDistance = hill.bodyRadiusMetres.minor * hill.usableShoulder.maximumBodyMinorRatio;
  return selectShoulderInRange(fields, hill, crest, canyonRelation, preferredBearing, minimumDistance, maximumDistance);
}

function selectShoulderInRange(
  fields: SeedWorldFields,
  tangentReferenceHill: SeedWorldGeologyHill,
  crest: Readonly<{ x: number; y: number; z: number }>,
  canyonRelation: MeasuredCanyonRelation | undefined,
  preferredBearing: number,
  minimumDistance: number,
  maximumDistance: number
): MeasuredShoulder {
  const canyon = canyonRelation?.canyon;
  const requestedSpanMetres = mix(minimumDistance, maximumDistance, 0.62);
  const canyonBankSpanMetres =
    canyonRelation && canyon
      ? Math.max(
          8,
          Math.hypot(crest.x - canyonRelation.anchor.x, crest.z - canyonRelation.anchor.z) - canyon.widthMetres * 0.5
        )
      : Number.POSITIVE_INFINITY;
  const spanMetres = Math.min(requestedSpanMetres, canyonBankSpanMetres);
  let selected: MeasuredShoulder | undefined;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (let ordinal = 0; ordinal < SHOULDER_DIRECTION_ORDINALS; ordinal++) {
    const bearing = (ordinal / SHOULDER_DIRECTION_ORDINALS) * Math.PI * 2;
    const bearingError = Math.abs(shortestAngle(bearing - preferredBearing));
    if (bearingError > CANYON_DIRECTION_LIMIT_RADIANS) continue;
    const profile = sampleShoulderProfile(fields, crest, bearing, spanMetres);
    const semanticAlignment = Math.max(0, Math.cos(bearingError));
    const score = profile.prominenceMetres + profile.maximumSlopeDegrees * 1.8 + semanticAlignment * 24;
    if (score <= selectedScore) continue;
    selectedScore = score;
    const tangentBearing = signedShoulderTangent(tangentReferenceHill, canyon, canyonRelation?.guideParameter, bearing);
    selected = Object.freeze({
      foot: profile.foot,
      downhillBearingRadians: bearing,
      shoulderTangentBearingRadians: tangentBearing,
      maximumSlopeDegrees: profile.maximumSlopeDegrees,
      surfaceNormal: sampleSurfaceNormal(fields, profile.socket.x, profile.socket.z),
      spanMetres,
      source: canyonRelation ? "canyon-exterior" : "terrain-gradient",
      ...(canyon ? { canyon } : {})
    });
  }
  if (!selected) throw new Error(`No terrain shoulder direction could be measured for ${tangentReferenceHill.id}`);
  return selected;
}

function sampleShoulderProfile(
  fields: SeedWorldFields,
  crest: Readonly<{ x: number; y: number; z: number }>,
  bearing: number,
  spanMetres: number
): Readonly<{
  foot: Readonly<{ x: number; y: number; z: number }>;
  socket: Readonly<{ x: number; z: number }>;
  prominenceMetres: number;
  maximumSlopeDegrees: number;
}> {
  const directionX = Math.sin(bearing);
  const directionZ = Math.cos(bearing);
  let previous = crest;
  let maximumSlopeDegrees = 0;
  let foot = crest;
  const stepMetres = spanMetres / (SHOULDER_PROFILE_SAMPLES - 1);
  for (let ordinal = 1; ordinal < SHOULDER_PROFILE_SAMPLES; ordinal++) {
    const distance = ordinal * stepMetres;
    const sample = pointWithHeight(fields, crest.x + directionX * distance, crest.z + directionZ * distance);
    const slopeDegrees = radiansToDegrees(Math.atan2(Math.max(0, previous.y - sample.y), stepMetres));
    maximumSlopeDegrees = Math.max(maximumSlopeDegrees, slopeDegrees);
    previous = sample;
    foot = sample;
  }
  const socketDistance = spanMetres * 0.68;
  return Object.freeze({
    foot,
    socket: Object.freeze({ x: crest.x + directionX * socketDistance, z: crest.z + directionZ * socketDistance }),
    prominenceMetres: Math.max(0, crest.y - foot.y),
    maximumSlopeDegrees
  });
}

function signedShoulderTangent(
  hill: SeedWorldGeologyHill,
  canyon: SeedWorldGeologyCanyon | undefined,
  canyonGuideParameter: number | undefined,
  downhillBearing: number
): number {
  const first = wrapAngle(downhillBearing + Math.PI * 0.5);
  const second = wrapAngle(downhillBearing - Math.PI * 0.5);
  if (canyon && canyonGuideParameter !== undefined) {
    const before = sampleSeedWorldGeologyCurve(canyon.points, Math.max(0, canyonGuideParameter - 0.002));
    const after = sampleSeedWorldGeologyCurve(canyon.points, Math.min(1, canyonGuideParameter + 0.002));
    const tangentLength = Math.hypot(after.x - before.x, after.z - before.z);
    if (tangentLength > 1e-6) {
      const tangentX = (after.x - before.x) / tangentLength;
      const tangentZ = (after.z - before.z) / tangentLength;
      const firstAlignment = Math.sin(first) * tangentX + Math.cos(first) * tangentZ;
      const secondAlignment = Math.sin(second) * tangentX + Math.cos(second) * tangentZ;
      return firstAlignment >= secondAlignment ? first : second;
    }
  }
  const majorX = Math.cos(hill.rotationRadians);
  const majorZ = Math.sin(hill.rotationRadians);
  const firstAlignment = Math.sin(first) * majorX + Math.cos(first) * majorZ;
  const secondAlignment = Math.sin(second) * majorX + Math.cos(second) * majorZ;
  return firstAlignment >= secondAlignment ? first : second;
}

function measureRelations(
  fields: SeedWorldFields,
  measured: readonly MeasuredHill[]
): SeedWorldRockConvexityRelation[] {
  const relations: SeedWorldRockConvexityRelation[] = [];
  for (let firstIndex = 0; firstIndex < measured.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < measured.length; secondIndex++) {
      const first = measured[firstIndex]!;
      const second = measured[secondIndex]!;
      const separation = Math.hypot(second.crest.x - first.crest.x, second.crest.z - first.crest.z);
      const normalizedPeakSeparation =
        separation / Math.max(1, Math.min(first.hill.bodyRadiusMetres.minor, second.hill.bodyRadiusMetres.minor));
      const saddleRetention = measureSaddleRetention(fields, first, second);
      relations.push(
        Object.freeze({
          firstHillId: first.hill.id,
          secondHillId: second.hill.id,
          normalizedPeakSeparation,
          saddleRetention,
          sameConvexity:
            normalizedPeakSeparation <= MAXIMUM_DUPLICATE_PEAK_SEPARATION_RATIO &&
            saddleRetention >= MINIMUM_DUPLICATE_SADDLE_RETENTION
        })
      );
    }
  }
  return relations;
}

function measureSaddleRetention(fields: SeedWorldFields, first: MeasuredHill, second: MeasuredHill): number {
  let saddle = Number.POSITIVE_INFINITY;
  const sampleCount = 17;
  for (let ordinal = 1; ordinal < sampleCount - 1; ordinal++) {
    const amount = ordinal / (sampleCount - 1);
    saddle = Math.min(
      saddle,
      sampleHeight(fields, mix(first.crest.x, second.crest.x, amount), mix(first.crest.z, second.crest.z, amount))
    );
  }
  const lowerPeak = Math.min(first.crest.y, second.crest.y);
  const sharedFoot = Math.min(first.shoulder.foot.y, second.shoulder.foot.y);
  return clamp((saddle - sharedFoot) / Math.max(1, lowerPeak - sharedFoot), 0, 1);
}

function groupDuplicateSummits(
  measured: readonly MeasuredHill[],
  relations: readonly SeedWorldRockConvexityRelation[]
): readonly (readonly MeasuredHill[])[] {
  const relationByPair = new Map(
    relations.map((relation) => [orderedPairKey(relation.firstHillId, relation.secondHillId), relation] as const)
  );
  const groups: MeasuredHill[][] = [];
  for (const entry of measured.slice().sort((left, right) => left.hill.id.localeCompare(right.hill.id))) {
    const group = groups.find((candidate) =>
      candidate.every(
        (member) => relationByPair.get(orderedPairKey(entry.hill.id, member.hill.id))?.sameConvexity === true
      )
    );
    if (group) group.push(entry);
    else groups.push([entry]);
  }
  for (let firstIndex = 0; firstIndex < groups.length; firstIndex++) {
    const first = groups[firstIndex]!;
    let firstCrest = highestGroupCrest(first);
    for (let secondIndex = firstIndex + 1; secondIndex < groups.length; ) {
      const second = groups[secondIndex]!;
      const secondCrest = highestGroupCrest(second);
      if (
        Math.hypot(secondCrest.x - firstCrest.x, secondCrest.z - firstCrest.z) >=
        MINIMUM_DISTINCT_ROCK_CREST_SEPARATION_METRES
      ) {
        secondIndex++;
        continue;
      }
      first.push(...second);
      firstCrest = highestGroupCrest(first);
      groups.splice(secondIndex, 1);
    }
  }
  return Object.freeze(groups.map((group) => Object.freeze(group.sort((a, b) => a.hill.id.localeCompare(b.hill.id)))));
}

function highestGroupCrest(group: readonly MeasuredHill[]): MeasuredHill["crest"] {
  return group
    .slice()
    .sort((left, right) => right.crest.y - left.crest.y || left.hill.id.localeCompare(right.hill.id))[0]!.crest;
}

function orderedPairKey(firstId: string, secondId: string): string {
  return firstId < secondId ? `${firstId}\u0000${secondId}` : `${secondId}\u0000${firstId}`;
}

function makeCoverageTarget(
  fields: SeedWorldFields,
  group: readonly MeasuredHill[],
  measured: readonly MeasuredHill[]
): SeedWorldRockCoverageTarget {
  const primary = group
    .slice()
    .sort((left, right) => right.crest.y - left.crest.y || left.hill.id.localeCompare(right.hill.id))[0]!;
  const crest = primary.crest;
  const canyonRelation = resolveMergedCanyonRelation(group, crest, measured);
  const preferredBearing = canyonRelation
    ? vectorToClockwiseNorthBearing(crest.x - canyonRelation.anchor.x, crest.z - canyonRelation.anchor.z)
    : meanBearing(group.map((entry) => entry.hill.usableShoulder.preferredExteriorBearingRadians));
  const distanceRange = mergedShoulderDistanceRange(group, crest, preferredBearing);
  const shoulder = selectShoulderInRange(
    fields,
    primary.hill,
    crest,
    canyonRelation,
    preferredBearing,
    distanceRange.minimum,
    distanceRange.maximum
  );
  const prominenceMetres = Math.max(0, crest.y - shoulder.foot.y);
  const canyon = shoulder.canyon;
  const ids = Object.freeze(group.map((entry) => entry.hill.id).sort());
  const target = Object.freeze({
    id: `convex:${ids.join("+")}`,
    sourceHillIds: ids,
    crest: Object.freeze([crest.x, crest.y, crest.z] as const),
    shoulderFoot: Object.freeze([shoulder.foot.x, shoulder.foot.y, shoulder.foot.z] as const),
    prominenceMetres,
    shoulderSpanMetres: shoulder.spanMetres,
    tangentSpanMetres: mergedDirectionalRadius(group, crest, shoulder.shoulderTangentBearingRadians),
    regionalInfluenceSpanMetres:
      Math.max(
        ...group.map((entry) =>
          Math.max(entry.hill.influenceRadiusMetres.major, entry.hill.influenceRadiusMetres.minor)
        )
      ) * 2,
    frame: Object.freeze({
      downhillBearingRadians: shoulder.downhillBearingRadians,
      uphillBearingRadians: wrapAngle(shoulder.downhillBearingRadians + Math.PI),
      shoulderTangentBearingRadians: shoulder.shoulderTangentBearingRadians,
      surfaceNormal: shoulder.surfaceNormal,
      maximumSlopeDegrees: shoulder.maximumSlopeDegrees,
      source: shoulder.source,
      ...(canyonRelation
        ? {
            canyonId: canyonRelation.canyon.id,
            bankSide: canyonRelation.side,
            canyonGuideParameter: canyonRelation.guideParameter,
            canyonAnchor: Object.freeze([canyonRelation.anchor.x, canyonRelation.anchor.z] as const),
            canyonHalfWidthMetres: canyon!.widthMetres * 0.5,
            canyonOutwardBearingRadians: vectorToClockwiseNorthBearing(
              crest.x - canyonRelation.anchor.x,
              crest.z - canyonRelation.anchor.z
            )
          }
        : {})
    })
  });
  return Object.freeze({
    ...target,
    rockPlanShoulder: makeRockPlanShoulder(target)
  });
}

function resolveMergedCanyonRelation(
  group: readonly MeasuredHill[],
  crest: Readonly<{ x: number; z: number }>,
  measured: readonly MeasuredHill[]
): MeasuredCanyonRelation | undefined {
  const selected = group
    .flatMap((entry) => {
      const relation = entry.canyonRelation;
      if (!relation) return [];
      const nearest = nearestPointOnCanyon(crest.x, crest.z, relation.canyon);
      const exteriorSpanMetres = nearest.distanceMetres - relation.canyon.widthMetres * 0.5;
      const exteriorWidthRatio = exteriorSpanMetres / Math.max(1, relation.canyon.widthMetres);
      if (exteriorWidthRatio < MINIMUM_CANYON_BANK_EXTERIOR_WIDTH_RATIO) return [];
      return [
        {
          relation,
          nearest,
          reciprocalPairGuideDelta: reciprocalCanyonPairGuideDelta(entry, measured),
          score: exteriorWidthRatio + entry.shoulder.maximumSlopeDegrees / 90
        }
      ];
    })
    .sort(
      (left, right) =>
        Number(right.reciprocalPairGuideDelta !== undefined) - Number(left.reciprocalPairGuideDelta !== undefined) ||
        (left.reciprocalPairGuideDelta ?? Number.POSITIVE_INFINITY) -
          (right.reciprocalPairGuideDelta ?? Number.POSITIVE_INFINITY) ||
        right.score - left.score ||
        left.relation.canyon.id.localeCompare(right.relation.canyon.id) ||
        left.relation.side.localeCompare(right.relation.side)
    )[0];
  if (!selected) return undefined;
  return Object.freeze({
    canyon: selected.relation.canyon,
    side: selected.relation.side,
    guideParameter: selected.nearest.guideParameter,
    anchor: selected.nearest.anchor
  });
}

function reciprocalCanyonPairGuideDelta(entry: MeasuredHill, measured: readonly MeasuredHill[]): number | undefined {
  const nearestOpposing = nearestOpposingCanyonHill(entry, measured);
  if (!nearestOpposing || nearestOpposing.guideDelta > SEED_WORLD_CANYON_BANK_PAIR_MAXIMUM_GUIDE_DELTA)
    return undefined;
  const reverse = nearestOpposingCanyonHill(nearestOpposing.entry, measured);
  return reverse?.entry === entry ? nearestOpposing.guideDelta : undefined;
}

function nearestOpposingCanyonHill(
  entry: MeasuredHill,
  measured: readonly MeasuredHill[]
): Readonly<{ entry: MeasuredHill; guideDelta: number }> | undefined {
  const relation = entry.canyonRelation;
  if (!relation) return undefined;
  return measured
    .flatMap((candidate) => {
      const candidateRelation = candidate.canyonRelation;
      if (
        !candidateRelation ||
        candidateRelation.canyon.id !== relation.canyon.id ||
        candidateRelation.side === relation.side
      ) {
        return [];
      }
      return [
        Object.freeze({
          entry: candidate,
          guideDelta: Math.abs(candidateRelation.guideParameter - relation.guideParameter)
        })
      ];
    })
    .sort(
      (left, right) => left.guideDelta - right.guideDelta || left.entry.hill.id.localeCompare(right.entry.hill.id)
    )[0];
}

function mergedShoulderDistanceRange(
  group: readonly MeasuredHill[],
  crest: Readonly<{ x: number; z: number }>,
  bearing: number
): Readonly<{ minimum: number; maximum: number }> {
  const directionX = Math.sin(bearing);
  const directionZ = Math.cos(bearing);
  const projectedRanges = group.map((entry) => {
    const centreProjection =
      (entry.hill.center.x - crest.x) * directionX + (entry.hill.center.z - crest.z) * directionZ;
    const radius = directionalRadius(entry.hill, bearing);
    return Object.freeze({
      minimum: centreProjection + radius * entry.hill.usableShoulder.minimumBodyMinorRatio,
      maximum: centreProjection + radius * entry.hill.usableShoulder.maximumBodyMinorRatio
    });
  });
  const minimum = Math.max(8, ...projectedRanges.map((range) => range.minimum));
  return Object.freeze({
    minimum,
    maximum: Math.max(minimum, ...projectedRanges.map((range) => range.maximum))
  });
}

function mergedDirectionalRadius(
  group: readonly MeasuredHill[],
  crest: Readonly<{ x: number; z: number }>,
  bearing: number
): number {
  const directionX = Math.sin(bearing);
  const directionZ = Math.cos(bearing);
  return Math.max(
    ...group.map((entry) => {
      const centreProjection =
        (entry.hill.center.x - crest.x) * directionX + (entry.hill.center.z - crest.z) * directionZ;
      return Math.abs(centreProjection) + directionalRadius(entry.hill, bearing);
    })
  );
}

function meanBearing(bearings: readonly number[]): number {
  const x = bearings.reduce((sum, bearing) => sum + Math.sin(bearing), 0);
  const z = bearings.reduce((sum, bearing) => sum + Math.cos(bearing), 0);
  return vectorToClockwiseNorthBearing(x, z);
}

function directionalRadius(hill: SeedWorldGeologyHill, bearing: number): number {
  const directionX = Math.sin(bearing);
  const directionZ = Math.cos(bearing);
  const majorX = Math.cos(hill.rotationRadians);
  const majorZ = Math.sin(hill.rotationRadians);
  const minorX = -majorZ;
  const minorZ = majorX;
  const majorProjection = directionX * majorX + directionZ * majorZ;
  const minorProjection = directionX * minorX + directionZ * minorZ;
  return 1 / Math.hypot(majorProjection / hill.bodyRadiusMetres.major, minorProjection / hill.bodyRadiusMetres.minor);
}

function sampleSurfaceNormal(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number
): readonly [x: number, y: number, z: number] {
  const stepMetres = Math.max(4, fields.sizeMetres / (fields.heightResolution - 1));
  const gradientX =
    (sampleHeight(fields, worldX + stepMetres, worldZ) - sampleHeight(fields, worldX - stepMetres, worldZ)) /
    (2 * stepMetres);
  const gradientZ =
    (sampleHeight(fields, worldX, worldZ + stepMetres) - sampleHeight(fields, worldX, worldZ - stepMetres)) /
    (2 * stepMetres);
  const length = Math.hypot(gradientX, 1, gradientZ);
  return Object.freeze([-gradientX / length, 1 / length, -gradientZ / length] as const);
}

function pointWithHeight(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number
): Readonly<{ x: number; y: number; z: number }> {
  return Object.freeze({ x: worldX, y: sampleHeight(fields, worldX, worldZ), z: worldZ });
}

function sampleHeight(fields: SeedWorldFields, worldX: number, worldZ: number): number {
  const half = fields.sizeMetres * 0.5;
  return sampleSeedWorldHeight(fields, clamp(worldX, -half, half), clamp(worldZ, -half, half)) ?? 0;
}

function validateInputs(layout: SeedWorldGeologyLayout, fields: SeedWorldFields): void {
  if (Math.abs(layout.worldSizeMetres - fields.sizeMetres) > 1e-6) {
    throw new RangeError("Rock terrain analysis requires matching layout and Heightmap extents");
  }
}

function wrapAngle(angle: number): number {
  const wrapped = angle % (Math.PI * 2);
  return wrapped < 0 ? wrapped + Math.PI * 2 : wrapped;
}

function vectorToClockwiseNorthBearing(deltaX: number, deltaZ: number): number {
  return wrapAngle(Math.atan2(deltaX, deltaZ));
}

function shortestAngle(angle: number): number {
  const wrapped = wrapAngle(angle);
  return wrapped > Math.PI ? wrapped - Math.PI * 2 : wrapped;
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
