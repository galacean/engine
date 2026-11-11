import { BufferMesh, BufferUtil, Mesh, ModelMesh, Vector2, Vector3, type Engine } from "@galacean/engine";
import { budget, cross, point, positive, type BuildingMeshData, type BuildingPoint } from "./BuildingLayout";
export type { BuildingMeshData, BuildingPoint } from "./BuildingLayout";

/** Read current mesh data on demand. Buffer or mesh edits cannot leave a stale chart cache.
 * A chart selects a triangle submesh with nonoverlapping TEXCOORD_0; atlas islands may be separate surfaces. */
export function buildingMeshData(mesh: Mesh, subMesh = 0): BuildingMeshData {
  if (mesh.destroyed) throw Error("Surface mesh has been destroyed");
  const sub = mesh.subMeshes[subMesh];
  if (!Number.isSafeInteger(subMesh) || !sub || sub.topology !== 4) throw Error("Surface requires a triangle submesh");
  let positions: BuildingPoint[], uvs: [number, number][], indices: number[];
  if (mesh instanceof ModelMesh) {
    if (!mesh.accessible) throw Error("Surface mesh CPU data was released; create or load the mesh with readable data");
    const p = mesh.getPositions(),
      uv = mesh.getUVs();
    if (!p || !uv) throw Error("Surface mesh needs readable positions and UV0; uploadData(false) retains them");
    positions = p.map((p) => [p.x, p.y, p.z]);
    uvs = uv.map((p) => [p.x, p.y]);
    const source = mesh.getIndices();
    indices = source
      ? Array.from(source).slice(sub.start, sub.start + sub.count)
      : Array.from({ length: sub.count }, (_, i) => sub.start + i);
  } else if (mesh instanceof BufferMesh) {
    const read = (name: string, width: number) => {
      const element = mesh.vertexElements.find((e) => e.attribute === name);
      if (!element) throw Error(`Surface mesh needs ${name}`);
      const binding = mesh.vertexBufferBindings[element.bindingIndex];
      if (!binding?.buffer.readable) throw Error(`Surface ${name} buffer must be readable`);
      const values = BufferUtil.getVertexElementData(
        binding.buffer.data!,
        element.format,
        binding.stride,
        element.offset
      );
      if (values.length / (binding.buffer.data!.byteLength / binding.stride) !== width)
        throw Error(`Invalid Surface attribute ${name}`);
      return Array.from({ length: values.length / width }, (_, i) => values.slice(i * width, (i + 1) * width));
    };
    positions = read("POSITION", 3) as BuildingPoint[];
    uvs = read("TEXCOORD_0", 2) as [number, number][];
    const binding = mesh.indexBufferBinding;
    if (binding && !binding.buffer.readable) throw Error("Surface index buffer must be readable");
    indices = binding
      ? Array.from(BufferUtil.getIndexData(binding.buffer.data!, binding.format, sub.start, sub.count))
      : Array.from({ length: sub.count }, (_, i) => sub.start + i);
  } else throw Error("Surface supports readable ModelMesh or BufferMesh");
  if (indices.length !== sub.count) throw Error("Surface submesh exceeds its index buffer");
  return { positions, uvs, indices };
}
/** Preset mesh algorithm. Agent supplies a parameterization; u/v domain is written into UV0.
 * Winding is dv × du. Swap parameters to reverse it. CPU data remains readable for Surfaces.
 * Caller owns the returned resource; release it after all renderer and support references are retired. */
export function createBuildingPatch(
  engine: Engine,
  options: {
    segments: [number, number];
    domain?: [number, number];
    point: (u: number, v: number) => BuildingPoint;
    limit?: number;
  }
): ModelMesh {
  const [nx, ny] = options.segments,
    [width, height] = options.domain ?? [1, 1];
  if (!Number.isSafeInteger(nx) || !Number.isSafeInteger(ny) || nx < 1 || ny < 1)
    throw Error("Patch segments must be positive integers");
  positive(width, "U extent");
  positive(height, "V extent");
  budget((nx + 1) * (ny + 1), options.limit ?? 100000);
  const positions: Vector3[] = [],
    uvs: Vector2[] = [],
    normals: Vector3[] = [],
    indices: number[] = [];
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const u = (x / nx) * width,
        v = (y / ny) * height,
        p = point(options.point(u, v));
      positions.push(new Vector3(...p));
      uvs.push(new Vector2(u, v));
      normals.push(new Vector3());
    }
  const triangle = (a: number, b: number, c: number) => {
    const p = positions[a],
      q = positions[b],
      r = positions[c];
    const n = cross([q.x - p.x, q.y - p.y, q.z - p.z], [r.x - p.x, r.y - p.y, r.z - p.z]);
    if (Math.hypot(...n) < 1e-10) return; // Parameterization poles have no drawable area.
    indices.push(a, b, c);
    for (const i of [a, b, c]) normals[i].add(new Vector3(...n));
  };
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const a = y * (nx + 1) + x,
        b = a + nx + 1;
      triangle(a, b, a + 1);
      triangle(a + 1, b, b + 1);
    }
  if (!indices.length) throw Error("Patch has no nondegenerate triangles");
  normals.forEach((n) => n.normalize());
  const mesh = new ModelMesh(engine);
  try {
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setUVs(uvs);
    mesh.setIndices(positions.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
    mesh.addSubMesh(0, indices.length);
    mesh.uploadData(false);
    return mesh;
  } catch (error) {
    mesh.destroy();
    throw error;
  }
}
