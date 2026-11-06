import { destroyOwnedMeshSet } from "@galacean/engine-terrain/geometry/destroyOwnedMesh";
import {
  MeshInteractionSurface,
  registerMeshInteractionSurface
} from "@galacean/engine-terrain/geometry/MeshInteractionSurface";
import {
  AssetType,
  BoundingBox,
  GLTFResource,
  MeshRenderer,
  ModelMesh,
  Vector2,
  Vector3,
  type Camera,
  type Engine,
  type Entity,
  type Material
} from "@galacean/engine";
import {
  suspensionBridgeMeshes,
  type BridgeMeshData,
  type BridgeTemplate,
  type CompiledSuspensionBridge
} from "./SuspensionBridge";

const assetUrl = new URL("./assets/farmlands-bridge-parts.glb", import.meta.url).href;
const lod1AssetUrl = new URL("./assets/farmlands-bridge-lod1.glb", import.meta.url).href;
interface AssetEntry {
  refs: number;
  resources: GLTFResource[];
  promise: Promise<BridgeAssets>;
}
interface BridgeAssets {
  template: BridgeTemplate;
  lod1Template: BridgeTemplate;
  wood: Material;
  rope: Material;
}
const assets = new WeakMap<Engine, AssetEntry>();
function destroyAssets(resource: GLTFResource): void {
  for (const root of resource.sceneRoots) root.destroy();
  resource.destroy(true);
  destroyOwnedMeshSet(resource.meshes?.flat() ?? []);
  for (const material of resource.materials ?? []) material.destroy(true);
  for (const texture of resource.textures ?? []) texture.destroy(true);
}
function readMesh(mesh: ModelMesh): BridgeMeshData {
  const positions = mesh.getPositions(),
    normals = mesh.getNormals(),
    uvs = mesh.getUVs();
  if (!positions || !normals || !uvs) throw new Error(`吊桥源部件缺少可读顶点：${mesh.name}`);
  return {
    positions: positions.flatMap((p) => [p.x, p.y, p.z]),
    normals: normals.flatMap((p) => [p.x, p.y, p.z]),
    uvs: uvs.flatMap((p) => [p.x, p.y]),
    indices: Array.from(mesh.getIndices()!)
  };
}
function readTemplate(resource: GLTFResource): BridgeTemplate {
  const meshes = resource.meshes?.flat() ?? [];
  const planks = meshes
    .filter((m) => m.name?.startsWith("Bridge_Plank_"))
    .sort((a, b) => a.name!.localeCompare(b.name!));
  const tower = meshes.find((m) => m.name === "Bridge_Tower"),
    knot = meshes.find((m) => m.name === "Bridge_Knot");
  if (!tower || !knot || planks.length !== 9) throw new Error("Farmlands 吊桥模板不完整");
  return { planks: planks.map(readMesh), tower: readMesh(tower), knot: readMesh(knot) };
}
async function acquireAssets(engine: Engine, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let entry = assets.get(engine);
  if (!entry) {
    const created: AssetEntry = { refs: 0, resources: [], promise: undefined! };
    entry = created;
    assets.set(engine, entry);
    created.promise = (async () => {
      try {
        // Sequential ownership also covers cancellation or a failure of the second load.
        for (const url of [assetUrl, lod1AssetUrl])
          created.resources.push(
            await engine.resourceManager.load<GLTFResource>({
              url,
              type: AssetType.GLTF,
              params: { keepMeshData: true }
            })
          );
        const [resource, lod1Resource] = created.resources;
        const wood = resource.materials?.find((m) => m.name === "Bridge:Wood"),
          rope = resource.materials?.find((m) => m.name === "Bridge:Rope");
        if (!wood || !rope) throw new Error("Farmlands 吊桥材质不完整");
        return { template: readTemplate(resource), lod1Template: readTemplate(lod1Resource), wood, rope };
      } catch (error) {
        created.resources.splice(0).forEach(destroyAssets);
        throw error;
      }
    })();
    void created.promise.then(
      () => {
        if (!created.refs && assets.get(engine) === created) {
          assets.delete(engine);
          created.resources.splice(0).forEach(destroyAssets);
        }
      },
      () => {
        if (assets.get(engine) === created) assets.delete(engine);
      }
    );
  }
  entry.refs++;
  const owner = entry;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    owner.refs--;
    // Pending loads retain ownership until the promise settles; its completion releases them.
    if (!owner.refs && owner.resources.length === 2 && assets.get(engine) === owner) {
      assets.delete(engine);
      owner.resources.splice(0).forEach(destroyAssets);
    }
  };
  let cancel: (() => void) | undefined;
  try {
    const ready = signal
      ? await Promise.race([
          owner.promise,
          new Promise<never>((_, reject) => {
            cancel = () => reject(signal.reason ?? new Error("吊桥准备已取消"));
            signal.addEventListener("abort", cancel, { once: true });
          })
        ])
      : await owner.promise;
    signal?.throwIfAborted();
    return { ...ready, release };
  } catch (error) {
    release();
    throw error;
  } finally {
    if (cancel) signal?.removeEventListener("abort", cancel);
  }
}

interface BridgePart {
  mesh: ModelMesh;
  lod1Mesh: ModelMesh;
  material: Material;
  surface: MeshInteractionSurface;
}
interface BridgeResources {
  key: string;
  owners: number;
  parts: BridgePart[];
}
interface BridgeBinding {
  resource: BridgeResources;
  renderers: MeshRenderer[];
  bounds: BoundingBox;
  worldBounds: BoundingBox;
  lod: 0 | 1;
}

/** Each view owns its hierarchy and leases immutable per-bridge meshes/interaction geometry.
 * Candidate preparation never moves or changes the published view's renderers. */
export class SuspensionBridgeView {
  readonly root: Entity;
  private readonly resources: BridgeResources[] = [];
  private readonly bindings: BridgeBinding[] = [];
  private release?: () => void;
  private disposed = false;
  private owners = 1;
  private constructor(
    private readonly engine: Engine,
    parent: Entity
  ) {
    this.root = parent.createChild("Farmlands suspension bridges");
  }
  /** Build an independent candidate, borrowing unchanged bridges only from a live view of the same Engine. */
  static async create(
    engine: Engine,
    parent: Entity,
    bridges: readonly { id: string; suspension?: CompiledSuspensionBridge }[],
    signal?: AbortSignal,
    previous?: SuspensionBridgeView
  ): Promise<SuspensionBridgeView> {
    const view = new SuspensionBridgeView(engine, parent);
    try {
      if (!bridges.length) return view;
      const source = await acquireAssets(engine, signal);
      view.release = source.release;
      signal?.throwIfAborted();
      if (parent.destroyed) throw new Error("吊桥宿主已销毁");
      // Capture keys when built, rather than retaining mutable planning objects. Keep the
      // existing conservative full-bridge equality contract, including id and metadata.
      const reusable = new Map(
        previous && !previous.disposed && previous.engine === engine
          ? previous.resources.map((resource) => [resource.key, resource] as const)
          : []
      );
      for (const bridge of bridges) {
        if (!bridge.suspension) throw new Error(`吊桥未编译：${bridge.id}`);
        const key = JSON.stringify(bridge);
        let resource = reusable.get(key);
        if (resource) {
          resource.owners++;
          view.resources.push(resource);
        } else {
          resource = { key, owners: 1, parts: [] };
          view.resources.push(resource);
          const geometry = suspensionBridgeMeshes(bridge.suspension, source.template);
          const lod1 = suspensionBridgeMeshes(bridge.suspension, source.lod1Template, 1);
          resource.parts.push(view.createPart("Wood", geometry.wood, lod1.wood, source.wood));
          resource.parts.push(view.createPart("Ropes", geometry.rope, lod1.rope, source.rope));
        }
        const root = view.root.createChild(bridge.id);
        const binding: BridgeBinding = {
          resource,
          renderers: [],
          bounds: resource.parts[0].mesh.bounds.clone(),
          worldBounds: new BoundingBox(),
          lod: 0
        };
        view.bindings.push(binding);
        for (const part of resource.parts) {
          const renderer = root.createChild(part.mesh.name).addComponent(MeshRenderer);
          renderer.mesh = part.mesh;
          renderer.setMaterial(part.material);
          renderer.castShadows = true;
          renderer.receiveShadows = true;
          registerMeshInteractionSurface(renderer, part.surface);
          binding.renderers.push(renderer);
          BoundingBox.merge(binding.bounds, part.mesh.bounds, binding.bounds);
        }
      }
      return view;
    } catch (error) {
      view.dispose();
      throw error;
    }
  }
  private createPart(name: string, data: BridgeMeshData, lod1: BridgeMeshData, material: Material): BridgePart {
    const meshes: ModelMesh[] = [];
    try {
      const mesh = this.createMesh(name, data);
      meshes.push(mesh);
      const lod1Mesh = this.createMesh(name + " LOD1", lod1);
      meshes.push(lod1Mesh);
      // Interaction queries retain LOD0 triangles and must not be rejected by tighter low-detail bounds.
      BoundingBox.merge(mesh.bounds, lod1Mesh.bounds, lod1Mesh.bounds);
      return { mesh, lod1Mesh, material, surface: new MeshInteractionSurface(data) };
    } catch (error) {
      destroyOwnedMeshSet(meshes);
      throw error;
    }
  }
  private createMesh(name: string, data: BridgeMeshData): ModelMesh {
    const mesh = new ModelMesh(this.engine, name);
    try {
      const positions: Vector3[] = [],
        normals: Vector3[] = [],
        uvs: Vector2[] = [];
      for (let i = 0; i < data.positions.length; i += 3) {
        const point = new Vector3(data.positions[i], data.positions[i + 1], data.positions[i + 2]);
        positions.push(point);
        normals.push(new Vector3(data.normals[i], data.normals[i + 1], data.normals[i + 2]));
        if (!i) {
          mesh.bounds.min.copyFrom(point);
          mesh.bounds.max.copyFrom(point);
        } else {
          mesh.bounds.min.set(
            Math.min(mesh.bounds.min.x, point.x),
            Math.min(mesh.bounds.min.y, point.y),
            Math.min(mesh.bounds.min.z, point.z)
          );
          mesh.bounds.max.set(
            Math.max(mesh.bounds.max.x, point.x),
            Math.max(mesh.bounds.max.y, point.y),
            Math.max(mesh.bounds.max.z, point.z)
          );
        }
      }
      for (let i = 0; i < data.uvs.length; i += 2) uvs.push(new Vector2(data.uvs[i], data.uvs[i + 1]));
      mesh.setPositions(positions);
      mesh.setNormals(normals);
      mesh.setUVs(uvs);
      mesh.setIndices(positions.length > 65535 ? new Uint32Array(data.indices) : new Uint16Array(data.indices));
      mesh.addSubMesh(0, data.indices.length);
      mesh.calculateTangents();
      mesh.uploadData(true);
      return mesh;
    } catch (error) {
      destroyOwnedMeshSet([mesh]);
      throw error;
    }
  }
  /** Select two-level render detail for the current camera, retaining the published interaction surface.
   * @param camera View camera; call after camera movement and before rendering. A distance of at most
   * 25 metres from the world-space LOD0 bridge bounds uses LOD0; greater distances use LOD1.
   */
  updateLod(camera: Camera): void {
    if (this.disposed || !this.root.isActiveInHierarchy) return;
    const p = camera.entity.transform.worldPosition;
    for (const binding of this.bindings) {
      BoundingBox.transform(binding.bounds, binding.renderers[0].entity.transform.worldMatrix, binding.worldBounds);
      const { min, max } = binding.worldBounds;
      const dx = Math.max(min.x - p.x, 0, p.x - max.x),
        dy = Math.max(min.y - p.y, 0, p.y - max.y),
        dz = Math.max(min.z - p.z, 0, p.z - max.z);
      const lod = dx * dx + dy * dy + dz * dz > 25 * 25 ? 1 : 0;
      if (lod === binding.lod) continue;
      binding.lod = lod;
      for (let i = 0; i < binding.renderers.length; i++) {
        const part = binding.resource.parts[i];
        binding.renderers[i].mesh = lod === 0 ? part.mesh : part.lod1Mesh;
      }
    }
  }
  setVisible(visible: boolean): void {
    this.root.isActive = visible;
  }
  reparent(parent: Entity): void {
    parent.addChild(this.root);
  }
  retain(): SuspensionBridgeView {
    if (this.disposed) throw new Error("吊桥资源已释放");
    this.owners++;
    return this;
  }
  dispose(): void {
    if (this.disposed) return;
    if (--this.owners > 0) return;
    this.disposed = true;
    this.root.destroy();
    for (const resource of this.resources) {
      if (--resource.owners === 0) destroyOwnedMeshSet(resource.parts.flatMap((part) => [part.mesh, part.lod1Mesh]));
    }
    this.resources.length = 0;
    this.bindings.length = 0;
    this.release?.();
    this.release = undefined;
  }
}
