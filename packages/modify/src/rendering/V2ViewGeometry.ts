import { uploadRestorableModelMesh, destroyOwnedModelMesh } from "./RestorableResources";
import {
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  Vector2,
  Vector3,
  type Engine,
  type Entity,
  type Material
} from "@galacean/engine";
interface V2Mesh {
  uvs?: number[][];
  pickIds?: number[];
  positions: number[];
  indices: number[];
}

/** GPU resources owned by one published view; destroy entities before their referenced resources. */
export interface V2ViewResources {
  root: Entity;
  meshes: ModelMesh[];
  materials: Material[];
}

/**
 * Release a replaced snapshot without keeping its meshes or materials in GPU memory.
 * @param resources Owned scene hierarchy and referenced GPU resources.
 * @returns Nothing.
 */
export function destroyV2ViewResources(resources: V2ViewResources): void {
  resources.root.destroy();
  const release = () => {
    for (const mesh of resources.meshes) destroyOwnedModelMesh(mesh);
    for (const material of resources.materials) material.destroy();
    resources.meshes.length = resources.materials.length = 0;
  };
  // Renderer references disappear at the end of an Engine frame. Releasing
  // reference-counted assets earlier would silently fail and lose ownership.
  if (resources.root.pendingDestroy) queueMicrotask(release);
  else release();
}

/**
 * Build a water or overlay mesh from published positions with averaged geometric normals.
 * @param engine Engine owning the new mesh.
 * @param resources Snapshot resource owner receiving the mesh and entity.
 * @param name Diagnostic mesh and entity name.
 * @param geometry Published positions and triangle indices.
 * @param material Material referenced by the new renderer.
 * @param options Optional offset, winding and shadow behavior.
 * @returns Created renderer entity.
 */
export function addV2Surface(
  engine: Engine,
  resources: V2ViewResources,
  name: string,
  geometry: V2Mesh,
  material: Material,
  options: { visualOffset?: number; upward?: boolean; shadows?: boolean } = {}
): Entity {
  const positions: Vector3[] = [];
  const normals: Vector3[] = [];
  const uvs: Vector2[] = [];
  const indices = geometry.indices.slice();
  for (let i = 0; i < geometry.positions.length; i += 3) {
    positions.push(
      new Vector3(
        geometry.positions[i]!,
        geometry.positions[i + 1]! + (options.visualOffset ?? 0),
        geometry.positions[i + 2]!
      )
    );
    normals.push(new Vector3());
    uvs.push(
      new Vector2(
        ...((geometry.uvs?.[i / 3] as [number, number]) ?? [
          geometry.positions[i]! / 16,
          geometry.positions[i + 2]! / 16
        ])
      )
    );
  }
  for (let i = 0; i < indices.length; i += 3) {
    const a = positions[indices[i]!]!,
      b = positions[indices[i + 1]!]!,
      c = positions[indices[i + 2]!]!;
    const abX = b.x - a.x,
      abY = b.y - a.y,
      abZ = b.z - a.z;
    const acX = c.x - a.x,
      acY = c.y - a.y,
      acZ = c.z - a.z;
    let nx = abY * acZ - abZ * acY,
      ny = abZ * acX - abX * acZ,
      nz = abX * acY - abY * acX;
    if (options.upward !== false && ny < 0) {
      [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (let j = 0; j < 3; j++) {
      const n = normals[indices[i + j]!]!;
      n.set(n.x + nx, n.y + ny, n.z + nz);
    }
  }
  for (const normal of normals) {
    if (normal.lengthSquared() > 0) normal.normalize();
    else normal.set(0, 1, 0);
  }
  const mesh = new ModelMesh(engine, name);
  resources.meshes.push(mesh);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUVs(uvs);
  if (geometry.pickIds)
    mesh.setUVs(
      geometry.pickIds.map((id) => new Vector2(id, 0)),
      1
    );
  mesh.setIndices(positions.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
  mesh.addSubMesh(0, indices.length);
  setMeshBounds(mesh, positions);
  uploadRestorableModelMesh(mesh);
  const entity = resources.root.createChild(name);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.setMaterial(material);
  renderer.castShadows = options.shadows !== false;
  renderer.receiveShadows = true;
  return entity;
}

/**
 * Add explicit line segments used only for diagnostic overlays.
 * @param engine Engine owning the new mesh.
 * @param resources Snapshot resource owner receiving the mesh and entity.
 * @param name Diagnostic mesh and entity name.
 * @param positions Consecutive independent segment endpoints.
 * @param material Material referenced by the new renderer.
 * @returns Created line renderer entity.
 */
export function addV2Lines(
  engine: Engine,
  resources: V2ViewResources,
  name: string,
  positions: Vector3[],
  material: Material
): Entity {
  const mesh = new ModelMesh(engine, name);
  resources.meshes.push(mesh);
  mesh.setPositions(positions);
  mesh.setIndices(
    positions.length > 65535 ? new Uint32Array(positions.map((_, i) => i)) : new Uint16Array(positions.map((_, i) => i))
  );
  mesh.addSubMesh(0, positions.length, MeshTopology.Lines);
  setMeshBounds(mesh, positions);
  uploadRestorableModelMesh(mesh);
  const entity = resources.root.createChild(name);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.setMaterial(material);
  renderer.castShadows = false;
  renderer.receiveShadows = false;
  return entity;
}

function setMeshBounds(mesh: ModelMesh, positions: Vector3[]): void {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const p of positions) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }
  mesh.bounds.min.set(minX, minY, minZ);
  mesh.bounds.max.set(maxX, maxY, maxZ);
}
