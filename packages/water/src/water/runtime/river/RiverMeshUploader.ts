import { destroyWaterOwnedMesh } from "../resources/destroyWaterOwnedMesh";
/** Converts compiler-owned CPU geometry into reusable Galacean BufferMesh resources. */
import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  ContentRestorer,
  Engine,
  IndexFormat,
  MeshTopology,
  VertexAttribute,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine-core";
import type { RiverGeometryData, RiverRenderableArtifact } from "../../compiler/river/types";
import type { RiverMeshBuildResult } from "./types";

export interface RiverMeshUploadOptions {
  existing?: RiverMeshBuildResult;
  releaseCpuData?: boolean;
}

function writeAttributeTuples(
  packed: Float32Array,
  values: readonly (readonly number[])[],
  floatStride: number,
  floatOffset: number,
  componentCount: number,
  sourceStart = 0
): void {
  for (let i = 0; i < values.length; i++) {
    const source = values[i]!;
    const dst = i * floatStride + floatOffset;
    for (let c = 0; c < componentCount; c++) {
      packed[dst + c] = source[sourceStart + c]!;
    }
  }
}

function writeFallbackMotionGradients(
  packed: Float32Array,
  geometry: RiverGeometryData,
  floatStride: number,
  uv4Offset: number,
  uv5Offset: number
): void {
  const tangents = geometry.tangents;
  const vertexCount = geometry.positions.length;
  for (let i = 0; i < vertexCount; i++) {
    const tangent = tangents?.[i];
    const tx = tangent ? tangent[0]! : 0;
    const tz = tangent ? tangent[2]! : 1;
    const length = Math.hypot(tx, tz) || 1;
    const nx = -tz / length;
    const nz = tx / length;
    const fx = tx / length;
    const fz = tz / length;
    const base = i * floatStride;
    packed[base + uv4Offset] = nx;
    packed[base + uv4Offset + 1] = nz;
    packed[base + uv5Offset] = fx;
    packed[base + uv5Offset + 1] = fz;
  }
}

function packRiverVertexBuffer(
  geometry: RiverGeometryData,
  elements: readonly VertexElement[],
  floatStride: number,
  uv4FloatOffset: number,
  uv5FloatOffset: number
): Float32Array {
  const vertexCount = geometry.positions.length;
  const packed = new Float32Array(vertexCount * floatStride);
  for (let e = 0; e < elements.length; e++) {
    const element = elements[e]!;
    const floatOffset = element.offset / Float32Array.BYTES_PER_ELEMENT;
    switch (element.attribute) {
      case VertexAttribute.Position:
        writeAttributeTuples(packed, geometry.positions, floatStride, floatOffset, 3);
        break;
      case VertexAttribute.Normal:
        writeAttributeTuples(packed, geometry.normals!, floatStride, floatOffset, 3);
        break;
      case VertexAttribute.Tangent:
        writeAttributeTuples(packed, geometry.tangents!, floatStride, floatOffset, 4);
        break;
      case VertexAttribute.Color:
        writeAttributeTuples(packed, geometry.colors!, floatStride, floatOffset, 4);
        break;
      case VertexAttribute.UV:
        writeAttributeTuples(packed, geometry.uvs, floatStride, floatOffset, 2);
        break;
      case VertexAttribute.UV1:
        writeAttributeTuples(packed, geometry.uv1s, floatStride, floatOffset, 2);
        break;
      case VertexAttribute.UV2:
        writeAttributeTuples(packed, geometry.uv2s!, floatStride, floatOffset, 2);
        break;
      case VertexAttribute.UV3:
        writeAttributeTuples(packed, geometry.uv3s!, floatStride, floatOffset, 2);
        break;
      case VertexAttribute.UV4:
        if (geometry.motionGradients) {
          writeAttributeTuples(packed, geometry.motionGradients, floatStride, floatOffset, 2, 0);
        }
        break;
      case VertexAttribute.UV5:
        if (geometry.motionGradients) {
          writeAttributeTuples(packed, geometry.motionGradients, floatStride, floatOffset, 2, 2);
        } else {
          writeFallbackMotionGradients(packed, geometry, floatStride, uv4FloatOffset, uv5FloatOffset);
        }
        break;
      default:
        throw new Error(`Unexpected River mesh attribute: ${element.attribute}`);
    }
  }
  return packed;
}

function buildRiverVertexLayout(geometry: RiverGeometryData): {
  elements: VertexElement[];
  floatStride: number;
  uv4FloatOffset: number;
  uv5FloatOffset: number;
} {
  const elements: VertexElement[] = [];
  let floatOffset = 0;
  const pushElement = (attribute: string, format: VertexElementFormat, floatCount: number) => {
    elements.push(new VertexElement(attribute, floatOffset * Float32Array.BYTES_PER_ELEMENT, format, 0));
    floatOffset += floatCount;
  };
  pushElement(VertexAttribute.Position, VertexElementFormat.Vector3, 3);
  if (geometry.normals) pushElement(VertexAttribute.Normal, VertexElementFormat.Vector3, 3);
  if (geometry.tangents) pushElement(VertexAttribute.Tangent, VertexElementFormat.Vector4, 4);
  if (geometry.colors) pushElement(VertexAttribute.Color, VertexElementFormat.Vector4, 4);
  pushElement(VertexAttribute.UV, VertexElementFormat.Vector2, 2);
  pushElement(VertexAttribute.UV1, VertexElementFormat.Vector2, 2);
  if (geometry.uv2s) pushElement(VertexAttribute.UV2, VertexElementFormat.Vector2, 2);
  if (geometry.uv3s) pushElement(VertexAttribute.UV3, VertexElementFormat.Vector2, 2);
  const uv4FloatOffset = floatOffset;
  pushElement(VertexAttribute.UV4, VertexElementFormat.Vector2, 2);
  const uv5FloatOffset = floatOffset;
  pushElement(VertexAttribute.UV5, VertexElementFormat.Vector2, 2);
  return { elements, floatStride: floatOffset, uv4FloatOffset, uv5FloatOffset };
}

/** Keeps only the immutable compiler recipe; packed vertex data lives for one restore call. */
class RiverMeshContentRestorer extends ContentRestorer<BufferMesh> {
  constructor(
    mesh: BufferMesh,
    private readonly geometry: RiverGeometryData,
    private readonly floatStride: number,
    private readonly uv4FloatOffset: number,
    private readonly uv5FloatOffset: number
  ) {
    super(mesh);
  }

  restoreContent(): void {
    const mesh = this.resource;
    if (mesh.destroyed) return;
    const binding = mesh.vertexBufferBindings[0];
    if (binding && !binding.buffer.destroyed) {
      const packed = packRiverVertexBuffer(
        this.geometry,
        mesh.vertexElements,
        this.floatStride,
        this.uv4FloatOffset,
        this.uv5FloatOffset
      );
      binding.buffer.setData(packed);
    }
    const indexBuffer = mesh.indexBufferBinding?.buffer;
    if (indexBuffer && !indexBuffer.destroyed) {
      const indices = this.geometry.indices.borrowTypedArray();
      indexBuffer.setData(
        this.geometry.positions.length > 65535
          ? indices instanceof Uint32Array
            ? indices
            : new Uint32Array(indices)
          : indices instanceof Uint16Array
            ? indices
            : new Uint16Array(indices)
      );
    }
  }
}

function uploadGeometry(
  engine: Engine,
  geometry: RiverGeometryData,
  existing?: BufferMesh,
  releaseCpuData = false
): BufferMesh {
  const readable = !releaseCpuData;
  const { elements, floatStride, uv4FloatOffset, uv5FloatOffset } = buildRiverVertexLayout(geometry);
  const packedVertices = packRiverVertexBuffer(geometry, elements, floatStride, uv4FloatOffset, uv5FloatOffset);
  const byteStride = floatStride * Float32Array.BYTES_PER_ELEMENT;
  const sourceIndices = geometry.indices.borrowTypedArray();
  const useUint32 = geometry.positions.length > 65535;
  const indices = useUint32
    ? sourceIndices instanceof Uint32Array
      ? sourceIndices
      : new Uint32Array(sourceIndices)
    : sourceIndices instanceof Uint16Array
      ? sourceIndices
      : new Uint16Array(sourceIndices);

  const mesh = existing ?? new BufferMesh(engine);
  const prevVertexBinding = existing?.vertexBufferBindings[0] ?? undefined;
  const prevVertexBuffer = prevVertexBinding?.buffer;
  const prevIndexBinding = existing?.indexBufferBinding ?? undefined;
  const prevIndexBuffer = prevIndexBinding?.buffer;
  const prevVertexElements = existing ? [...existing.vertexElements] : undefined;
  const indexFormat = useUint32 ? IndexFormat.UInt32 : IndexFormat.UInt16;
  const reuseVertex = Boolean(
    prevVertexBinding &&
      prevVertexBinding.stride === byteStride &&
      prevVertexBuffer &&
      !prevVertexBuffer.destroyed &&
      prevVertexBuffer.byteLength === packedVertices.byteLength &&
      prevVertexBuffer.readable === readable
  );
  const reuseIndex = Boolean(
    prevIndexBinding &&
      prevIndexBinding.format === indexFormat &&
      prevIndexBuffer &&
      !prevIndexBuffer.destroyed &&
      prevIndexBuffer.byteLength === indices.byteLength &&
      prevIndexBuffer.readable === readable
  );
  let createdVertexBuffer: Buffer | undefined;
  let createdIndexBuffer: Buffer | undefined;
  let reboundVertex = false;
  let reboundIndex = false;
  try {
    // Phase 1: allocate replacement GPU buffers before mutating existing mesh bindings or destroying prior buffers.
    if (!reuseVertex) {
      createdVertexBuffer = new Buffer(
        engine,
        BufferBindFlag.VertexBuffer,
        packedVertices,
        BufferUsage.Static,
        readable
      );
    }
    if (!reuseIndex) {
      createdIndexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static, readable);
    }

    // Phase 2: upload, rebind, update layout/bounds, and register restorer.
    if (reuseVertex) {
      prevVertexBuffer!.setData(packedVertices);
    } else {
      mesh.setVertexBufferBinding(createdVertexBuffer!, byteStride, 0);
      reboundVertex = true;
    }
    if (reuseIndex) {
      prevIndexBuffer!.setData(indices);
    } else {
      mesh.setIndexBufferBinding(createdIndexBuffer!, indexFormat);
      reboundIndex = true;
    }

    mesh.setVertexElements(elements);
    mesh.bounds.min.set(geometry.bounds.min[0], geometry.bounds.min[1], geometry.bounds.min[2]);
    mesh.bounds.max.set(geometry.bounds.max[0], geometry.bounds.max[1], geometry.bounds.max[2]);
    mesh.clearSubMesh();
    mesh.addSubMesh(geometry.drawStart, geometry.drawCount, MeshTopology.Triangles);
    engine.resourceManager.addContentRestorer(
      new RiverMeshContentRestorer(mesh, geometry, floatStride, uv4FloatOffset, uv5FloatOffset)
    );

    // Phase 3: commit succeeded; safely destroy replaced buffers.
    if (createdVertexBuffer && prevVertexBuffer && !prevVertexBuffer.destroyed) prevVertexBuffer.destroy(true);
    if (createdIndexBuffer && prevIndexBuffer && !prevIndexBuffer.destroyed) prevIndexBuffer.destroy(true);

    return mesh;
  } catch (error) {
    if (existing) {
      if (reboundVertex && prevVertexBinding && prevVertexBuffer && !prevVertexBuffer.destroyed) {
        mesh.setVertexBufferBinding(prevVertexBinding, 0);
      }
      if (reboundIndex) {
        mesh.setIndexBufferBinding(
          prevIndexBinding && prevIndexBuffer && !prevIndexBuffer.destroyed ? prevIndexBinding : null
        );
      }
      if (prevVertexElements) {
        mesh.setVertexElements(prevVertexElements);
      }
    } else if (!mesh.destroyed) {
      destroyWaterOwnedMesh(mesh);
    }
    if (createdVertexBuffer && !createdVertexBuffer.destroyed) createdVertexBuffer.destroy(true);
    if (createdIndexBuffer && !createdIndexBuffer.destroyed) createdIndexBuffer.destroy(true);
    throw error;
  }
}

export function uploadRiverMeshes(
  engine: Engine,
  artifact: RiverRenderableArtifact,
  options: RiverMeshUploadOptions = {}
): RiverMeshBuildResult {
  const surfaceMesh = uploadGeometry(
    engine,
    artifact.surfaceGeometry,
    options.existing?.surfaceMesh,
    options.releaseCpuData
  );
  return { surfaceMesh };
}
