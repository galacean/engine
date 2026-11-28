import {
  CanonicalWaterBinaryWriterV1,
  canonicalSha256HexToBytes,
  createCanonicalWaterHashWriter
} from "@galacean/engine-water/water/compiler/index";
import { SEED_WORLD_DETAIL_SPECIES_PROFILES } from "./SeedWorldDetailSpecies";
import { SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES } from "./SeedWorldPlanner";
import type {
  SeedWorldAquaticHabitatMask,
  SeedWorldDetailBrushOperation,
  SeedWorldPlan,
  SeedWorldTreeScatterOperation
} from "./SeedWorldPlanner";
import { createSeedWorldFlowingWaterLakeSurrogateShapeV1 } from "../runtime/hydrology-v1/SeedWorldFlowingWaterLakeSurrogate.ts";
import {
  detachSeedWorldTreeShapePatch,
  type SeedWorldTreeShapePatch
} from "@galacean/engine-vegetation/world/SeedWorldTreeShapeControls";

export const SEED_WORLD_AUTHORING_STATE_SCHEMA_VERSION = 2 as const;
export const SEED_WORLD_TERRAIN_PATCH_SCHEMA_VERSION = 2 as const;
export const SEED_WORLD_VEGETATION_BRUSH_SCHEMA_VERSION = 3 as const;
export const SEED_WORLD_RIVER_SCHEMA_VERSION = 1 as const;
export const SEED_WORLD_OBJECT_REMOVAL_SCHEMA_VERSION = 1 as const;
export const SEED_WORLD_EDIT_TRANSACTION_SCHEMA_VERSION = 1 as const;

export type SeedWorldTerrainFeatureKindV1 =
  | "mountain"
  | "hill"
  | "ridge"
  | "canyon"
  | "valley"
  | "slope"
  | "plateau"
  | "basin";
export type SeedWorldStandingWaterFeatureKindV1 = "pond" | "lake";
export type SeedWorldFlowingWaterFeatureKindV1 = "stream" | "river";
const TERRAIN_FEATURE_KINDS = Object.freeze([
  "mountain",
  "hill",
  "ridge",
  "canyon",
  "valley",
  "slope",
  "plateau",
  "basin"
] as const);

export type SeedWorldTerrainPatchShapeV1 =
  | Readonly<{
      kind: "radial-height";
      centerXOffsetMillimetres: number;
      centerZOffsetMillimetres: number;
      radiusMillimetres: number;
      heightDeltaMillimetres: number;
      falloff: "smoothstep";
    }>
  | Readonly<{
      kind: "rect-height";
      minXOffsetMillimetres: number;
      minZOffsetMillimetres: number;
      maxXOffsetMillimetres: number;
      maxZOffsetMillimetres: number;
      heightDeltaMillimetres: number;
      edgeFeatherMillimetres: number;
    }>
  | Readonly<{
      kind: "procedural-landform";
      featureKind: SeedWorldTerrainFeatureKindV1;
      centerXOffsetMillimetres: number;
      centerZOffsetMillimetres: number;
      headingMilliDegrees: number;
      lengthMillimetres: number;
      widthMillimetres: number;
      elevationDeltaMillimetres: number;
      sharpnessPermille: number;
      asymmetryPermille: number;
      roughnessPermille: number;
      erosionPermille: number;
      seed: number;
    }>
  | Readonly<{
      kind: "compact-cosine-hill";
      centerXOffsetMillimetres: number;
      centerZOffsetMillimetres: number;
      headingMilliDegrees: number;
      pedestalLiftMillimetres: number;
      influenceMajorRadiusMillimetres: number;
      influenceMinorRadiusMillimetres: number;
      peakReliefMillimetres: number;
      bodyMajorRadiusMillimetres: number;
      bodyMinorRadiusMillimetres: number;
    }>
  | Readonly<{
      kind: "radial-water-basin";
      featureKind: SeedWorldStandingWaterFeatureKindV1;
      centerXOffsetMillimetres: number;
      centerZOffsetMillimetres: number;
      radiusMillimetres: number;
      depthMillimetres: number;
      shorelineIrregularityPermille: number;
      /** Absolute world-space surface at a full canonical basin. */
      canonicalWaterLevelMillimetres: number;
      /** Persistent effective surface offset from the canonical datum; always non-positive. */
      surfaceLevelOffsetMillimetres: number;
      seed: number;
    }>;

export interface SeedWorldTerrainPatchV1 {
  readonly schemaVersion: typeof SEED_WORLD_TERRAIN_PATCH_SCHEMA_VERSION;
  readonly patchId: string;
  /** Semantic owner prevents Water Body CRUD from overlapping ordinary Terrain Patch CRUD. */
  readonly purpose: "terrain" | "terrain-feature" | "water-body";
  readonly shape: SeedWorldTerrainPatchShapeV1;
  readonly patchContentHash: string;
}

export type SeedWorldVegetationCategoryV1 = "tree" | "shrub" | "grass" | "flower" | "water-grass";
export type SeedWorldPlantKindV1 = "tree" | "shrub" | "grass" | "flower" | "aquatic-grass";
export type SeedWorldVegetationDistributionKindV1 = "single" | "cluster" | "area";

/**
 * Internal semantic density represented by an authored area brush at densityScale=1.
 *
 * Natural habitat-fill operations deliberately use sparse world-scale densities,
 * so they cannot also define what a local "forest" or "grassland" means. Keeping
 * this baseline at the Runtime authoring boundary gives every caller one stable
 * interpretation of the public range/count API without exposing density to callers.
 */
const SEED_WORLD_AUTHORED_VEGETATION_BASE_DENSITY_PER_SQUARE_METRE: Readonly<
  Record<SeedWorldVegetationCategoryV1, number>
> = Object.freeze({
  tree: 0.02,
  shrub: 0.08,
  grass: 8,
  flower: 2,
  "water-grass": 4
});

/** Versioned local vegetation intent stored in the same AuthoringState as Terrain Patches. */
export interface SeedWorldVegetationBrushV1 {
  readonly schemaVersion: typeof SEED_WORLD_VEGETATION_BRUSH_SCHEMA_VERSION;
  readonly brushId: string;
  readonly category: SeedWorldVegetationCategoryV1;
  readonly plantKind: SeedWorldPlantKindV1;
  readonly distributionKind: SeedWorldVegetationDistributionKindV1;
  readonly centerXOffsetMillimetres: number;
  readonly centerZOffsetMillimetres: number;
  readonly radiusMillimetres: number;
  readonly densityScalePermille: number;
  readonly requestedPlantCount?: number;
  readonly seed: number;
  readonly brushContentHash: string;
}

/** Stable parametric river intent. Runtime centerline and terrain carving are derived deterministically. */
export interface SeedWorldRiverV1 {
  readonly schemaVersion: typeof SEED_WORLD_RIVER_SCHEMA_VERSION;
  readonly riverId: string;
  readonly featureKind: SeedWorldFlowingWaterFeatureKindV1;
  readonly startXOffsetMillimetres: number;
  readonly startZOffsetMillimetres: number;
  readonly headingMilliDegrees: number;
  readonly lengthMillimetres: number;
  readonly widthMillimetres: number;
  readonly depthMillimetres: number;
  readonly flowSpeedMillimetresPerSecond: number;
  readonly meanderPermille: number;
  readonly riverContentHash: string;
}

/** Persistent tombstone for one addressable generated/runtime object. */
export interface SeedWorldObjectRemovalV1 {
  readonly schemaVersion: typeof SEED_WORLD_OBJECT_REMOVAL_SCHEMA_VERSION;
  readonly objectId: string;
  readonly objectKind: "tree" | "shrub" | "rock" | "small-rock" | "mushroom";
  readonly centerXOffsetMillimetres: number;
  readonly centerZOffsetMillimetres: number;
  readonly radiusMillimetres: number;
  readonly removalContentHash: string;
}

export interface SeedWorldAuthoringStateV1 {
  readonly schemaVersion: typeof SEED_WORLD_AUTHORING_STATE_SCHEMA_VERSION;
  readonly terrainPatches: readonly Readonly<SeedWorldTerrainPatchV1>[];
  readonly vegetationBrushes: readonly Readonly<SeedWorldVegetationBrushV1>[];
  readonly rivers: readonly Readonly<SeedWorldRiverV1>[];
  readonly objectRemovals: readonly Readonly<SeedWorldObjectRemovalV1>[];
  /** Finite overrides of existing recipe/effect slots; never keyed by tree instance. */
  readonly treeVariationEdits?: readonly SeedWorldTreeVariationEditV1[];
  readonly authoringStateHash: string;
}

export interface SeedWorldTreeVariationEditV1 {
  readonly recipeId: string;
  /** Zero-based editable effect index; GPU catalog slot is variationIndex + 1. */
  readonly variationIndex: number;
  readonly controls: SeedWorldTreeShapePatch;
  readonly baselineControls: SeedWorldTreeShapePatch;
  readonly contentHash: string;
}

export function createSeedWorldTreeVariationEditV1(
  recipeId: string,
  variationIndex: number,
  controls: SeedWorldTreeShapePatch,
  baselineControls: SeedWorldTreeShapePatch
): SeedWorldTreeVariationEditV1 {
  requireNonEmpty(recipeId, "Tree recipe id");
  if (!Number.isInteger(variationIndex) || variationIndex < 0 || variationIndex >= 7)
    throw new RangeError("Tree effect must be 1 through 7");
  const detached = detachSeedWorldTreeShapePatch(controls);
  const baseline = detachSeedWorldTreeShapePatch(baselineControls);
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer.writeRecord("seed-world/tree-variation-edit/v1", 1).writeString(recipeId).writeUint8(variationIndex);
  // Key order must not change canonical identity for otherwise equal partial controls.
  writer.writeString(
    JSON.stringify(Object.fromEntries(Object.entries(detached).sort(([a], [b]) => a.localeCompare(b))))
  );
  writer.writeString(
    JSON.stringify(Object.fromEntries(Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b))))
  );
  return Object.freeze({
    recipeId,
    variationIndex,
    controls: detached,
    baselineControls: baseline,
    contentHash: hash.digestHex()
  });
}

export type SeedWorldEditMergeModeV1 = "absolute-coalescible" | "structural-ordered";

export interface UpsertSeedWorldTerrainPatchOperationV1 {
  readonly kind: "upsert-terrain-patch";
  readonly operationId: string;
  readonly mergeMode: SeedWorldEditMergeModeV1;
  readonly coalesceKey?: string;
  readonly expectedCurrentPatchContentHash?: string;
  readonly patch: Readonly<SeedWorldTerrainPatchV1>;
}

export interface RemoveSeedWorldTerrainPatchOperationV1 {
  readonly kind: "remove-terrain-patch";
  readonly operationId: string;
  readonly mergeMode: "structural-ordered";
  readonly patchId: string;
}

export interface ReorderSeedWorldTerrainPatchOperationV1 {
  readonly kind: "reorder-terrain-patches";
  readonly operationId: string;
  readonly mergeMode: "structural-ordered";
  readonly orderedPatchIds: readonly string[];
}

export interface UpsertSeedWorldVegetationBrushOperationV1 {
  readonly kind: "upsert-vegetation-brush";
  readonly operationId: string;
  readonly mergeMode: "structural-ordered";
  readonly brush: Readonly<SeedWorldVegetationBrushV1>;
}

export interface RemoveSeedWorldVegetationBrushOperationV1 {
  readonly kind: "remove-vegetation-brush";
  readonly operationId: string;
  readonly mergeMode: "structural-ordered";
  readonly brushId: string;
}

export interface UpsertSeedWorldRiverOperationV1 {
  readonly kind: "upsert-river";
  readonly operationId: string;
  readonly mergeMode: "structural-ordered";
  readonly river: Readonly<SeedWorldRiverV1>;
}

export interface RemoveSeedWorldRiverOperationV1 {
  readonly kind: "remove-river";
  readonly operationId: string;
  readonly mergeMode: "structural-ordered";
  readonly riverId: string;
}

export interface UpsertSeedWorldObjectRemovalOperationV1 {
  readonly kind: "upsert-object-removal";
  readonly operationId: string;
  readonly mergeMode: "structural-ordered";
  readonly removal: Readonly<SeedWorldObjectRemovalV1>;
}

export interface RemoveSeedWorldObjectRemovalOperationV1 {
  readonly kind: "remove-object-removal";
  readonly operationId: string;
  readonly mergeMode: "structural-ordered";
  readonly objectId: string;
}

export type SeedWorldEditOperationV1 =
  | Readonly<{
      kind: "upsert-tree-variation";
      operationId: string;
      mergeMode: "structural-ordered";
      edit: SeedWorldTreeVariationEditV1;
    }>
  | Readonly<{
      kind: "remove-tree-variation";
      operationId: string;
      mergeMode: "structural-ordered";
      recipeId: string;
      variationIndex: number;
    }>
  | UpsertSeedWorldTerrainPatchOperationV1
  | RemoveSeedWorldTerrainPatchOperationV1
  | ReorderSeedWorldTerrainPatchOperationV1
  | UpsertSeedWorldVegetationBrushOperationV1
  | RemoveSeedWorldVegetationBrushOperationV1
  | UpsertSeedWorldRiverOperationV1
  | RemoveSeedWorldRiverOperationV1
  | UpsertSeedWorldObjectRemovalOperationV1
  | RemoveSeedWorldObjectRemovalOperationV1;

export interface SeedWorldEditTransactionV1 {
  readonly authoringTransactionSchemaVersion: typeof SEED_WORLD_EDIT_TRANSACTION_SCHEMA_VERSION;
  readonly transactionId: string;
  readonly baseDraftRevision: number;
  readonly operations: readonly Readonly<SeedWorldEditOperationV1>[];
}

export interface SeedWorldEditReceiptV1 {
  readonly transactionId: string;
  readonly transactionPayloadHash: string;
  readonly acceptedDraftRevision: number;
  readonly authoringStateHash: string;
  readonly coalescedKeys: readonly string[];
  readonly status: "accepted";
}

export interface SeedWorldEditRejectedV1 {
  readonly transactionId: string;
  readonly status: "rejected";
  readonly code: "ABORTED_NOT_APPLIED" | "TRANSACTION_ID_REUSE_CONFLICT" | "STALE_DRAFT_REVISION" | "EDIT_CONFLICT";
  readonly currentDraftRevision: number;
  readonly message: string;
}

export type SeedWorldEditApplyResultV1 = SeedWorldEditReceiptV1 | SeedWorldEditRejectedV1;

export interface SeedWorldDiscardReceiptV1 {
  readonly status: "discarded";
  readonly discardedDraftRevision: number;
  readonly nextDraftRevision: number;
  readonly authoringStateHash: string;
}

export interface SeedWorldAuthoringCoordinatorSnapshotV1 {
  readonly activeRevision: number;
  readonly draftRevision: number;
  readonly activeAuthoringState: Readonly<SeedWorldAuthoringStateV1>;
  readonly draftAuthoringState: Readonly<SeedWorldAuthoringStateV1>;
  readonly receiptLedgerEntryCount: number;
}

export interface SeedWorldAuthoringCoordinatorOptionsV1 {
  readonly onDraftChanged?: (draftRevision: number, draft: Readonly<SeedWorldAuthoringStateV1>) => void;
}

export function createSeedWorldTerrainPatchV1(
  patchId: string,
  shape: SeedWorldTerrainPatchShapeV1,
  purpose: SeedWorldTerrainPatchV1["purpose"] = "terrain"
): Readonly<SeedWorldTerrainPatchV1> {
  requireNonEmpty(patchId, "Terrain Patch id");
  if (purpose !== "terrain" && purpose !== "terrain-feature" && purpose !== "water-body")
    throw new RangeError(`Unsupported Terrain Patch purpose '${purpose}'.`);
  validatePatchShape(shape);
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer.writeRecord("seed-world-water/terrain-patch/v2", SEED_WORLD_TERRAIN_PATCH_SCHEMA_VERSION).writeString(patchId);
  // Keep historical terrain-only V1 identities stable while tagging Water Body resources.
  if (purpose === "water-body") writer.writeString("purpose:water-body/v1");
  else if (purpose === "terrain-feature") writer.writeString("purpose:terrain-feature/v1");
  writePatchShape(writer, shape);
  return Object.freeze({
    schemaVersion: SEED_WORLD_TERRAIN_PATCH_SCHEMA_VERSION,
    patchId,
    purpose,
    shape: Object.freeze({ ...shape }),
    patchContentHash: hash.digestHex()
  });
}

export function createSeedWorldVegetationBrushV1(
  brushId: string,
  input: Readonly<{
    category: SeedWorldVegetationCategoryV1;
    plantKind: SeedWorldPlantKindV1;
    distributionKind: SeedWorldVegetationDistributionKindV1;
    centerXOffsetMillimetres: number;
    centerZOffsetMillimetres: number;
    radiusMillimetres: number;
    densityScalePermille: number;
    requestedPlantCount?: number;
    seed: number;
  }>
): Readonly<SeedWorldVegetationBrushV1> {
  requireNonEmpty(brushId, "Vegetation Brush id");
  validateVegetationBrushInput(input);
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer.writeRecord("seed-world/vegetation-brush/v3", SEED_WORLD_VEGETATION_BRUSH_SCHEMA_VERSION).writeString(brushId);
  writeVegetationBrushContent(writer, input);
  return Object.freeze({
    schemaVersion: SEED_WORLD_VEGETATION_BRUSH_SCHEMA_VERSION,
    brushId,
    category: input.category,
    plantKind: input.plantKind,
    distributionKind: input.distributionKind,
    centerXOffsetMillimetres: input.centerXOffsetMillimetres,
    centerZOffsetMillimetres: input.centerZOffsetMillimetres,
    radiusMillimetres: input.radiusMillimetres,
    densityScalePermille: input.densityScalePermille,
    requestedPlantCount: input.requestedPlantCount,
    seed: input.seed,
    brushContentHash: hash.digestHex()
  });
}

export function createSeedWorldRiverV1(
  riverId: string,
  input: Readonly<{
    featureKind: SeedWorldFlowingWaterFeatureKindV1;
    startXOffsetMillimetres: number;
    startZOffsetMillimetres: number;
    headingMilliDegrees: number;
    lengthMillimetres: number;
    widthMillimetres: number;
    depthMillimetres: number;
    flowSpeedMillimetresPerSecond: number;
    meanderPermille: number;
  }>
): Readonly<SeedWorldRiverV1> {
  requireNonEmpty(riverId, "River id");
  validateRiverInput(input);
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer.writeRecord("seed-world/river/v1", SEED_WORLD_RIVER_SCHEMA_VERSION).writeString(riverId);
  writeRiverContent(writer, input);
  return Object.freeze({
    schemaVersion: SEED_WORLD_RIVER_SCHEMA_VERSION,
    riverId,
    ...input,
    riverContentHash: hash.digestHex()
  });
}

export function createSeedWorldObjectRemovalV1(
  objectId: string,
  input: Readonly<{
    objectKind: SeedWorldObjectRemovalV1["objectKind"];
    centerXOffsetMillimetres: number;
    centerZOffsetMillimetres: number;
    radiusMillimetres: number;
  }>
): Readonly<SeedWorldObjectRemovalV1> {
  requireNonEmpty(objectId, "World Object id");
  validateObjectRemovalInput(input);
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer.writeRecord("seed-world/object-removal/v1", SEED_WORLD_OBJECT_REMOVAL_SCHEMA_VERSION).writeString(objectId);
  writeObjectRemovalContent(writer, input);
  return Object.freeze({
    schemaVersion: SEED_WORLD_OBJECT_REMOVAL_SCHEMA_VERSION,
    objectId,
    ...input,
    removalContentHash: hash.digestHex()
  });
}

export function createEmptySeedWorldAuthoringStateV1(): Readonly<SeedWorldAuthoringStateV1> {
  return createAuthoringState([], [], [], []);
}

/**
 * Replays an untrusted persisted value through every resource constructor and
 * verifies both the resource hashes and the aggregate AuthoringState hash.
 */
export function hydrateSeedWorldAuthoringStateV1(value: unknown): Readonly<SeedWorldAuthoringStateV1> {
  const record = requireRecord(value, "Seed World AuthoringState");
  if (record.schemaVersion !== SEED_WORLD_AUTHORING_STATE_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported Seed World AuthoringState schema ${String(record.schemaVersion)}.`);
  }
  const terrainPatches = requireRecordArray(record.terrainPatches, "Terrain Patches").map((item) => {
    const patch = createSeedWorldTerrainPatchV1(
      item.patchId as string,
      item.shape as SeedWorldTerrainPatchShapeV1,
      item.purpose as SeedWorldTerrainPatchV1["purpose"]
    );
    requireMatchingHash(item.patchContentHash, patch.patchContentHash, `Terrain Patch '${patch.patchId}'`);
    return patch;
  });
  const vegetationBrushes = requireRecordArray(record.vegetationBrushes, "Vegetation Brushes").map((item) => {
    const brush = createSeedWorldVegetationBrushV1(
      item.brushId as string,
      item as unknown as SeedWorldVegetationBrushV1
    );
    requireMatchingHash(item.brushContentHash, brush.brushContentHash, `Vegetation Brush '${brush.brushId}'`);
    return brush;
  });
  const rivers = requireRecordArray(record.rivers, "Rivers").map((item) => {
    const river = createSeedWorldRiverV1(item.riverId as string, item as unknown as SeedWorldRiverV1);
    requireMatchingHash(item.riverContentHash, river.riverContentHash, `River '${river.riverId}'`);
    return river;
  });
  const objectRemovals = requireRecordArray(record.objectRemovals, "World Object removals").map((item) => {
    const removal = createSeedWorldObjectRemovalV1(
      item.objectId as string,
      item as unknown as SeedWorldObjectRemovalV1
    );
    requireMatchingHash(
      item.removalContentHash,
      removal.removalContentHash,
      `World Object removal '${removal.objectId}'`
    );
    return removal;
  });
  const treeVariationEdits =
    record.treeVariationEdits === undefined
      ? []
      : requireRecordArray(record.treeVariationEdits, "Tree variation edits").map((item) => {
          const edit = createSeedWorldTreeVariationEditV1(
            item.recipeId as string,
            item.variationIndex as number,
            item.controls as SeedWorldTreeShapePatch,
            item.baselineControls as SeedWorldTreeShapePatch
          );
          requireMatchingHash(
            item.contentHash,
            edit.contentHash,
            `Tree variation '${edit.recipeId}/${edit.variationIndex}'`
          );
          return edit;
        });
  requireUniqueResourceIds(terrainPatches, ({ patchId }) => patchId, "Terrain Patch");
  requireUniqueResourceIds(vegetationBrushes, ({ brushId }) => brushId, "Vegetation Brush");
  requireUniqueResourceIds(rivers, ({ riverId }) => riverId, "River");
  requireUniqueResourceIds(objectRemovals, ({ objectId }) => objectId, "World Object removal");
  requireUniqueResourceIds(
    treeVariationEdits,
    ({ recipeId, variationIndex }) => `${recipeId}/${variationIndex}`,
    "Tree variation"
  );
  const hydrated = createAuthoringState(terrainPatches, vegetationBrushes, rivers, objectRemovals, treeVariationEdits);
  requireMatchingHash(record.authoringStateHash, hydrated.authoringStateHash, "Seed World AuthoringState");
  return hydrated;
}

/** Applies saved vegetation resources to a Root Plan before authoritative compilation. */
export function applySeedWorldAuthoringStateToPlanV1(
  rootPlan: SeedWorldPlan,
  authoringState: Readonly<SeedWorldAuthoringStateV1>
): SeedWorldPlan {
  if (authoringState.vegetationBrushes.length === 0) return rootPlan;
  const treeScatterOperations = [...rootPlan.treeScatterOperations];
  const detailBrushOperations = [...rootPlan.detailBrushOperations];
  const worldSizeMillimetres = Math.round(rootPlan.sizeMetres * 1_000);
  for (const brush of authoringState.vegetationBrushes) {
    validateVegetationBrush(brush);
    if (
      brush.centerXOffsetMillimetres > worldSizeMillimetres ||
      brush.centerZOffsetMillimetres > worldSizeMillimetres
    ) {
      throw new RangeError(`Vegetation Brush '${brush.brushId}' center lies outside the Root Plan.`);
    }
    const center = Object.freeze({
      x: brush.centerXOffsetMillimetres / worldSizeMillimetres,
      y: brush.centerZOffsetMillimetres / worldSizeMillimetres
    });
    const radiusMetres = brush.radiusMillimetres / 1_000;
    const densityScale = brush.densityScalePermille / 1_000;
    const targetAreaDensityPerSquareMetre = resolveAuthoredVegetationAreaDensity(brush, radiusMetres, densityScale);
    if (brush.category === "tree" || brush.category === "shrub") {
      const sources = rootPlan.treeScatterOperations.filter(
        (operation) => operation.category === brush.category && operation.distribution === "habitat-fill"
      );
      if (sources.length === 0) throw new Error(`Root Plan has no ${brush.category} vegetation prototype.`);
      const sourceDensityTotal = sumPositiveDensity(sources.map((source) => source.densityPerSquareMetre));
      for (const source of sources) {
        const id = `${brush.brushId}:${source.prototypeFamily}`;
        const operation: SeedWorldTreeScatterOperation = Object.freeze({
          ...source,
          id,
          distribution: "local-brush",
          authoringBrushId: brush.brushId,
          center,
          radiusMetres,
          ...(brush.distributionKind === "single" || brush.distributionKind === "cluster"
            ? {
                exactInstanceCount: brush.requestedPlantCount,
                exactPlacement: brush.distributionKind === "single" ? ("center" as const) : ("scatter" as const)
              }
            : {}),
          densityPerSquareMetre:
            brush.distributionKind === "single" || brush.distributionKind === "cluster"
              ? source.densityPerSquareMetre
              : distributeAuthoredAreaDensity(
                  targetAreaDensityPerSquareMetre,
                  source.densityPerSquareMetre,
                  sourceDensityTotal
                ),
          seed: deriveVegetationOperationSeed(brush.seed, id)
        });
        const existing = treeScatterOperations.findIndex((candidate) => candidate.id === id);
        if (existing < 0) treeScatterOperations.push(operation);
        else treeScatterOperations[existing] = operation;
      }
    } else {
      const sources =
        brush.category === "water-grass"
          ? [createWaterGrassDetailSource(brush.seed)]
          : rootPlan.detailBrushOperations.filter(
              (operation) => operation.category === brush.category && operation.distribution === "habitat-fill"
            );
      if (sources.length === 0) throw new Error(`Root Plan has no ${brush.category} Detail prototype.`);
      const sourceDensityTotal = sumPositiveDensity(sources.map((source) => source.targetDensityPerSquareMetre));
      const aquaticHabitatMasks =
        brush.category === "water-grass" ? createAquaticHabitatMasks(authoringState, rootPlan.sizeMetres) : undefined;
      for (const source of sources) {
        const id = `${brush.brushId}:${source.prototypeFamily}`;
        const operation: SeedWorldDetailBrushOperation = Object.freeze({
          ...source,
          id,
          distribution: "local-brush",
          center,
          radiusMetres,
          ...(aquaticHabitatMasks ? { aquaticHabitatMasks } : {}),
          targetDensityPerSquareMetre: distributeAuthoredAreaDensity(
            targetAreaDensityPerSquareMetre,
            source.targetDensityPerSquareMetre,
            sourceDensityTotal
          ),
          seed: deriveVegetationOperationSeed(brush.seed, id)
        });
        const existing = detailBrushOperations.findIndex((candidate) => candidate.id === id);
        if (existing < 0) detailBrushOperations.push(operation);
        else detailBrushOperations[existing] = operation;
      }
    }
  }
  return Object.freeze({
    ...rootPlan,
    treeScatterOperations: Object.freeze(treeScatterOperations),
    detailBrushOperations: Object.freeze(detailBrushOperations)
  });
}

function resolveAuthoredVegetationAreaDensity(
  brush: Readonly<SeedWorldVegetationBrushV1>,
  radiusMetres: number,
  densityScale: number
): number {
  if (brush.distributionKind !== "area") return 0;
  if (brush.requestedPlantCount !== undefined) {
    const areaSquareMetres = Math.PI * radiusMetres * radiusMetres;
    return brush.requestedPlantCount / areaSquareMetres;
  }
  return SEED_WORLD_AUTHORED_VEGETATION_BASE_DENSITY_PER_SQUARE_METRE[brush.category] * densityScale;
}

function sumPositiveDensity(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || !Number.isFinite(total)) {
    throw new RangeError("Authored vegetation requires a positive finite source density.");
  }
  return total;
}

function distributeAuthoredAreaDensity(
  targetDensityPerSquareMetre: number,
  sourceDensityPerSquareMetre: number,
  sourceDensityTotal: number
): number {
  return targetDensityPerSquareMetre * (sourceDensityPerSquareMetre / sourceDensityTotal);
}

function createWaterGrassDetailSource(seed: number): SeedWorldDetailBrushOperation {
  const profile = SEED_WORLD_DETAIL_SPECIES_PROFILES.find((candidate) => candidate.key === "water-grass");
  if (!profile) throw new Error("The water-grass Detail species profile is unavailable.");
  return Object.freeze({
    id: "water-grass-authoring-source",
    category: profile.category,
    brushMaskKey: "hard-circle",
    prototypeFamily: profile.key,
    distribution: "habitat-fill",
    opacity: 1,
    targetDensityPerSquareMetre: profile.targetDensityPerSquareMetre,
    seed
  });
}

function createAquaticHabitatMasks(
  authoringState: Readonly<SeedWorldAuthoringStateV1>,
  sizeMetres: number
): readonly SeedWorldAquaticHabitatMask[] {
  const worldSizeMillimetres = Math.round(sizeMetres * 1_000);
  const basins: SeedWorldAquaticHabitatMask[] = authoringState.terrainPatches.flatMap((patch) => {
    if (patch.purpose !== "water-body" || patch.shape.kind !== "radial-water-basin") return [];
    return [
      Object.freeze({
        kind: "radial" as const,
        center: Object.freeze({
          x: patch.shape.centerXOffsetMillimetres / worldSizeMillimetres,
          y: patch.shape.centerZOffsetMillimetres / worldSizeMillimetres
        }),
        radiusMetres: patch.shape.radiusMillimetres / 1_000,
        featureKind: patch.shape.featureKind,
        shorelineIrregularityPermille: patch.shape.shorelineIrregularityPermille,
        seed: patch.shape.seed
      })
    ];
  });
  const rivers: SeedWorldAquaticHabitatMask[] = authoringState.rivers.map((river) => {
    const shape = createSeedWorldFlowingWaterLakeSurrogateShapeV1(river);
    return Object.freeze({
      kind: "radial" as const,
      center: Object.freeze({
        x: shape.centerXOffsetMillimetres / worldSizeMillimetres,
        y: shape.centerZOffsetMillimetres / worldSizeMillimetres
      }),
      radiusMetres: shape.radiusMillimetres / 1_000,
      featureKind: shape.featureKind,
      shorelineIrregularityPermille: shape.shorelineIrregularityPermille,
      seed: shape.seed
    });
  });
  return Object.freeze([...basins, ...rivers]);
}

export class SeedWorldWorldEditCoordinatorV1 {
  private readonly _receiptLedger = new Map<string, Readonly<SeedWorldEditReceiptV1>>();
  private readonly _unpublishedCoalesceKeys = new Set<string>();
  private readonly _onDraftChanged?: SeedWorldAuthoringCoordinatorOptionsV1["onDraftChanged"];
  private _activeAuthoringState: Readonly<SeedWorldAuthoringStateV1>;
  private _draftAuthoringState: Readonly<SeedWorldAuthoringStateV1>;
  private _activeRevision = 0;
  private _draftRevision = 0;
  private _destroyed = false;

  constructor(options: Readonly<SeedWorldAuthoringCoordinatorOptionsV1> = {}) {
    this._onDraftChanged = options.onDraftChanged;
    this._activeAuthoringState = createEmptySeedWorldAuthoringStateV1();
    this._draftAuthoringState = this._activeAuthoringState;
  }

  async applyWorldEdit(
    transaction: Readonly<SeedWorldEditTransactionV1>,
    signal?: AbortSignal
  ): Promise<Readonly<SeedWorldEditApplyResultV1>> {
    this._assertActive();
    validateTransactionEnvelope(transaction);
    const transactionPayloadHash = hashWorldEditTransactionPayload(transaction);
    const existing = this._receiptLedger.get(transaction.transactionId);
    if (existing) {
      if (existing.transactionPayloadHash === transactionPayloadHash) return existing;
      return this._reject(
        transaction.transactionId,
        "TRANSACTION_ID_REUSE_CONFLICT",
        "transactionId was reused with different semantics."
      );
    }
    if (signal?.aborted) {
      return this._reject(
        transaction.transactionId,
        "ABORTED_NOT_APPLIED",
        "World edit was aborted before the acceptance boundary."
      );
    }
    const stale = transaction.baseDraftRevision !== this._draftRevision;
    if (stale) {
      const staleValidation = validateStaleCoalescibleOperations(transaction.operations, this._draftAuthoringState);
      if (staleValidation)
        return this._reject(transaction.transactionId, staleValidation.code, staleValidation.message);
    }
    let nextState: Readonly<SeedWorldAuthoringStateV1>;
    try {
      nextState = applyOperations(this._draftAuthoringState, transaction.operations);
    } catch (error) {
      return this._reject(
        transaction.transactionId,
        "EDIT_CONFLICT",
        error instanceof Error ? error.message : String(error)
      );
    }
    const coalescedKeys: string[] = [];
    for (const operation of transaction.operations) {
      if (operation.mergeMode !== "absolute-coalescible") continue;
      const key = requireCoalesceKey(operation);
      if (this._unpublishedCoalesceKeys.has(key)) coalescedKeys.push(key);
      this._unpublishedCoalesceKeys.add(key);
    }
    this._draftRevision++;
    this._draftAuthoringState = nextState;
    const receipt = Object.freeze({
      transactionId: transaction.transactionId,
      transactionPayloadHash,
      acceptedDraftRevision: this._draftRevision,
      authoringStateHash: nextState.authoringStateHash,
      coalescedKeys: Object.freeze(coalescedKeys.sort()),
      status: "accepted" as const
    });
    this._receiptLedger.set(transaction.transactionId, receipt);
    this._onDraftChanged?.(this._draftRevision, nextState);
    return receipt;
  }

  flushSnapshot(): Readonly<{
    draftRevision: number;
    authoringState: Readonly<SeedWorldAuthoringStateV1>;
  }> {
    this._assertActive();
    return Object.freeze({ draftRevision: this._draftRevision, authoringState: this._draftAuthoringState });
  }

  commitDraft(expectedDraftRevision: number, expectedAuthoringStateHash: string): Readonly<SeedWorldAuthoringStateV1> {
    this._assertActive();
    if (
      expectedDraftRevision !== this._draftRevision ||
      expectedAuthoringStateHash !== this._draftAuthoringState.authoringStateHash
    ) {
      throw new Error("Cannot commit a stale WorldAuthoringState Draft.");
    }
    this._activeRevision = expectedDraftRevision;
    this._activeAuthoringState = this._draftAuthoringState;
    this._unpublishedCoalesceKeys.clear();
    return this._activeAuthoringState;
  }

  discardDraft(expectedDraftRevision: number): Readonly<SeedWorldDiscardReceiptV1> | Readonly<SeedWorldEditRejectedV1> {
    this._assertActive();
    if (expectedDraftRevision !== this._draftRevision) {
      return this._reject("discard-draft", "STALE_DRAFT_REVISION", "discardDraft expected a different Draft Revision.");
    }
    const discardedDraftRevision = this._draftRevision;
    this._draftRevision++;
    this._draftAuthoringState = this._activeAuthoringState;
    this._unpublishedCoalesceKeys.clear();
    this._onDraftChanged?.(this._draftRevision, this._draftAuthoringState);
    return Object.freeze({
      status: "discarded",
      discardedDraftRevision,
      nextDraftRevision: this._draftRevision,
      authoringStateHash: this._draftAuthoringState.authoringStateHash
    });
  }

  get snapshot(): Readonly<SeedWorldAuthoringCoordinatorSnapshotV1> {
    return Object.freeze({
      activeRevision: this._activeRevision,
      draftRevision: this._draftRevision,
      activeAuthoringState: this._activeAuthoringState,
      draftAuthoringState: this._draftAuthoringState,
      receiptLedgerEntryCount: this._receiptLedger.size
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._receiptLedger.clear();
    this._unpublishedCoalesceKeys.clear();
  }

  private _reject(
    transactionId: string,
    code: SeedWorldEditRejectedV1["code"],
    message: string
  ): Readonly<SeedWorldEditRejectedV1> {
    return Object.freeze({
      transactionId,
      status: "rejected",
      code,
      currentDraftRevision: this._draftRevision,
      message
    });
  }

  private _assertActive(): void {
    if (this._destroyed) throw new Error("WorldEditTransaction Coordinator has been destroyed.");
  }
}

export function hashWorldEditTransactionPayload(transaction: Readonly<SeedWorldEditTransactionV1>): string {
  let payloadByteLength = 0;
  const measuringWriter = new CanonicalWaterBinaryWriterV1({
    update(bytes) {
      payloadByteLength += bytes.byteLength;
      if (payloadByteLength > 0xffff_ffff) {
        throw new RangeError("World Edit canonical transaction payload exceeds Uint32 framing capacity.");
      }
    }
  });
  writeWorldEditTransactionPayload(measuringWriter, transaction);
  const { writer, hash } = createCanonicalWaterHashWriter();
  // Preserve the former writeBytes framing while streaming the payload directly into SHA-256.
  // The first pass measures only; it never allocates an unbounded transaction-sized scratch buffer.
  writer.writeUint32(payloadByteLength);
  writeWorldEditTransactionPayload(writer, transaction);
  return hash.digestHex();
}

function writeWorldEditTransactionPayload(
  writer: CanonicalWaterBinaryWriterV1,
  transaction: Readonly<SeedWorldEditTransactionV1>
): void {
  writer
    .writeRecord("seed-world-water/world-edit-transaction/v1", transaction.authoringTransactionSchemaVersion)
    .writeUint32(transaction.baseDraftRevision)
    .writeArray(transaction.operations, (itemWriter, operation) => writeOperation(itemWriter, operation));
}

function createAuthoringState(
  terrainPatches: readonly Readonly<SeedWorldTerrainPatchV1>[],
  vegetationBrushes: readonly Readonly<SeedWorldVegetationBrushV1>[],
  rivers: readonly Readonly<SeedWorldRiverV1>[],
  objectRemovals: readonly Readonly<SeedWorldObjectRemovalV1>[],
  treeVariationEdits: readonly SeedWorldTreeVariationEditV1[] = []
): Readonly<SeedWorldAuthoringStateV1> {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/authoring-state/v2", SEED_WORLD_AUTHORING_STATE_SCHEMA_VERSION)
    .writeArray(terrainPatches, (itemWriter, patch) => {
      itemWriter.writeString(patch.patchId).writeFixedBytes(canonicalSha256HexToBytes(patch.patchContentHash), 32);
    });
  // Preserve the canonical identity of historical terrain-only V1 states while extending
  // the envelope with a domain-tagged vegetation section when it is actually present.
  if (vegetationBrushes.length > 0) {
    writer.writeString("vegetation-brushes/v1").writeArray(vegetationBrushes, (itemWriter, brush) => {
      itemWriter.writeString(brush.brushId).writeFixedBytes(canonicalSha256HexToBytes(brush.brushContentHash), 32);
    });
  }
  if (rivers.length > 0) {
    writer.writeString("rivers/v1").writeArray(rivers, (itemWriter, river) => {
      itemWriter.writeString(river.riverId).writeFixedBytes(canonicalSha256HexToBytes(river.riverContentHash), 32);
    });
  }
  if (objectRemovals.length > 0) {
    writer.writeString("object-removals/v1").writeArray(objectRemovals, (itemWriter, removal) => {
      itemWriter
        .writeString(removal.objectId)
        .writeFixedBytes(canonicalSha256HexToBytes(removal.removalContentHash), 32);
    });
  }
  if (treeVariationEdits.length > 0) {
    writer.writeString("tree-variation-edits/v1").writeArray(treeVariationEdits, (itemWriter, edit) => {
      itemWriter
        .writeString(edit.recipeId)
        .writeUint8(edit.variationIndex)
        .writeFixedBytes(canonicalSha256HexToBytes(edit.contentHash), 32);
    });
  }
  return Object.freeze({
    schemaVersion: SEED_WORLD_AUTHORING_STATE_SCHEMA_VERSION,
    terrainPatches: Object.freeze([...terrainPatches]),
    vegetationBrushes: Object.freeze([...vegetationBrushes]),
    rivers: Object.freeze([...rivers]),
    objectRemovals: Object.freeze([...objectRemovals]),
    ...(treeVariationEdits.length ? { treeVariationEdits: Object.freeze([...treeVariationEdits]) } : {}),
    authoringStateHash: hash.digestHex()
  });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value.map((item, index) => requireRecord(item, `${label}[${index}]`));
}

function requireMatchingHash(actual: unknown, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`${label} hash mismatch.`);
}

function requireUniqueResourceIds<T>(items: readonly T[], readId: (item: T) => string, label: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    const id = readId(item);
    if (ids.has(id)) throw new Error(`Duplicate ${label} id '${id}'.`);
    ids.add(id);
  }
}

function applyOperations(
  source: Readonly<SeedWorldAuthoringStateV1>,
  operations: readonly Readonly<SeedWorldEditOperationV1>[]
): Readonly<SeedWorldAuthoringStateV1> {
  const patches = [...source.terrainPatches];
  const vegetationBrushes = [...source.vegetationBrushes];
  const rivers = [...source.rivers];
  const objectRemovals = [...source.objectRemovals];
  const treeVariationEdits = [...(source.treeVariationEdits ?? [])];
  const operationIds = new Set<string>();
  for (const operation of operations) {
    requireNonEmpty(operation.operationId, "World edit operation id");
    if (operationIds.has(operation.operationId)) throw new Error(`Duplicate operationId '${operation.operationId}'.`);
    operationIds.add(operation.operationId);
    if (operation.kind === "upsert-tree-variation") {
      const edit = createSeedWorldTreeVariationEditV1(
        operation.edit.recipeId,
        operation.edit.variationIndex,
        operation.edit.controls,
        operation.edit.baselineControls
      );
      if (edit.contentHash !== operation.edit.contentHash) throw new Error("Tree variation edit content hash mismatch");
      const index = treeVariationEdits.findIndex(
        ({ recipeId, variationIndex }) => recipeId === edit.recipeId && variationIndex === edit.variationIndex
      );
      if (index < 0) treeVariationEdits.push(edit);
      else treeVariationEdits[index] = edit;
    } else if (operation.kind === "remove-tree-variation") {
      const index = treeVariationEdits.findIndex(
        ({ recipeId, variationIndex }) => recipeId === operation.recipeId && variationIndex === operation.variationIndex
      );
      if (index < 0) throw new Error(`Tree effect '${operation.recipeId}/${operation.variationIndex}' does not exist`);
      treeVariationEdits.splice(index, 1);
    } else if (operation.kind === "upsert-terrain-patch") {
      validatePatch(operation.patch);
      if (operation.mergeMode === "absolute-coalescible") requireCoalesceKey(operation);
      else if (operation.coalesceKey !== undefined) throw new Error("Structural operation cannot carry coalesceKey.");
      const index = patches.findIndex(({ patchId }) => patchId === operation.patch.patchId);
      if (index < 0) patches.push(operation.patch);
      else patches[index] = operation.patch;
    } else if (operation.kind === "remove-terrain-patch") {
      const index = patches.findIndex(({ patchId }) => patchId === operation.patchId);
      if (index < 0) throw new Error(`Terrain Patch '${operation.patchId}' does not exist.`);
      patches.splice(index, 1);
    } else if (operation.kind === "reorder-terrain-patches") {
      if (operation.orderedPatchIds.length !== patches.length) {
        throw new Error("Terrain Patch reorder must name every current Patch exactly once.");
      }
      const patchById = new Map(patches.map((patch) => [patch.patchId, patch]));
      const reordered = operation.orderedPatchIds.map((patchId) => {
        const patch = patchById.get(patchId);
        if (!patch) throw new Error(`Terrain Patch reorder references unknown '${patchId}'.`);
        patchById.delete(patchId);
        return patch;
      });
      if (patchById.size > 0) throw new Error("Terrain Patch reorder contains duplicate ids.");
      patches.splice(0, patches.length, ...reordered);
    } else if (operation.kind === "upsert-vegetation-brush") {
      validateVegetationBrush(operation.brush);
      const index = vegetationBrushes.findIndex(({ brushId }) => brushId === operation.brush.brushId);
      if (index < 0) vegetationBrushes.push(operation.brush);
      else if (vegetationBrushes[index]!.brushContentHash !== operation.brush.brushContentHash) {
        // Authoring order is the deterministic ownership priority used by Population replay.
        // An updated Brush is the current writer, so it is solved after every unchanged owner and must avoid them.
        vegetationBrushes.splice(index, 1);
        vegetationBrushes.push(operation.brush);
      }
    } else if (operation.kind === "remove-vegetation-brush") {
      const index = vegetationBrushes.findIndex(({ brushId }) => brushId === operation.brushId);
      if (index < 0) throw new Error(`Vegetation Brush '${operation.brushId}' does not exist.`);
      vegetationBrushes.splice(index, 1);
    } else if (operation.kind === "upsert-river") {
      validateRiver(operation.river);
      const index = rivers.findIndex(({ riverId }) => riverId === operation.river.riverId);
      if (index < 0) rivers.push(operation.river);
      else rivers[index] = operation.river;
    } else if (operation.kind === "remove-river") {
      const index = rivers.findIndex(({ riverId }) => riverId === operation.riverId);
      if (index < 0) throw new Error(`River '${operation.riverId}' does not exist.`);
      rivers.splice(index, 1);
    } else if (operation.kind === "upsert-object-removal") {
      validateObjectRemoval(operation.removal);
      const index = objectRemovals.findIndex(({ objectId }) => objectId === operation.removal.objectId);
      if (index < 0) objectRemovals.push(operation.removal);
      else objectRemovals[index] = operation.removal;
    } else {
      const index = objectRemovals.findIndex(({ objectId }) => objectId === operation.objectId);
      if (index < 0) throw new Error(`World Object removal '${operation.objectId}' does not exist.`);
      objectRemovals.splice(index, 1);
    }
  }
  return createAuthoringState(patches, vegetationBrushes, rivers, objectRemovals, treeVariationEdits);
}

function validateStaleCoalescibleOperations(
  operations: readonly Readonly<SeedWorldEditOperationV1>[],
  draft: Readonly<SeedWorldAuthoringStateV1>
): { readonly code: "STALE_DRAFT_REVISION" | "EDIT_CONFLICT"; readonly message: string } | undefined {
  if (
    operations.some(
      (operation) => operation.kind !== "upsert-terrain-patch" || operation.mergeMode !== "absolute-coalescible"
    )
  ) {
    return { code: "STALE_DRAFT_REVISION", message: "Only absolute-coalescible Upserts may rebase a stale Draft." };
  }
  for (const operation of operations as readonly UpsertSeedWorldTerrainPatchOperationV1[]) {
    requireCoalesceKey(operation);
    const current = draft.terrainPatches.find(({ patchId }) => patchId === operation.patch.patchId);
    if (!current || operation.expectedCurrentPatchContentHash !== current.patchContentHash) {
      return {
        code: "EDIT_CONFLICT",
        message: `Stale Terrain Patch '${operation.patch.patchId}' precondition failed.`
      };
    }
  }
  return undefined;
}

function validateTransactionEnvelope(transaction: Readonly<SeedWorldEditTransactionV1>): void {
  if (transaction.authoringTransactionSchemaVersion !== SEED_WORLD_EDIT_TRANSACTION_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported World Edit Transaction schema ${transaction.authoringTransactionSchemaVersion}.`);
  }
  requireNonEmpty(transaction.transactionId, "World Edit transactionId");
  if (!Number.isSafeInteger(transaction.baseDraftRevision) || transaction.baseDraftRevision < 0) {
    throw new RangeError("World Edit baseDraftRevision must be a non-negative safe integer.");
  }
  if (transaction.operations.length === 0) throw new RangeError("World Edit Transaction must contain an operation.");
}

function writeOperation(writer: CanonicalWaterBinaryWriterV1, operation: Readonly<SeedWorldEditOperationV1>): void {
  writer.writeString(operation.operationId);
  if (operation.kind === "upsert-tree-variation") {
    writer
      .writeUint8(10)
      .writeString(operation.edit.recipeId)
      .writeUint8(operation.edit.variationIndex)
      .writeFixedBytes(canonicalSha256HexToBytes(operation.edit.contentHash), 32);
  } else if (operation.kind === "remove-tree-variation") {
    writer.writeUint8(11).writeString(operation.recipeId).writeUint8(operation.variationIndex);
  } else if (operation.kind === "upsert-terrain-patch") {
    writer
      .writeUint8(1)
      .writeUint8(operation.mergeMode === "absolute-coalescible" ? 1 : 2)
      .writeOptional(operation.coalesceKey, (itemWriter, value) => itemWriter.writeString(value))
      .writeOptional(operation.expectedCurrentPatchContentHash, (itemWriter, value) =>
        itemWriter.writeFixedBytes(canonicalSha256HexToBytes(value), 32)
      )
      .writeString(operation.patch.patchId)
      .writeFixedBytes(canonicalSha256HexToBytes(operation.patch.patchContentHash), 32);
  } else if (operation.kind === "remove-terrain-patch") {
    writer.writeUint8(2).writeString(operation.patchId);
  } else if (operation.kind === "reorder-terrain-patches") {
    writer
      .writeUint8(3)
      .writeArray(operation.orderedPatchIds, (itemWriter, patchId) => itemWriter.writeString(patchId));
  } else if (operation.kind === "upsert-vegetation-brush") {
    writer
      .writeUint8(4)
      .writeString(operation.brush.brushId)
      .writeFixedBytes(canonicalSha256HexToBytes(operation.brush.brushContentHash), 32);
  } else if (operation.kind === "remove-vegetation-brush") {
    writer.writeUint8(5).writeString(operation.brushId);
  } else if (operation.kind === "upsert-river") {
    writer
      .writeUint8(6)
      .writeString(operation.river.riverId)
      .writeFixedBytes(canonicalSha256HexToBytes(operation.river.riverContentHash), 32);
  } else if (operation.kind === "remove-river") {
    writer.writeUint8(7).writeString(operation.riverId);
  } else if (operation.kind === "upsert-object-removal") {
    writer
      .writeUint8(8)
      .writeString(operation.removal.objectId)
      .writeFixedBytes(canonicalSha256HexToBytes(operation.removal.removalContentHash), 32);
  } else {
    writer.writeUint8(9).writeString(operation.objectId);
  }
}

function validateObjectRemoval(removal: Readonly<SeedWorldObjectRemovalV1>): void {
  if (removal.schemaVersion !== SEED_WORLD_OBJECT_REMOVAL_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported World Object removal schema ${removal.schemaVersion}.`);
  }
  const replay = createSeedWorldObjectRemovalV1(removal.objectId, removal);
  if (replay.removalContentHash !== removal.removalContentHash) {
    throw new Error(`World Object removal '${removal.objectId}' hash mismatch.`);
  }
}

function validateObjectRemovalInput(
  input: Pick<
    SeedWorldObjectRemovalV1,
    "objectKind" | "centerXOffsetMillimetres" | "centerZOffsetMillimetres" | "radiusMillimetres"
  >
): void {
  if (!(["tree", "shrub", "rock", "small-rock", "mushroom"] as const).includes(input.objectKind)) {
    throw new RangeError(`Unsupported World Object kind '${String(input.objectKind)}'.`);
  }
  requireUint32(input.centerXOffsetMillimetres, "World Object removal center X");
  requireUint32(input.centerZOffsetMillimetres, "World Object removal center Z");
  requirePositiveUint32(input.radiusMillimetres, "World Object removal radius");
}

function writeObjectRemovalContent(
  writer: CanonicalWaterBinaryWriterV1,
  input: Pick<
    SeedWorldObjectRemovalV1,
    "objectKind" | "centerXOffsetMillimetres" | "centerZOffsetMillimetres" | "radiusMillimetres"
  >
): void {
  writer
    .writeUint8((["tree", "shrub", "rock", "small-rock", "mushroom"] as const).indexOf(input.objectKind) + 1)
    .writeUint32(input.centerXOffsetMillimetres)
    .writeUint32(input.centerZOffsetMillimetres)
    .writeUint32(input.radiusMillimetres);
}

function validateRiver(river: Readonly<SeedWorldRiverV1>): void {
  if (river.schemaVersion !== SEED_WORLD_RIVER_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported River schema ${river.schemaVersion}.`);
  }
  const replay = createSeedWorldRiverV1(river.riverId, river);
  if (replay.riverContentHash !== river.riverContentHash) throw new Error(`River '${river.riverId}' hash mismatch.`);
}

function validateRiverInput(
  input: Pick<
    SeedWorldRiverV1,
    | "featureKind"
    | "startXOffsetMillimetres"
    | "startZOffsetMillimetres"
    | "headingMilliDegrees"
    | "lengthMillimetres"
    | "widthMillimetres"
    | "depthMillimetres"
    | "flowSpeedMillimetresPerSecond"
    | "meanderPermille"
  >
): void {
  if (input.featureKind !== "stream" && input.featureKind !== "river") {
    throw new RangeError(`Unsupported flowing Water Feature kind '${String(input.featureKind)}'.`);
  }
  requireUint32(input.startXOffsetMillimetres, "River start X");
  requireUint32(input.startZOffsetMillimetres, "River start Z");
  if (
    !Number.isInteger(input.headingMilliDegrees) ||
    input.headingMilliDegrees < 0 ||
    input.headingMilliDegrees >= 360_000
  ) {
    throw new RangeError("River heading must be an integer in [0, 360000) millidegrees.");
  }
  requirePositiveUint32(input.lengthMillimetres, "River length");
  requirePositiveUint32(input.widthMillimetres, "River width");
  requirePositiveUint32(input.depthMillimetres, "River depth");
  requirePositiveUint32(input.flowSpeedMillimetresPerSecond, "River flow speed");
  if (!Number.isInteger(input.meanderPermille) || input.meanderPermille < 0 || input.meanderPermille > 1_000) {
    throw new RangeError("River meander must be an integer in [0, 1000] permille.");
  }
}

function writeRiverContent(
  writer: CanonicalWaterBinaryWriterV1,
  input: Parameters<typeof validateRiverInput>[0]
): void {
  writer
    .writeUint8(input.featureKind === "stream" ? 1 : 2)
    .writeUint32(input.startXOffsetMillimetres)
    .writeUint32(input.startZOffsetMillimetres)
    .writeUint32(input.headingMilliDegrees)
    .writeUint32(input.lengthMillimetres)
    .writeUint32(input.widthMillimetres)
    .writeUint32(input.depthMillimetres)
    .writeUint32(input.flowSpeedMillimetresPerSecond)
    .writeUint16(input.meanderPermille);
}

function validateVegetationBrush(brush: Readonly<SeedWorldVegetationBrushV1>): void {
  if (brush.schemaVersion !== SEED_WORLD_VEGETATION_BRUSH_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported Vegetation Brush schema ${brush.schemaVersion}.`);
  }
  const replay = createSeedWorldVegetationBrushV1(brush.brushId, brush);
  if (replay.brushContentHash !== brush.brushContentHash) {
    throw new Error(`Vegetation Brush '${brush.brushId}' hash mismatch.`);
  }
}

function validateVegetationBrushInput(
  input: Pick<
    SeedWorldVegetationBrushV1,
    | "category"
    | "plantKind"
    | "distributionKind"
    | "centerXOffsetMillimetres"
    | "centerZOffsetMillimetres"
    | "radiusMillimetres"
    | "densityScalePermille"
    | "requestedPlantCount"
    | "seed"
  >
): void {
  if (!(["tree", "shrub", "grass", "flower", "water-grass"] as const).includes(input.category)) {
    throw new RangeError(`Unsupported Vegetation Brush category '${String(input.category)}'.`);
  }
  if (vegetationCategoryForPlantKind(input.plantKind) !== input.category) {
    throw new RangeError(`Vegetation plant kind '${input.plantKind}' cannot use render category '${input.category}'.`);
  }
  if (!(["single", "cluster", "area"] as const).includes(input.distributionKind)) {
    throw new RangeError(`Unsupported Vegetation Brush distribution '${String(input.distributionKind)}'.`);
  }
  requireUint32(input.centerXOffsetMillimetres, "Vegetation Brush center X");
  requireUint32(input.centerZOffsetMillimetres, "Vegetation Brush center Z");
  requirePositiveUint32(input.radiusMillimetres, "Vegetation Brush radius");
  if (
    !Number.isInteger(input.densityScalePermille) ||
    input.densityScalePermille < 100 ||
    input.densityScalePermille > 8_000
  ) {
    throw new RangeError("Vegetation Brush density scale must be an integer between 100 and 8000 permille.");
  }
  if (input.requestedPlantCount !== undefined) {
    requirePositiveUint32(input.requestedPlantCount, "Vegetation Brush requested plant count");
  }
  if (
    (input.distributionKind === "single" || input.distributionKind === "cluster") &&
    input.requestedPlantCount === undefined
  ) {
    throw new RangeError(`Vegetation Brush '${input.distributionKind}' requires requestedPlantCount.`);
  }
  if (input.distributionKind === "single" && input.requestedPlantCount !== 1) {
    throw new RangeError("Vegetation Brush 'single' requires requestedPlantCount to equal 1.");
  }
  if (
    input.distributionKind === "cluster" &&
    input.requestedPlantCount !== undefined &&
    (input.requestedPlantCount < 2 || input.requestedPlantCount > SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES)
  ) {
    throw new RangeError(
      `Vegetation Brush 'cluster' requires 2 to ${SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES} exact instances.`
    );
  }
  requireUint32(input.seed, "Vegetation Brush seed");
}

function writeVegetationBrushContent(
  writer: CanonicalWaterBinaryWriterV1,
  input: Pick<
    SeedWorldVegetationBrushV1,
    | "category"
    | "plantKind"
    | "distributionKind"
    | "centerXOffsetMillimetres"
    | "centerZOffsetMillimetres"
    | "radiusMillimetres"
    | "densityScalePermille"
    | "requestedPlantCount"
    | "seed"
  >
): void {
  writer
    .writeUint8((["tree", "shrub", "grass", "flower", "water-grass"] as const).indexOf(input.category) + 1)
    .writeString(input.plantKind)
    .writeString(input.distributionKind)
    .writeUint32(input.centerXOffsetMillimetres)
    .writeUint32(input.centerZOffsetMillimetres)
    .writeUint32(input.radiusMillimetres)
    .writeUint32(input.densityScalePermille)
    .writeOptional(input.requestedPlantCount, (itemWriter, value) => itemWriter.writeUint32(value))
    .writeUint32(input.seed);
}

function vegetationCategoryForPlantKind(kind: SeedWorldPlantKindV1): SeedWorldVegetationCategoryV1 {
  if (kind === "aquatic-grass") return "water-grass";
  return kind;
}

function deriveVegetationOperationSeed(seed: number, operationId: string): number {
  let hash = (seed ^ 0x811c9dc5) >>> 0;
  for (let index = 0; index < operationId.length; index++) {
    hash ^= operationId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function validatePatch(patch: Readonly<SeedWorldTerrainPatchV1>): void {
  if (patch.schemaVersion !== SEED_WORLD_TERRAIN_PATCH_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported Terrain Patch schema ${patch.schemaVersion}.`);
  }
  const replay = createSeedWorldTerrainPatchV1(patch.patchId, patch.shape, patch.purpose ?? "terrain");
  if (replay.patchContentHash !== patch.patchContentHash)
    throw new Error(`Terrain Patch '${patch.patchId}' hash mismatch.`);
}

function validatePatchShape(shape: SeedWorldTerrainPatchShapeV1): void {
  if (shape.kind === "radial-height") {
    requireUint32(shape.centerXOffsetMillimetres, "Radial Patch center X");
    requireUint32(shape.centerZOffsetMillimetres, "Radial Patch center Z");
    requirePositiveUint32(shape.radiusMillimetres, "Radial Patch radius");
    requireInt32(shape.heightDeltaMillimetres, "Radial Patch height delta");
    if (shape.falloff !== "smoothstep") throw new Error("Radial Patch requires the versioned smoothstep falloff.");
  } else if (shape.kind === "rect-height") {
    requireUint32(shape.minXOffsetMillimetres, "Rect Patch min X");
    requireUint32(shape.minZOffsetMillimetres, "Rect Patch min Z");
    requireUint32(shape.maxXOffsetMillimetres, "Rect Patch max X");
    requireUint32(shape.maxZOffsetMillimetres, "Rect Patch max Z");
    if (
      shape.minXOffsetMillimetres >= shape.maxXOffsetMillimetres ||
      shape.minZOffsetMillimetres >= shape.maxZOffsetMillimetres
    ) {
      throw new RangeError("Rect Terrain Patch bounds must have positive area.");
    }
    requireInt32(shape.heightDeltaMillimetres, "Rect Patch height delta");
    requireUint32(shape.edgeFeatherMillimetres, "Rect Patch edge feather");
  } else if (shape.kind === "procedural-landform") {
    if (!(TERRAIN_FEATURE_KINDS as readonly string[]).includes(shape.featureKind)) {
      throw new RangeError(`Unsupported Terrain Feature kind '${String(shape.featureKind)}'.`);
    }
    requireUint32(shape.centerXOffsetMillimetres, "Terrain Feature center X");
    requireUint32(shape.centerZOffsetMillimetres, "Terrain Feature center Z");
    requireHeadingMilliDegrees(shape.headingMilliDegrees, "Terrain Feature heading");
    requirePositiveUint32(shape.lengthMillimetres, "Terrain Feature length");
    requirePositiveUint32(shape.widthMillimetres, "Terrain Feature width");
    requireInt32(shape.elevationDeltaMillimetres, "Terrain Feature elevation delta");
    if (shape.elevationDeltaMillimetres === 0)
      throw new RangeError("Terrain Feature elevation delta must be non-zero.");
    requirePermille(shape.sharpnessPermille, "Terrain Feature sharpness");
    requirePermille(shape.asymmetryPermille, "Terrain Feature asymmetry");
    requirePermille(shape.roughnessPermille, "Terrain Feature roughness");
    requirePermille(shape.erosionPermille, "Terrain Feature erosion");
    requireUint32(shape.seed, "Terrain Feature seed");
  } else if (shape.kind === "compact-cosine-hill") {
    requireUint32(shape.centerXOffsetMillimetres, "Hill center X");
    requireUint32(shape.centerZOffsetMillimetres, "Hill center Z");
    requireHeadingMilliDegrees(shape.headingMilliDegrees, "Hill heading");
    requireUint32(shape.pedestalLiftMillimetres, "Hill pedestal lift");
    requirePositiveUint32(shape.influenceMajorRadiusMillimetres, "Hill influence major radius");
    requirePositiveUint32(shape.influenceMinorRadiusMillimetres, "Hill influence minor radius");
    requirePositiveUint32(shape.peakReliefMillimetres, "Hill peak relief");
    requirePositiveUint32(shape.bodyMajorRadiusMillimetres, "Hill body major radius");
    requirePositiveUint32(shape.bodyMinorRadiusMillimetres, "Hill body minor radius");
  } else if (shape.kind === "radial-water-basin") {
    if (shape.featureKind !== "pond" && shape.featureKind !== "lake") {
      throw new RangeError(`Unsupported standing Water Feature kind '${String(shape.featureKind)}'.`);
    }
    requireUint32(shape.centerXOffsetMillimetres, "Water basin center X");
    requireUint32(shape.centerZOffsetMillimetres, "Water basin center Z");
    requirePositiveUint32(shape.radiusMillimetres, "Water basin radius");
    requirePositiveUint32(shape.depthMillimetres, "Water basin depth");
    requirePermille(shape.shorelineIrregularityPermille, "Water basin shoreline irregularity");
    requireInt32(shape.canonicalWaterLevelMillimetres, "Water basin canonical water level");
    requireInt32(shape.surfaceLevelOffsetMillimetres, "Water basin surface-level offset");
    if (shape.surfaceLevelOffsetMillimetres > 0 || shape.surfaceLevelOffsetMillimetres < -shape.depthMillimetres) {
      throw new RangeError("Water basin surface-level offset must stay between negative depth and zero.");
    }
    requireUint32(shape.seed, "Water basin seed");
  } else {
    throw new RangeError(`Unsupported Terrain Patch shape '${String((shape as { kind?: unknown }).kind)}'.`);
  }
}

function writePatchShape(writer: CanonicalWaterBinaryWriterV1, shape: SeedWorldTerrainPatchShapeV1): void {
  if (shape.kind === "radial-height") {
    writer
      .writeUint8(1)
      .writeUint32(shape.centerXOffsetMillimetres)
      .writeUint32(shape.centerZOffsetMillimetres)
      .writeUint32(shape.radiusMillimetres)
      .writeInt32(shape.heightDeltaMillimetres)
      .writeUint8(1);
  } else if (shape.kind === "rect-height") {
    writer
      .writeUint8(2)
      .writeUint32(shape.minXOffsetMillimetres)
      .writeUint32(shape.minZOffsetMillimetres)
      .writeUint32(shape.maxXOffsetMillimetres)
      .writeUint32(shape.maxZOffsetMillimetres)
      .writeInt32(shape.heightDeltaMillimetres)
      .writeUint32(shape.edgeFeatherMillimetres);
  } else if (shape.kind === "procedural-landform") {
    writer
      .writeUint8(3)
      .writeUint8(TERRAIN_FEATURE_KINDS.indexOf(shape.featureKind) + 1)
      .writeUint32(shape.centerXOffsetMillimetres)
      .writeUint32(shape.centerZOffsetMillimetres)
      .writeUint32(shape.headingMilliDegrees)
      .writeUint32(shape.lengthMillimetres)
      .writeUint32(shape.widthMillimetres)
      .writeInt32(shape.elevationDeltaMillimetres)
      .writeUint16(shape.sharpnessPermille)
      .writeUint16(shape.asymmetryPermille)
      .writeUint16(shape.roughnessPermille)
      .writeUint16(shape.erosionPermille)
      .writeUint32(shape.seed);
  } else if (shape.kind === "radial-water-basin") {
    writer
      .writeUint8(4)
      .writeUint8(shape.featureKind === "pond" ? 1 : 2)
      .writeUint32(shape.centerXOffsetMillimetres)
      .writeUint32(shape.centerZOffsetMillimetres)
      .writeUint32(shape.radiusMillimetres)
      .writeUint32(shape.depthMillimetres)
      .writeUint16(shape.shorelineIrregularityPermille)
      .writeInt32(shape.canonicalWaterLevelMillimetres)
      .writeInt32(shape.surfaceLevelOffsetMillimetres)
      .writeUint32(shape.seed);
  } else {
    writer
      .writeUint8(5)
      .writeUint32(shape.centerXOffsetMillimetres)
      .writeUint32(shape.centerZOffsetMillimetres)
      .writeUint32(shape.headingMilliDegrees)
      .writeUint32(shape.pedestalLiftMillimetres)
      .writeUint32(shape.influenceMajorRadiusMillimetres)
      .writeUint32(shape.influenceMinorRadiusMillimetres)
      .writeUint32(shape.peakReliefMillimetres)
      .writeUint32(shape.bodyMajorRadiusMillimetres)
      .writeUint32(shape.bodyMinorRadiusMillimetres);
  }
}

function requireCoalesceKey(operation: Readonly<UpsertSeedWorldTerrainPatchOperationV1>): string {
  const key = operation.coalesceKey;
  requireNonEmpty(key ?? "", "absolute-coalescible operation coalesceKey");
  return key!;
}

function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${label} must be non-empty.`);
}

function requirePositiveUint32(value: number, label: string): void {
  requireUint32(value, label);
  if (value === 0) throw new RangeError(`${label} must be positive.`);
}

function requireUint32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${label} must be Uint32.`);
}

function requireInt32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff)
    throw new RangeError(`${label} must be Int32.`);
}

function requireHeadingMilliDegrees(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= 360_000) {
    throw new RangeError(`${label} must be an integer in [0, 360000).`);
  }
}

function requirePermille(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 1_000) {
    throw new RangeError(`${label} must be an integer in [0, 1000].`);
  }
}
