import { AssetType, type Engine, type GLTFResource, type ModelMesh } from "@galacean/engine";
import type { RockVariantAsset } from "@galacean/engine-terrain/rock-formation/types";

const urls = import.meta.glob<string>("./lod-meshes/*/*.glb", { query: "?url", import: "default", eager: true });
const lodMeshes = new WeakMap<RockVariantAsset, readonly [ModelMesh | undefined, ModelMesh | undefined]>();
const loads = new WeakMap<RockVariantAsset, Promise<void>>();

/**
 * Loads only the lower-detail geometry of a selected rock variant.
 * @param engine The same engine that owns the LOD0 textures.
 * @param asset LOD0 source identity.
 * @returns Completion of its shared geometry load.
 */
export async function prepareRockLodMeshes(engine: Engine, asset: RockVariantAsset): Promise<void> {
  const resident = lodMeshes.get(asset);
  if (resident && resident.every((mesh) => !mesh?.destroyed)) return;
  const pending = loads.get(asset);
  if (pending) return pending;
  const task = loadRockLodMeshesById(engine, asset.id)
    .then(([middle, far]) => {
      lodMeshes.set(asset, [middle, far]);
    })
    .finally(() => loads.delete(asset));
  loads.set(asset, task);
  return task;
}

/** Pre-warms LOD1/LOD2 GLB loads by variant id so they download concurrently with LOD0. */
export function loadRockLodMeshesById(
  engine: Engine,
  id: string
): Promise<readonly [ModelMesh | undefined, ModelMesh | undefined]> {
  const load = async (level: number): Promise<ModelMesh | undefined> => {
    const url = urls[`./lod-meshes/${id}/lod${level}.glb`];
    if (!url) return;
    const gltf = await engine.resourceManager.load<GLTFResource>({ url, type: AssetType.GLTF });
    const mesh = gltf.meshes?.[0]?.[0];
    if (gltf.meshes?.length !== 1 || gltf.meshes[0].length !== 1 || !mesh || mesh.destroyed)
      throw Error(`Rock LOD GLB must contain one valid primitive: ${id}/lod${level}`);
    return mesh;
  };
  return Promise.all([load(1), load(2)]);
}

/**
 * Finds the lower meshes prepared for a resident rock variant.
 * @param asset LOD0 source identity.
 * @returns Optional middle and far meshes. Missing levels retain the next finer mesh.
 */
export function rockLodMeshes(
  asset: RockVariantAsset
): readonly [ModelMesh | undefined, ModelMesh | undefined] | undefined {
  return lodMeshes.get(asset);
}
