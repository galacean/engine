import { registerWaterMeshContentRestorer } from "../resources/WaterMeshContentRestorer";
/** Converts compiler-owned heightfield geometry into a 16-bit-safe Galacean BufferMesh. */
import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Engine,
  IndexFormat,
  MeshTopology,
  VertexAttribute,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine-core";
import type { HeightfieldWaterGeometryData } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import type { HeightfieldWaterMeshBuildResult } from "./types";

const HEIGHTFIELD_VERTEX_FLOAT_STRIDE = 12;
const HEIGHTFIELD_VERTEX_BYTE_STRIDE = HEIGHTFIELD_VERTEX_FLOAT_STRIDE * Float32Array.BYTES_PER_ELEMENT;
const HEIGHTFIELD_VERTEX_ELEMENTS: VertexElement[] = [
  new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
  new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.Vector3, 0),
  new VertexElement(VertexAttribute.Tangent, 24, VertexElementFormat.Vector4, 0),
  new VertexElement(VertexAttribute.UV, 40, VertexElementFormat.Vector2, 0)
];

function hasHeightfieldVertexLayout(elements: readonly VertexElement[]): boolean {
  if (elements.length !== HEIGHTFIELD_VERTEX_ELEMENTS.length) return false;
  for (let i = 0; i < HEIGHTFIELD_VERTEX_ELEMENTS.length; i++) {
    const actual = elements[i]!;
    const expected = HEIGHTFIELD_VERTEX_ELEMENTS[i]!;
    if (
      actual.attribute !== expected.attribute ||
      actual.offset !== expected.offset ||
      actual.format !== expected.format ||
      actual.bindingIndex !== expected.bindingIndex
    ) {
      return false;
    }
  }
  return true;
}

export interface HeightfieldWaterMeshUploadOptions {
  readonly existing?: HeightfieldWaterMeshBuildResult;
  readonly releaseCpuData?: boolean;
  readonly boundsPadding?: number;
}

export function uploadHeightfieldWaterMesh(
  engine: Engine,
  geometry: HeightfieldWaterGeometryData,
  options: HeightfieldWaterMeshUploadOptions = {}
): HeightfieldWaterMeshBuildResult {
  if (geometry.vertexCount > 65535) {
    throw new Error(`Heightfield water chunk has ${geometry.vertexCount} vertices; Uint16 limit is 65535.`);
  }
  if (geometry.positions.length !== geometry.vertexCount * 3) {
    throw new Error("Heightfield water geometry position buffer does not match vertexCount.");
  }
  if (geometry.normals.length !== geometry.vertexCount * 3) {
    throw new Error("Heightfield water geometry must provide one base normal per vertex.");
  }
  if (geometry.tangents.length !== geometry.vertexCount * 4) {
    throw new Error("Heightfield water geometry must provide one base tangent per vertex.");
  }
  if (geometry.uvs.length !== geometry.vertexCount * 2) {
    throw new Error("Heightfield water geometry must provide one local-map UV per vertex.");
  }

  const sourceIndices = geometry.indices.borrowTypedArray();
  for (let i = 0; i < sourceIndices.length; i++) {
    const index = sourceIndices[i]!;
    if (index >= geometry.vertexCount) {
      throw new Error(`Heightfield water geometry index ${index} is outside the vertex buffer.`);
    }
  }

  const releaseCpuData = options.releaseCpuData ?? false;
  const readable = !releaseCpuData;
  const positions = geometry.positions.borrowTypedArray();
  const normals = geometry.normals.borrowTypedArray();
  const tangents = geometry.tangents.borrowTypedArray();
  const uvs = geometry.uvs.borrowTypedArray();
  const vertexData = new Float32Array(geometry.vertexCount * HEIGHTFIELD_VERTEX_FLOAT_STRIDE);
  for (let i = 0; i < geometry.vertexCount; i++) {
    const src3 = i * 3;
    const src4 = i * 4;
    const src2 = i * 2;
    const dst = i * HEIGHTFIELD_VERTEX_FLOAT_STRIDE;
    vertexData[dst] = positions[src3]!;
    vertexData[dst + 1] = positions[src3 + 1]!;
    vertexData[dst + 2] = positions[src3 + 2]!;
    vertexData[dst + 3] = normals[src3]!;
    vertexData[dst + 4] = normals[src3 + 1]!;
    vertexData[dst + 5] = normals[src3 + 2]!;
    vertexData[dst + 6] = tangents[src4]!;
    vertexData[dst + 7] = tangents[src4 + 1]!;
    vertexData[dst + 8] = tangents[src4 + 2]!;
    vertexData[dst + 9] = tangents[src4 + 3]!;
    vertexData[dst + 10] = uvs[src2]!;
    vertexData[dst + 11] = uvs[src2 + 1]!;
  }

  const existingMesh = options.existing?.surfaceMesh;
  const mesh = existingMesh ?? new BufferMesh(engine);
  const boundsPadding = Math.max(0, options.boundsPadding ?? 0);

  const prevVertexBinding = existingMesh?.vertexBufferBindings[0] ?? undefined;
  const prevVertexBuffer = prevVertexBinding?.buffer;
  const prevIndexBinding = existingMesh?.indexBufferBinding ?? undefined;
  const prevIndexBuffer = prevIndexBinding?.buffer;
  const reuseVertex = Boolean(
    prevVertexBinding &&
      prevVertexBinding.stride === HEIGHTFIELD_VERTEX_BYTE_STRIDE &&
      prevVertexBuffer &&
      !prevVertexBuffer.destroyed &&
      prevVertexBuffer.byteLength === vertexData.byteLength &&
      prevVertexBuffer.readable === readable
  );
  const indexData = sourceIndices instanceof Uint16Array ? sourceIndices : new Uint16Array(sourceIndices);
  const reuseIndex = Boolean(
    prevIndexBinding &&
      prevIndexBinding.format === IndexFormat.UInt16 &&
      prevIndexBuffer &&
      !prevIndexBuffer.destroyed &&
      prevIndexBuffer.byteLength === indexData.byteLength &&
      prevIndexBuffer.readable === readable
  );
  let createdVertexBuffer: Buffer | undefined;
  let createdIndexBuffer: Buffer | undefined;
  let reboundVertex = false;
  let reboundIndex = false;
  try {
    // Phase 1: allocate all replacement GPU buffers before mutating existing mesh bindings or destroying prior buffers.
    const vertexBuffer = reuseVertex
      ? prevVertexBuffer!
      : (createdVertexBuffer = new Buffer(
          engine,
          BufferBindFlag.VertexBuffer,
          vertexData,
          BufferUsage.Static,
          readable
        ));
    const indexBuffer = reuseIndex
      ? prevIndexBuffer!
      : (createdIndexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indexData, BufferUsage.Static, readable));

    // Phase 2: upload, rebind, update metadata, and register restorer.
    if (reuseVertex) {
      prevVertexBuffer!.setData(vertexData);
    } else {
      mesh.setVertexBufferBinding(vertexBuffer, HEIGHTFIELD_VERTEX_BYTE_STRIDE, 0);
      reboundVertex = true;
    }
    if (reuseIndex) {
      prevIndexBuffer!.setData(indexData);
    } else {
      mesh.setIndexBufferBinding(indexBuffer, IndexFormat.UInt16);
      reboundIndex = true;
    }

    if (!hasHeightfieldVertexLayout(mesh.vertexElements)) {
      mesh.setVertexElements(HEIGHTFIELD_VERTEX_ELEMENTS);
    }
    mesh.bounds.min.set(
      geometry.bounds.min[0] - boundsPadding,
      geometry.bounds.min[1] - boundsPadding,
      geometry.bounds.min[2] - boundsPadding
    );
    mesh.bounds.max.set(
      geometry.bounds.max[0] + boundsPadding,
      geometry.bounds.max[1] + boundsPadding,
      geometry.bounds.max[2] + boundsPadding
    );
    mesh.clearSubMesh();
    mesh.addSubMesh(0, geometry.indexCount, MeshTopology.Triangles);
    registerWaterMeshContentRestorer(engine, mesh, () => {
      const attributes: Readonly<Record<string, readonly [Float32Array, number]>> = {
        [VertexAttribute.Position]: [geometry.positions.borrowTypedArray(), 3],
        [VertexAttribute.Normal]: [geometry.normals.borrowTypedArray(), 3],
        [VertexAttribute.Tangent]: [geometry.tangents.borrowTypedArray(), 4],
        [VertexAttribute.UV]: [geometry.uvs.borrowTypedArray(), 2]
      };
      return {
        vertexCount: geometry.vertexCount,
        indices: geometry.indices.borrowTypedArray(),
        read: (attribute, vertex, component) => {
          const [values, stride] = attributes[attribute];
          return values[vertex * stride + component];
        }
      };
    });

    // Phase 3: commit succeeded; safely destroy replaced buffers.
    if (createdVertexBuffer && prevVertexBuffer && !prevVertexBuffer.destroyed) prevVertexBuffer.destroy(true);
    if (createdIndexBuffer && prevIndexBuffer && !prevIndexBuffer.destroyed) prevIndexBuffer.destroy(true);

    return {
      surfaceMesh: mesh,
      ownedBuffers: Object.freeze(vertexBuffer === indexBuffer ? [vertexBuffer] : [vertexBuffer, indexBuffer])
    };
  } catch (error) {
    if (existingMesh) {
      if (reboundVertex && prevVertexBinding && prevVertexBuffer && !prevVertexBuffer.destroyed) {
        mesh.setVertexBufferBinding(prevVertexBinding, 0);
      }
      if (reboundIndex) {
        mesh.setIndexBufferBinding(
          prevIndexBinding && prevIndexBuffer && !prevIndexBuffer.destroyed ? prevIndexBinding : null
        );
      }
    } else if (!mesh.destroyed) {
      mesh.destroy(true);
    }
    if (createdVertexBuffer && !createdVertexBuffer.destroyed) createdVertexBuffer.destroy(true);
    if (createdIndexBuffer && !createdIndexBuffer.destroyed) createdIndexBuffer.destroy(true);
    throw error;
  }
}
