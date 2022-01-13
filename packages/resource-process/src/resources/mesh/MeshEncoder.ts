import { BufferWriter } from "../../utils/BufferWriter";
import { encoder } from "../../utils/Decorator";
import { IMeshData } from "./type";

@encoder("Mesh")
export class MeshEncoder {
  static encode(bufferWriter: BufferWriter, data: IMeshData): void {
    bufferWriter.writeStr(data.objectId);
    bufferWriter.writeStr(data.name);

    const { vertexElements, subMeshes, vertexBuffer, indexBuffer } = data;

    // vertex
    const vertexElementsLength = vertexElements.length;
    bufferWriter.writeUint8(vertexElementsLength);
    for (let i = 0; i < vertexElementsLength; i++) {
      const vertexElement = vertexElements[i];
      bufferWriter.writeStr(vertexElement.semantic);
      bufferWriter.writeUint32(vertexElement.offset);
      bufferWriter.writeUint8(vertexElement.format);
      bufferWriter.writeUint8(vertexElement.bindingIndex);
      bufferWriter.writeUint8(vertexElement.instanceStepRate);
    }

    // sub mesh
    const subMeshesLength = subMeshes.length;
    bufferWriter.writeUint8(subMeshesLength);
    for (let i = 0; i < subMeshesLength; i++) {
      const subMesh = subMeshes[i];
      bufferWriter.writeUint32(subMesh.start);
      bufferWriter.writeUint32(subMesh.count);
      bufferWriter.writeUint8(subMesh.topology);
    }

    bufferWriter.writeUint8(vertexBuffer.bufferUsage);
    bufferWriter.writeUint16(vertexBuffer.stride);
    bufferWriter.writeUint32(vertexBuffer.buffer.byteLength);
    bufferWriter.writeArrayBuffer(vertexBuffer.buffer);

    bufferWriter.writeUint8(data.hasIndexBuffer ? 1 : 0);
    if (data.hasIndexBuffer) {
      bufferWriter.writeUint8(indexBuffer.bufferUsage);
      bufferWriter.writeUint8(indexBuffer.format);
      bufferWriter.writeUint32(indexBuffer.buffer.byteLength);
      bufferWriter.writeArrayBuffer(indexBuffer.buffer);
    }
  }
}
