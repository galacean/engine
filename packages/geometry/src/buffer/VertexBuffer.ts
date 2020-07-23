import { Logger } from "@alipay/o3-base";
import { BufferAttribute } from "../index";
import { getVertexDataTypeSize, getVertexDataTypeDataView } from "../Constant";

/**
 * VertexBuffer
 * 只包含非instanced的非插值buffer
 */
export class VertexBuffer {
  attributes: BufferAttribute[];
  buffers: ArrayBuffer[];
  private _startBufferIndex: number | undefined;
  private _semanticList: string[] = [];
  readonly isInterleaved: boolean = false;

  set startBufferIndex(value) {
    // 只能够set一次
    if (this._startBufferIndex === undefined) {
      this._startBufferIndex = value;
    }
  }

  get startBufferIndex() {
    return this._startBufferIndex;
  }

  get semanticList() {
    return this._semanticList;
  }

  constructor(attributes: BufferAttribute[], vertexCount: number) {
    this.initialize(attributes, vertexCount);
  }

  initialize(attributes: BufferAttribute[], vertexCount: number) {
    this.attributes = attributes;
    for (let i = 0; i < attributes.length; i += 1) {
      const attribute = attributes[i];
      const { instanced, semantic } = attribute;
      this._semanticList.push(semantic);
      const stride = this._getSizeInByte(attribute.size, attribute.type);
      attribute.stride = stride;
      attribute.vertexBufferIndex = this.startBufferIndex + i;
      const bufferLength = instanced ? (vertexCount / instanced) * stride : vertexCount * stride;
      const buffer = new ArrayBuffer(bufferLength);
      this.buffers.push(buffer);
    }
  }

  setData(
    semantic: string,
    vertexValues,
    dataStartIndex: number = 0,
    bufferOffset: number = 0,
    dataCount: number = Number.MAX_SAFE_INTEGER
  ) {
    const vertexAttrib = this._getAttributeBySemantic(semantic);
    const buffer = this._getBufferBySemantic(semantic);
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    const view = new constructor(buffer, dataStartIndex, dataCount);
    view.set(vertexValues);
  }

  getData(semantic) {
    const vertexAttrib = this._getAttributeBySemantic(semantic);
    const buffer = this._getBufferBySemantic(semantic);
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    return new constructor(buffer);
  }

  setDataByIndex(semantic: string, vertexIndex: number, value: number[] | Float32Array) {
    const vertexAttrib = this._getAttributeBySemantic(semantic);
    const { stride, size } = vertexAttrib;
    const buffer = this._getBufferBySemantic(semantic);
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    const view = new constructor(buffer, vertexIndex * stride, size);
    view.set(value);
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
    return this.attributes.find((item) => (item.semantic = semantic));
  }

  protected _getBufferBySemantic(semantic: string) {
    const vertexAttrib = this.attributes.find((item) => (item.semantic = semantic));
    const { vertexBufferIndex } = vertexAttrib;
    const bufferIndex = vertexBufferIndex - this.startBufferIndex;
    const buffer = this.buffers[bufferIndex];
    return buffer;
  }
}
