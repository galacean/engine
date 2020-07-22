import { Logger } from "@alipay/o3-base";
import { BufferAttribute } from "../index";
import { getVertexDataTypeSize } from "../Constant";

/**
 * VertexBuffer
 * 只包含非instanced的非插值buffer
 */
export class VertexBuffer {
  attributes: BufferAttribute[];
  buffers: ArrayBuffer[];
  bufferMap: {};
  private _startBufferIndex: number | undefined;
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

  constructor(attributes: BufferAttribute[], vertexCount: number) {
    this.initialize(attributes, vertexCount);
  }

  initialize(attributes: BufferAttribute[], vertexCount: number) {
    this.attributes = attributes;
    for (let i = 0; i < attributes.length; i += 1) {
      const attribute = attributes[i];
      attribute.vertexBufferIndex = this.startBufferIndex + i;
      const stride = this._getSizeInByte(attribute.size, attribute.type);
      const buffer = new ArrayBuffer(vertexCount * stride);
      this.buffers.push(buffer);
    }
  }

  setData(
    semantic: string,
    vertexValues,
    bufferOffset: number = 0,
    dataStartIndex: number = 0,
    dataCount: number = Number.MAX_SAFE_INTEGER
  ) {}

  getData(semantic) {}

  setDataByIndex(semantic: string, vertexIndex: number, value: number[] | Float32Array) {}

  getDataByIndex(semantic: string, vertexIndex: number) {}

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
}
