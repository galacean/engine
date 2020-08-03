import { UpdateType, BufferUsage } from "@alipay/o3-base";
import { BufferAttribute } from "@alipay/o3-primitive";
import { VertexBuffer } from "./VertexBuffer";
import { getVertexDataTypeDataView } from "../Constant";

/**
 * InterleavedBuffer
 * 只包含非instanced的插值buffer
 */
export class InterleavedBuffer extends VertexBuffer {
  private _bufferOffset: number;
  readonly isInterleaved = true;

  set bufferOffset(offset: number) {
    this._bufferOffset = offset;
  }

  get bufferOffset() {
    return this._bufferOffset;
  }

  constructor(attributes: BufferAttribute[], vertexCount: number) {
    super(attributes, vertexCount);
  }

  _initialize(startBufferIndex) {
    const { attributes, vertexCount } = this;
    const attribCount = attributes.length;
    let stride = 0;
    let dynamic = false;
    for (let i = 0; i < attribCount; i++) {
      const attribute = attributes[i];
      attribute.offset = stride;
      attribute.interleaved = true;
      attribute.vertexBufferIndex = startBufferIndex;
      if (attribute.usage === BufferUsage.DYNAMIC_DRAW) {
        dynamic = true;
      }
      this._semanticList.push(attribute.semantic);
      stride += this._getSizeInByte(attribute.size, attribute.type);
    }
    for (let i = 0; i < attribCount; i++) {
      const attribute = attributes[i];
      attribute.stride = stride;
      if (dynamic) {
        attribute.usage = BufferUsage.DYNAMIC_DRAW;
      }
    }
    const buffer = new ArrayBuffer(vertexCount * stride);
    this.buffers[0] = buffer;
  }

  setData(semantic: string, vertexValues, dataStartIndex: number = 0, bufferOffset: number = 0, dataCount: number) {
    this.bufferOffset = bufferOffset;
    const attribute = this._getAttributeBySemantic(semantic);
    const { size } = attribute;
    dataCount = dataCount === undefined ? vertexValues.length / size : dataCount;
    let offset = 0;
    for (let vertexIndex = dataStartIndex; vertexIndex < dataCount; vertexIndex += 1) {
      const value = vertexValues.slice(offset, offset + size);
      this.setDataByIndex(semantic, vertexIndex, value);
      offset += 3;
    }
  }

  getData(semantic: string) {
    let data = this.getDataByIndex(semantic, 0);
    for (let i = 1; i < this.vertexCount; i += 1) {
      const value = this.getDataByIndex(semantic, i);
      data = this._concat(value.constructor, data, value);
    }
    return data;
  }

  setDataByIndex(semantic: string, vertexIndex: number, value: number[] | Float32Array) {
    const vertexAttrib = this._getAttributeBySemantic(semantic);
    const { type, stride, size, offset, updateType, updateRange } = vertexAttrib;
    const buffer = this.buffers[0];
    const byteOffset = offset + stride * vertexIndex;
    const length = size;
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    const view = new constructor(buffer, byteOffset, length);
    view.set(value);
    if (updateType === UpdateType.NO_UPDATE) {
      vertexAttrib.updateType = UpdateType.UPDATE_RANGE;
    }
    if (updateType === UpdateType.UPDATE_RANGE) {
      const byteLength = this._getSizeInByte(size, type);
      if (updateRange.byteLength === -1 && updateRange.byteOffset === 0) {
        vertexAttrib.updateRange = {
          byteOffset,
          byteLength,
          bufferByteOffset: byteOffset
        };
      } else {
        const updateRange = this._getUpdateRange(vertexAttrib, byteOffset, byteLength);
        vertexAttrib.updateRange = updateRange;
      }
    }
  }

  getDataByIndex(semantic: string, index: number) {
    const vertexAttrib = this._getAttributeBySemantic(semantic);
    const buffer = this.buffers[0];
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    return new constructor(buffer, vertexAttrib.offset + vertexAttrib.stride * index, vertexAttrib.size);
  }

  private _concat(ResultConstructor, ...arrays) {
    let totalLength = 0;
    for (const arr of arrays) {
      totalLength += arr.length;
    }
    const result = new ResultConstructor(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }
}
