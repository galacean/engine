import { BufferBindFlag, BufferUsage, IPlatformBuffer, SetDataOptions } from "@galacean/engine-core";
import type { WebGLGraphicDevice } from "./WebGLGraphicDevice";

export class GLBuffer implements IPlatformBuffer {
  /** @internal */
  _glBuffer: WebGLBuffer | null;

  private _gl: WebGL2RenderingContext;
  private _glBindTarget: number;
  private _glBufferUsage: number;

  constructor(
    rhi: WebGLGraphicDevice,
    type: BufferBindFlag,
    private _byteLength: number,
    bufferUsage: BufferUsage = BufferUsage.Static,
    data?: ArrayBuffer | ArrayBufferView
  ) {
    const gl = rhi.gl;
    const glBuffer = gl.createBuffer();
    const glBufferUsage = this._getGLBufferUsage(gl, bufferUsage);
    let glBindTarget: number;
    switch (type) {
      case BufferBindFlag.VertexBuffer:
        glBindTarget = gl.ARRAY_BUFFER;
        break;
      case BufferBindFlag.IndexBuffer:
        glBindTarget = gl.ELEMENT_ARRAY_BUFFER;
        break;
      case BufferBindFlag.ConstantBuffer:
        glBindTarget = gl.UNIFORM_BUFFER;
        break;
      case BufferBindFlag.StorageBuffer:
        glBindTarget = gl.COPY_WRITE_BUFFER;
        break;
    }
    this._gl = gl;
    this._glBuffer = glBuffer;
    this._glBufferUsage = glBufferUsage;
    this._glBindTarget = glBindTarget;

    this.bind();

    if (data) {
      gl.bufferData(glBindTarget, data, glBufferUsage);
    } else {
      gl.bufferData(glBindTarget, this._byteLength, glBufferUsage);
    }
    gl.bindBuffer(glBindTarget, null);
  }

  bind(): void {
    this._gl.bindBuffer(this._glBindTarget, this._glBuffer);
  }

  /** @internal A failed native range binding must never direct a write into a different generic buffer. */
  canUploadUniformRange(gl: WebGL2RenderingContext, end: number): boolean {
    return this._gl === gl && !!this._glBuffer && this._glBindTarget === gl.UNIFORM_BUFFER && end <= this._byteLength;
  }

  /** @internal A native bindBufferRange has already bound this buffer to the generic uniform target. */
  uploadBoundUniformRange(offset: number, data: ArrayBufferView, discard?: boolean): void {
    const gl = this._gl;
    if (discard) gl.bufferData(gl.UNIFORM_BUFFER, this._byteLength, this._glBufferUsage);
    gl.bufferSubData(gl.UNIFORM_BUFFER, offset, data);
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
      this._byteLength = byteLength;
    }

    // TypeArray is BYTES_PER_ELEMENT, unTypeArray is 1
    const byteSize = (<Uint8Array>data).BYTES_PER_ELEMENT || 1;
    const dataByteLength =
      dataLength === undefined ? data.byteLength - (dataOffset ?? 0) * byteSize : byteSize * dataLength;
    if (dataByteLength === 0) {
      gl.bindBuffer(glBindTarget, null);
      return;
    }

    if (dataOffset !== 0 || dataByteLength < data.byteLength) {
      const isArrayBufferView = (<ArrayBufferView>data).byteOffset !== undefined;
      if (isArrayBufferView) {
        gl.bufferSubData(
          glBindTarget,
          bufferByteOffset!,
          <ArrayBufferView>data,
          dataOffset!,
          dataByteLength / byteSize
        );
      } else {
        const subData = new Uint8Array(<ArrayBuffer>data, dataOffset! * byteSize, dataByteLength);
        gl.bufferSubData(glBindTarget, bufferByteOffset!, subData);
      }
    } else {
      gl.bufferSubData(glBindTarget, bufferByteOffset!, data);
    }
    gl.bindBuffer(glBindTarget, null);
  }

  getData(data: ArrayBufferView, bufferByteOffset?: number, dataOffset?: number, dataLength?: number): void {
    this.bind();
    this._gl.getBufferSubData(this._glBindTarget, bufferByteOffset!, data, dataOffset, dataLength);
  }

  async getDataAsync(data: ArrayBufferView, offset = 0, dataOffset = 0, dataLength?: number): Promise<void> {
    const gl = this._gl;
    const unit = (data as Uint8Array).BYTES_PER_ELEMENT || 1;
    const length = dataLength === undefined ? data.byteLength - dataOffset * unit : dataLength * unit;
    if (
      offset < 0 ||
      dataOffset < 0 ||
      length < 0 ||
      offset + length > this._byteLength ||
      dataOffset * unit + length > data.byteLength
    ) {
      throw new RangeError("Buffer read exceeds the source or destination range.");
    }
    if (!length) return;
    const staging = gl.createBuffer();
    if (!staging) throw new Error("Unable to allocate a WebGL readback buffer.");
    let fence: WebGLSync | null = null;
    try {
      if (this._glBindTarget === gl.ELEMENT_ARRAY_BUFFER) {
        const previous = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, staging);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previous);
      }
      gl.bindBuffer(gl.COPY_READ_BUFFER, this._glBuffer);
      gl.bindBuffer(gl.COPY_WRITE_BUFFER, staging);
      gl.bufferData(gl.COPY_WRITE_BUFFER, length, gl.STREAM_READ);
      gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, offset, 0, length);
      gl.bindBuffer(gl.COPY_READ_BUFFER, null);
      gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
      fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!fence) throw new Error("Unable to fence a WebGL buffer readback.");
      gl.flush();
      for (;;) {
        const status = gl.clientWaitSync(fence, 0, 0);
        if (status === gl.WAIT_FAILED) throw new Error("WebGL buffer readback failed.");
        if (status !== gl.TIMEOUT_EXPIRED) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      gl.bindBuffer(gl.COPY_READ_BUFFER, staging);
      gl.getBufferSubData(
        gl.COPY_READ_BUFFER,
        0,
        new Uint8Array(data.buffer, data.byteOffset + dataOffset * unit, length)
      );
      gl.bindBuffer(gl.COPY_READ_BUFFER, null);
    } finally {
      gl.deleteSync(fence);
      gl.deleteBuffer(staging);
    }
  }

  copyFromBuffer(srcBuffer: IPlatformBuffer, srcByteOffset: number, dstByteOffset: number, byteLength: number): void {
    const gl = this._gl;
    gl.bindBuffer(gl.COPY_READ_BUFFER, (<GLBuffer>srcBuffer)._glBuffer);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, this._glBuffer);
    gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, srcByteOffset, dstByteOffset, byteLength);
    gl.bindBuffer(gl.COPY_READ_BUFFER, null);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
  }

  destroy(): void {
    this._gl.deleteBuffer(this._glBuffer);
    this._gl = null!;
    this._glBuffer = null!;
  }

  private _getGLBufferUsage(gl: WebGL2RenderingContext, bufferUsage: BufferUsage): number {
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
