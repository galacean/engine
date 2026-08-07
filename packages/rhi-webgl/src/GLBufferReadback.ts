import type { IPlatformBuffer, IPlatformBufferReadback } from "@galacean/engine-core";
import type { GLBuffer } from "./GLBuffer";

/**
 * @internal
 */
export class GLBufferReadback implements IPlatformBufferReadback {
  private _gl: WebGL2RenderingContext;
  private _glBuffer: WebGLBuffer;
  private readonly _byteLength: number;
  private _sync: WebGLSync = null;
  private _ready = false;
  private _needsFlush = false;
  private _hasUnreadSubmission = false;
  private _needsStorageReset = false;

  constructor(gl: WebGL2RenderingContext, byteLength: number) {
    const glBuffer = gl.createBuffer();
    if (!glBuffer) {
      throw new Error("Failed to create GPU buffer readback staging buffer.");
    }

    this._gl = gl;
    this._glBuffer = glBuffer;
    this._byteLength = byteLength;
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, glBuffer);
    gl.bufferData(gl.COPY_WRITE_BUFFER, byteLength, gl.STREAM_READ);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
  }

  copyFromBuffer(srcBuffer: IPlatformBuffer, srcByteOffset: number, dstByteOffset: number, byteLength: number): void {
    if (this._sync) {
      throw new Error("Cannot modify a pending GPU buffer readback.");
    }

    const gl = this._gl;
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, this._glBuffer);
    if (this._needsStorageReset) {
      // Orphan canceled unread storage before writing again to preserve the driver's readback shadow copy
      gl.bufferData(gl.COPY_WRITE_BUFFER, this._byteLength, gl.STREAM_READ);
      this._needsStorageReset = false;
    }
    gl.bindBuffer(gl.COPY_READ_BUFFER, (<GLBuffer>srcBuffer)._glBuffer);
    gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, srcByteOffset, dstByteOffset, byteLength);
    gl.bindBuffer(gl.COPY_READ_BUFFER, null);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
  }

  submit(): void {
    if (this._sync) {
      throw new Error("GPU buffer readback has already been submitted.");
    }

    const gl = this._gl;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      throw new Error("Failed to create GPU buffer readback fence.");
    }
    this._sync = sync;
    this._ready = false;
    this._needsFlush = true;
    this._hasUnreadSubmission = true;
  }

  isReady(): boolean {
    const sync = this._sync;
    if (!sync) return true;
    if (this._ready) return true;

    const gl = this._gl;
    // Avoid an unconditional mid-frame flush; the first non-blocking poll guarantees submission
    const flags = this._needsFlush ? gl.SYNC_FLUSH_COMMANDS_BIT : 0;
    this._needsFlush = false;
    const status = gl.clientWaitSync(sync, flags, 0);
    if (status === gl.WAIT_FAILED) {
      throw new Error("GPU buffer readback fence failed.");
    }
    const ready = status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED;
    this._ready = ready;
    return ready;
  }

  getData(data: ArrayBufferView, bufferByteOffset?: number, dataOffset?: number, dataLength?: number): void {
    if (!this._sync || (!this._ready && !this.isReady())) {
      throw new Error("GPU buffer readback is not ready.");
    }

    const gl = this._gl;
    gl.bindBuffer(gl.COPY_READ_BUFFER, this._glBuffer);
    gl.getBufferSubData(gl.COPY_READ_BUFFER, bufferByteOffset, data, dataOffset, dataLength);
    gl.bindBuffer(gl.COPY_READ_BUFFER, null);
    this._hasUnreadSubmission = false;
  }

  reset(): void {
    if (this._sync) {
      this._gl.deleteSync(this._sync);
      this._sync = null;
    }
    this._needsStorageReset ||= this._hasUnreadSubmission;
    this._hasUnreadSubmission = false;
    this._ready = false;
    this._needsFlush = false;
  }

  destroy(): void {
    const gl = this._gl;
    if (!gl) return;

    this.reset();
    gl.deleteBuffer(this._glBuffer);
    this._gl = null;
    this._glBuffer = null;
  }
}
