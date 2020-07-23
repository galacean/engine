import { BufferUsage } from "@alipay/o3-base";
import { IndexFormat } from "../index";
import { getVertexDataTypeSize } from "../Constant";

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

  constructor(indexCount: number, indexType?: IndexFormat, usage?: BufferUsage) {
    this._indexCount = indexCount;
    const stride = getVertexDataTypeSize(indexType);
    const buffer = new ArrayBuffer(indexCount * stride);
    this.buffer = buffer;
  }

  setData(
    data,
    dataStartIndex: number = 0,
    bufferOffset: number = 0,
    dataCount: number = 4294967295 /*uint.MAX_VALUE*/
  ) {}

  setDataByIndex(index, value) {}

  getData() {}

  getDataByIndex(index) {}
}
