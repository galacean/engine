import { VertexDeclaration } from "./VertexDeclaration";
import { VertexElement } from "./VertexElement";
import { UpdateType, BufferUsage } from "../../base/Constant";
import { TypedArray, getVertexDataTypeDataView } from "../Constant";
import { Engine } from "../../Engine";
import { Logger } from "../../base/Logger";

/**
 * VertexBuffer
 */
export class VertexBuffer {
  static _bindedVertexBuffer;

  /** 顶点声明 */
  declaration: VertexDeclaration;

  private _canRead: boolean;
  private _byteSize: number;
  private _bufferUsage: BufferUsage;
  private _isInterleaved: boolean;
  private _buffer: TypedArray;
  private _glBuffer;
  private _gl: WebGLRenderingContext & WebGL2RenderingContext;

  private _semanticList: string[] = [];

  updateRange = {
    byteOffset: 0,
    byteLength: -1,
    bufferByteOffset: 0
  };

  /**
   * 顶点缓冲的长度,以字节为单位。
   */
  get byteSize(): number {
    return this._byteSize;
  }

  /**
   * 顶点缓冲用途
   */
  get bufferUsage(): BufferUsage {
    return this._bufferUsage;
  }

  /**
   * 顶点声明语意
   */
  get semanticList() {
    return this._semanticList;
  }

  /**
   * 是否可读
   */
  get canRead() {
    return this._canRead;
  }

  /**
   * 是否为插值形式
   */
  get isInterleaved() {
    return this._isInterleaved;
  }

  constructor(byteSize: number, bufferUsage: BufferUsage, canRead: boolean, engine?: Engine) {
    engine = engine || Engine._getDefaultEngine();
    const rhi = engine._hardwareRenderer;
    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    this._gl = gl;
    this._glBuffer = gl.createBuffer();
    this._byteSize = byteSize;
    this._bufferUsage = bufferUsage;
    this._canRead = canRead;
    this.bind();
    gl.bufferData(gl.ARRAY_BUFFER, this._byteSize, this._bufferUsage);
    if (canRead) {
      this._buffer = new Float32Array(byteSize);
    }
  }

  bind() {
    if (VertexBuffer._bindedVertexBuffer !== this._glBuffer) {
      const gl = this._gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this._glBuffer);
      VertexBuffer._bindedVertexBuffer = this._glBuffer;
      return true;
    } else {
      return false;
    }
  }

  initialize(startBufferIndex) {
    // if (!this.declaration) {
    //   Logger.error("Need set vertex declaration first");
    //   return;
    // }
    // this._startBufferIndex = startBufferIndex;
    // const { declaration } = this;
    // const { elements, vertexStride } = declaration;
    // for (let i = 0; i < elements.length; i += 1) {
    //   const element = elements[i];
    //   const { semantic } = element;
    //   this._semanticList.push(semantic);
    //   element.stride = vertexStride;
    //   element.vertexBufferIndex = this._startBufferIndex;
    // }
  }

  setData(
    data: ArrayBuffer | TypedArray,
    bufferByteOffset: number = 0,
    dataByteOffset: number = 0,
    dataByteLength: number = Number.MAX_SAFE_INTEGER
  ) {
    this.bind();
    const needSubData: boolean = dataByteOffset !== 0 || dataByteLength !== Number.MAX_SAFE_INTEGER;
    const gl = this._gl;
    if (needSubData) {
      const subData: Uint8Array = new Uint8Array(data, dataByteOffset, dataByteLength);
      gl.bufferSubData(gl.ARRAY_BUFFER, bufferByteOffset, subData);
      if (this._canRead) this._buffer.set(subData, bufferByteOffset);
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, bufferByteOffset, data);
      if (this._canRead) {
        this._buffer.set(new Uint8Array(data), bufferByteOffset);
      }
    }
    // const vertexElement = this._getVertexElementBySemantic(semantic);
    // const { size, type, stride } = this._getElementInfo(vertexElement);
    // if (this._isInterleaved) {
    //   let offset = 0;
    //   dataCount = dataCount === undefined ? vertexValues.length / size : dataCount;
    //   for (let vertexIndex = dataStartIndex; vertexIndex < dataCount; vertexIndex += 1) {
    //     const value = vertexValues.slice(offset, offset + size);
    //     this.setDataByIndex(semantic, vertexIndex, value);
    //     offset += size;
    //   }
    // } else {
    //   dataCount = dataCount === undefined ? vertexValues.length : dataCount;
    //   const constructor = getVertexDataTypeDataView(type);
    //   const view = new constructor(this.buffer, dataStartIndex, dataCount);
    //   view.set(vertexValues);

    //   const byteOffset = (dataStartIndex * stride) / size;
    //   const byteLength = (dataCount * stride) / size;
    //   const bufferByteOffset = bufferOffset * stride;

    //   if (vertexElement.updateType === UpdateType.NO_UPDATE) {
    //     vertexElement.updateType = UpdateType.UPDATE_RANGE;
    //   }
    //   if (vertexElement.updateType === UpdateType.UPDATE_RANGE) {
    //     vertexElement.updateRange = {
    //       byteOffset,
    //       byteLength,
    //       bufferByteOffset
    //     };
    //   }
    // }
  }

  // resizeData(semantic: string, vertexValues: Array<Number> | TypedArray) {
  //   const vertexElement = this._getVertexElementBySemantic(semantic);
  //   const { size, type, stride } = this._getElementInfo(vertexElement);
  //   const dataCount = vertexValues.length / size;
  //   const bufferLength = dataCount * stride;
  //   const newBuffer = new ArrayBuffer(bufferLength);
  //   this.buffer = newBuffer;

  //   const constructor = getVertexDataTypeDataView(type);
  //   const view = new constructor(newBuffer);
  //   view.set(vertexValues);

  //   if (vertexElement.updateType === UpdateType.NO_UPDATE) {
  //     vertexElement.updateType = UpdateType.RESIZE;
  //   }
  // }

  resize(byteSize: number) {
    const gl = this._gl;
    gl.bufferData(gl.ARRAY_BUFFER, byteSize, this._bufferUsage);
  }

  getData(semantic) {
    // const vertexElement = this._getVertexElementBySemantic(semantic);
    // const { type } = this._getElementInfo(vertexElement);
    // const buffer = this.buffer;
    // const constructor = getVertexDataTypeDataView(type);
    // return new constructor(buffer);
  }

  setDataByIndex(semantic: string, vertexIndex: number, value: Array<Number> | TypedArray) {
    // const vertexElement = this._getVertexElementBySemantic(semantic);
    // const { size, type, stride } = this._getElementInfo(vertexElement);
    // const { offset } = vertexElement;
    // const constructor = getVertexDataTypeDataView(type);
    // const byteOffset = offset + stride * vertexIndex;
    // const byteLength = stride;
    // const view = new constructor(this.buffer, byteOffset, size);
    // view.set(value);
    // if (vertexElement.updateType === UpdateType.NO_UPDATE) {
    //   vertexElement.updateType = UpdateType.UPDATE_RANGE;
    // }
    // if (vertexElement.updateType === UpdateType.UPDATE_RANGE) {
    //   if (vertexElement.updateRange.byteLength === -1 && vertexElement.updateRange.byteOffset === 0) {
    //     vertexElement.updateRange = {
    //       byteOffset,
    //       byteLength,
    //       bufferByteOffset: byteOffset
    //     };
    //   } else {
    //     const updateRange = this._getUpdateRange(vertexElement, byteOffset, byteLength);
    //     vertexElement.updateRange = updateRange;
    //   }
    // }
  }

  getDataByIndex(semantic: string, vertexIndex: number) {
    // const vertexElement = this._getVertexElementBySemantic(semantic);
    // const { size, type, stride } = this._getElementInfo(vertexElement);
    // const buffer = this.buffer;
    // const constructor = getVertexDataTypeDataView(type);
    // return new constructor(buffer, vertexIndex * stride, size);
  }

  // protected _getVertexElementBySemantic(semantic: string) {
  //   let matchedElement;
  //   for (let i = 0; i < this.declaration.elements.length; i += 1) {
  //     const element = this.declaration.elements[i];
  //     if (element.semantic === semantic) {
  //       matchedElement = element;
  //     }
  //   }
  //   return matchedElement;
  // }

  // protected _getElementInfo(vertexElement: VertexElement) {
  //   const { stride, elementInfo } = vertexElement;
  //   const { size, type } = elementInfo;
  //   return { size, type, stride };
  // }

  // /**
  //  * 获取更新范围
  //  * @param {number} offset 字节偏移
  //  * @param {number} length 字节长度
  //  * @private
  //  */
  // protected _getUpdateRange(vertexAttrib, offset, length) {
  //   const updateRange = vertexAttrib.updateRange;
  //   const rangeEnd1 = updateRange.byteOffset + updateRange.byteLength;
  //   const byteOffset = Math.min(offset, updateRange.byteOffset);
  //   const rangeEnd2 = offset + length;
  //   const byteLength = rangeEnd1 <= rangeEnd2 ? rangeEnd2 - updateRange.byteOffset : rangeEnd1 - updateRange.byteOffset;
  //   return { byteOffset, byteLength, bufferByteOffset: byteOffset };
  // }

  destroy() {
    const gl = this._gl;
    if (this._glBuffer) {
      gl.deleteBuffer(this._glBuffer);
      this._glBuffer = null;
    }
    this._buffer = null;
    this.declaration = null;
  }
}
