import { BufferUsage, UpdateType } from "../../base/Constant";
import { IndexFormat, UpdateRange } from "../../primitive/type";
import { getVertexDataTypeSize, getVertexDataTypeDataView, TypedArray } from "../Constant";

/**
 * IndexBuffer
 */
export class IndexBuffer {
  index: number;
  buffers: ArrayBuffer[];
  updateType: UpdateType = UpdateType.UPDATE_ALL;
  usage: BufferUsage = BufferUsage.STATIC_DRAW;
  private _stride: number;
  private _indexType: IndexFormat;
  private _indexCount: number;
  updateRange: UpdateRange = {
    byteOffset: 0,
    byteLength: -1,
    bufferByteOffset: 0
  };

  get indexType(): IndexFormat {
    return this._indexType;
  }

  set indexType(indexType: IndexFormat) {
    this._indexType = indexType;
  }

  get indexCount(): number {
    return this._indexCount;
  }

  get stride() {
    return this._stride;
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
    this.buffers = [buffer];
    this._stride = stride;
  }

  setData(
    indexValues: Array<Number> | TypedArray,
    dataStartIndex: number = 0,
    bufferOffset: number = 0,
    dataCount: number
  ) {
    const constructor = getVertexDataTypeDataView(this.indexType);
    dataCount = dataCount === undefined ? indexValues.length : dataCount;
    const view = new constructor(this.buffers[0], dataStartIndex, dataCount);
    const stride = this.stride;
    const byteOffset = dataStartIndex * stride;
    const byteLength = dataCount * stride;
    const bufferByteOffset = bufferOffset * stride;
    view.set(indexValues);
    if (this.updateType === UpdateType.NO_UPDATE) {
      this.updateType = UpdateType.UPDATE_RANGE;
    }
    if (this.updateType === UpdateType.UPDATE_RANGE) {
      this.updateRange = {
        byteOffset,
        byteLength,
        bufferByteOffset
      };
    }
  }

  resizeData(indexValues: Array<Number> | TypedArray) {
    const indexCount = indexValues.length;
    if (indexCount <= this.indexCount) {
      this.setData(indexValues, 0, 0, null);
      return;
    }
    this._indexCount = indexCount;
    const bufferLength = indexCount * this.stride;
    const newBuffer = new ArrayBuffer(bufferLength);
    this.buffers[0] = newBuffer;
    const constructor = getVertexDataTypeDataView(this.indexType);
    const view = new constructor(this.buffers[0]);
    view.set(indexValues);
    if (this.updateType === UpdateType.NO_UPDATE) {
      this.updateType = UpdateType.RESIZE;
    }
  }

  setDataByIndex(index, value) {
    const constructor = getVertexDataTypeDataView(this.indexType);
    const stride = getVertexDataTypeSize(this.indexType);
    const view = new constructor(this.buffers[0], index * stride, 1);
    view.set(value);
  }

  getData() {
    const constructor = getVertexDataTypeDataView(this.indexType);
    return new constructor(this.buffers[0]);
  }

  getDataByIndex(index) {
    const constructor = getVertexDataTypeDataView(this.indexType);
    const stride = getVertexDataTypeSize(this.indexType);
    return new constructor(this.buffers[0], index * stride, 1);
  }

  resetUpdateRange() {
    this.updateRange = {
      byteOffset: 0,
      byteLength: -1,
      bufferByteOffset: 0
    };
  }
}
