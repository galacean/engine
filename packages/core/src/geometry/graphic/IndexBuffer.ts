import { BufferUsage, UpdateType } from "../../base/Constant";
import { getVertexDataTypeSize, getVertexDataTypeDataView, TypedArray } from "../Constant";
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
  private _bufferUsage: BufferUsage;
  private _gl: WebGLRenderingContext & WebGL2RenderingContext;
  private _buffer: TypedArray;
  private _canRead: boolean;
  private _glBuffer;

  updateRange = {
    byteOffset: 0,
    byteLength: -1,
    bufferByteOffset: 0
  };

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

  constructor(
    indexFormat: IndexFormat,
    indexCount: number,
    bufferUsage: BufferUsage,
    canRead: boolean,
    engine?: Engine
  ) {
    engine = engine || Engine._getDefaultEngine();
    const rhi = engine._hardwareRenderer;
    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    this._gl = gl;
    this._indexFormat = indexFormat;
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

  setData(data: Uint16Array | Uint32Array | Uint8Array, bufferOffset: number, dataOffset: number, dataLength: number) {
    var byteCount: number = this._indexTypeByteCount;
    if (dataOffset !== 0 || dataLength !== 4294967295 /*uint.MAX_VALUE*/) {
      switch (this._indexFormat) {
        case IndexFormat.UInt32:
          data = new Uint32Array(data.buffer, dataOffset * byteCount, dataLength);
          break;
        case IndexFormat.UInt16:
          data = new Uint16Array(data.buffer, dataOffset * byteCount, dataLength);
          break;
        case IndexFormat.UInt8:
          data = new Uint8Array(data.buffer, dataOffset * byteCount, dataLength);
          break;
      }
    }

    // var curBufSta: BufferStateBase = BufferStateBase._curBindedBufferState;
    // if (curBufSta) {
    // 	if (curBufSta._bindedIndexBuffer === this) {
    // 		LayaGL.instance.bufferSubData(this._bufferType, bufferOffset * byteCount, data);//offset==0情况下，某些特殊设备或情况下直接bufferData速度是否优于bufferSubData
    // 	} else {
    // 		curBufSta.unBind();//避免影响VAO
    // 		this.bind();
    // 		LayaGL.instance.bufferSubData(this._bufferType, bufferOffset * byteCount, data);
    // 		curBufSta.bind();
    // 	}
    // } else {
    // 	this.bind();
    // 	LayaGL.instance.bufferSubData(this._bufferType, bufferOffset * byteCount, data);
    // }

    if (this._canRead) {
      if (bufferOffset !== 0 || dataStartIndex !== 0 || dataCount !== 4294967295 /*uint.MAX_VALUE*/) {
        var maxLength: number = this._buffer.length - bufferOffset;
        if (dataCount > maxLength) dataCount = maxLength;
        for (var i: number = 0; i < dataCount; i++) this._buffer[bufferOffset + i] = data[i];
      } else {
        this._buffer = data;
      }
    }
  }

  bind(): boolean {
    if (BufferStateBase._curBindedBufferState) {
      throw "IndexBuffer3D: must unbind current BufferState.";
    } else {
      if (IndexBuffer._bindedIndexBuffer !== this._glBuffer) {
        var gl: WebGLRenderingContext = LayaGL.instance;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._glBuffer);
        IndexBuffer._bindedIndexBuffer = this._glBuffer;
        return true;
      } else {
        return false;
      }
    }
  }
  resize(byteSize: number) {}

  // resizeData(indexValues: Array<Number> | TypedArray) {
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
    this._buffer = null;
  }
}
