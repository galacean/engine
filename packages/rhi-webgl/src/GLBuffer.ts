import { BufferBindFlag, BufferUsage, IPlatformBuffer, SetDataOptions } from "@galacean/engine-core";
import { WebGLExtension } from "./type";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";

export class GLBuffer implements IPlatformBuffer {
  private _gl: (WebGLRenderingContext & WebGLExtension) | WebGL2RenderingContext;
  private _glBindTarget: number;
  private _glBufferUsage: number;
  private _glBuffer: WebGLBuffer;
  private _isWebGL2: boolean;

  constructor(
    rhi: WebGLGraphicDevice,
    type: BufferBindFlag,
    byteLength: number,
    bufferUsage: BufferUsage = BufferUsage.Static,
    data?: ArrayBuffer | ArrayBufferView
  ) {
    const gl = rhi.gl;
    const glBuffer = gl.createBuffer();
    const glBufferUsage = this._getGLBufferUsage(gl, bufferUsage);
    const glBindTarget = type === BufferBindFlag.VertexBuffer ? gl.ARRAY_BUFFER : gl.ELEMENT_ARRAY_BUFFER;

    this._gl = gl;
    this._glBuffer = glBuffer;
    this._glBufferUsage = glBufferUsage;
    this._glBindTarget = glBindTarget;
    this._isWebGL2 = rhi.isWebGL2;

    this.bind();

    if (data) {
      gl.bufferData(glBindTarget, data, glBufferUsage);
    } else {
      gl.bufferData(glBindTarget, byteLength, glBufferUsage);
    }
    gl.bindBuffer(glBindTarget, null);
  }

  bind(): void {
    this._gl.bindBuffer(this._glBindTarget, this._glBuffer);
  }

  setData(
    byteLength: number,
    data: ArrayBuffer | ArrayBufferView,
    bufferByteOffset?: number,
    dataOffset?: number,
    dataLength?: number,
    options?: SetDataOptions
  ): void {
    const gl = this._gl;
    const glBindTarget = this._glBindTarget;

    this.bind();

    if (options === SetDataOptions.Discard) {
      gl.bufferData(glBindTarget, byteLength, this._glBufferUsage);
    }

    // TypeArray is BYTES_PER_ELEMENT, unTypeArray is 1
    const byteSize = (<Uint8Array>data).BYTES_PER_ELEMENT || 1;
    const dataByteLength = dataLength ? byteSize * dataLength : data.byteLength;

    if (dataOffset !== 0 || dataByteLength < data.byteLength) {
      const isArrayBufferView = (<ArrayBufferView>data).byteOffset !== undefined;
      if (this._isWebGL2 && isArrayBufferView) {
        gl.bufferSubData(glBindTarget, bufferByteOffset, <ArrayBufferView>data, dataOffset, dataByteLength / byteSize);
      } else {
        const subData = new Uint8Array(
          isArrayBufferView ? (<ArrayBufferView>data).buffer : <ArrayBuffer>data,
          dataOffset * byteSize,
          dataByteLength
        );
        gl.bufferSubData(glBindTarget, bufferByteOffset, subData);
      }
    } else {
      gl.bufferSubData(glBindTarget, bufferByteOffset, data);
    }
    gl.bindBuffer(glBindTarget, null);
  }

  getData(data: ArrayBufferView, bufferByteOffset?: number, dataOffset?: number, dataLength?: number): void {
    if (this._isWebGL2) {
      const gl = <WebGL2RenderingContext>this._gl;
      this.bind();
      gl.getBufferSubData(this._glBindTarget, bufferByteOffset, data, dataOffset, dataLength);
    } else {
      throw "Buffer is write-only on WebGL1.0 platforms.";
    }
  }

  resize(byteLength: number): void {
    this.bind();
    this._gl.bufferData(this._glBindTarget, byteLength, this._glBufferUsage);
  }

  destroy(): void {
    this._gl.deleteBuffer(this._glBuffer);
    this._gl = null;
    this._glBuffer = null;
  }

  private _getGLBufferUsage(gl: WebGLRenderingContext, bufferUsage: BufferUsage): number {
    switch (bufferUsage) {
      case BufferUsage.Static:
        return gl.STATIC_DRAW;
      case BufferUsage.Dynamic:
        return gl.DYNAMIC_DRAW;
      case BufferUsage.Stream:
        return gl.STREAM_DRAW;
    }
  }
}
