import {
  ModelMesh,
  VertexElement,
  Buffer,
  BufferBindFlag,
  VertexBufferBinding,
  IndexBufferBinding
} from "@oasis-engine/core";
import { decoder } from "../../utils/Decorator";
import type { Engine } from "@oasis-engine/core";
import type { BufferReader } from "../../utils/BufferReader";

@decoder("Mesh")
export class MeshDecoder {
  public static decode(engine: Engine, bufferReader: BufferReader): Promise<ModelMesh> {
    return new Promise((resolve) => {
      const objectId = bufferReader.nextStr();
      const name = bufferReader.nextStr();

      const modelMesh = new ModelMesh(engine, name);
      const vertexElementsLength = bufferReader.nextUint8();

      for (let i = 0; i < vertexElementsLength; i++) {
        const semantic = bufferReader.nextStr();
        if (semantic.indexOf("POSITION_BS") > -1) {
          // @ts-ignore
          modelMesh._hasBlendShape = true;
        } else if (semantic.indexOf("NORMAL_BS") > -1) {
          // @ts-ignore
          modelMesh._useBlendShapeNormal = true;
        } else if (semantic.indexOf("TANGENT_BS") > -1) {
          // @ts-ignore
          modelMesh._useBlendShapeTangent = true;
        }
        const offset = bufferReader.nextUint32();
        const format = bufferReader.nextUint8();
        const bindingIndex = bufferReader.nextUint8();
        const instanceStepRate = bufferReader.nextUint8();
        const vertexElement = new VertexElement(semantic, offset, format, bindingIndex, instanceStepRate);
        // @ts-ignore
        modelMesh._addVertexElement(vertexElement);
      }

      const subMeshesLength = bufferReader.nextUint8();
      for (let i = 0; i < subMeshesLength; i++) {
        const start = bufferReader.nextUint32();
        const count = bufferReader.nextUint32();
        const topology = bufferReader.nextUint8();
        modelMesh.addSubMesh(start, count, topology);
      }

      const vertexBufferUsage = bufferReader.nextUint8();
      const vertexBufferStride = bufferReader.nextUint16();
      const vertexBufferLength = bufferReader.nextUint32();
      const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertexBufferLength, vertexBufferUsage);
      const dataOffset = bufferReader.offset;
      vertexBuffer.setData(bufferReader.buffer, 0, dataOffset, vertexBufferLength);
      // @ts-ignore
      modelMesh._setVertexBufferBinding(0, new VertexBufferBinding(vertexBuffer, vertexBufferStride));
      bufferReader.skip(vertexBufferLength);

      const hasIndexBuffer = bufferReader.nextUint8() === 1;
      if (hasIndexBuffer) {
        const indexBufferUsage = bufferReader.nextUint8();
        const indexFormat = bufferReader.nextUint8();
        const indexBufferLength = bufferReader.nextUint32();
        const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indexBufferLength, indexBufferUsage);
        indexBuffer.setData(bufferReader.buffer, 0, bufferReader.offset, indexBufferLength);
        // @ts-ignore
        modelMesh._setIndexBufferBinding(new IndexBufferBinding(indexBuffer, indexFormat));
      }

      engine.resourceManager.addToResourceMap(objectId, modelMesh);
      resolve(modelMesh);
    });
  }
}
