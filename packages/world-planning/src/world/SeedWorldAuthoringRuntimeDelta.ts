import {
  SEED_WORLD_HEIGHT_RANGE,
  seedWorldRockySlopeWeight,
  type SeedWorldFields
} from "../runtime/SeedWorldFields.ts";
import type { SeedWorldDecorationInstance } from "./SeedWorldDecorations";
import type { SeedWorldRuntimeBounds } from "./SeedWorldRuntimeBounds";
import {
  compileSeedWorldLocalDetailDensityFields,
  compileSeedWorldLocalTreeScatterOperations,
  compileSeedWorldPopulationPreview,
  createSeedWorldDetailDensityField,
  createSeedWorldPopulationPreviewFromLayout,
  type SeedWorldDetailDensityField,
  type SeedWorldPopulationInstance,
  type SeedWorldPopulationPreview
} from "../runtime/SeedWorldPopulationPlan.ts";
import type { SeedWorldPlan } from "./SeedWorldPlanner";
import {
  decodeR16HeightMillimetres,
  encodeR16HeightMillimetres,
  sampleSeedWorldAuthoringHeightDeltaMillimetresV1
} from "../runtime/hydrology-v1/SeedWorldCanonicalNaturalTerrain.ts";
import {
  applySeedWorldAuthoringStateToPlanV1,
  type SeedWorldAuthoringStateV1,
  type SeedWorldTreeVariationEditV1,
  type SeedWorldObjectRemovalV1,
  type SeedWorldRiverV1,
  type SeedWorldTerrainPatchV1,
  type SeedWorldVegetationBrushV1
} from "./SeedWorldWorldEdit";
import {
  createSeedWorldFlowingWaterLakeSurrogatePatchV1,
  createSeedWorldFlowingWaterLakeSurrogateShapeV1
} from "../runtime/hydrology-v1/SeedWorldFlowingWaterLakeSurrogate.ts";
import {
  sampleSeedWorldWaterBasinProfileV1,
  seedWorldTerrainPatchShapeOffsetBoundsV1
} from "../runtime/hydrology-v1/SeedWorldTerrainFeatureGeometry.ts";

/** World-space rectangle touched by one local Authoring publication. */
export type SeedWorldAuthoringRuntimeBoundsV1 = SeedWorldRuntimeBounds;

/** Immutable height publication and the Authoring state already represented by it. */
export interface SeedWorldAuthoringHeightBaselineV1 {
  readonly samples: Uint16Array;
  readonly authoringState: Readonly<SeedWorldAuthoringStateV1>;
}

/** Compact lossless height update for the active Seed World Terrain Region. */
export interface SeedWorldAuthoringHeightPatchV1 {
  readonly sampleOrigin: readonly [x: number, z: number];
  readonly sampleSize: readonly [width: number, height: number];
  readonly previousSamples: Uint16Array;
  readonly nextSamples: Uint16Array;
  readonly bounds: SeedWorldAuthoringRuntimeBoundsV1;
}

/** Compact local update for Terrain Alphamap pixels and their canonical slope-derived ownership. */
export interface SeedWorldAuthoringSurfacePatchV1 {
  readonly sampleOrigin: readonly [x: number, z: number];
  readonly sampleSize: readonly [width: number, height: number];
  readonly previousPixels: Uint8Array;
  readonly nextPixels: Uint8Array;
  readonly previousRockySlopeWeights: Uint8Array;
  readonly nextRockySlopeWeights: Uint8Array;
}

/** Renderer-neutral local delta prepared before crossing the runtime publication boundary. */
export interface SeedWorldAuthoringRuntimeDeltaV1 {
  /** Shape-only publication does not rescatters trees or alter the Terrain/Water plan. */
  readonly treeVariationEdits?: readonly SeedWorldTreeVariationEditV1[];
  readonly dirtyBounds?: SeedWorldAuthoringRuntimeBoundsV1;
  readonly heightPatch?: SeedWorldAuthoringHeightPatchV1;
  readonly surfacePatch?: SeedWorldAuthoringSurfacePatchV1;
  readonly populationLayout?: SeedWorldPopulationPreview;
  /** Authored ponds, lakes, rivers, or streams changed even when Terrain and Population stay untouched. */
  readonly authoredWaterChanged?: true;
  /** Exact sparse instances introduced by this transition and eligible for local entrance presentation. */
  readonly addedPopulationInstances?: readonly SeedWorldPopulationInstance[];
}

/**
 * Compiles only the runtime data affected by an Authoring state transition.
 * The active world, camera, water host, and unaffected Population Cells are deliberately absent.
 */
export function compileSeedWorldAuthoringRuntimeDeltaV1(
  input: Readonly<{
    sourcePlan: SeedWorldPlan;
    fields: SeedWorldFields;
    heightBaseline?: SeedWorldAuthoringHeightBaselineV1;
    activeAuthoringState: Readonly<SeedWorldAuthoringStateV1>;
    draftAuthoringState: Readonly<SeedWorldAuthoringStateV1>;
    activePopulationLayout: SeedWorldPopulationPreview;
    /** Immutable Worker publication before any local Authoring overlay. */
    rootPopulationLayout?: SeedWorldPopulationPreview;
    /** Exact saved physical publication; restoration must not scatter these instances again. */
    restoredPopulationLayout?: SeedWorldPopulationPreview;
    rockDecorations?: readonly SeedWorldDecorationInstance[];
  }>
): SeedWorldAuthoringRuntimeDeltaV1 {
  const rootPopulationLayout =
    input.rootPopulationLayout ??
    (populationMatchesRootAuthoringState(input.activeAuthoringState) ? input.activePopulationLayout : undefined);
  const terrainBounds = unionBounds(
    changedTerrainBounds(
      input.activeAuthoringState.terrainPatches,
      input.draftAuthoringState.terrainPatches,
      input.fields.sizeMetres
    ),
    changedRiverBounds(input.activeAuthoringState.rivers, input.draftAuthoringState.rivers, input.fields.sizeMetres)
  );
  const vegetationBounds = changedVegetationBounds(
    input.activeAuthoringState.vegetationBrushes,
    input.draftAuthoringState.vegetationBrushes,
    input.fields.sizeMetres
  );
  const waterBounds = unionBounds(
    changedWaterTerrainBounds(
      input.activeAuthoringState.terrainPatches,
      input.draftAuthoringState.terrainPatches,
      input.fields.sizeMetres
    ),
    changedRiverBounds(input.activeAuthoringState.rivers, input.draftAuthoringState.rivers, input.fields.sizeMetres)
  );
  const objectRemovalBounds = changedObjectRemovalBounds(
    input.activeAuthoringState.objectRemovals,
    input.draftAuthoringState.objectRemovals,
    input.fields.sizeMetres
  );
  const populationBounds = input.restoredPopulationLayout
    ? Object.freeze({
        minimumX: -input.fields.sizeMetres / 2,
        minimumZ: -input.fields.sizeMetres / 2,
        maximumX: input.fields.sizeMetres / 2,
        maximumZ: input.fields.sizeMetres / 2
      })
    : unionBounds(unionBounds(vegetationBounds, waterBounds), objectRemovalBounds);
  const dirtyBounds = unionBounds(terrainBounds, populationBounds);
  const authoredWaterChanged = authoredWaterResourcesDiffer(input.activeAuthoringState, input.draftAuthoringState);
  const heightPatch = terrainBounds
    ? compileHeightPatch(
        input.fields,
        input.activeAuthoringState,
        input.draftAuthoringState,
        terrainBounds,
        input.heightBaseline
      )
    : undefined;
  const surfacePatch = heightPatch
    ? compileSurfacePatch(
        input.fields,
        input.activeAuthoringState,
        input.draftAuthoringState,
        heightPatch,
        terrainBounds!
      )
    : undefined;
  const populationLayout =
    input.restoredPopulationLayout ??
    (populationBounds
      ? compilePopulationLayout(
          input.sourcePlan,
          input.fields,
          input.activePopulationLayout,
          rootPopulationLayout,
          input.activeAuthoringState,
          input.draftAuthoringState,
          populationBounds,
          waterBounds !== undefined,
          visibleRockDecorations(input.rockDecorations ?? [], input.draftAuthoringState.objectRemovals)
        )
      : undefined);
  const addedPopulationInstances = populationLayout
    ? selectAddedPopulationInstances(input.activePopulationLayout.treeInstances, populationLayout.treeInstances)
    : [];
  return Object.freeze({
    ...(JSON.stringify(input.activeAuthoringState.treeVariationEdits ?? []) !==
    JSON.stringify(input.draftAuthoringState.treeVariationEdits ?? [])
      ? { treeVariationEdits: input.draftAuthoringState.treeVariationEdits ?? [] }
      : {}),
    ...(dirtyBounds ? { dirtyBounds } : {}),
    ...(heightPatch ? { heightPatch } : {}),
    ...(surfacePatch ? { surfacePatch } : {}),
    ...(populationLayout ? { populationLayout } : {}),
    ...(authoredWaterChanged ? { authoredWaterChanged: true as const } : {}),
    ...(addedPopulationInstances.length ? { addedPopulationInstances } : {})
  });
}

function populationMatchesRootAuthoringState(state: Readonly<SeedWorldAuthoringStateV1>): boolean {
  return (
    state.vegetationBrushes.length === 0 &&
    state.rivers.length === 0 &&
    state.terrainPatches.length === 0 &&
    state.objectRemovals.length === 0
  );
}

function visibleRockDecorations(
  rocks: readonly SeedWorldDecorationInstance[],
  removals: readonly Readonly<SeedWorldObjectRemovalV1>[]
): readonly SeedWorldDecorationInstance[] {
  const removedRockIds = new Set(
    removals.filter(({ objectKind }) => objectKind === "rock").map(({ objectId }) => objectId)
  );
  return removedRockIds.size === 0 ? rocks : Object.freeze(rocks.filter(({ id }) => !removedRockIds.has(id)));
}

/**
 * Recompiles only material samples whose slope or authored-water ownership may change in one terrain transaction.
 * `fields.materialWeights` remains the immutable natural substrate; authored water is composed into Alphamap pixels.
 */
function compileSurfacePatch(
  fields: SeedWorldFields,
  active: Readonly<SeedWorldAuthoringStateV1>,
  draft: Readonly<SeedWorldAuthoringStateV1>,
  heightPatch: SeedWorldAuthoringHeightPatchV1,
  bounds: SeedWorldAuthoringRuntimeBoundsV1
): SeedWorldAuthoringSurfacePatchV1 {
  const resolution = fields.surfaceResolution;
  const sampleMetres = fields.sizeMetres / resolution;
  const half = fields.sizeMetres * 0.5;
  const materialInfluenceMetres = 18;
  const minimumSampleX = clampInteger(
    Math.floor((bounds.minimumX - materialInfluenceMetres + half) / sampleMetres),
    0,
    resolution - 1
  );
  const minimumSampleZ = clampInteger(
    Math.floor((bounds.minimumZ - materialInfluenceMetres + half) / sampleMetres),
    0,
    resolution - 1
  );
  const maximumSampleX = clampInteger(
    Math.floor((bounds.maximumX + materialInfluenceMetres + half) / sampleMetres),
    0,
    resolution - 1
  );
  const maximumSampleZ = clampInteger(
    Math.floor((bounds.maximumZ + materialInfluenceMetres + half) / sampleMetres),
    0,
    resolution - 1
  );
  const width = maximumSampleX - minimumSampleX + 1;
  const height = maximumSampleZ - minimumSampleZ + 1;
  const previousPixels = new Uint8Array(width * height * 4);
  const nextPixels = new Uint8Array(width * height * 4);
  const previousRockySlopeWeights = new Uint8Array(width * height);
  const nextRockySlopeWeights = new Uint8Array(width * height);
  for (let localZ = 0; localZ < height; localZ++) {
    const sampleZ = minimumSampleZ + localZ;
    const normalizedZ = (sampleZ + 0.5) / resolution;
    const worldZ = normalizedZ * fields.sizeMetres - half;
    for (let localX = 0; localX < width; localX++) {
      const sampleX = minimumSampleX + localX;
      const normalizedX = (sampleX + 0.5) / resolution;
      const worldX = normalizedX * fields.sizeMetres - half;
      const sourceIndex = sampleZ * resolution + sampleX;
      const compactIndex = localZ * width + localX;
      const previousRockySlope = fields.rockySlopeWeight[sourceIndex]!;
      const nextRockySlope = Math.round(
        seedWorldRockySlopeWeight(samplePatchedNormalizedSlope(fields, heightPatch, normalizedX, normalizedZ)) * 255
      );
      previousRockySlopeWeights[compactIndex] = previousRockySlope;
      nextRockySlopeWeights[compactIndex] = nextRockySlope;
      writeAuthoredSurfacePixel(
        previousPixels,
        compactIndex * 4,
        fields.materialWeights,
        sourceIndex * 4,
        previousRockySlope,
        authoredWaterMaterialWeight(active, fields.sizeMetres, worldX, worldZ)
      );
      writeAuthoredSurfacePixel(
        nextPixels,
        compactIndex * 4,
        fields.materialWeights,
        sourceIndex * 4,
        nextRockySlope,
        authoredWaterMaterialWeight(draft, fields.sizeMetres, worldX, worldZ)
      );
    }
  }
  return Object.freeze({
    sampleOrigin: Object.freeze([minimumSampleX, minimumSampleZ] as const),
    sampleSize: Object.freeze([width, height] as const),
    previousPixels,
    nextPixels,
    previousRockySlopeWeights,
    nextRockySlopeWeights
  });
}

function samplePatchedNormalizedSlope(
  fields: SeedWorldFields,
  patch: SeedWorldAuthoringHeightPatchV1,
  normalizedX: number,
  normalizedZ: number
): number {
  const spacing = fields.sizeMetres / (fields.heightResolution - 1);
  const stepMetres = Math.max(8, spacing);
  const step = stepMetres / fields.sizeMetres;
  const left = samplePatchedHeight(fields, patch, normalizedX - step, normalizedZ);
  const right = samplePatchedHeight(fields, patch, normalizedX + step, normalizedZ);
  const near = samplePatchedHeight(fields, patch, normalizedX, normalizedZ - step);
  const far = samplePatchedHeight(fields, patch, normalizedX, normalizedZ + step);
  return Math.atan(Math.hypot((right - left) / (2 * stepMetres), (far - near) / (2 * stepMetres))) / (Math.PI * 0.5);
}

function samplePatchedHeight(
  fields: SeedWorldFields,
  patch: SeedWorldAuthoringHeightPatchV1,
  normalizedX: number,
  normalizedZ: number
): number {
  const resolution = fields.heightResolution;
  const x = clamp(normalizedX, 0, 1) * (resolution - 1);
  const z = clamp(normalizedZ, 0, 1) * (resolution - 1);
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const z1 = Math.min(resolution - 1, z0 + 1);
  const tx = x - x0;
  const tz = z - z0;
  const top = mix(patchedHeightSample(fields, patch, x0, z0), patchedHeightSample(fields, patch, x1, z0), tx);
  const bottom = mix(patchedHeightSample(fields, patch, x0, z1), patchedHeightSample(fields, patch, x1, z1), tx);
  return decodeHeightSample(mix(top, bottom, tz));
}

function patchedHeightSample(
  fields: SeedWorldFields,
  patch: SeedWorldAuthoringHeightPatchV1,
  sampleX: number,
  sampleZ: number
): number {
  const [originX, originZ] = patch.sampleOrigin;
  const [width, height] = patch.sampleSize;
  if (sampleX >= originX && sampleX < originX + width && sampleZ >= originZ && sampleZ < originZ + height) {
    return patch.nextSamples[(sampleZ - originZ) * width + sampleX - originX]!;
  }
  return fields.heightSamples[sampleZ * fields.heightResolution + sampleX]!;
}

function decodeHeightSample(sample: number): number {
  return (
    SEED_WORLD_HEIGHT_RANGE.minimum +
    (sample / 65535) * (SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum)
  );
}

function authoredWaterMaterialWeight(
  state: Readonly<SeedWorldAuthoringStateV1>,
  sizeMetres: number,
  worldX: number,
  worldZ: number
): number {
  let weight = 0;
  const half = sizeMetres * 0.5;
  for (const river of state.rivers) {
    const profile = sampleSeedWorldWaterBasinProfileV1(
      createSeedWorldFlowingWaterLakeSurrogateShapeV1(river),
      Math.round((worldX + half) * 1_000),
      Math.round((worldZ + half) * 1_000)
    );
    weight = Math.max(weight, smootherstep(0, 0.2, profile));
  }
  for (const patch of state.terrainPatches) {
    if (patch.purpose !== "water-body" || patch.shape.kind !== "radial-water-basin") continue;
    const profile = sampleSeedWorldWaterBasinProfileV1(
      patch.shape,
      Math.round((worldX + half) * 1_000),
      Math.round((worldZ + half) * 1_000)
    );
    weight = Math.max(weight, smootherstep(0, 0.2, profile));
  }
  return weight;
}

function writeAuthoredSurfacePixel(
  target: Uint8Array,
  targetOffset: number,
  naturalWeights: Uint8Array,
  naturalOffset: number,
  rockySlopeWeight: number,
  authoredWaterWeight: number
): void {
  const dry = 1 - authoredWaterWeight;
  const dryGrass = (naturalWeights[naturalOffset]! + naturalWeights[naturalOffset + 2]!) * dry;
  const rock = Math.min(dryGrass, Math.round((dryGrass * rockySlopeWeight) / 255));
  writeNormalizedWeights(target, targetOffset, [
    dryGrass - rock,
    naturalWeights[naturalOffset + 1]! * dry + 255 * authoredWaterWeight,
    rock,
    naturalWeights[naturalOffset + 3]! * dry
  ]);
}

function writeNormalizedWeights(target: Uint8Array, offset: number, weights: readonly number[]): void {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  const fractions: Array<{ readonly channel: number; readonly fraction: number }> = [];
  let remaining = 255;
  for (let channel = 0; channel < 4; channel++) {
    const exact = total > 0 ? (Math.max(0, weights[channel]!) / total) * 255 : channel === 0 ? 255 : 0;
    const value = Math.floor(exact);
    target[offset + channel] = value;
    remaining -= value;
    fractions.push({ channel, fraction: exact - value });
  }
  fractions.sort((left, right) => right.fraction - left.fraction || left.channel - right.channel);
  for (let index = 0; index < remaining; index++) target[offset + fractions[index]!.channel]++;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smootherstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

/** Returns only stable identities that do not exist in the currently published sparse population. */
export function selectAddedPopulationInstances(
  activeInstances: readonly SeedWorldPopulationInstance[],
  nextInstances: readonly SeedWorldPopulationInstance[]
): readonly SeedWorldPopulationInstance[] {
  const activeIds = new Set(activeInstances.map((instance) => instance.id));
  return Object.freeze(nextInstances.filter((instance) => !activeIds.has(instance.id)));
}

function compileHeightPatch(
  fields: SeedWorldFields,
  active: Readonly<SeedWorldAuthoringStateV1>,
  draft: Readonly<SeedWorldAuthoringStateV1>,
  bounds: SeedWorldAuthoringRuntimeBoundsV1,
  baseline?: SeedWorldAuthoringHeightBaselineV1
): SeedWorldAuthoringHeightPatchV1 {
  if (baseline && baseline.samples.length !== fields.heightSamples.length) {
    throw new Error("Authoring height baseline dimensions do not match the active terrain");
  }
  const resolution = fields.heightResolution;
  const spacing = fields.sizeMetres / (resolution - 1);
  const half = fields.sizeMetres * 0.5;
  const minimumSampleX = clampInteger(Math.floor((bounds.minimumX + half) / spacing) - 1, 0, resolution - 1);
  const minimumSampleZ = clampInteger(Math.floor((bounds.minimumZ + half) / spacing) - 1, 0, resolution - 1);
  const maximumSampleX = clampInteger(Math.ceil((bounds.maximumX + half) / spacing) + 1, 0, resolution - 1);
  const maximumSampleZ = clampInteger(Math.ceil((bounds.maximumZ + half) / spacing) + 1, 0, resolution - 1);
  const width = maximumSampleX - minimumSampleX + 1;
  const height = maximumSampleZ - minimumSampleZ + 1;
  const previousSamples = new Uint16Array(width * height);
  const nextSamples = new Uint16Array(width * height);
  for (let localZ = 0; localZ < height; localZ++) {
    const sampleZ = minimumSampleZ + localZ;
    const worldZ = -half + sampleZ * spacing;
    for (let localX = 0; localX < width; localX++) {
      const sampleX = minimumSampleX + localX;
      const worldX = -half + sampleX * spacing;
      const compactIndex = localZ * width + localX;
      const currentSample = fields.heightSamples[sampleZ * resolution + sampleX]!;
      previousSamples[compactIndex] = currentSample;
      const xOffsetMillimetres = Math.round((worldX + half) * 1_000);
      const zOffsetMillimetres = Math.round((worldZ + half) * 1_000);
      const activeDelta = sampleSeedWorldAuthoringHeightDeltaMillimetresV1(
        baseline?.authoringState ?? active,
        xOffsetMillimetres,
        zOffsetMillimetres,
        fields.sizeMetres
      );
      const draftDelta = sampleSeedWorldAuthoringHeightDeltaMillimetresV1(
        draft,
        xOffsetMillimetres,
        zOffsetMillimetres,
        fields.sizeMetres
      );
      nextSamples[compactIndex] = encodeR16HeightMillimetres(
        // Repeatedly decoding the edited R16 value accumulates rounding error.
        // Evaluate against the immutable generation publication instead.
        decodeR16HeightMillimetres(baseline?.samples[sampleZ * resolution + sampleX] ?? currentSample) -
          activeDelta +
          draftDelta
      );
    }
  }
  return Object.freeze({
    sampleOrigin: Object.freeze([minimumSampleX, minimumSampleZ] as const),
    sampleSize: Object.freeze([width, height] as const),
    previousSamples,
    nextSamples,
    bounds
  });
}

/**
 * Preserves the Worker-published base population and applies only the Authoring overlay difference.
 * This avoids recomputing native tree ownership with a less complete decoration context on the UI thread.
 */
function compilePopulationLayout(
  sourcePlan: SeedWorldPlan,
  fields: SeedWorldFields,
  activeLayout: SeedWorldPopulationPreview,
  rootLayout: SeedWorldPopulationPreview | undefined,
  activeState: Readonly<SeedWorldAuthoringStateV1>,
  draftState: Readonly<SeedWorldAuthoringStateV1>,
  dirtyBounds: SeedWorldAuthoringRuntimeBoundsV1,
  recompileWithinBounds: boolean,
  rockDecorations: readonly SeedWorldDecorationInstance[]
): SeedWorldPopulationPreview {
  const draftPlan = applySeedWorldAuthoringStateToPlanV1(sourcePlan, draftState);
  const changedBrushIds = changedVegetationBrushIds(activeState.vegetationBrushes, draftState.vegetationBrushes);
  const changedBrushes = [...activeState.vegetationBrushes, ...draftState.vegetationBrushes].filter((brush) =>
    changedBrushIds.has(brush.brushId)
  );
  const objectRemovalsChanged = resourceCollectionsDiffer(
    activeState.objectRemovals,
    draftState.objectRemovals,
    (removal) => removal.objectId,
    (removal) => removal.removalContentHash
  );
  const removedObjectIds = new Set(draftState.objectRemovals.map(({ objectId }) => objectId));
  const activeRemovedObjectIds = new Set(activeState.objectRemovals.map(({ objectId }) => objectId));
  const restoredObjectIds = new Set([...activeRemovedObjectIds].filter((objectId) => !removedObjectIds.has(objectId)));
  const detailBrushesChanged = changedBrushes.some(
    (brush) => brush.category === "grass" || brush.category === "flower" || brush.category === "water-grass"
  );
  if (objectRemovalsChanged && changedBrushIds.size === 0 && !recompileWithinBounds) {
    const canonicalRestoreLayout = resolveExactObjectRestoreLayout(
      draftPlan,
      fields,
      rootLayout,
      draftState,
      restoredObjectIds,
      rockDecorations
    );
    if (canonicalRestoreLayout) {
      const treeInstances = reconcileExactObjectVisibility(
        activeLayout.treeInstances,
        canonicalRestoreLayout,
        removedObjectIds,
        restoredObjectIds
      );
      return createSeedWorldPopulationPreviewFromLayout(draftPlan, activeLayout, treeInstances);
    }
  }
  if (
    !recompileWithinBounds &&
    !objectRemovalsChanged &&
    changedBrushIds.size > 0 &&
    changedBrushes.every((brush) => brush.category === "tree" || brush.category === "shrub")
  ) {
    const instances = compileChangedSparseVegetationBrushes(
      draftPlan,
      fields,
      activeLayout.treeInstances,
      draftState,
      changedBrushIds,
      rockDecorations
    );
    return createSeedWorldPopulationPreviewFromLayout(draftPlan, activeLayout, instances);
  }

  if (rootLayout && (recompileWithinBounds || detailBrushesChanged)) {
    const sparseBrushesChanged = changedBrushes.some(
      (brush) => brush.category === "tree" || brush.category === "shrub"
    );
    const changedInstances = recompileWithinBounds
      ? mergePopulationInstancesWithinBounds(
          activeLayout.treeInstances,
          compileCanonicalSparseAuthoringLayout(
            draftPlan,
            fields,
            rootLayout.treeInstances,
            draftState,
            rockDecorations
          ),
          dirtyBounds,
          sourcePlan.sizeMetres,
          draftState
        )
      : sparseBrushesChanged
        ? compileChangedSparseVegetationBrushes(
            draftPlan,
            fields,
            activeLayout.treeInstances,
            draftState,
            changedBrushIds,
            rockDecorations
          )
        : activeLayout.treeInstances;
    // A restored snapshot can contain Water/Detail edits and exact removals in
    // the same transaction. Their combination must not discard the richer
    // Worker-published natural population and regenerate it on the UI thread.
    const treeInstances = reconcileExactObjectVisibility(
      changedInstances,
      resolveExactObjectRestoreLayout(draftPlan, fields, rootLayout, draftState, restoredObjectIds, rockDecorations) ??
        [],
      removedObjectIds,
      restoredObjectIds
    );
    const localDetailOperations = draftPlan.detailBrushOperations.filter(
      (operation) => operation.distribution === "local-brush"
    );
    const localDetailFields = compileSeedWorldLocalDetailDensityFields(
      draftPlan,
      fields,
      localDetailOperations,
      rootLayout.detailSpeciesProfiles,
      rockDecorations
    );
    const detailDensityFields = composeDetailDensityFieldsWithinBounds(
      activeLayout.detailDensityFields,
      rootLayout.detailDensityFields,
      localDetailFields,
      rootLayout.detailSpeciesProfiles,
      dirtyBounds,
      sourcePlan.sizeMetres,
      draftState
    );
    return createSeedWorldPopulationPreviewFromLayout(draftPlan, activeLayout, treeInstances, detailDensityFields);
  }

  const activeCompiled = compileSeedWorldPopulationPreview(
    applySeedWorldAuthoringStateToPlanV1(sourcePlan, activeState),
    fields,
    undefined,
    rockDecorations
  );
  const draftCompiled = compileSeedWorldPopulationPreview(draftPlan, fields, undefined, rockDecorations);
  const activeBrushIds = new Set(activeState.vegetationBrushes.map((brush) => brush.brushId));
  const draftBrushIds = new Set(draftState.vegetationBrushes.map((brush) => brush.brushId));
  const baseTreeInstances = recompileWithinBounds
    ? mergePopulationInstancesWithinBounds(
        activeLayout.treeInstances,
        draftCompiled.treeInstances,
        dirtyBounds,
        sourcePlan.sizeMetres,
        draftState
      )
    : Object.freeze([
        ...activeLayout.treeInstances.filter(
          (instance) => !ownedByBrush(instance, activeBrushIds) && !removedObjectIds.has(instance.id)
        ),
        ...draftCompiled.treeInstances.filter(
          (instance) => ownedByBrush(instance, draftBrushIds) && !removedObjectIds.has(instance.id)
        )
      ]);
  const treeInstances = reconcileExactObjectVisibility(
    baseTreeInstances,
    draftCompiled.treeInstances,
    removedObjectIds,
    restoredObjectIds
  );
  const detailDensityFields = recompileWithinBounds
    ? mergeDetailDensityFieldsWithinBounds(
        activeLayout.detailDensityFields,
        draftCompiled.detailDensityFields,
        dirtyBounds,
        sourcePlan.sizeMetres,
        draftState
      )
    : mergeDetailDensityFields(
        activeLayout.detailDensityFields,
        activeCompiled.detailDensityFields,
        draftCompiled.detailDensityFields
      );
  return Object.freeze({
    ...draftCompiled,
    treeInstances,
    detailDensityFields
  });
}

/** Recompiles changed sparse Brushes while preserving every unaffected published owner. */
function compileChangedSparseVegetationBrushes(
  draftPlan: SeedWorldPlan,
  fields: SeedWorldFields,
  activeInstances: readonly SeedWorldPopulationInstance[],
  draftState: Readonly<SeedWorldAuthoringStateV1>,
  changedBrushIds: ReadonlySet<string>,
  rockDecorations: readonly SeedWorldDecorationInstance[]
): readonly SeedWorldPopulationInstance[] {
  const naturalInstances = activeInstances.filter((instance) => instance.authoringBrushId === undefined);
  const naturalTreeIds = new Set(
    naturalInstances.filter((instance) => instance.category === "tree").map(({ id }) => id)
  );
  const draftBrushIds = draftState.vegetationBrushes.map(({ brushId }) => brushId);
  const unchangedInstances = activeInstances.filter(
    (instance) =>
      instance.authoringBrushId !== undefined &&
      draftBrushIds.includes(instance.authoringBrushId) &&
      !changedBrushIds.has(instance.authoringBrushId)
  );
  const compiledByBrush = new Map<string, SeedWorldPopulationInstance[]>();
  for (const instance of unchangedInstances) {
    const brushId = instance.authoringBrushId!;
    const existing = compiledByBrush.get(brushId);
    if (existing) existing.push(instance);
    else compiledByBrush.set(brushId, [instance]);
  }
  const occupiedInstances = [...naturalInstances, ...unchangedInstances];
  for (const brushId of draftBrushIds) {
    if (!changedBrushIds.has(brushId)) continue;
    const changedOperations = draftPlan.treeScatterOperations.filter(
      (operation) => operation.distribution === "local-brush" && operation.authoringBrushId === brushId
    );
    const compiled = compileSeedWorldLocalTreeScatterOperations(
      draftPlan,
      fields,
      changedOperations,
      occupiedInstances,
      naturalTreeIds,
      rockDecorations
    );
    compiledByBrush.set(brushId, [...compiled]);
    occupiedInstances.push(...compiled);
  }
  return Object.freeze([
    ...naturalInstances,
    ...draftBrushIds.flatMap((brushId) => compiledByBrush.get(brushId) ?? [])
  ]);
}

/** Replays only sparse Authoring Brushes against the immutable Worker-published natural population. */
function compileCanonicalSparseAuthoringLayout(
  draftPlan: SeedWorldPlan,
  fields: SeedWorldFields,
  rootInstances: readonly SeedWorldPopulationInstance[],
  draftState: Readonly<SeedWorldAuthoringStateV1>,
  rockDecorations: readonly SeedWorldDecorationInstance[]
): readonly SeedWorldPopulationInstance[] {
  const removedObjectIds = new Set(draftState.objectRemovals.map(({ objectId }) => objectId));
  const naturalInstances = rootInstances.filter(
    (instance) => instance.authoringBrushId === undefined && !removedObjectIds.has(instance.id)
  );
  const naturalTreeIds = new Set(
    naturalInstances.filter((instance) => instance.category === "tree").map(({ id }) => id)
  );
  const result = [...naturalInstances];
  for (const brushId of draftState.vegetationBrushes
    .filter((brush) => brush.category === "tree" || brush.category === "shrub")
    .map(({ brushId }) => brushId)) {
    const operations = draftPlan.treeScatterOperations.filter(
      (operation) => operation.distribution === "local-brush" && operation.authoringBrushId === brushId
    );
    result.push(
      ...compileSeedWorldLocalTreeScatterOperations(
        draftPlan,
        fields,
        operations,
        result,
        naturalTreeIds,
        rockDecorations
      )
    );
  }
  return Object.freeze(result.filter((instance) => !removedObjectIds.has(instance.id)));
}

function resolveExactObjectRestoreLayout(
  draftPlan: SeedWorldPlan,
  fields: SeedWorldFields,
  rootLayout: SeedWorldPopulationPreview | undefined,
  draftState: Readonly<SeedWorldAuthoringStateV1>,
  restoredObjectIds: ReadonlySet<string>,
  rockDecorations: readonly SeedWorldDecorationInstance[]
): readonly SeedWorldPopulationInstance[] | undefined {
  if (restoredObjectIds.size === 0) return [];
  if (!rootLayout) return undefined;
  return restoredObjectIdsAreNatural(restoredObjectIds, rootLayout.treeInstances)
    ? rootLayout.treeInstances
    : compileCanonicalSparseAuthoringLayout(draftPlan, fields, rootLayout.treeInstances, draftState, rockDecorations);
}

function restoredObjectIdsAreNatural(
  restoredObjectIds: ReadonlySet<string>,
  rootInstances: readonly SeedWorldPopulationInstance[]
): boolean {
  const naturalIds = new Set(
    rootInstances.filter((instance) => instance.authoringBrushId === undefined).map(({ id }) => id)
  );
  return [...restoredObjectIds].every((objectId) => naturalIds.has(objectId));
}

function changedVegetationBrushIds(
  active: readonly Readonly<SeedWorldVegetationBrushV1>[],
  draft: readonly Readonly<SeedWorldVegetationBrushV1>[]
): ReadonlySet<string> {
  const activeById = new Map(active.map((brush) => [brush.brushId, brush.brushContentHash] as const));
  const draftById = new Map(draft.map((brush) => [brush.brushId, brush.brushContentHash] as const));
  return new Set(
    [...new Set([...activeById.keys(), ...draftById.keys()])].filter(
      (brushId) => activeById.get(brushId) !== draftById.get(brushId)
    )
  );
}

/**
 * Exact object removal is an identity delta, not a request to regenerate Population within its bounds.
 * Deletions filter the currently published layout; undo restores only the exact stable ids from the
 * canonical draft compilation. Unrelated generated instances are never introduced by the edit.
 */
function reconcileExactObjectVisibility(
  published: readonly SeedWorldPopulationInstance[],
  canonicalDraft: readonly SeedWorldPopulationInstance[],
  removedObjectIds: ReadonlySet<string>,
  restoredObjectIds: ReadonlySet<string>
): readonly SeedWorldPopulationInstance[] {
  const visible = published.filter((instance) => !removedObjectIds.has(instance.id));
  if (restoredObjectIds.size === 0) return Object.freeze(visible);
  const visibleIds = new Set(visible.map(({ id }) => id));
  for (const instance of canonicalDraft) {
    if (!restoredObjectIds.has(instance.id) || visibleIds.has(instance.id)) continue;
    visible.push(instance);
    visibleIds.add(instance.id);
  }
  return Object.freeze(visible);
}

function mergePopulationInstancesWithinBounds(
  published: readonly SeedWorldPopulationInstance[],
  draftCompiled: readonly SeedWorldPopulationInstance[],
  bounds: SeedWorldAuthoringRuntimeBoundsV1,
  sizeMetres: number,
  draftState: Readonly<SeedWorldAuthoringStateV1>
): readonly SeedWorldPopulationInstance[] {
  const removedObjectIds = new Set(draftState.objectRemovals.map(({ objectId }) => objectId));
  const outside = published.filter((instance) => !populationInstanceInBounds(instance, bounds, sizeMetres));
  const inside = draftCompiled.filter(
    (instance) =>
      populationInstanceInBounds(instance, bounds, sizeMetres) &&
      !removedObjectIds.has(instance.id) &&
      ((instance.category === "shrub" && instance.authoringBrushId !== undefined) ||
        !positionIntersectsAuthoredWater(
          (instance.normalizedPosition.x - 0.5) * sizeMetres,
          (instance.normalizedPosition.y - 0.5) * sizeMetres,
          Math.hypot(instance.footprintMetres[0], instance.footprintMetres[1]) * 0.5,
          draftState,
          sizeMetres
        ))
  );
  return Object.freeze([...outside, ...inside]);
}

function populationInstanceInBounds(
  instance: Readonly<SeedWorldPopulationInstance>,
  bounds: SeedWorldAuthoringRuntimeBoundsV1,
  sizeMetres: number
): boolean {
  const x = (instance.normalizedPosition.x - 0.5) * sizeMetres;
  const z = (instance.normalizedPosition.y - 0.5) * sizeMetres;
  return x >= bounds.minimumX && x <= bounds.maximumX && z >= bounds.minimumZ && z <= bounds.maximumZ;
}

function mergeDetailDensityFieldsWithinBounds(
  published: readonly SeedWorldDetailDensityField[],
  draftCompiled: readonly SeedWorldDetailDensityField[],
  bounds: SeedWorldAuthoringRuntimeBoundsV1,
  sizeMetres: number,
  draftState: Readonly<SeedWorldAuthoringStateV1>
): readonly SeedWorldDetailDensityField[] {
  const draftByPrototype = new Map(draftCompiled.map((field) => [field.prototypeFamily, field] as const));
  return Object.freeze(
    published.map((field) => {
      const draft = draftByPrototype.get(field.prototypeFamily);
      if (!draft || draft.resolution !== field.resolution) {
        throw new Error(`Authoring Detail prototype '${field.prototypeFamily}' changed runtime topology.`);
      }
      const samples = new Uint8Array(field.samples);
      const cellSize = sizeMetres / field.resolution;
      const minimumX = clampInteger(
        Math.floor((bounds.minimumX + sizeMetres * 0.5) / cellSize),
        0,
        field.resolution - 1
      );
      const maximumX = clampInteger(
        Math.ceil((bounds.maximumX + sizeMetres * 0.5) / cellSize),
        0,
        field.resolution - 1
      );
      const minimumZ = clampInteger(
        Math.floor((bounds.minimumZ + sizeMetres * 0.5) / cellSize),
        0,
        field.resolution - 1
      );
      const maximumZ = clampInteger(
        Math.ceil((bounds.maximumZ + sizeMetres * 0.5) / cellSize),
        0,
        field.resolution - 1
      );
      for (let z = minimumZ; z <= maximumZ; z++) {
        const worldZ = (z + 0.5) * cellSize - sizeMetres * 0.5;
        for (let x = minimumX; x <= maximumX; x++) {
          const worldX = (x + 0.5) * cellSize - sizeMetres * 0.5;
          const index = z * field.resolution + x;
          samples[index] =
            field.prototypeFamily !== "water-grass" &&
            positionIntersectsAuthoredWater(worldX, worldZ, cellSize * Math.SQRT1_2, draftState, sizeMetres) &&
            !positionIntersectsAuthoredTerrestrialDetailBrush(
              worldX,
              worldZ,
              cellSize * Math.SQRT1_2,
              field.category,
              draftState,
              sizeMetres
            )
              ? 0
              : draft.samples[index]!;
        }
      }
      return Object.freeze({ ...draft, samples, hash: field.hash });
    })
  );
}

/**
 * Rebuilds only the physical density values inside one local Authoring rectangle.
 * Published bytes outside the rectangle remain the source of truth; when a new local maximum changes
 * field normalization, their physical densities are preserved and only the cheap byte quantization is repeated.
 */
function composeDetailDensityFieldsWithinBounds(
  published: readonly SeedWorldDetailDensityField[],
  root: readonly SeedWorldDetailDensityField[],
  authored: readonly SeedWorldDetailDensityField[],
  profiles: SeedWorldPopulationPreview["detailSpeciesProfiles"],
  bounds: SeedWorldAuthoringRuntimeBoundsV1,
  sizeMetres: number,
  draftState: Readonly<SeedWorldAuthoringStateV1>
): readonly SeedWorldDetailDensityField[] {
  const rootByPrototype = new Map(root.map((field) => [field.prototypeFamily, field] as const));
  const authoredByPrototype = new Map(authored.map((field) => [field.prototypeFamily, field] as const));
  const profileByPrototype = new Map(profiles.map((profile) => [profile.key, profile] as const));
  return Object.freeze(
    published.map((field) => {
      const rootField = rootByPrototype.get(field.prototypeFamily);
      const authoredField = authoredByPrototype.get(field.prototypeFamily);
      const profile = profileByPrototype.get(field.prototypeFamily);
      if (
        !rootField ||
        !authoredField ||
        !profile ||
        rootField.resolution !== field.resolution ||
        authoredField.resolution !== field.resolution
      ) {
        throw new Error(`Authoring Detail prototype '${field.prototypeFamily}' changed runtime topology.`);
      }
      const densities = new Float32Array(field.samples.length);
      for (let index = 0; index < densities.length; index++) {
        densities[index] = (field.samples[index]! / 255) * field.maximumDensityPerSquareMetre;
      }
      const cellSize = sizeMetres / field.resolution;
      const minimumX = clampInteger(
        Math.floor((bounds.minimumX + sizeMetres * 0.5) / cellSize),
        0,
        field.resolution - 1
      );
      const maximumX = clampInteger(
        Math.ceil((bounds.maximumX + sizeMetres * 0.5) / cellSize),
        0,
        field.resolution - 1
      );
      const minimumZ = clampInteger(
        Math.floor((bounds.minimumZ + sizeMetres * 0.5) / cellSize),
        0,
        field.resolution - 1
      );
      const maximumZ = clampInteger(
        Math.ceil((bounds.maximumZ + sizeMetres * 0.5) / cellSize),
        0,
        field.resolution - 1
      );
      for (let z = minimumZ; z <= maximumZ; z++) {
        const worldZ = (z + 0.5) * cellSize - sizeMetres * 0.5;
        for (let x = minimumX; x <= maximumX; x++) {
          const worldX = (x + 0.5) * cellSize - sizeMetres * 0.5;
          const index = z * field.resolution + x;
          const rootDensity = (rootField.samples[index]! / 255) * rootField.maximumDensityPerSquareMetre;
          const authoredDensity = (authoredField.samples[index]! / 255) * authoredField.maximumDensityPerSquareMetre;
          const rootSurvivesAuthoredWater =
            field.prototypeFamily === "water-grass" ||
            !positionIntersectsAuthoredWater(worldX, worldZ, cellSize * Math.SQRT1_2, draftState, sizeMetres);
          densities[index] = Math.max(rootSurvivesAuthoredWater ? rootDensity : 0, authoredDensity);
        }
      }
      return createSeedWorldDetailDensityField(profile, field.resolution, densities);
    })
  );
}

function positionIntersectsAuthoredWater(
  worldX: number,
  worldZ: number,
  clearanceMetres: number,
  state: Readonly<SeedWorldAuthoringStateV1>,
  sizeMetres: number
): boolean {
  const half = sizeMetres * 0.5;
  for (const river of state.rivers) {
    const shape = createSeedWorldFlowingWaterLakeSurrogateShapeV1(river);
    const profile = sampleSeedWorldWaterBasinProfileV1(
      shape,
      Math.round((worldX + half) * 1_000),
      Math.round((worldZ + half) * 1_000)
    );
    const clearanceRatio = clearanceMetres / Math.max(1, shape.radiusMillimetres / 1_000);
    if (profile > Math.min(0.18, clearanceRatio)) return true;
  }
  for (const patch of state.terrainPatches) {
    if (patch.purpose !== "water-body" || patch.shape.kind !== "radial-water-basin") continue;
    const profile = sampleSeedWorldWaterBasinProfileV1(
      patch.shape,
      Math.round((worldX + half) * 1_000),
      Math.round((worldZ + half) * 1_000)
    );
    const clearanceRatio = clearanceMetres / Math.max(1, patch.shape.radiusMillimetres / 1_000);
    if (profile > Math.min(0.18, clearanceRatio)) return true;
  }
  return false;
}

function positionIntersectsAuthoredTerrestrialDetailBrush(
  worldX: number,
  worldZ: number,
  clearanceMetres: number,
  category: SeedWorldDetailDensityField["category"],
  state: Readonly<SeedWorldAuthoringStateV1>,
  sizeMetres: number
): boolean {
  const half = sizeMetres * 0.5;
  for (const brush of state.vegetationBrushes) {
    if (brush.category !== category) continue;
    const centerX = brush.centerXOffsetMillimetres / 1_000 - half;
    const centerZ = brush.centerZOffsetMillimetres / 1_000 - half;
    if (Math.hypot(worldX - centerX, worldZ - centerZ) <= brush.radiusMillimetres / 1_000 + clearanceMetres) {
      return true;
    }
  }
  return false;
}

function ownedByBrush(instance: SeedWorldPopulationInstance, brushIds: ReadonlySet<string>): boolean {
  return instance.authoringBrushId !== undefined && brushIds.has(instance.authoringBrushId);
}

function mergeDetailDensityFields(
  published: readonly SeedWorldDetailDensityField[],
  activeCompiled: readonly SeedWorldDetailDensityField[],
  draftCompiled: readonly SeedWorldDetailDensityField[]
): readonly SeedWorldDetailDensityField[] {
  const activeByPrototype = new Map(activeCompiled.map((field) => [field.prototypeFamily, field] as const));
  const draftByPrototype = new Map(draftCompiled.map((field) => [field.prototypeFamily, field] as const));
  return Object.freeze(
    published.map((field) => {
      const active = activeByPrototype.get(field.prototypeFamily);
      const draft = draftByPrototype.get(field.prototypeFamily);
      if (!active || !draft || active.resolution !== field.resolution || draft.resolution !== field.resolution) {
        throw new Error(`Authoring Detail prototype '${field.prototypeFamily}' changed runtime topology.`);
      }
      const samples = new Uint8Array(field.samples.length);
      for (let index = 0; index < samples.length; index++) {
        samples[index] = clampInteger(field.samples[index]! + draft.samples[index]! - active.samples[index]!, 0, 255);
      }
      return Object.freeze({ ...draft, samples, hash: field.hash });
    })
  );
}

function changedTerrainBounds(
  active: readonly Readonly<SeedWorldTerrainPatchV1>[],
  draft: readonly Readonly<SeedWorldTerrainPatchV1>[],
  sizeMetres: number
): SeedWorldAuthoringRuntimeBoundsV1 | undefined {
  return changedResourceBounds(
    active,
    draft,
    (patch) => patch.patchId,
    terrainPatchGeometryIdentity,
    (patch) => terrainPatchBounds(patch, sizeMetres)
  );
}

/** Water-level changes republish Water only; they never dirty the excavated terrain or Population. */
function terrainPatchGeometryIdentity(patch: Readonly<SeedWorldTerrainPatchV1>): string {
  if (patch.shape.kind !== "radial-water-basin") return patch.patchContentHash;
  const shape = patch.shape;
  return [
    shape.featureKind,
    shape.centerXOffsetMillimetres,
    shape.centerZOffsetMillimetres,
    shape.radiusMillimetres,
    shape.depthMillimetres,
    shape.shorelineIrregularityPermille,
    shape.seed
  ].join(":");
}

function changedWaterTerrainBounds(
  active: readonly Readonly<SeedWorldTerrainPatchV1>[],
  draft: readonly Readonly<SeedWorldTerrainPatchV1>[],
  sizeMetres: number
): SeedWorldAuthoringRuntimeBoundsV1 | undefined {
  return changedTerrainBounds(
    active.filter((patch) => patch.purpose === "water-body"),
    draft.filter((patch) => patch.purpose === "water-body"),
    sizeMetres
  );
}

/** Water publication identity includes persistent level state, unlike Terrain geometry identity. */
function authoredWaterResourcesDiffer(
  active: Readonly<SeedWorldAuthoringStateV1>,
  draft: Readonly<SeedWorldAuthoringStateV1>
): boolean {
  const activeBasins = active.terrainPatches.filter((patch) => patch.purpose === "water-body");
  const draftBasins = draft.terrainPatches.filter((patch) => patch.purpose === "water-body");
  return (
    resourceCollectionsDiffer(
      activeBasins,
      draftBasins,
      (patch) => patch.patchId,
      (patch) => patch.patchContentHash
    ) ||
    resourceCollectionsDiffer(
      active.rivers,
      draft.rivers,
      (river) => river.riverId,
      (river) => river.riverContentHash
    )
  );
}

function changedVegetationBounds(
  active: readonly Readonly<SeedWorldVegetationBrushV1>[],
  draft: readonly Readonly<SeedWorldVegetationBrushV1>[],
  sizeMetres: number
): SeedWorldAuthoringRuntimeBoundsV1 | undefined {
  return changedResourceBounds(
    active,
    draft,
    (brush) => brush.brushId,
    (brush) => brush.brushContentHash,
    (brush) =>
      radialBounds(brush.centerXOffsetMillimetres, brush.centerZOffsetMillimetres, brush.radiusMillimetres, sizeMetres)
  );
}

function changedRiverBounds(
  active: readonly Readonly<SeedWorldRiverV1>[],
  draft: readonly Readonly<SeedWorldRiverV1>[],
  sizeMetres: number
): SeedWorldAuthoringRuntimeBoundsV1 | undefined {
  return changedResourceBounds(
    active,
    draft,
    (river) => river.riverId,
    (river) => river.riverContentHash,
    (river) => terrainPatchBounds(createSeedWorldFlowingWaterLakeSurrogatePatchV1(river), sizeMetres)
  );
}

function changedObjectRemovalBounds(
  active: readonly Readonly<SeedWorldObjectRemovalV1>[],
  draft: readonly Readonly<SeedWorldObjectRemovalV1>[],
  sizeMetres: number
): SeedWorldAuthoringRuntimeBoundsV1 | undefined {
  return changedResourceBounds(
    active,
    draft,
    (removal) => removal.objectId,
    (removal) => removal.removalContentHash,
    (removal) =>
      radialBounds(
        removal.centerXOffsetMillimetres,
        removal.centerZOffsetMillimetres,
        removal.radiusMillimetres,
        sizeMetres
      )
  );
}

function changedResourceBounds<T>(
  active: readonly T[],
  draft: readonly T[],
  id: (value: T) => string,
  hash: (value: T) => string,
  bounds: (value: T) => SeedWorldAuthoringRuntimeBoundsV1
): SeedWorldAuthoringRuntimeBoundsV1 | undefined {
  const activeById = new Map(active.map((value) => [id(value), value] as const));
  const draftById = new Map(draft.map((value) => [id(value), value] as const));
  let result: SeedWorldAuthoringRuntimeBoundsV1 | undefined;
  for (const resourceId of new Set([...activeById.keys(), ...draftById.keys()])) {
    const previous = activeById.get(resourceId);
    const next = draftById.get(resourceId);
    if (previous && next && hash(previous) === hash(next)) continue;
    if (previous) result = unionBounds(result, bounds(previous));
    if (next) result = unionBounds(result, bounds(next));
  }
  return result;
}

function resourceCollectionsDiffer<T>(
  active: readonly T[],
  draft: readonly T[],
  id: (value: T) => string,
  hash: (value: T) => string
): boolean {
  if (active.length !== draft.length) return true;
  const draftById = new Map(draft.map((value) => [id(value), hash(value)] as const));
  return active.some((value) => draftById.get(id(value)) !== hash(value));
}

function terrainPatchBounds(
  patch: Readonly<SeedWorldTerrainPatchV1>,
  sizeMetres: number
): SeedWorldAuthoringRuntimeBoundsV1 {
  const bounds = seedWorldTerrainPatchShapeOffsetBoundsV1(patch.shape);
  const half = sizeMetres * 0.5;
  return freezeBounds({
    minimumX: bounds.minimumXOffsetMillimetres / 1_000 - half,
    minimumZ: bounds.minimumZOffsetMillimetres / 1_000 - half,
    maximumX: bounds.maximumXOffsetMillimetres / 1_000 - half,
    maximumZ: bounds.maximumZOffsetMillimetres / 1_000 - half
  });
}

function radialBounds(
  centerXOffsetMillimetres: number,
  centerZOffsetMillimetres: number,
  radiusMillimetres: number,
  sizeMetres: number
): SeedWorldAuthoringRuntimeBoundsV1 {
  const half = sizeMetres * 0.5;
  const centerX = centerXOffsetMillimetres / 1_000 - half;
  const centerZ = centerZOffsetMillimetres / 1_000 - half;
  const radius = radiusMillimetres / 1_000;
  return freezeBounds({
    minimumX: centerX - radius,
    minimumZ: centerZ - radius,
    maximumX: centerX + radius,
    maximumZ: centerZ + radius
  });
}

function unionBounds(
  left: SeedWorldAuthoringRuntimeBoundsV1 | undefined,
  right: SeedWorldAuthoringRuntimeBoundsV1 | undefined
): SeedWorldAuthoringRuntimeBoundsV1 | undefined {
  if (!left) return right;
  if (!right) return left;
  return freezeBounds({
    minimumX: Math.min(left.minimumX, right.minimumX),
    minimumZ: Math.min(left.minimumZ, right.minimumZ),
    maximumX: Math.max(left.maximumX, right.maximumX),
    maximumZ: Math.max(left.maximumZ, right.maximumZ)
  });
}

function freezeBounds(bounds: SeedWorldAuthoringRuntimeBoundsV1): SeedWorldAuthoringRuntimeBoundsV1 {
  return Object.freeze(bounds);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}
