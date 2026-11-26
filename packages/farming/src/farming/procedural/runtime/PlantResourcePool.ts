import { destroyOwnedMeshSet } from "@galacean/engine-project/geometry/destroyOwnedMesh";
import { restoreBuffer, uploadRestorableModelMesh } from "@galacean/engine-project/rendering/RestorableResources";
import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Color,
  Engine,
  IndexFormat,
  ModelMesh,
  PBRMaterial,
  PrimitiveMesh,
  RenderFace,
  Shader,
  Vector2,
  VertexElement,
  VertexElementFormat,
  type Texture2D
} from "@galacean/engine";
import { PlantGeometryEvaluator } from "../core/PlantGeometryEvaluator";
import type { PlantGrowthMetadata, PlantGrowthDefinition } from "../core/PlantGrowthDefinition";
import type { PlantGeometry } from "../core/PlantGrowthGeometry";
import type { PlantGrowthRecipe, PlantShape } from "../core/PlantGrowthRecipe";
import organTintShaderSource from "./PlantOrganTint.shader?plant-precompiled";

const SHARED_VERTEX_ELEMENTS: VertexElement[] = [
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
  new VertexElement("TEXCOORD_0", 0, VertexElementFormat.Vector2, 1),
  new VertexElement("COLOR_0", 8, VertexElementFormat.Vector4, 1)
];

const definitionKeyCache = new WeakMap<PlantGrowthDefinition, string>();
const normalizeZero = (value: number): number => (value === 0 ? 0 : value);

export function plantDefinitionKey(definition: PlantGrowthDefinition): string {
  const cached = definitionKeyCache.get(definition);
  if (cached !== undefined) return cached;
  const key = JSON.stringify([
    definition.id,
    definition.revision,
    definition.recipe,
    definition.atlasUrl,
    definition.material
  ]);
  if (Object.isFrozen(definition) && Object.isFrozen(definition.recipe) && Object.isFrozen(definition.material))
    definitionKeyCache.set(definition, key);
  return key;
}

export function plantShapeKey(shape: PlantShape): string {
  return `${normalizeZero(shape.leafSpread)},${normalizeZero(shape.stemBend)},${normalizeZero(shape.fruitScale)}`;
}

/** Matches CropGrowthScheduler's 0.001 sub-permille update threshold for bit-identical quantization. */
export function quantizePlantAge(age: number): number {
  const clamped = Math.max(0, Math.min(1, age));
  return Math.round(clamped * 1000);
}

type MutablePlantGeometry = { -readonly [K in keyof PlantGeometry]: PlantGeometry[K] };

interface SpeciesMaterialEntry {
  readonly key: string;
  readonly material: PBRMaterial;
  readonly hasTint: boolean;
  references: number;
}

interface StaticGeometryEntry {
  readonly key: string;
  readonly recipe: PlantGrowthRecipe;
  readonly vertexElements: VertexElement[];
  readonly staticVertexBuffer: Buffer;
  readonly staticData: Float32Array;
  readonly indexBuffer: Buffer;
  readonly indexData: Uint16Array | Uint32Array;
  readonly indexFormat: IndexFormat;
  readonly indexCount: number;
  readonly vertexCount: number;
  readonly supportMeshes: readonly ModelMesh[];
  evaluator?: PlantGeometryEvaluator;
  readonly uvs: PlantGeometry["uvs"];
  readonly indices: PlantGeometry["indices"];
  readonly tintMask: PlantGeometry["tintMask"];
  readonly organs: PlantGeometry["organs"];
  references: number;
}

interface PooledGrowthMeshEntry {
  key: string;
  bucket: number;
  shapeKey: string;
  readonly mesh: BufferMesh;
  readonly dynamicBuffer: Buffer;
  readonly dynamicData: Float32Array;
  readonly positions: [number, number, number][];
  readonly normals: [number, number, number][];
  readonly geometry: MutablePlantGeometry;
  readonly staticEntry: StaticGeometryEntry;
  readonly staticLease: PlantStaticGeometryLease;
  references: number;
}

interface EnginePlantPools {
  readonly materials: Map<string, SpeciesMaterialEntry>;
  readonly materialEntries: WeakMap<PBRMaterial, SpeciesMaterialEntry>;
  readonly staticGeometries: Map<string, StaticGeometryEntry>;
  readonly growthMeshes: Map<string, PooledGrowthMeshEntry>;
}

const enginePools = new WeakMap<Engine, EnginePlantPools>();

function poolsFor(engine: Engine): EnginePlantPools {
  let pools = enginePools.get(engine);
  if (!pools) {
    pools = {
      materials: new Map(),
      materialEntries: new WeakMap(),
      staticGeometries: new Map(),
      growthMeshes: new Map()
    };
    enginePools.set(engine, pools);
  }
  return pools;
}

function retainMaterialEntry(pools: EnginePlantPools, entry: SpeciesMaterialEntry): () => void {
  entry.references++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.references--;
    if (entry.references > 0) return;
    if (pools.materials.get(entry.key) === entry) pools.materials.delete(entry.key);
    if (!entry.material.destroyed) entry.material.destroy(true);
  };
}

export interface PlantSpeciesMaterialLease {
  readonly key: string;
  readonly material: PBRMaterial;
  readonly hasTint: boolean;
  readonly references: number;
  release(): void;
}

export function acquirePlantSpeciesMaterial(
  engine: Engine,
  definitionKey: string,
  metadata: PlantGrowthMetadata,
  texture: Texture2D
): PlantSpeciesMaterialLease {
  const pools = poolsFor(engine);
  let entry = pools.materials.get(definitionKey);
  if (!entry || entry.material.destroyed) {
    const hasTint = Boolean(metadata.material.tintColors);
    const material = new PBRMaterial(engine);
    try {
      material.baseTexture = texture;
      material.metallic = metadata.material.metallic;
      material.roughness = metadata.material.roughness;
      material.alphaCutoff = metadata.material.alphaCutoff;
      material.renderFace = metadata.material.doubleSided ? RenderFace.Double : RenderFace.Front;
      if (hasTint) {
        const precompiledShader = Shader as typeof Shader & {
          _createFromPrecompiled(data: typeof organTintShaderSource): Shader;
        };
        material.shader =
          Shader.find(organTintShaderSource.name) ?? precompiledShader._createFromPrecompiled(organTintShaderSource);
        material.name = "植物部件着色";
        material.isTransparent = false;
        material.screenSpaceReflectionIntensity = 0;
      } else {
        material.name = metadata.name;
      }
      material.isGCIgnored = true;
      entry = { key: definitionKey, material, hasTint, references: 0 };
      pools.materials.set(definitionKey, entry);
      pools.materialEntries.set(material, entry);
    } catch (error) {
      if (!material.destroyed) material.destroy(true);
      throw error;
    }
  }
  const owner = entry;
  const release = retainMaterialEntry(pools, owner);
  return {
    key: owner.key,
    material: owner.material,
    hasTint: owner.hasTint,
    get references() {
      return owner.references;
    },
    release
  };
}

/** Retains an already-pooled Tier A species material without creating clones or incrementing misses. */
export function retainPlantSpeciesMaterial(engine: Engine, material: PBRMaterial): (() => void) | undefined {
  const pools = enginePools.get(engine);
  const entry = pools?.materialEntries.get(material);
  if (!pools || !entry || entry.material.destroyed || pools.materials.get(entry.key) !== entry) return undefined;
  return retainMaterialEntry(pools, entry);
}

export interface PlantStaticGeometryLease {
  readonly key: string;
  readonly vertexElements: VertexElement[];
  readonly staticVertexBuffer: Buffer;
  readonly indexBuffer: Buffer;
  readonly indexFormat: IndexFormat;
  readonly indexCount: number;
  readonly vertexCount: number;
  readonly supportMeshes: readonly ModelMesh[];
  readonly uvs: PlantGeometry["uvs"];
  readonly indices: PlantGeometry["indices"];
  readonly tintMask: PlantGeometry["tintMask"];
  readonly organs: PlantGeometry["organs"];
  readonly references: number;
  release(): void;
}

function getStaticEvaluator(entry: StaticGeometryEntry): PlantGeometryEvaluator {
  return (entry.evaluator ??= new PlantGeometryEvaluator(entry.recipe));
}

function retainStaticEntry(pools: EnginePlantPools, entry: StaticGeometryEntry): PlantStaticGeometryLease {
  entry.references++;
  let released = false;
  return {
    key: entry.key,
    vertexElements: entry.vertexElements,
    staticVertexBuffer: entry.staticVertexBuffer,
    indexBuffer: entry.indexBuffer,
    indexFormat: entry.indexFormat,
    indexCount: entry.indexCount,
    vertexCount: entry.vertexCount,
    supportMeshes: entry.supportMeshes,
    uvs: entry.uvs,
    indices: entry.indices,
    tintMask: entry.tintMask,
    organs: entry.organs,
    get references() {
      return entry.references;
    },
    release() {
      if (released) return;
      released = true;
      entry.references--;
      if (entry.references > 0) return;
      if (pools.staticGeometries.get(entry.key) === entry) pools.staticGeometries.delete(entry.key);
      if (!entry.staticVertexBuffer.destroyed) entry.staticVertexBuffer.destroy(true);
      if (!entry.indexBuffer.destroyed) entry.indexBuffer.destroy(true);
      destroyOwnedMeshSet(entry.supportMeshes);
    }
  };
}

export function acquirePlantStaticGeometry(
  engine: Engine,
  definitionKey: string,
  recipe: PlantGrowthRecipe,
  evaluatorHint?: PlantGeometryEvaluator
): PlantStaticGeometryLease {
  const pools = poolsFor(engine);
  const key = definitionKey;
  let entry = pools.staticGeometries.get(key);
  if (
    !entry ||
    entry.staticVertexBuffer.destroyed ||
    entry.indexBuffer.destroyed ||
    entry.supportMeshes.some((m) => m.destroyed)
  ) {
    let createdEvaluator: PlantGeometryEvaluator | undefined;
    const geometry = evaluatorHint
      ? evaluatorHint.geometry
      : (createdEvaluator = new PlantGeometryEvaluator(recipe)).geometry;
    const count = geometry.positions.length;
    const staticData = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const uv = geometry.uvs[i],
        offset = i * 6;
      staticData[offset] = uv[0];
      staticData[offset + 1] = uv[1];
      staticData[offset + 2] = staticData[offset + 3] = staticData[offset + 4] = 1;
      staticData[offset + 5] = geometry.tintMask[i];
    }
    const indexCount = geometry.indices.length;
    const use32 = count > 65535;
    const indexData = use32 ? new Uint32Array(geometry.indices) : new Uint16Array(geometry.indices);
    const indexFormat = use32 ? IndexFormat.UInt32 : IndexFormat.UInt16;
    let staticVertexBuffer: Buffer | undefined;
    let indexBuffer: Buffer | undefined;
    const supportMeshes: ModelMesh[] = [];
    try {
      staticVertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, staticData, BufferUsage.Static, false);
      staticVertexBuffer.isGCIgnored = true;
      restoreBuffer(staticVertexBuffer, staticData);
      indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indexData, BufferUsage.Static, false);
      indexBuffer.isGCIgnored = true;
      restoreBuffer(indexBuffer, indexData);
      for (let i = 0; i < recipe.supports.length; i++) {
        const item = recipe.supports[i];
        const mesh = PrimitiveMesh.createCuboid(engine, ...item.size, { keepMeshData: true });
        supportMeshes.push(mesh);
        const positions = mesh.getPositions()!;
        const supportUVs: Vector2[] = new Array(positions.length);
        const supportColors: Color[] = new Array(positions.length);
        for (let v = 0; v < positions.length; v++) {
          supportUVs[v] = new Vector2(item.uv[0], item.uv[1]);
          supportColors[v] = new Color(1, 1, 1, 0);
        }
        mesh.setUVs(supportUVs);
        mesh.setColors(supportColors);
        uploadRestorableModelMesh(mesh);
      }
      entry = {
        key,
        recipe,
        vertexElements: SHARED_VERTEX_ELEMENTS,
        staticVertexBuffer,
        staticData,
        indexBuffer,
        indexData,
        indexFormat,
        indexCount,
        vertexCount: count,
        supportMeshes,
        evaluator: createdEvaluator,
        uvs: geometry.uvs,
        indices: geometry.indices,
        tintMask: geometry.tintMask,
        organs: geometry.organs,
        references: 0
      };
      pools.staticGeometries.set(key, entry);
    } catch (error) {
      if (staticVertexBuffer && !staticVertexBuffer.destroyed) staticVertexBuffer.destroy(true);
      if (indexBuffer && !indexBuffer.destroyed) indexBuffer.destroy(true);
      destroyOwnedMeshSet(supportMeshes);
      throw error;
    }
  }
  return retainStaticEntry(pools, entry);
}

export interface PlantGrowthMeshLease {
  readonly key: string;
  readonly bucket: number;
  readonly shapeKey: string;
  readonly mesh: BufferMesh;
  readonly supportMeshes: readonly ModelMesh[];
  readonly geometry: PlantGeometry;
  readonly references: number;
  release(): void;
}

const growthLeaseStates = new WeakMap<
  PlantGrowthMeshLease,
  { readonly engine: Engine; readonly owner: PooledGrowthMeshEntry; isReleased: () => boolean }
>();

function writeEvaluatedGrowthInPlace(owner: PooledGrowthMeshEntry, evaluated: PlantGeometry): void {
  const { dynamicData, positions, normals } = owner;
  const count = evaluated.positions.length;
  for (let i = 0; i < count; i++) {
    const p = evaluated.positions[i],
      n = evaluated.normals[i],
      offset = i * 6;
    dynamicData[offset] = p[0];
    dynamicData[offset + 1] = p[1];
    dynamicData[offset + 2] = p[2];
    dynamicData[offset + 3] = n[0];
    dynamicData[offset + 4] = n[1];
    dynamicData[offset + 5] = n[2];
    const dstPos = positions[i];
    dstPos[0] = p[0];
    dstPos[1] = p[1];
    dstPos[2] = p[2];
    const dstNorm = normals[i];
    dstNorm[0] = n[0];
    dstNorm[1] = n[1];
    dstNorm[2] = n[2];
  }
  owner.dynamicBuffer.setData(dynamicData);
  const min = evaluated.bounds.min;
  const max = evaluated.bounds.max;
  owner.mesh.bounds.min.set(min[0], min[1], min[2]);
  owner.mesh.bounds.max.set(max[0], max[1], max[2]);
  const geomMin = owner.geometry.bounds.min as [number, number, number];
  const geomMax = owner.geometry.bounds.max as [number, number, number];
  geomMin[0] = min[0];
  geomMin[1] = min[1];
  geomMin[2] = min[2];
  geomMax[0] = max[0];
  geomMax[1] = max[1];
  geomMax[2] = max[2];
  owner.geometry.age = evaluated.age;
  owner.geometry.maturity = evaluated.maturity;
  owner.geometry.leafCount = evaluated.leafCount;
  owner.geometry.fruitCount = evaluated.fruitCount;
}

function retainGrowthEntry(
  pools: EnginePlantPools,
  engine: Engine,
  owner: PooledGrowthMeshEntry
): PlantGrowthMeshLease {
  owner.references++;
  let released = false;
  const lease: PlantGrowthMeshLease = {
    get key() {
      return owner.key;
    },
    get bucket() {
      return owner.bucket;
    },
    get shapeKey() {
      return owner.shapeKey;
    },
    mesh: owner.mesh,
    supportMeshes: owner.staticEntry.supportMeshes,
    geometry: owner.geometry,
    get references() {
      return owner.references;
    },
    release() {
      if (released) return;
      released = true;
      owner.references--;
      if (owner.references > 0) return;
      if (pools.growthMeshes.get(owner.key) === owner) pools.growthMeshes.delete(owner.key);
      // Destroy only the BufferMesh wrapper and its dynamic (POSITION, NORMAL) buffer.
      // Shared Tier A static/index buffers stay intact until staticLease.release() drops refCount to 0.
      if (!owner.mesh.destroyed) owner.mesh.destroy(true);
      if (!owner.dynamicBuffer.destroyed) owner.dynamicBuffer.destroy(true);
      owner.staticLease.release();
    }
  };
  growthLeaseStates.set(lease, { engine, owner, isReleased: () => released });
  return lease;
}

function acquirePlantGrowthMeshResolved(
  pools: EnginePlantPools,
  engine: Engine,
  definitionKey: string,
  recipe: PlantGrowthRecipe,
  shape: PlantShape,
  bucket: number,
  sKey: string,
  meshKey: string
): PlantGrowthMeshLease {
  let entry = pools.growthMeshes.get(meshKey);
  if (!entry || entry.mesh.destroyed || entry.dynamicBuffer.destroyed) {
    const staticLease = acquirePlantStaticGeometry(engine, definitionKey, recipe);
    let dynamicBuffer: Buffer | undefined;
    let mesh: BufferMesh | undefined;
    try {
      const staticEntry = pools.staticGeometries.get(definitionKey)!;
      const quantizedAge = bucket / 1000;
      const evaluated = getStaticEvaluator(staticEntry).update(quantizedAge, shape);
      const count = evaluated.positions.length;
      const dynamicData = new Float32Array(count * 6);
      const positions: [number, number, number][] = new Array(count);
      const normals: [number, number, number][] = new Array(count);
      for (let i = 0; i < count; i++) {
        const p = evaluated.positions[i],
          n = evaluated.normals[i],
          offset = i * 6;
        dynamicData[offset] = p[0];
        dynamicData[offset + 1] = p[1];
        dynamicData[offset + 2] = p[2];
        dynamicData[offset + 3] = n[0];
        dynamicData[offset + 4] = n[1];
        dynamicData[offset + 5] = n[2];
        positions[i] = [p[0], p[1], p[2]];
        normals[i] = [n[0], n[1], n[2]];
      }
      dynamicBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, dynamicData, BufferUsage.Dynamic, false);
      dynamicBuffer.isGCIgnored = true;
      restoreBuffer(dynamicBuffer, dynamicData);
      mesh = new BufferMesh(engine, `growth-${recipe.id}@${bucket}`);
      mesh.isGCIgnored = true;
      mesh.setVertexElements(staticEntry.vertexElements);
      mesh.setVertexBufferBinding(dynamicBuffer, 24, 0);
      mesh.setVertexBufferBinding(staticEntry.staticVertexBuffer, 24, 1);
      mesh.setIndexBufferBinding(staticEntry.indexBuffer, staticEntry.indexFormat);
      mesh.addSubMesh(0, staticEntry.indexCount);
      mesh.bounds.min.set(evaluated.bounds.min[0], evaluated.bounds.min[1], evaluated.bounds.min[2]);
      mesh.bounds.max.set(evaluated.bounds.max[0], evaluated.bounds.max[1], evaluated.bounds.max[2]);
      const geometry: MutablePlantGeometry = {
        positions,
        normals,
        uvs: staticEntry.uvs,
        indices: staticEntry.indices,
        tintMask: staticEntry.tintMask,
        organs: staticEntry.organs,
        bounds: {
          min: [evaluated.bounds.min[0], evaluated.bounds.min[1], evaluated.bounds.min[2]],
          max: [evaluated.bounds.max[0], evaluated.bounds.max[1], evaluated.bounds.max[2]]
        },
        age: evaluated.age,
        maturity: evaluated.maturity,
        leafCount: evaluated.leafCount,
        fruitCount: evaluated.fruitCount
      };
      entry = {
        key: meshKey,
        bucket,
        shapeKey: sKey,
        mesh,
        dynamicBuffer,
        dynamicData,
        positions,
        normals,
        geometry,
        staticEntry,
        staticLease,
        references: 0
      };
      pools.growthMeshes.set(meshKey, entry);
      // Ownership of staticLease transferred to entry.release(); prevent double release on success.
    } catch (error) {
      if (mesh && !mesh.destroyed) mesh.destroy(true);
      if (dynamicBuffer && !dynamicBuffer.destroyed) dynamicBuffer.destroy(true);
      staticLease.release();
      throw error;
    }
  }
  return retainGrowthEntry(pools, engine, entry);
}

export function acquirePlantGrowthMesh(
  engine: Engine,
  definitionKey: string,
  recipe: PlantGrowthRecipe,
  shape: PlantShape,
  age: number
): PlantGrowthMeshLease {
  const pools = poolsFor(engine);
  const bucket = quantizePlantAge(age);
  const sKey = plantShapeKey(shape);
  const meshKey = `${definitionKey}|${sKey}|${bucket}`;
  return acquirePlantGrowthMeshResolved(pools, engine, definitionKey, recipe, shape, bucket, sKey, meshKey);
}

/** Reuses a sole-owner Tier B BufferMesh/VBO in-place when advancing to an uncached growth bucket. */
export function transitionPlantGrowthMesh(
  engine: Engine,
  prevLease: PlantGrowthMeshLease | undefined,
  definitionKey: string,
  recipe: PlantGrowthRecipe,
  shape: PlantShape,
  age: number,
  precomputedBucket?: number
): PlantGrowthMeshLease {
  const pools = poolsFor(engine);
  const bucket = precomputedBucket ?? quantizePlantAge(age);
  const sKey = plantShapeKey(shape);
  const meshKey = `${definitionKey}|${sKey}|${bucket}`;
  const prevState = prevLease ? growthLeaseStates.get(prevLease) : undefined;
  if (
    prevState &&
    !prevState.isReleased() &&
    prevState.engine === engine &&
    prevState.owner.key === meshKey &&
    !prevState.owner.mesh.destroyed &&
    !prevState.owner.dynamicBuffer.destroyed
  ) {
    // Validate even on same-key return just in case a shape with e.g. -0 matched key, already valid if cached.
    return prevLease!;
  }
  const existing = pools.growthMeshes.get(meshKey);
  if (existing && !existing.mesh.destroyed && !existing.dynamicBuffer.destroyed) {
    return retainGrowthEntry(pools, engine, existing);
  }
  if (prevState && !prevState.isReleased() && prevState.engine === engine) {
    const owner = prevState.owner;
    if (
      owner.references === 1 &&
      owner.staticEntry.key === definitionKey &&
      !owner.mesh.destroyed &&
      !owner.dynamicBuffer.destroyed &&
      !owner.staticEntry.staticVertexBuffer.destroyed &&
      !owner.staticEntry.indexBuffer.destroyed &&
      !owner.staticEntry.supportMeshes.some((m) => m.destroyed)
    ) {
      // Evaluate first: an invalid shape throws before mutating the cached entry or pool map.
      const evaluated = getStaticEvaluator(owner.staticEntry).update(bucket / 1000, shape);
      writeEvaluatedGrowthInPlace(owner, evaluated);
      if (pools.growthMeshes.get(owner.key) === owner) pools.growthMeshes.delete(owner.key);
      owner.key = meshKey;
      owner.bucket = bucket;
      owner.shapeKey = sKey;
      pools.growthMeshes.set(meshKey, owner);
      return prevLease!;
    }
  }
  return acquirePlantGrowthMeshResolved(pools, engine, definitionKey, recipe, shape, bucket, sKey, meshKey);
}

export function plantResourcePoolDiagnostics(engine: Engine) {
  const pools = enginePools.get(engine);
  if (!pools) {
    return Object.freeze({
      materials: 0,
      materialReferences: 0,
      staticGeometries: 0,
      staticReferences: 0,
      growthMeshes: 0,
      growthReferences: 0
    });
  }
  let materialReferences = 0;
  for (const e of pools.materials.values()) materialReferences += e.references;
  let staticReferences = 0;
  for (const e of pools.staticGeometries.values()) staticReferences += e.references;
  let growthReferences = 0;
  for (const e of pools.growthMeshes.values()) growthReferences += e.references;
  return Object.freeze({
    materials: pools.materials.size,
    materialReferences,
    staticGeometries: pools.staticGeometries.size,
    staticReferences,
    growthMeshes: pools.growthMeshes.size,
    growthReferences
  });
}
