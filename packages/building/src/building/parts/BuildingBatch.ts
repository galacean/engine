import {
  BufferMesh,
  BufferUtil,
  Color,
  Mesh,
  Vector2,
  Matrix,
  MeshRenderer,
  ModelMesh,
  Shader,
  RenderQueueType,
  Vector3,
  Vector4
} from "@galacean/engine";
import { BuildingPartDraft } from "./BuildingParts";
import type { BuildingInstanceOrigin } from "./BuildingAlgorithms";

export interface BuildingBatchInstance extends BuildingInstanceOrigin {
  firstIndex: number;
  indexCount: number;
}
export interface BuildingBatch {
  renderer: MeshRenderer;
  instances: BuildingBatchInstance[];
}
/** Static standard-material geometry can be merged without allocating an Entity per unit.
 * Object-space custom shaders, unreadable meshes and behavioral nodes retain Entity semantics. */
const attributes = new Set([
  "POSITION",
  "NORMAL",
  "TANGENT",
  "COLOR_0",
  ...Array.from({ length: 8 }, (_, i) => `TEXCOORD_${i}`)
]);
export function canBatchBuildingRenderer(renderer: MeshRenderer): boolean {
  const mesh = renderer.mesh;
  const readable =
    mesh instanceof ModelMesh
      ? mesh.accessible && !mesh.blendShapeCount
      : mesh instanceof BufferMesh &&
        mesh.vertexElements.every(
          (e) => attributes.has(e.attribute) && mesh.vertexBufferBindings[e.bindingIndex]?.buffer.readable
        ) &&
        (!mesh.indexBufferBinding || mesh.indexBufferBinding.buffer.readable);
  return (
    renderer.constructor === MeshRenderer &&
    Boolean(readable) &&
    (!(mesh instanceof BufferMesh) || mesh.instanceCount === 0) &&
    mesh.subMeshes.every((s) => s.topology === 4) &&
    mesh.subMeshes.every((_, i) => {
      const material = renderer.getMaterial(i);
      return (
        !!material &&
        (material.shader === Shader.find("PBR") || material.shader === Shader.find("Unlit")) &&
        material.shaderData.getInt("renderQueueType") !== RenderQueueType.Transparent
      );
    })
  );
}
function readMesh(mesh: Mesh) {
  if (mesh instanceof ModelMesh)
    return {
      positions: mesh.getPositions()!,
      normals: mesh.getNormals(),
      tangents: mesh.getTangents(),
      colors: mesh.getColors(),
      uvs: Array.from({ length: 8 }, (_, i) => mesh.getUVs(i)),
      indices: mesh.getIndices()
    };
  const bufferMesh = mesh as BufferMesh;
  const attribute = (name: string, width: number): number[][] | null => {
    const e = bufferMesh.vertexElements.find((e) => e.attribute === name);
    if (!e) return null;
    const b = bufferMesh.vertexBufferBindings[e.bindingIndex]!;
    const data = BufferUtil.getVertexElementData(b.buffer.data!, e.format, b.stride, e.offset);
    if (data.length !== (b.buffer.byteLength / b.stride) * width)
      throw Error(`Unsupported building attribute format: ${name}`);
    return Array.from({ length: data.length / width }, (_, i) => data.slice(i * width, (i + 1) * width));
  };
  const index = bufferMesh.indexBufferBinding;
  return {
    positions: attribute("POSITION", 3)!.map((v) => new Vector3(v[0], v[1], v[2])),
    normals: attribute("NORMAL", 3)?.map((v) => new Vector3(v[0], v[1], v[2])),
    tangents: attribute("TANGENT", 4)?.map((v) => new Vector4(v[0], v[1], v[2], v[3])),
    colors: attribute("COLOR_0", 4)?.map((v) => new Color(v[0], v[1], v[2], v[3])),
    uvs: Array.from({ length: 8 }, (_, i) => attribute(`TEXCOORD_${i}`, 2)?.map((v) => new Vector2(v[0], v[1]))),
    indices: index
      ? BufferUtil.getIndexData(
          index.buffer.data!,
          index.format,
          0,
          Math.max(...mesh.subMeshes.map((s) => s.start + s.count))
        )
      : null
  };
}
export function buildStaticBuildingBatch(
  draft: BuildingPartDraft,
  source: MeshRenderer,
  placements: BuildingInstanceOrigin[],
  vertexLimit: number
): BuildingBatch {
  const original = source.mesh,
    data = readMesh(original),
    positions = data.positions;
  if (positions.length * placements.length > vertexLimit)
    throw Error(`Building batch exceeds vertex budget ${vertexLimit}`);
  const { normals, tangents, colors } = data;
  const uvChannels = data.uvs;
  const outPositions: Vector3[] = [],
    outNormals: Vector3[] = [],
    outTangents: Vector4[] = [];
  const outColors: NonNullable<ReturnType<ModelMesh["getColors"]>> = [];
  const outUVs = uvChannels.map(() => [] as NonNullable<ReturnType<ModelMesh["getUVs"]>>);
  const sourceIndices = data.indices;
  const indices: number[] = [],
    ranges: { start: number; count: number }[] = [];
  const min = new Vector3(Infinity, Infinity, Infinity),
    max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const { matrix } of placements) {
    if (Math.abs(matrix.determinant()) < 1e-10) throw Error("Singular building instance transform");
    const inverse = new Matrix();
    Matrix.invert(matrix, inverse);
    Matrix.transpose(inverse, inverse);
    positions.forEach((p, i) => {
      const v = new Vector3();
      Vector3.transformCoordinate(p, matrix, v);
      outPositions.push(v);
      Vector3.min(min, v, min);
      Vector3.max(max, v, max);
      if (normals) {
        const n = new Vector3();
        Vector3.transformNormal(normals[i], inverse, n);
        outNormals.push(n.normalize());
      }
      if (tangents) {
        const t = tangents[i],
          v = new Vector3(t.x, t.y, t.z);
        Vector3.transformNormal(v, matrix, v);
        v.normalize();
        outTangents.push(new Vector4(v.x, v.y, v.z, t.w * Math.sign(matrix.determinant())));
      }
      if (colors) outColors.push(colors[i].clone());
      uvChannels.forEach((uv, channel) => {
        if (uv) outUVs[channel].push(uv[i].clone());
      });
    });
  }
  // One submesh per material; keep per-instance triangle ranges for picking/edit provenance.
  for (const sub of original.subMeshes) {
    const start = indices.length;
    placements.forEach(({ matrix }, instance) => {
      const offset = instance * positions.length,
        flip = matrix.determinant() < 0;
      for (let k = sub.start; k < sub.start + sub.count; k += 3) {
        const a = (sourceIndices?.[k] ?? k) + offset;
        const b = (sourceIndices?.[k + 1] ?? k + 1) + offset;
        const c = (sourceIndices?.[k + 2] ?? k + 2) + offset;
        indices.push(a, flip ? c : b, flip ? b : c);
      }
    });
    ranges.push({ start, count: indices.length - start });
  }
  const mesh = draft.own(new ModelMesh(draft.root.engine));
  mesh.setPositions(outPositions);
  if (normals) mesh.setNormals(outNormals);
  if (tangents) mesh.setTangents(outTangents);
  if (colors) mesh.setColors(outColors);
  outUVs.forEach((uv, channel) => {
    if (uv.length) mesh.setUVs(uv, channel);
  });
  mesh.setIndices(outPositions.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
  ranges.forEach(({ start, count }) => mesh.addSubMesh(start, count));
  mesh.bounds.min.copyFrom(min);
  mesh.bounds.max.copyFrom(max);
  mesh.uploadData(true);
  const entity = draft.root.createChild(`Batch: ${source.entity.name}`);
  entity.layer = source.entity.layer;
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  original.subMeshes.forEach((_, i) => renderer.setMaterial(i, source.getMaterial(i)!));
  renderer.castShadows = source.castShadows;
  renderer.receiveShadows = source.receiveShadows;
  renderer.enableVertexColor = source.enableVertexColor;
  renderer.priority = source.priority;
  source.shaderData.cloneTo(renderer.shaderData);
  // Record all submesh ranges, not just the first material slot.
  const allInstances = ranges.flatMap((range, sub) =>
    placements.map((p, i) => ({
      ...p,
      firstIndex: range.start + i * original.subMeshes[sub].count,
      indexCount: original.subMeshes[sub].count
    }))
  );
  return { renderer, instances: allInstances };
}
