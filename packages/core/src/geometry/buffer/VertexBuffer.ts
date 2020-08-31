import { UpdateType } from "../../base/Constant";
import { Logger } from "../../base";
import { BufferAttribute } from "../../primitive/type";
import { getVertexDataTypeSize, getVertexDataTypeDataView, TypedArray } from "../Constant";

/**
 * VertexBuffer
 * 只包含非instanced的非插值buffer
 */
export class VertexBuffer {
  attributes: BufferAttribute[];
  buffers: ArrayBuffer[] = [];
  vertexCount: number;
  protected _semanticList: string[] = [];
  private _startBufferIndex: number;
  readonly isInterleaved: boolean = false;

  get semanticList() {
    return this._semanticList;
  }

  constructor(attributes: BufferAttribute[], vertexCount: number) {
    this.attributes = attributes;
    this.vertexCount = vertexCount;
  }

  _initialize(startBufferIndex) {
    this._startBufferIndex = startBufferIndex;
    const { attributes, vertexCount } = this;
    for (let i = 0; i < attributes.length; i += 1) {
      const attribute = attributes[i];
      const { instanced, semantic } = attribute;
      this._semanticList.push(semantic);
      const stride = this._getSizeInByte(attribute.size, attribute.type);
      attribute.stride = stride;
      attribute.offset = 0;
      attribute.vertexBufferIndex = this._startBufferIndex + i;
      const bufferLength = instanced ? (vertexCount / instanced) * stride : vertexCount * stride;
      const buffer = new ArrayBuffer(bufferLength);
      this.buffers.push(buffer);
    }
  }

  setData(
    semantic: string,
    vertexValues: Array<Number> | TypedArray,
    dataStartIndex: number = 0,
    bufferOffset: number = 0,
    dataCount: number
  ) {
    const vertexAttrib = this._getAttributeBySemantic(semantic);
    const buffer = this._getBufferBySemantic(semantic);
    const { stride, size } = vertexAttrib;
    dataCount = dataCount === undefined ? vertexValues.length : dataCount;
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    const view = new constructor(buffer, dataStartIndex, dataCount);
    view.set(vertexValues);
    const byteOffset = (dataStartIndex * stride) / size;
    const byteLength = (dataCount * stride) / size;
    const bufferByteOffset = bufferOffset * stride;
    if (vertexAttrib.updateType === UpdateType.NO_UPDATE) {
      vertexAttrib.updateType = UpdateType.UPDATE_RANGE;
    }
    if (vertexAttrib.updateType === UpdateType.UPDATE_RANGE) {
      vertexAttrib.updateRange = {
        byteOffset,
        byteLength,
        bufferByteOffset
      };
    }
  }

  resizeData(semantic: string, vertexValues: Array<Number> | TypedArray) {
    const vertexAttrib = this._getAttributeBySemantic(semantic);
    const { size, stride } = vertexAttrib;
    const dataCount = vertexValues.length / size;
    if (dataCount <= this.vertexCount) {
      this.setData(semantic, vertexValues, 0, 0, null);
      return;
    }
    const bufferLength = dataCount * stride;
    const bufferIndex = this._getBufferIndexBySemantic(semantic);
    const newBuffer = new ArrayBuffer(bufferLength);
    this.buffers[bufferIndex] = newBuffer;

    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    const view = new constructor(newBuffer);
    view.set(vertexValues);

    if (vertexAttrib.updateType === UpdateType.NO_UPDATE) {
      vertexAttrib.updateType = UpdateType.RESIZE;
    }
  }

  getData(semantic) {
    const vertexAttrib = this._getAttributeBySemantic(semantic);
    const buffer = this._getBufferBySemantic(semantic);
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    return new constructor(buffer);
  }

  setDataByIndex(semantic: string, vertexIndex: number, value: Array<Number> | TypedArray) {
    const vertexAttrib = this._getAttributeBySemantic(semantic);
    const { stride, size } = vertexAttrib;
    const buffer = this._getBufferBySemantic(semantic);
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    const view = new constructor(buffer, vertexIndex * stride, size);
    view.set(value);
    const byteOffset = vertexAttrib.offset + vertexAttrib.stride * vertexIndex;
    const byteLength = vertexAttrib.stride;
    if (vertexAttrib.updateType === UpdateType.NO_UPDATE) {
      vertexAttrib.updateType = UpdateType.UPDATE_RANGE;
    }
    if (vertexAttrib.updateType === UpdateType.UPDATE_RANGE) {
      if (vertexAttrib.updateRange.byteLength === -1 && vertexAttrib.updateRange.byteOffset === 0) {
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

  getDataByIndex(semantic: string, vertexIndex: number) {
    const vertexAttrib = this._getAttributeBySemantic(semantic);
    const { stride, size } = vertexAttrib;
    const buffer = this._getBufferBySemantic(semantic);
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    return new constructor(buffer, vertexIndex * stride, size);
  }

  /**
   * 获取当前类型的数据所占字节数
   * @param {Number} size 所占空间长度
   * @param {Number} type 数据类型常量
   * @private
   */
  protected _getSizeInByte(size, type) {
    const num = getVertexDataTypeSize(type);
    if (num) {
      return size * num;
    } else {
      Logger.error("UNKNOWN vertex attribute type: " + type);
      return 0;
    }
  }

  protected _getAttributeBySemantic(semantic: string) {
    let matchedAttribute;
    for (let i = 0; i < this.attributes.length; i += 1) {
      const attribute = this.attributes[i];
      if (attribute.semantic === semantic) {
        matchedAttribute = attribute;
      }
    }
    return matchedAttribute;
  }

  protected _getBufferBySemantic(semantic: string) {
    const bufferIndex = this._getBufferIndexBySemantic(semantic);
    const buffer = this.buffers[bufferIndex];
    return buffer;
  }

  protected _getBufferIndexBySemantic(semantic: string) {
    const vertexAttrib = this.attributes.find((item) => item.semantic === semantic);
    const { vertexBufferIndex } = vertexAttrib;
    const bufferIndex = vertexBufferIndex - this._startBufferIndex;
    return bufferIndex;
  }

  /**
   * 获取更新范围
   * @param {number} offset 字节偏移
   * @param {number} length 字节长度
   * @private
   */
  protected _getUpdateRange(vertexAttrib, offset, length) {
    const updateRange = vertexAttrib.updateRange;
    const rangeEnd1 = updateRange.byteOffset + updateRange.byteLength;
    const byteOffset = Math.min(offset, updateRange.byteOffset);
    const rangeEnd2 = offset + length;
    const byteLength = rangeEnd1 <= rangeEnd2 ? rangeEnd2 - updateRange.byteOffset : rangeEnd1 - updateRange.byteOffset;
    return { byteOffset, byteLength, bufferByteOffset: byteOffset };
  }
}
