import { BufferUsage } from "@alipay/o3-base";
import { IndexFormat } from "../index";
import { getVertexDataTypeSize, getVertexDataTypeDataView } from "../Constant";

/**
 * IndexBuffer
 */
export class IndexBuffer {
  index: number;
  buffer: ArrayBuffer;
  private _indexType: IndexFormat;
  private _indexCount: number;

  get indexType(): IndexFormat {
    return this._indexType;
  }

  set indexType(indexType: IndexFormat) {
    this._indexType = indexType;
  }

  get indexCount(): number {
    return this._indexCount;
  }

  constructor(
    indexCount: number,
    indexType: IndexFormat = IndexFormat.UNSIGNED_SHORT,
    usage: BufferUsage = BufferUsage.STATIC_DRAW
  ) {
    this._indexCount = indexCount;
    this._indexType = indexType;
    const stride = getVertexDataTypeSize(indexType);
    const buffer = new ArrayBuffer(indexCount * stride);
    this.buffer = buffer;
  }

  setData(
    indexValues,
    dataStartIndex: number = 0,
    bufferOffset: number = 0,
    dataCount: number = 4294967295 /*uint.MAX_VALUE*/
  ) {
    const constructor = getVertexDataTypeDataView(this.indexType);
    const view = new constructor(this.buffer);
    view.set(indexValues);
  }

  setDataByIndex(index, value) {
    const constructor = getVertexDataTypeDataView(this.indexType);
    const stride = getVertexDataTypeSize(this.indexType);
    const view = new constructor(this.buffer, index * stride, 1);
    view.set(value);
  }

  getData() {
    const constructor = getVertexDataTypeDataView(this.indexType);
    return new constructor(this.buffer);
  }

  getDataByIndex(index) {
    const constructor = getVertexDataTypeDataView(this.indexType);
    const stride = getVertexDataTypeSize(this.indexType);
    return new constructor(this.buffer, index * stride, 1);
  }
}
