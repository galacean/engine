import {
  AssetType,
  type GLTFResource,
  type Engine,
  ModelMesh,
  Vector2,
  Vector3,
  Vector4,
  type Texture2D,
  TextureFilterMode,
  TextureWrapMode
} from "@galacean/engine";
import { buildGrassCoverage } from "@galacean/engine-terrain/rock-formation/GrassCoverage";
import { buildRockGrassSurface } from "@galacean/engine-terrain/rock-formation/GrassSurface";
import { hashSeed, smoothstep } from "@galacean/engine-terrain/rock-formation/math";
import type {
  RockFormationJob,
  RockFormationMesh,
  RockVariantAsset,
  V3
} from "@galacean/engine-terrain/rock-formation/types";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel";
import catalog from "./RockVariantCatalog.json";

interface RockVariantEntry {
  id: string;
  mesh: string;
  base: string;
  normal: string;
  /** Fraction of the fitted mesh height to sink below the placement base. */
  groundInset: number;
}

interface RockVariantPools {
  mountains: readonly RockVariantEntry[];
  stones: readonly RockVariantEntry[];
}

/** Optional template entries replace the corresponding shared role. */
const templatePools: Readonly<Partial<Record<string, RockVariantPools>>> = catalog.templates;

const MAX_VARIANTS = 10;
const meshTasks = new WeakMap<Engine, Map<string, Promise<RockVariantAsset>>>();
type VariantTexturePair = [Texture2D, Texture2D];
const textures = new WeakMap<
  Engine,
  Map<RockVariantAsset, { task: Promise<VariantTexturePair>; ready?: VariantTexturePair }>
>();

async function decodeVariant(engine: Engine, variant: RockVariantEntry): Promise<RockVariantAsset> {
  const gltf = await engine.resourceManager.load<GLTFResource>({
    url: variant.mesh,
    type: AssetType.GLTF,
    params: { keepMeshData: true }
  });
  const mesh = gltf.meshes?.[0]?.[0];
  if (gltf.meshes?.length !== 1 || gltf.meshes[0].length !== 1) {
    gltf.destroy();
    throw Error(`Rock GLB needs one mesh primitive: ${variant.id}`);
  }
  const vertices = mesh?.getPositions(),
    sourceNormals = mesh?.getNormals();
  const sourceTangents = mesh?.getTangents(),
    sourceUVs = mesh?.getUVs(),
    sourceIndices = mesh?.getIndices();
  if (!vertices?.length || !sourceNormals || !sourceTangents || !sourceUVs || !sourceIndices?.length) {
    gltf.destroy();
    throw Error(`Rock GLB needs an indexed mesh with normals, tangents and UVs: ${variant.id}`);
  }
  const positions = new Float32Array(vertices.length * 3),
    normals = new Float32Array(positions.length);
  const tangents = new Float32Array(vertices.length * 4),
    uvs = new Float32Array(vertices.length * 2);
  const indices = new Uint32Array(sourceIndices);
  for (let i = 0; i < vertices.length; i++) {
    vertices[i].copyToArray(positions, i * 3);
    sourceNormals[i].copyToArray(normals, i * 3);
    sourceTangents[i].copyToArray(tangents, i * 4);
    sourceUVs[i].copyToArray(uvs, i * 2);
  }
  gltf.destroy();
  const min: V3 = [Infinity, Infinity, Infinity],
    max: V3 = [-Infinity, -Infinity, -Infinity];
  positions.forEach((value, index) => {
    min[index % 3] = Math.min(min[index % 3], value);
    max[index % 3] = Math.max(max[index % 3], value);
  });
  if (max.some((value, axis) => !Number.isFinite(value - min[axis]) || value <= min[axis]))
    throw Error(`Invalid rock bounds: ${variant.id}`);
  const bounds: [V3, V3] = [min, max];
  const coverage = buildGrassCoverage({ positions, normals, indices, bounds });
  // Leave lower shelves bare; slope alone also classifies the underside of some split meshes.
  for (let i = 0; i < vertices.length; i++) {
    const height = (positions[i * 3 + 1] - min[1]) / (max[1] - min[1]);
    coverage[i] *= smoothstep(0.55, 0.78, height);
  }
  return {
    ...variant,
    positions,
    normals,
    tangents,
    uvs,
    indices,
    bounds,
    coverage
  };
}

function loadVariant(engine: Engine, variant: RockVariantEntry): Promise<RockVariantAsset> {
  let assets = meshTasks.get(engine);
  if (!assets) meshTasks.set(engine, (assets = new Map()));
  const key = JSON.stringify(variant);
  let task = assets.get(key);
  if (!task) {
    task = decodeVariant(engine, variant).catch((error) => {
      assets.delete(key);
      throw error;
    });
    assets.set(key, task);
  }
  return task;
}

function rankedPool(seed: number, role: string, entries: readonly RockVariantEntry[]) {
  const unique = [...new Map(entries.map((entry) => [entry.id, entry])).values()];
  return unique.sort(
    (a, b) =>
      hashSeed(seed, `rock-pool:${role}:${a.id}`) - hashSeed(seed, `rock-pool:${role}:${b.id}`) ||
      a.id.localeCompare(b.id)
  );
}

/** Both placement systems draw from the same seed-specific palette. */
export function rockVariantPools(plan: IslandPlan) {
  const seed = plan.parameters.seed;
  const overrides = templatePools[plan.parameters.worldTemplate?.id ?? ""];
  if (!overrides) return undefined;
  const mountains = rankedPool(seed, "mountains", overrides.mountains);
  const stones = rankedPool(seed, "stones", overrides.stones);
  const mountainCount = Math.min(mountains.length, Math.max(MAX_VARIANTS / 2, MAX_VARIANTS - stones.length));
  mountains.length = mountainCount;
  stones.length = Math.min(stones.length, MAX_VARIANTS - mountainCount);
  return { mountains, stones };
}

export function pickRockVariant<T>(pool: readonly T[], seed: number): T | undefined {
  return pool.length ? pool[hashSeed(seed, "rock-variant") % pool.length] : undefined;
}

/** Lower the fitted mesh by its authored inset, keeping the planned base as the reference. */
export function rockVariantGroundOffset(asset: RockVariantAsset, scale: number): number {
  return -asset.groundInset * (asset.bounds[1][1] - asset.bounds[0][1]) * scale;
}

export async function prepareRockVariant(engine: Engine, variant: RockVariantEntry): Promise<RockVariantAsset> {
  const asset = await loadVariant(engine, variant);
  await prepareVariantTextures(engine, asset);
  return asset;
}

export function rockVariantFit(job: RockFormationJob, asset: RockVariantAsset): Float32Array {
  const guide = job.guides[0];
  const [min, max] = asset.bounds;
  const yaw = Math.atan2(guide.axes[0][2], guide.axes[0][0]);
  const flip = hashSeed(job.seed, "rock-facing") % 2 ? -1 : 1;
  const scale = Math.min(...guide.size.map((length, axis) => length / (max[axis] - min[axis])));
  const c = Math.cos(yaw) * flip,
    s = Math.sin(yaw) * flip;
  const x = (-(min[0] + max[0]) * scale) / 2,
    z = (-(min[2] + max[2]) * scale) / 2;
  const y = guide.center[1] - guide.size[1] / 2;
  return new Float32Array([
    c * scale,
    0,
    s * scale,
    0,
    0,
    scale,
    0,
    0,
    -s * scale,
    0,
    c * scale,
    0,
    guide.center[0] + c * x - s * z,
    y - min[1] * scale + rockVariantGroundOffset(asset, scale),
    guide.center[2] + s * x + c * z,
    1
  ]);
}

/** Prepare the exact indexed surface used by collision and grass plus the shared render transform. */
export function fitRockVariant(
  job: RockFormationJob,
  asset: RockVariantAsset,
  matrix: Float32Array,
  grass: boolean
): RockFormationMesh {
  const c = matrix[0] / matrix[5],
    s = matrix[2] / matrix[5];
  const positions = new Float32Array(asset.positions.length),
    normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const px = asset.positions[i],
      py = asset.positions[i + 1],
      pz = asset.positions[i + 2];
    positions[i] = matrix[0] * px + matrix[8] * pz + matrix[12];
    positions[i + 1] = matrix[5] * py + matrix[13];
    positions[i + 2] = matrix[2] * px + matrix[10] * pz + matrix[14];
    const nx = asset.normals[i],
      ny = asset.normals[i + 1],
      nz = asset.normals[i + 2];
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[i] = (c * nx - s * nz) / length;
    normals[i + 1] = ny / length;
    normals[i + 2] = (s * nx + c * nz) / length;
  }
  const result: RockFormationMesh = {
    id: job.id,
    origin: job.origin,
    owners: Array(asset.indices.length / 3).fill(job.guides[0].ownerId),
    mesh: { positions, normals, indices: asset.indices },
    variant: { asset, matrix },
    stats: { bodies: 1, vertices: positions.length / 3, generationMs: 0 }
  };
  if (grass) result.grass = buildRockGrassSurface(result, normals, asset.coverage);
  return result;
}

function prepareVariantTextures(engine: Engine, asset: RockVariantAsset) {
  let entries = textures.get(engine);
  if (!entries) textures.set(engine, (entries = new Map()));
  let entry = entries.get(asset);
  if (!entry || entry.ready?.some((texture) => texture.destroyed)) {
    const load = (url: string) =>
      engine.resourceManager.load<Texture2D>({ url, type: AssetType.KTX2 }).then((value) => {
        if (value.width > 512 || value.height > 512) throw Error(`Rock texture exceeds 512 px: ${url}`);
        value.wrapModeU = value.wrapModeV = TextureWrapMode.Repeat;
        value.filterMode = TextureFilterMode.Trilinear;
        return value;
      });
    const next: { task: Promise<VariantTexturePair>; ready?: VariantTexturePair } = {
      task: Promise.all([load(asset.base), load(asset.normal)])
        .then((pair) => {
          next.ready = pair;
          return pair;
        })
        .catch((error) => {
          entries.delete(asset);
          throw error;
        })
    };
    entries.set(asset, (entry = next));
  }
  return entry.task;
}

/** Borrow the engine-owned pair after fitting has prepared it. */
export function rockVariantTextures(engine: Engine, asset: RockVariantAsset): VariantTexturePair {
  const pair = textures.get(engine)?.get(asset)?.ready;
  if (!pair) throw Error(`Rock textures are not ready: ${asset.id}`);
  return pair;
}

const variantMeshes = new WeakMap<Engine, Map<RockVariantAsset, { mesh: ModelMesh; users: number }>>();

export function acquireRockVariantMesh(engine: Engine, asset: RockVariantAsset) {
  let entries = variantMeshes.get(engine);
  if (!entries) variantMeshes.set(engine, (entries = new Map()));
  let entry = entries.get(asset);
  if (!entry) {
    const mesh = new ModelMesh(engine, asset.id);
    try {
      const vertices = asset.positions.length / 3;
      mesh.setPositions(
        Array.from(
          { length: vertices },
          (_, i) => new Vector3(asset.positions[i * 3], asset.positions[i * 3 + 1], asset.positions[i * 3 + 2])
        )
      );
      mesh.setNormals(
        Array.from(
          { length: vertices },
          (_, i) => new Vector3(asset.normals[i * 3], asset.normals[i * 3 + 1], asset.normals[i * 3 + 2])
        )
      );
      mesh.setTangents(
        Array.from(
          { length: vertices },
          (_, i) =>
            new Vector4(
              asset.tangents[i * 4],
              asset.tangents[i * 4 + 1],
              asset.tangents[i * 4 + 2],
              asset.tangents[i * 4 + 3]
            )
        )
      );
      mesh.setUVs(Array.from({ length: vertices }, (_, i) => new Vector2(asset.uvs[i * 2], asset.uvs[i * 2 + 1])));
      mesh.setIndices(vertices <= 65535 ? new Uint16Array(asset.indices) : asset.indices);
      mesh.addSubMesh(0, asset.indices.length);
      mesh.bounds.min.set(...asset.bounds[0]);
      mesh.bounds.max.set(...asset.bounds[1]);
      mesh.uploadData(true);
    } catch (error) {
      mesh.destroy();
      throw error;
    }
    entries.set(asset, (entry = { mesh, users: 0 }));
  }
  const shared = entry;
  shared.users++;
  return {
    mesh: shared.mesh,
    release() {
      if (--shared.users === 0) {
        entries.delete(asset);
        shared.mesh.destroy();
      }
    }
  };
}
