import {
  AssetPromise,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Engine,
  IndexFormat,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine-core";
import { BufferReader } from "../../utils/BufferReader";
import { FileHeader } from "../../utils/FileHeader";
import { decoder } from "../../utils/Decorator";

/** Native BufferMesh payload. Offsets address the aligned data following the JSON header.
 * Attribute names/formats are the Engine's vertex contract, independent of any producer. */
interface EncodedBufferMesh {
  version: 1;
  vertexBuffers: { start: number; end: number; stride: number }[];
  vertexElements: { attribute: string; offset: number; format: VertexElementFormat; bindingIndex: number }[];
  indices: { start: number; end: number; format: IndexFormat };
  subMeshes: { start: number; count: number; topology: number }[];
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
}

@decoder("BufferMesh")
export class BufferMeshDecoder {
  static decode(engine: Engine, reader: BufferReader, restored?: BufferMesh): AssetPromise<BufferMesh> {
    return new AssetPromise((resolve, reject) => {
      let mesh: BufferMesh | undefined;
      const allocated: Buffer[] = [];
      try {
        const { data, vertices, indexBytes } = readBufferMesh(reader);
        if (
          restored &&
          (!(restored instanceof BufferMesh) ||
            restored.vertexBufferBindings.length !== vertices.length ||
            restored.vertexBufferBindings.some(
              (binding, i) =>
                !binding ||
                binding.stride !== data.vertexBuffers[i].stride ||
                binding.buffer.byteLength !== vertices[i].byteLength
            ) ||
            restored.indexBufferBinding?.format !== data.indices.format ||
            restored.indexBufferBinding?.buffer.byteLength !== indexBytes.byteLength)
        )
          throw Error("Cannot restore a different mesh layout");
        mesh = restored ?? new BufferMesh(engine);
        // Reuse buffers on device restoration. Readable data is needed by CPU geometry queries;
        // consumers must never need a GPU readback to inspect a native mesh.
        vertices.forEach((value, index) => {
          const existing = restored?.vertexBufferBindings[index]?.buffer;
          if (existing) existing.setData(value);
          else {
            const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, value, BufferUsage.Static, true);
            allocated.push(buffer);
            mesh!.setVertexBufferBinding(buffer, data.vertexBuffers[index].stride, index);
          }
        });
        const existingIndices = restored?.indexBufferBinding?.buffer;
        if (existingIndices) existingIndices.setData(indexBytes);
        else {
          const buffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indexBytes, BufferUsage.Static, true);
          allocated.push(buffer);
          mesh.setIndexBufferBinding(buffer, data.indices.format);
        }
        mesh.setVertexElements(
          data.vertexElements.map((e) => new VertexElement(e.attribute, e.offset, e.format, e.bindingIndex))
        );
        mesh.clearSubMesh();
        data.subMeshes.forEach((s) => mesh!.addSubMesh(s.start, s.count, s.topology));
        mesh.bounds.min.set(data.bounds.min.x, data.bounds.min.y, data.bounds.min.z);
        mesh.bounds.max.set(data.bounds.max.x, data.bounds.max.y, data.bounds.max.z);
        resolve(mesh);
      } catch (error) {
        if (!restored) {
          mesh?.destroy();
          allocated.forEach((buffer) => {
            if (!buffer.destroyed) buffer.destroy();
          });
        }
        reject(error);
      }
    });
  }
}

/** CPU import/validation uses exactly the same native format checks as GPU loading. */
export function parseBufferMeshData(buffer: ArrayBuffer) {
  if (!FileHeader.checkMagic(buffer)) throw Error("Expected a native BufferMesh asset");
  const header = FileHeader.decode(buffer);
  if (header.type !== "BufferMesh") throw Error("Expected a native BufferMesh asset");
  return readBufferMesh(new BufferReader(new Uint8Array(buffer), header.headerLength, header.dataLength));
}
function readBufferMesh(reader: BufferReader) {
  const data: EncodedBufferMesh = JSON.parse(reader.nextStr());
  if (data.version !== 1 || !data.vertexBuffers?.length || !data.vertexElements?.length)
    throw Error("Invalid native BufferMesh header");
  const offset = Math.ceil(reader.offset / 4) * 4;
  const bytes = ({ start, end }: { start: number; end: number }) => {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end <= start ||
      offset + end > reader.data.length
    )
      throw Error("BufferMesh range outside asset");
    return reader.data.subarray(offset + start, offset + end);
  };
  const vertices = data.vertexBuffers.map((binding) => {
    const value = bytes(binding);
    if (!Number.isSafeInteger(binding.stride) || binding.stride <= 0 || value.byteLength % binding.stride)
      throw Error("Invalid BufferMesh vertex stride");
    return value;
  });
  const sizes = [4, 8, 12, 16, 4, 4, 4, 4, 4, 4, 4, 4, 8, 8, 8, 8, 16];
  const attributes = new Set<string>();
  for (const element of data.vertexElements) {
    const binding = data.vertexBuffers[element.bindingIndex];
    if (
      !binding ||
      typeof element.attribute !== "string" ||
      !element.attribute ||
      attributes.has(element.attribute) ||
      !Number.isInteger(element.format) ||
      !sizes[element.format] ||
      !Number.isSafeInteger(element.offset) ||
      element.offset < 0 ||
      element.offset + sizes[element.format] > binding.stride
    )
      throw Error("Invalid BufferMesh vertex element");
    attributes.add(element.attribute);
  }
  const indexBytes = bytes(data.indices),
    indexSize = [1, 2, 4][data.indices.format];
  if (!indexSize || indexBytes.byteLength % indexSize) throw Error("Invalid BufferMesh index format");
  const vertexCount = Math.min(...data.vertexBuffers.map((binding, i) => vertices[i].byteLength / binding.stride));
  const indices = new DataView(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength);
  for (let offset = 0; offset < indexBytes.byteLength; offset += indexSize) {
    const index =
      indexSize === 4
        ? indices.getUint32(offset, true)
        : indexSize === 2
          ? indices.getUint16(offset, true)
          : indices.getUint8(offset);
    if (index >= vertexCount) throw Error("BufferMesh index outside vertex buffer");
  }
  if (!Array.isArray(data.subMeshes) || !data.subMeshes.length) throw Error("BufferMesh requires submeshes");
  for (const subMesh of data.subMeshes) {
    if (
      !Number.isInteger(subMesh.topology) ||
      subMesh.topology < 0 ||
      subMesh.topology > 6 ||
      !Number.isSafeInteger(subMesh.start) ||
      !Number.isSafeInteger(subMesh.count) ||
      subMesh.start < 0 ||
      subMesh.count < 0 ||
      subMesh.start + subMesh.count > indexBytes.byteLength / indexSize
    )
      throw Error("BufferMesh submesh outside index buffer");
  }
  for (const axis of ["x", "y", "z"] as const)
    if (
      !Number.isFinite(data.bounds?.min[axis]) ||
      !Number.isFinite(data.bounds?.max[axis]) ||
      data.bounds.min[axis] > data.bounds.max[axis]
    )
      throw Error("Invalid BufferMesh bounds");
  return { data, vertices, indexBytes };
}
