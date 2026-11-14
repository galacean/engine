import {
  type BoundingBox,
  type Engine,
  type Entity,
  type ModelMesh,
  MeshRenderer,
  SetDataOptions,
  ShaderMacro,
  type RenderViewCullingContext
} from "@galacean/engine";
import {
  createTreeAssemblyInstanceStorage,
  createTreeAssemblyInstancedMesh,
  TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS,
  TREE_ASSEMBLY_COMPACT_REVEAL_INSTANCE_FLOATS,
  TREE_ASSEMBLY_COMPACT_LOD_FADE_FLOAT_OFFSET,
  type TreeAssemblyInstancedMesh,
  type TreeAssemblyInstanceStorage
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh";
import {
  setAssetEntranceRevealRange,
  setAssetEntranceRevealRangeValues
} from "@galacean/engine-vegetation/asset-assembly/AssetEntranceEffect";
import type { TerrainProjectResolvedRenderer } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";

export const POPULATION_RENDER_VIEW_COUNT = 5;
export const POPULATION_CAMERA_VIEW_INDEX = 0;
export const POPULATION_WORLD_BOUNDS_FLOATS = 6;
const INSTANCE_MACRO = ShaderMacro.getByName("RENDERER_ASSET_ASSEMBLY_INSTANCE");
const ASSET_ASSEMBLY_COMPACT_INSTANCE_MACRO = ShaderMacro.getByName("RENDERER_ASSET_ASSEMBLY_COMPACT_INSTANCE");
const LOD_DITHER_MACRO = ShaderMacro.getByName("RENDERER_LOD_DITHER");

export interface PopulationInstanceUploadState {
  gpuInitializedRecordCount: number;
  dirtyFloatStart: number;
  dirtyFloatEnd: number;
}

export interface PrefabInstanceViewBatch extends PopulationInstanceUploadState {
  readonly entity: Entity;
  readonly renderer: MeshRenderer;
  resources: TreeAssemblyInstancedMesh;
  readonly engine: Engine;
  readonly sourceMesh: ModelMesh;
  readonly bounds: BoundingBox;
  readonly localMinimumY: number;
  readonly localMaximumY: number;
  count: number;
  destroyed: boolean;
}

export interface PopulationViewCache {
  readonly viewProjection: Float32Array;
  lodStateRevision: number;
  revealRevision: number;
  frustumCullingEnabled: boolean;
  valid: boolean;
}

export function createPopulationViewCaches(): PopulationViewCache[] {
  return Array.from({ length: POPULATION_RENDER_VIEW_COUNT }, () => ({
    viewProjection: new Float32Array(16),
    lodStateRevision: -1,
    revealRevision: -1,
    frustumCullingEnabled: false,
    valid: false
  }));
}

export function populationViewCacheMatches(
  cache: PopulationViewCache,
  context: RenderViewCullingContext,
  lodStateRevision: number,
  revealRevision = 0
): boolean {
  if (
    !cache.valid ||
    cache.lodStateRevision !== lodStateRevision ||
    cache.revealRevision !== revealRevision ||
    cache.frustumCullingEnabled !== context.camera.enableFrustumCulling
  ) {
    return false;
  }
  const elements = context.virtualCamera.viewProjectionMatrix.elements;
  for (let index = 0; index < 16; index++) {
    if (!Object.is(cache.viewProjection[index], elements[index])) {
      return false;
    }
  }
  return true;
}

export function capturePopulationViewCache(
  cache: PopulationViewCache,
  context: RenderViewCullingContext,
  lodStateRevision: number,
  revealRevision = 0
): void {
  cache.viewProjection.set(context.virtualCamera.viewProjectionMatrix.elements);
  cache.lodStateRevision = lodStateRevision;
  cache.revealRevision = revealRevision;
  cache.frustumCullingEnabled = context.camera.enableFrustumCulling;
  cache.valid = true;
}

export function readPopulationWorldBounds(data: Float32Array, index: number, bounds: BoundingBox): void {
  const offset = index * POPULATION_WORLD_BOUNDS_FLOATS;
  bounds.min.set(data[offset]!, data[offset + 1]!, data[offset + 2]!);
  bounds.max.set(data[offset + 3]!, data[offset + 4]!, data[offset + 5]!);
}

export function extendPopulationWorldBounds(bounds: BoundingBox, data: Float32Array, index: number): void {
  const offset = index * POPULATION_WORLD_BOUNDS_FLOATS;
  bounds.min.set(
    Math.min(bounds.min.x, data[offset]!),
    Math.min(bounds.min.y, data[offset + 1]!),
    Math.min(bounds.min.z, data[offset + 2]!)
  );
  bounds.max.set(
    Math.max(bounds.max.x, data[offset + 3]!),
    Math.max(bounds.max.y, data[offset + 4]!),
    Math.max(bounds.max.z, data[offset + 5]!)
  );
}

/** Packs a canonical compact transform with its view LOD fade and optional local-entrance membership. */
export function appendPrefabInstance(
  batch: PrefabInstanceViewBatch,
  source: Float32Array,
  index: number,
  signedFade: number,
  entering = false
): void {
  const recordFloats = batch.resources.recordFloats;
  const recordOffset = batch.count++ * recordFloats;
  const sourceOffset = index * TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS;
  const target = batch.resources.staging;
  if (recordOffset + recordFloats > target.length) {
    throw new RangeError("Seed World Prefab visible prefix exceeds its batch capacity");
  }
  for (let floatIndex = 0; floatIndex < recordFloats; floatIndex++) {
    let next =
      floatIndex === TREE_ASSEMBLY_COMPACT_LOD_FADE_FLOAT_OFFSET
        ? Math.fround(signedFade)
        : source[sourceOffset + floatIndex]!;
    if (floatIndex >= TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS) {
      const positionY = source[sourceOffset + 1]!;
      const scaleY = source[sourceOffset + 9]!;
      const firstY = positionY + batch.localMinimumY * scaleY;
      const secondY = positionY + batch.localMaximumY * scaleY;
      next = Math.fround(
        floatIndex === 12
          ? Number(entering)
          : floatIndex === 13
            ? Math.min(firstY, secondY)
            : Math.max(0.001, Math.abs(secondY - firstY))
      );
    }
    const targetIndex = recordOffset + floatIndex;
    if (Object.is(target[targetIndex], next)) {
      continue;
    }
    target[targetIndex] = next;
    batch.dirtyFloatStart = Math.min(batch.dirtyFloatStart, targetIndex);
    batch.dirtyFloatEnd = Math.max(batch.dirtyFloatEnd, targetIndex + 1);
  }
}

export function createPrefabInstanceViewBatch(
  engine: Engine,
  root: Entity,
  name: string,
  source: TerrainProjectResolvedRenderer,
  capacity: number,
  bounds: BoundingBox,
  lodDither = true,
  instanceGenerationReveal = false
): PrefabInstanceViewBatch {
  const entity = root.createChild(name);
  let resources: TreeAssemblyInstancedMesh | undefined;
  let storage: TreeAssemblyInstanceStorage | undefined;
  try {
    const renderer = entity.addComponent(MeshRenderer);
    storage = createTreeAssemblyInstanceStorage(
      engine,
      Math.max(1, capacity),
      instanceGenerationReveal ? TREE_ASSEMBLY_COMPACT_REVEAL_INSTANCE_FLOATS : TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS
    );
    resources = createTreeAssemblyInstancedMesh(
      engine,
      source.mesh,
      Math.max(1, capacity),
      bounds,
      entity.name,
      storage
    );
    configurePrefabInstanceRenderer(renderer, source, lodDither);
    renderer.mesh = resources.mesh;
    renderer.enabled = false;
    const localMinimumY = source.mesh.bounds.min.y;
    const localMaximumY = source.mesh.bounds.max.y;
    if (!Number.isFinite(localMinimumY) || !Number.isFinite(localMaximumY)) {
      throw new Error(`Population batch "${name}" requires finite authored Mesh Bounds`);
    }
    return {
      entity,
      renderer,
      resources,
      engine,
      sourceMesh: source.mesh,
      bounds,
      localMinimumY: Math.min(localMinimumY, localMaximumY),
      localMaximumY: Math.max(localMinimumY, localMaximumY),
      count: 0,
      gpuInitializedRecordCount: 0,
      dirtyFloatStart: Number.POSITIVE_INFINITY,
      dirtyFloatEnd: 0,
      destroyed: false
    };
  } catch (error) {
    resources?.mesh.destroy();
    (resources?.instanceBuffer ?? storage?.instanceBuffer)?.destroy(true);
    entity.destroy();
    throw error;
  }
}

export function ensurePrefabInstanceViewBatchCapacity(batch: PrefabInstanceViewBatch, requestedCapacity: number): void {
  const currentCapacity = batch.resources.staging.length / batch.resources.recordFloats;
  if (requestedCapacity <= currentCapacity) {
    return;
  }
  const nextCapacity = Math.max(requestedCapacity, currentCapacity * 2);
  const storage = createTreeAssemblyInstanceStorage(batch.engine, nextCapacity, batch.resources.recordFloats);
  let next: TreeAssemblyInstancedMesh;
  try {
    next = createTreeAssemblyInstancedMesh(
      batch.engine,
      batch.sourceMesh,
      nextCapacity,
      batch.bounds,
      batch.entity.name,
      storage
    );
  } catch (error) {
    storage.instanceBuffer.destroy(true);
    throw error;
  }
  const previous = batch.resources;
  batch.resources = next;
  batch.count = 0;
  batch.gpuInitializedRecordCount = 0;
  batch.dirtyFloatStart = Number.POSITIVE_INFINITY;
  batch.dirtyFloatEnd = 0;
  batch.renderer.mesh = next.mesh;
  previous.mesh.destroy();
  previous.instanceBuffer.destroy(true);
}

export function uploadChangedPopulationInstances(
  storage: Pick<TreeAssemblyInstanceStorage, "staging" | "instanceBuffer" | "recordFloats">,
  state: PopulationInstanceUploadState,
  count: number
): void {
  const activeFloatCount = count * storage.recordFloats;
  if (!Number.isInteger(count) || count < 0 || activeFloatCount > storage.staging.length) {
    throw new RangeError("Seed World visible prefix exceeds its instance storage");
  }
  if (count === 0) return;
  let dirtyFloatStart = state.dirtyFloatStart;
  let dirtyFloatEnd = state.dirtyFloatEnd;
  if (count > state.gpuInitializedRecordCount) {
    dirtyFloatStart = Math.min(dirtyFloatStart, state.gpuInitializedRecordCount * storage.recordFloats);
    dirtyFloatEnd = Math.max(dirtyFloatEnd, activeFloatCount);
  }
  if (dirtyFloatEnd <= dirtyFloatStart) return;
  const dirtyFloatCount = dirtyFloatEnd - dirtyFloatStart;
  const discard = state.gpuInitializedRecordCount === 0 || dirtyFloatCount * 2 >= activeFloatCount;
  if (discard) {
    storage.instanceBuffer.setData(storage.staging, 0, 0, activeFloatCount, SetDataOptions.Discard);
  } else {
    storage.instanceBuffer.setData(
      storage.staging,
      dirtyFloatStart * Float32Array.BYTES_PER_ELEMENT,
      dirtyFloatStart,
      dirtyFloatCount,
      SetDataOptions.None
    );
  }
  state.gpuInitializedRecordCount = discard ? count : Math.max(state.gpuInitializedRecordCount, count);
}

function configurePrefabInstanceRenderer(
  renderer: MeshRenderer,
  source: TerrainProjectResolvedRenderer,
  lodDither: boolean
): void {
  renderer.setMaterial(source.material);
  renderer.castShadows = source.castShadows;
  renderer.receiveShadows = source.receiveShadows;
  renderer.enableVertexColor = source.enableVertexColor;
  renderer.shaderData.enableMacro(INSTANCE_MACRO);
  renderer.shaderData.enableMacro(ASSET_ASSEMBLY_COMPACT_INSTANCE_MACRO);
  if (lodDither) renderer.shaderData.enableMacro(LOD_DITHER_MACRO);
  setAssetEntranceRevealRange(renderer, { minimumY: 0, maximumY: 1 });
}

export function publishPrefabInstanceViewBatch(batch: PrefabInstanceViewBatch): void {
  const count = batch.count;
  if (count > 0 && (batch.dirtyFloatEnd > batch.dirtyFloatStart || batch.resources.mesh.instanceCount !== count)) {
    updatePrefabInstanceRevealRange(batch, count);
  }
  uploadChangedPopulationInstances(batch.resources, batch, count);
  batch.resources.mesh.instanceCount = count;
}

function updatePrefabInstanceRevealRange(batch: PrefabInstanceViewBatch, count: number): void {
  const records = batch.resources.staging;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < count; index++) {
    const offset = index * batch.resources.recordFloats;
    const positionY = records[offset + 1];
    const scaleY = records[offset + 9];
    const firstY = positionY + batch.localMinimumY * scaleY;
    const secondY = positionY + batch.localMaximumY * scaleY;
    minimumY = Math.min(minimumY, firstY, secondY);
    maximumY = Math.max(maximumY, firstY, secondY);
  }
  setAssetEntranceRevealRangeValues(batch.renderer, minimumY, maximumY);
}

export function disposePrefabInstanceViewBatch(batch: PrefabInstanceViewBatch): void {
  if (batch.destroyed) return;
  batch.destroyed = true;
  batch.renderer.enabled = false;
  batch.renderer.mesh = null!;
  batch.renderer.setMaterials([]);
  batch.resources.mesh.destroy();
  batch.resources.instanceBuffer.destroy(true);
  batch.entity.destroy();
}
