import {
  createCanonicalWaterSemanticFieldSample,
  sampleCanonicalWaterSemanticField,
  type WaterSemanticFieldBodyV1,
  type WaterSemanticFieldSnapshotV1
} from "@galacean/engine-water/water/runtime/index";
import { hashPromptNoise, promptNoiseUnit } from "@galacean/engine-world-planning/generation/noise/PromptNoiseHash";
import { samplePromptNoiseRiverField } from "@galacean/engine-world-planning/generation/noise/PromptNoiseRiverFieldCompiler";
import { PromptNoiseTerrainProgram, type PromptNoiseWorldRecipe } from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";
import type { PromptNoiseWaterLayoutAuditV1, PromptNoiseWaterLayoutCandidateV1 } from "./PromptNoiseWaterLayout.ts";

export const PROMPT_NOISE_SCENE_LAYOUT_VERSION = 1 as const;

export type PromptNoiseScenePlacementKind = "tree" | "shrub" | "flower" | "grass" | "rock" | "bridge";
export type PromptNoiseScenePlacementRole = "vegetation" | "ambient-rock" | "river-bank-rock" | "bridge";

export interface PromptNoiseScenePlacementV1 {
  readonly id: string;
  readonly kind: PromptNoiseScenePlacementKind;
  readonly role: PromptNoiseScenePlacementRole;
  readonly position: readonly [x: number, y: number, z: number];
  readonly rotationYRadians: number;
  readonly scale: readonly [x: number, y: number, z: number];
  readonly footprint: number;
  readonly waterBodyId?: string;
}

export interface PromptNoiseSceneLayoutV1 {
  readonly version: typeof PROMPT_NOISE_SCENE_LAYOUT_VERSION;
  readonly semanticGeneration: number;
  readonly semanticSourceHash: string;
  readonly layoutHash: string;
  readonly placements: readonly PromptNoiseScenePlacementV1[];
  readonly audit: PromptNoiseWaterLayoutAuditV1;
  readonly rejected: Readonly<Record<string, number>>;
  readonly vegetationCount: number;
  readonly ambientRockCount: number;
  readonly riverBankRockCount: number;
  readonly bridgeCount: number;
  readonly transientBytes: number;
}

export interface PromptNoiseRiverTerrainLayerSampleV1 {
  readonly riverbedWeight: number;
  readonly wetEdgeWeight: number;
  readonly erosionWeight: number;
}

interface SceneRule {
  readonly kind: Exclude<PromptNoiseScenePlacementKind, "bridge">;
  readonly role: "vegetation" | "ambient-rock";
  readonly stage: number;
  readonly spacing: number;
  readonly probability: number;
  readonly footprint: number;
  readonly minimumScale: number;
  readonly maximumScale: number;
  readonly maximumSlope: number;
}

interface OccupiedPlacement {
  readonly x: number;
  readonly z: number;
  readonly footprint: number;
}

const LAYOUT_PADDING_METRES = 36;
const HEIGHT_DERIVATIVE_STEP = 3;
const MAX_RIVER_BANK_ROCKS = 48;
const MAX_PLACEMENTS_BY_KIND: Readonly<Record<Exclude<PromptNoiseScenePlacementKind, "bridge">, number>> =
  Object.freeze({
    tree: 160,
    shrub: 180,
    flower: 240,
    grass: 320,
    rock: 80
  });
const SCENE_RULES: readonly SceneRule[] = Object.freeze([
  Object.freeze({
    kind: "rock",
    role: "ambient-rock",
    stage: 1,
    spacing: 15,
    probability: 0.2,
    footprint: 2.2,
    minimumScale: 0.7,
    maximumScale: 1.65,
    maximumSlope: 0.76
  }),
  Object.freeze({
    kind: "tree",
    role: "vegetation",
    stage: 2,
    spacing: 18,
    probability: 0.42,
    footprint: 3.1,
    minimumScale: 0.72,
    maximumScale: 1.18,
    maximumSlope: 0.5
  }),
  Object.freeze({
    kind: "shrub",
    role: "vegetation",
    stage: 3,
    spacing: 10,
    probability: 0.48,
    footprint: 1.2,
    minimumScale: 0.7,
    maximumScale: 1.45,
    maximumSlope: 0.58
  }),
  Object.freeze({
    kind: "flower",
    role: "vegetation",
    stage: 4,
    spacing: 6.5,
    probability: 0.32,
    footprint: 0.28,
    minimumScale: 0.7,
    maximumScale: 1.35,
    maximumSlope: 0.44
  }),
  Object.freeze({
    kind: "grass",
    role: "vegetation",
    stage: 5,
    spacing: 4.8,
    probability: 0.34,
    footprint: 0.18,
    minimumScale: 0.72,
    maximumScale: 1.25,
    maximumSlope: 0.5
  })
]);

/**
 * Compiles a bounded Prompt scene layout from the current PNW4 recipe and the
 * exact Water Semantic Field staged for the same world revision.
 */
export function compilePromptNoiseSceneLayout(
  program: PromptNoiseTerrainProgram,
  semanticField: WaterSemanticFieldSnapshotV1
): PromptNoiseSceneLayoutV1 {
  if (semanticField.bodies.length === 0) return emptyLayout(semanticField);
  const bounds = semanticBounds(semanticField);
  const occupied: OccupiedPlacement[] = [];
  const candidatePlacements = new Map<string, PromptNoiseScenePlacementV1>();
  const acceptedVegetationCandidates: PromptNoiseWaterLayoutCandidateV1[] = [];
  const rejected: Record<string, number> = Object.create(null) as Record<string, number>;
  const semanticSample = createCanonicalWaterSemanticFieldSample();
  const rootSeed = program.recipe.base.rootSeed >>> 0;
  let waterExcludedCandidateCount = 0;

  for (const rule of SCENE_RULES) {
    const minimumCellX = Math.floor((bounds.minX - LAYOUT_PADDING_METRES) / rule.spacing);
    const maximumCellX = Math.ceil((bounds.maxX + LAYOUT_PADDING_METRES) / rule.spacing);
    const minimumCellZ = Math.floor((bounds.minZ - LAYOUT_PADDING_METRES) / rule.spacing);
    const maximumCellZ = Math.ceil((bounds.maxZ + LAYOUT_PADDING_METRES) / rule.spacing);
    const cellCount = (maximumCellX - minimumCellX + 1) * (maximumCellZ - minimumCellZ + 1);
    const placementLimit = MAX_PLACEMENTS_BY_KIND[rule.kind];
    const effectiveProbability = Math.min(rule.probability, (placementLimit * 1.25) / Math.max(1, cellCount));
    let rulePlacementCount = 0;
    for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ++) {
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX++) {
        const seed = hashPromptNoise(rootSeed, 0x4332_4400, rule.stage, cellX, cellZ);
        if (rulePlacementCount >= placementLimit || promptNoiseUnit(hashPromptNoise(seed, 1)) > effectiveProbability)
          continue;
        const x = (cellX + 0.12 + promptNoiseUnit(hashPromptNoise(seed, 2)) * 0.76) * rule.spacing;
        const z = (cellZ + 0.12 + promptNoiseUnit(hashPromptNoise(seed, 3)) * 0.76) * rule.spacing;
        const id = `${rule.kind}:${cellX}:${cellZ}`;
        const resolvedSemantic = sampleCanonicalWaterSemanticField(semanticField, x, z, semanticSample);
        if (rule.role === "vegetation") {
          if (rule.kind === "rock") throw new Error("Prompt vegetation rule cannot use the rock category.");
          if (resolvedSemantic) {
            increment(rejected, semanticSample.wet ? "water" : "shore");
            waterExcludedCandidateCount++;
            continue;
          }
        } else if (resolvedSemantic && semanticSample.wet) {
          increment(rejected, "water");
          continue;
        }
        const slope = sampleSlope(program, x, z);
        if (slope > rule.maximumSlope) {
          increment(rejected, "slope");
          continue;
        }
        if (overlaps(occupied, x, z, rule.footprint)) {
          increment(rejected, "footprint");
          continue;
        }
        const scale = mix(rule.minimumScale, rule.maximumScale, promptNoiseUnit(hashPromptNoise(seed, 4)));
        const stretch = mix(0.86, 1.14, promptNoiseUnit(hashPromptNoise(seed, 5)));
        const placement = freezePlacement({
          id,
          kind: rule.kind,
          role: rule.role,
          position: [x, program.sampleHeight(x, z), z],
          rotationYRadians: promptNoiseUnit(hashPromptNoise(seed, 6)) * Math.PI * 2,
          scale: [scale * stretch, scale, scale / stretch],
          footprint: rule.footprint
        });
        candidatePlacements.set(id, placement);
        occupied.push({ x, z, footprint: rule.footprint });
        rulePlacementCount++;
        if (rule.role === "vegetation") {
          if (rule.kind === "rock") throw new Error("Prompt vegetation rule cannot use the rock category.");
          acceptedVegetationCandidates.push(Object.freeze({ id, kind: rule.kind, x, z, minimumShoreDistance: 0 }));
        }
      }
    }
  }

  const bridge = createBridgePlacement(program, semanticField);
  const bridgeClearance = bridge ? Math.max(9, bridge.scale[0] * 0.42) : 0;
  if (bridge) {
    candidatePlacements.set(bridge.id, bridge);
    for (const [id, placement] of candidatePlacements) {
      if (placement.role === "bridge") continue;
      if (
        Math.hypot(placement.position[0] - bridge.position[0], placement.position[2] - bridge.position[2]) <
        bridgeClearance
      ) {
        candidatePlacements.delete(id);
        increment(rejected, "bridge-clearance");
      }
    }
  }

  for (const placement of createRiverBankRockPlacements(program, semanticField, occupied)) {
    if (
      bridge &&
      Math.hypot(placement.position[0] - bridge.position[0], placement.position[2] - bridge.position[2]) <
        bridgeClearance
    ) {
      increment(rejected, "bridge-clearance");
      continue;
    }
    candidatePlacements.set(placement.id, placement);
  }

  const placements = Object.freeze(
    [...candidatePlacements.values()].sort(
      (left, right) => left.role.localeCompare(right.role) || left.id.localeCompare(right.id)
    )
  );
  const renderedVegetationIds = new Set(placements.filter(({ role }) => role === "vegetation").map(({ id }) => id));
  const auditAccepted = Object.freeze(acceptedVegetationCandidates.filter(({ id }) => renderedVegetationIds.has(id)));
  const audit: PromptNoiseWaterLayoutAuditV1 = Object.freeze({
    semanticGeneration: semanticField.generation,
    accepted: auditAccepted,
    excludedCount: waterExcludedCandidateCount,
    wetVegetationCount: 0,
    ordinaryPrefabCount: 0
  });
  const vegetationCount = placements.filter(({ role }) => role === "vegetation").length;
  const ambientRockCount = placements.filter(({ role }) => role === "ambient-rock").length;
  const riverBankRockCount = placements.filter(({ role }) => role === "river-bank-rock").length;
  const bridgeCount = placements.filter(({ role }) => role === "bridge").length;
  return deepFreeze({
    version: PROMPT_NOISE_SCENE_LAYOUT_VERSION,
    semanticGeneration: semanticField.generation,
    semanticSourceHash: semanticField.sourceHash,
    layoutHash: hashLayout(program.recipe, semanticField, placements),
    placements,
    audit,
    rejected: { ...rejected },
    vegetationCount,
    ambientRockCount,
    riverBankRockCount,
    bridgeCount,
    transientBytes: placements.length * 12 * Float32Array.BYTES_PER_ELEMENT
  });
}

/** CPU reference for the Terrain shader's same-field riverbed composition. */
export function samplePromptNoiseRiverTerrainLayer(
  program: PromptNoiseTerrainProgram,
  worldX: number,
  worldZ: number
): PromptNoiseRiverTerrainLayerSampleV1 {
  let riverbedWeight = 0;
  let wetEdgeWeight = 0;
  let erosionWeight = 0;
  for (const operator of program.recipe.operators) {
    if (!operator.enabled || operator.kind !== "river" || !operator.controlPoints) continue;
    const field = program.getRiverField(operator.id);
    if (!field) continue;
    const sample = samplePromptNoiseRiverField(field, worldX, worldZ);
    const halfWidth = sample.width * 0.5;
    const shoreWidth = Math.max(sample.bankFeather, 0.05);
    const erosionWidth = Math.max(operator.bankWidth * 0.35, shoreWidth);
    riverbedWeight = Math.max(
      riverbedWeight,
      1 - smoothstep(halfWidth * 0.65, halfWidth + shoreWidth, sample.distance)
    );
    wetEdgeWeight = Math.max(wetEdgeWeight, 1 - smoothstep(halfWidth, halfWidth + shoreWidth, sample.distance));
    erosionWeight = Math.max(
      erosionWeight,
      1 - smoothstep(halfWidth + shoreWidth, halfWidth + shoreWidth + erosionWidth, sample.distance)
    );
  }
  return Object.freeze({ riverbedWeight, wetEdgeWeight, erosionWeight });
}

function createRiverBankRockPlacements(
  program: PromptNoiseTerrainProgram,
  semanticField: WaterSemanticFieldSnapshotV1,
  occupied: OccupiedPlacement[]
): readonly PromptNoiseScenePlacementV1[] {
  const placements: PromptNoiseScenePlacementV1[] = [];
  const semanticSample = createCanonicalWaterSemanticFieldSample();
  const rootSeed = program.recipe.base.rootSeed >>> 0;
  for (const body of [...semanticField.bodies].sort((left, right) => left.id.localeCompare(right.id))) {
    const segments = body.localField?.segments ?? [];
    for (let index = 0; index < segments.length && placements.length < MAX_RIVER_BANK_ROCKS; index++) {
      const segment = segments[index];
      const segmentX = segment.endX - segment.startX;
      const segmentZ = segment.endZ - segment.startZ;
      const length = Math.hypot(segmentX, segmentZ);
      if (length < 5) continue;
      const seed = hashPromptNoise(rootSeed, 0x524f_434b, index, stringSeed(body.id));
      if (promptNoiseUnit(hashPromptNoise(seed, 1)) > 0.58) continue;
      const localFactor = mix(0.28, 0.72, promptNoiseUnit(hashPromptNoise(seed, 2)));
      const centerX = mix(segment.startX, segment.endX, localFactor);
      const centerZ = mix(segment.startZ, segment.endZ, localFactor);
      const normalX = -segmentZ / length;
      const normalZ = segmentX / length;
      const side = promptNoiseUnit(hashPromptNoise(seed, 3)) < 0.5 ? -1 : 1;
      const halfWidth = mix(segment.startHalfWidth, segment.endHalfWidth, localFactor);
      const shoreWidth = Math.max(0.2, mix(segment.startShoreWidth, segment.endShoreWidth, localFactor));
      const offset = halfWidth + shoreWidth * mix(0.28, 0.72, promptNoiseUnit(hashPromptNoise(seed, 4)));
      const x = centerX + normalX * side * offset;
      const z = centerZ + normalZ * side * offset;
      if (!sampleCanonicalWaterSemanticField(semanticField, x, z, semanticSample) || semanticSample.wet) continue;
      const footprint = mix(1.2, 2.6, promptNoiseUnit(hashPromptNoise(seed, 5)));
      if (overlaps(occupied, x, z, footprint)) continue;
      const scale = mix(0.72, 1.55, promptNoiseUnit(hashPromptNoise(seed, 6)));
      placements.push(
        freezePlacement({
          id: `river-bank-rock:${body.id}:${index}`,
          kind: "rock",
          role: "river-bank-rock",
          position: [x, program.sampleHeight(x, z), z],
          rotationYRadians: promptNoiseUnit(hashPromptNoise(seed, 7)) * Math.PI * 2,
          scale: [scale * 1.15, scale * 0.82, scale],
          footprint,
          waterBodyId: body.id
        })
      );
      occupied.push({ x, z, footprint });
    }
  }
  return Object.freeze(placements);
}

function createBridgePlacement(
  _program: PromptNoiseTerrainProgram,
  semanticField: WaterSemanticFieldSnapshotV1
): PromptNoiseScenePlacementV1 | undefined {
  const body = [...semanticField.bodies].sort((left, right) => left.id.localeCompare(right.id))[0];
  const segment = longestBridgeSegment(body);
  if (!segment) return undefined;
  const segmentX = segment.endX - segment.startX;
  const segmentZ = segment.endZ - segment.startZ;
  const length = Math.hypot(segmentX, segmentZ);
  const centerX = (segment.startX + segment.endX) * 0.5;
  const centerZ = (segment.startZ + segment.endZ) * 0.5;
  const surfaceHeight = (segment.startSurfaceHeight + segment.endSurfaceHeight) * 0.5;
  const halfWidth = (segment.startHalfWidth + segment.endHalfWidth) * 0.5;
  const shoreWidth = (segment.startShoreWidth + segment.endShoreWidth) * 0.5;
  const bridgeLength = halfWidth * 2 + shoreWidth * 2 + 4.5;
  const normalX = -segmentZ / length;
  const normalZ = segmentX / length;
  return freezePlacement({
    id: `bridge:${body.id}`,
    kind: "bridge",
    role: "bridge",
    position: [centerX, surfaceHeight + 1.15, centerZ],
    rotationYRadians: Math.atan2(normalZ, normalX),
    scale: [bridgeLength, 0.42, 3.4],
    footprint: bridgeLength * 0.5,
    waterBodyId: body.id
  });
}

function longestBridgeSegment(body: WaterSemanticFieldBodyV1 | undefined) {
  if (!body?.localField) return undefined;
  return body.localField.segments
    .filter((segment) => Math.hypot(segment.endX - segment.startX, segment.endZ - segment.startZ) >= 8)
    .sort(
      (left, right) =>
        Math.hypot(right.endX - right.startX, right.endZ - right.startZ) -
        Math.hypot(left.endX - left.startX, left.endZ - left.startZ)
    )[0];
}

function semanticBounds(snapshot: WaterSemanticFieldSnapshotV1) {
  return Object.freeze({
    minX: Math.min(...snapshot.bodies.map(({ bounds }) => bounds.minX)),
    minZ: Math.min(...snapshot.bodies.map(({ bounds }) => bounds.minZ)),
    maxX: Math.max(...snapshot.bodies.map(({ bounds }) => bounds.maxX)),
    maxZ: Math.max(...snapshot.bodies.map(({ bounds }) => bounds.maxZ))
  });
}

function sampleSlope(program: PromptNoiseTerrainProgram, x: number, z: number): number {
  const left = program.sampleHeight(x - HEIGHT_DERIVATIVE_STEP, z);
  const right = program.sampleHeight(x + HEIGHT_DERIVATIVE_STEP, z);
  const back = program.sampleHeight(x, z - HEIGHT_DERIVATIVE_STEP);
  const front = program.sampleHeight(x, z + HEIGHT_DERIVATIVE_STEP);
  const derivativeX = (right - left) / (HEIGHT_DERIVATIVE_STEP * 2);
  const derivativeZ = (front - back) / (HEIGHT_DERIVATIVE_STEP * 2);
  return 1 - 1 / Math.sqrt(1 + derivativeX * derivativeX + derivativeZ * derivativeZ);
}

function overlaps(occupied: readonly OccupiedPlacement[], x: number, z: number, footprint: number): boolean {
  return occupied.some((candidate) => {
    const required = candidate.footprint + footprint;
    return (candidate.x - x) ** 2 + (candidate.z - z) ** 2 < required * required;
  });
}

function freezePlacement(
  placement: Omit<PromptNoiseScenePlacementV1, "position" | "scale"> & {
    readonly position: readonly [number, number, number];
    readonly scale: readonly [number, number, number];
  }
): PromptNoiseScenePlacementV1 {
  return Object.freeze({
    ...placement,
    position: Object.freeze([...placement.position] as [number, number, number]),
    scale: Object.freeze([...placement.scale] as [number, number, number])
  });
}

function emptyLayout(semanticField: WaterSemanticFieldSnapshotV1): PromptNoiseSceneLayoutV1 {
  return deepFreeze({
    version: PROMPT_NOISE_SCENE_LAYOUT_VERSION,
    semanticGeneration: semanticField.generation,
    semanticSourceHash: semanticField.sourceHash,
    layoutHash: hashLayout(undefined, semanticField, []),
    placements: [],
    audit: {
      semanticGeneration: semanticField.generation,
      accepted: [],
      excludedCount: 0,
      wetVegetationCount: 0,
      ordinaryPrefabCount: 0
    },
    rejected: {},
    vegetationCount: 0,
    ambientRockCount: 0,
    riverBankRockCount: 0,
    bridgeCount: 0,
    transientBytes: 0
  });
}

function hashLayout(
  recipe: PromptNoiseWorldRecipe | undefined,
  semanticField: WaterSemanticFieldSnapshotV1,
  placements: readonly PromptNoiseScenePlacementV1[]
): string {
  let hash = 0xcbf29ce484222325n;
  const source = JSON.stringify({
    recipe,
    semanticSourceHash: semanticField.sourceHash,
    placements: placements.map(({ id, role, position, rotationYRadians, scale, waterBodyId }) => ({
      id,
      role,
      position,
      rotationYRadians,
      scale,
      waterBodyId
    }))
  });
  for (const character of source) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function stringSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const factor = clamp01((value - edge0) / Math.max(edge1 - edge0, 1e-6));
  return factor * factor * (3 - 2 * factor);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(left: number, right: number, factor: number): number {
  return left + (right - left) * factor;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
