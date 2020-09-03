import { BufferUsage, UpdateType, DataType } from "../../base/Constant";
import { Engine } from "../../Engine";

/**
 * 索引格式。
 */
export enum IndexFormat {
  /** 8 位。*/
  UInt8,
  /** 16 位。*/
  UInt16,
  /** 32 位。*/
  UInt32
}

/**
 * IndexBuffer
 */
export class IndexBuffer {
  static _bindedIndexBuffer;

  updateType: UpdateType = UpdateType.UPDATE_ALL;

  private _indexFormat: IndexFormat;
  private _indexCount: number;
  private _indexTypeByteCount: number;
  private _byteSize: number;
  private _bufferUsage: BufferUsage;
  private _gl: WebGLRenderingContext & WebGL2RenderingContext;
  private _buffer: ArrayBufferView;
  private _canRead: boolean;
  private _glBuffer;

  updateRange = {
    byteOffset: 0,
    byteLength: -1,
    bufferByteOffset: 0
  };

  get glBuffer() {
    return this._glBuffer;
  }

  get buffetUsage(): BufferUsage {
    return this._bufferUsage;
  }

  get indexFormat(): IndexFormat {
    return this._indexFormat;
  }

  get indexCount(): number {
    return this._indexCount;
  }

  get indexTypeByteCount(): number {
    return this._indexTypeByteCount;
  }

  get byteSize(): number {
    return this._byteSize;
  }

  get indexType() {
    let type;
    switch (this._indexFormat) {
      case IndexFormat.UInt8:
        type = DataType.UNSIGNED_BYTE;
        break;
      case IndexFormat.UInt16:
        type = DataType.UNSIGNED_SHORT;
        break;
      case IndexFormat.UInt32:
        type = DataType.UNSIGNED_INT;
        break;
      default:
        type = DataType.UNSIGNED_SHORT;
        break;
    }
    return type;
  }

  constructor(
    indexCount: number,
    bufferUsage: BufferUsage = BufferUsage.STATIC_DRAW,
    indexFormat: IndexFormat = IndexFormat.UInt16,
    canRead: boolean,
    engine?: Engine
  ) {
    engine = engine || Engine._getDefaultEngine();
    const rhi = engine._hardwareRenderer;
    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    this._gl = gl;
    this._glBuffer = gl.createBuffer();
    this._indexFormat = indexFormat;
    this._indexCount = indexCount;
    this._bufferUsage = bufferUsage;
    this._canRead = canRead;
    switch (indexFormat) {
      case IndexFormat.UInt32:
        this._indexTypeByteCount = 4;
        break;
      case IndexFormat.UInt16:
        this._indexTypeByteCount = 2;
        break;
      case IndexFormat.UInt8:
        this._indexTypeByteCount = 1;
        break;
      default:
        throw new Error("unidentification index type.");
    }
    const byteSize: number = this._indexTypeByteCount * indexCount;
    this._byteSize = byteSize;
    this.bind();
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._byteSize, this._bufferUsage);
    if (canRead) {
      switch (indexFormat) {
        case IndexFormat.UInt32:
          this._buffer = new Uint32Array(indexCount);
          break;
        case IndexFormat.UInt16:
          this._buffer = new Uint16Array(indexCount);
          break;
        case IndexFormat.UInt8:
          this._buffer = new Uint8Array(indexCount);
          break;
      }
    }
  }

  setData(
    data: Uint16Array | Uint32Array | Uint8Array | number[],
    bufferOffset: number = 0,
    dataOffset: number = 0,
    dataLength: number = 4294967295
  ) {
    const gl = this._gl;
    const byteCount: number = this._indexTypeByteCount;
    const constructor = this._getIndexDataView(this._indexFormat);
    if (!ArrayBuffer.isView(data)) {
      data = new constructor(data, dataOffset * byteCount, dataLength);
    }
    if (dataOffset !== 0 || dataLength !== 4294967295 /*uint.MAX_VALUE*/) {
      data = new constructor(data.buffer, dataOffset * byteCount, dataLength);
    }
    this.bind();
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, bufferOffset * byteCount, data);
    if (this._canRead) {
      if (bufferOffset !== 0 || dataOffset !== 0 || dataLength !== 4294967295 /*uint.MAX_VALUE*/) {
        var maxLength: number = this._buffer.length - bufferOffset;
        if (dataLength > maxLength) dataLength = maxLength;
        for (var i: number = 0; i < dataLength; i++) this._buffer[bufferOffset + i] = data[i];
      } else {
        // this._buffer = data;
      }
    }
  }

  private _getIndexDataView(indexFormat: IndexFormat) {
    switch (indexFormat) {
      case IndexFormat.UInt32:
        return Uint32Array;
      case IndexFormat.UInt16:
        return Uint16Array;
      case IndexFormat.UInt8:
        return Uint8Array;
      default:
        return Uint16Array;
    }
  }

  bind(): boolean {
    if (IndexBuffer._bindedIndexBuffer !== this._glBuffer) {
      const gl = this._gl;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._glBuffer);
      IndexBuffer._bindedIndexBuffer = this._glBuffer;
      return true;
    } else {
      return false;
    }
  }

  resize(byteSize: number) {
    const gl = this._gl;
    gl.bufferData(gl.ARRAY_BUFFER, byteSize, this._bufferUsage);
  }

  // resizeData(indexValues: Array<Number> | ArrayBufferView) {
  //   const indexCount = indexValues.length;
  //   this._indexCount = indexCount;
  //   const bufferLength = indexCount * this.stride;
  //   const newBuffer = new ArrayBuffer(bufferLength);
  //   this.buffer[0] = newBuffer;
  //   const constructor = getVertexDataTypeDataView(this.indexType);
  //   const view = new constructor(this.buffer[0]);
  //   view.set(indexValues);
  //   if (this.updateType === UpdateType.NO_UPDATE) {
  //     this.updateType = UpdateType.RESIZE;
  //   }
  // }

  // setDataByIndex(index, value) {
  //   const constructor = getVertexDataTypeDataView(this.indexType);
  //   const stride = getVertexDataTypeSize(this.indexType);
  //   const view = new constructor(this.buffer[0], index * stride, 1);
  //   view.set(value);
  // }

  // getData() {
  //   const constructor = getVertexDataTypeDataView(this.indexType);
  //   return new constructor(this.buffer[0]);
  // }

  // getDataByIndex(index) {
  //   const constructor = getVertexDataTypeDataView(this.indexType);
  //   const stride = getVertexDataTypeSize(this.indexType);
  //   return new constructor(this.buffer[0], index * stride, 1);
  // }

  resetUpdateRange() {
    this.updateRange = {
      byteOffset: 0,
      byteLength: -1,
      bufferByteOffset: 0
    };
  }

  destroy() {
    console.log("destroy index");
    const gl = this._gl;
    if (this._glBuffer) {
      gl.deleteBuffer(this._glBuffer);
      this._glBuffer = null;
    }
    this._buffer = null;
  }
}
