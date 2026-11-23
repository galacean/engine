import { BufferBindFlag, BufferUsage, IPlatformBuffer, SetDataOptions } from "@galacean/engine-core";
import type { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";

export class WebGPUBuffer implements IPlatformBuffer {
  readonly supportsSynchronousReadback = false;
  readonly byteLength: number;
  _contentVersion = 0;
  shaderWriteRevision = 0;

  get uniformContentRevision(): number {
    return this._contentVersion;
  }

  _markShaderWrite(): void {
    ++this._contentVersion;
    ++this.shaderWriteRevision;
  }
  _gpuBuffer: GPUBuffer;
  private readonly _allocationSize: number;
  private readonly _usage: GPUBufferUsageFlags;
  private _serial = -1;
  private _usedStart = 0;
  private _usedEnd = 0;
  private _instanceSubmission = -1;
  private _instanceOffset = 0;
  private _expandedIndices?: GPUBuffer;
  private _expandedVersion = -1;
  private _spares?: { buffer: GPUBuffer; submission: number }[];
  private _uniformArrays?: {
    words: number;
    zeroEnd: number;
    version: number;
    starts: WeakMap<GPUBuffer, Uint32Array>;
  };

  constructor(
    private readonly _device: WebGPUGraphicDevice,
    type: BufferBindFlag,
    size: number,
    usage: BufferUsage,
    data?: ArrayBuffer | ArrayBufferView
  ) {
    this.byteLength = size;
    this._allocationSize = Math.max(4, Math.ceil(size / 4) * 4);
    const binding =
      type === BufferBindFlag.ConstantBuffer
        ? GPUBufferUsage.UNIFORM
        : type === BufferBindFlag.IndexBuffer
          ? GPUBufferUsage.INDEX
          : GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.UNIFORM;
    this._usage = binding | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    this._gpuBuffer = this._allocate();
    if (data) this.setData(size, data);
  }

  bind(): void {}

  restartUniformArena(): void {
    // Previous draws in this encoder retain their physical buffer. Untouched
    // bytes in the new cycle cannot be observed and do not need a GPU clear.
    if (this._serial === this._device.submissionSerial) {
      this._rotateBacking();
      this._serial = -1;
    }
  }

  writeUniformArrayRange(offset: number, data: Uint32Array, zeroStart: number, zeroEnd: number): void {
    const alignment = this._device.uniformBufferOffsetAlignment;
    const stride = Math.ceil(data.byteLength / alignment) * alignment;
    const slot = offset / stride;
    if (
      offset < 0 ||
      !Number.isInteger(slot) ||
      offset + data.byteLength > this.byteLength ||
      zeroStart < 0 ||
      zeroEnd < zeroStart ||
      zeroEnd > data.length
    ) {
      throw new RangeError("Invalid uniform array slot or zero range.");
    }
    if (
      this._serial === this._device.submissionSerial &&
      this._usedStart < offset + data.byteLength &&
      offset < this._usedEnd
    ) {
      // A caller that reuses a live slot needs an ordered copy after the earlier draw.
      this.setData(this.byteLength, data, offset);
      return;
    }
    let cache = this._uniformArrays;
    if (!cache || cache.words !== data.length || cache.zeroEnd !== zeroEnd || cache.version !== this._contentVersion) {
      // Other CPU/GPU buffer writes invalidate prior observations, including rotated backings.
      this._uniformArrays = cache = {
        words: data.length,
        zeroEnd,
        version: this._contentVersion,
        starts: new WeakMap()
      };
    }
    const buffer = this._gpuBuffer;
    let starts = cache.starts.get(buffer);
    if (!starts) {
      starts = new Uint32Array(Math.ceil(this.byteLength / stride));
      cache.starts.set(buffer, starts);
    }
    // Zero denotes an unobserved physical slot. Record the confirmed zero start plus one after a successful write.
    const known = starts[slot];
    const prefix = known ? Math.max(zeroStart, known - 1) : zeroEnd;
    const queue = this._device.device.queue;
    starts[slot] = 0;
    if (zeroEnd - prefix < 256) {
      queue.writeBuffer(buffer, offset, data);
    } else {
      if (prefix) queue.writeBuffer(buffer, offset, data, 0, prefix);
      if (zeroEnd < data.length) queue.writeBuffer(buffer, offset + 4 * zeroEnd, data, zeroEnd, data.length - zeroEnd);
    }
    starts[slot] = zeroStart + 1;
    cache.version = ++this._contentVersion;
  }

  writeInstanceData(data: Float32Array, activeWords: number, bindingSize: number): number {
    const serial = this._device.submissionSerial;
    const activeBytes = activeWords * Float32Array.BYTES_PER_ELEMENT;
    if (activeBytes > bindingSize || bindingSize > this.byteLength) {
      throw new RangeError("Instance records exceed the uniform binding size.");
    }
    if (this._instanceSubmission !== serial) {
      this._instanceSubmission = serial;
      this._instanceOffset = 0;
    } else if (this._instanceOffset + bindingSize > this.byteLength) {
      this._rotateBacking();
      this._serial = -1;
      this._instanceOffset = 0;
    }
    const offset = this._instanceOffset;
    // The generated instance block is indexed only by the instance ID of this draw.
    // Later writes can occupy its unused suffix while every active header and record stays intact.
    this._device.device.queue.writeBuffer(this._gpuBuffer, offset, data, 0, activeWords);
    const alignment = this._device.uniformBufferOffsetAlignment;
    this._instanceOffset = offset + Math.ceil(activeBytes / alignment) * alignment;
    this._contentVersion++;
    return offset;
  }

  /** Vertex and index bindings expose the entire allocation to a recorded draw. */
  _useForDraw(): GPUBuffer {
    this._serial = this._device.submissionSerial;
    this._usedStart = 0;
    this._usedEnd = this.byteLength;
    return this._gpuBuffer;
  }

  _markUsed(offset = 0, size = this.byteLength): void {
    const serial = this._device.submissionSerial;
    if (this._serial !== serial) {
      this._serial = serial;
      this._usedStart = offset;
      this._usedEnd = offset + size;
    } else {
      this._usedStart = Math.min(this._usedStart, offset);
      this._usedEnd = Math.max(this._usedEnd, offset + size);
    }
  }

  setData(
    _byteLength: number,
    data: ArrayBuffer | ArrayBufferView,
    offset = 0,
    dataOffset = 0,
    dataLength?: number,
    options = SetDataOptions.None
  ): void {
    const source = WebGPUBuffer._getSourceRange(data, dataOffset, dataLength);
    const end = offset + source.length;
    if (offset < 0 || end > this.byteLength) throw new RangeError("WebGPU buffer write exceeds allocation.");
    const discard = options === SetDataOptions.Discard;
    if (!source.length && !discard) return;
    this._contentVersion++;
    const aligned = Math.floor(offset / 4) * 4;
    const length = Math.ceil(end / 4) * 4 - aligned;
    let initialized = true;
    let orderedWrite = false;
    if (
      this._serial === this._device.submissionSerial &&
      (discard || (this._usedStart < aligned + length && aligned < this._usedEnd))
    ) {
      if (discard || (offset === 0 && end === this.byteLength)) {
        initialized = this._rotateBacking();
        this._serial = -1;
      } else {
        orderedWrite = true;
      }
    }
    if (discard && initialized && (aligned || aligned + length < this._allocationSize)) {
      // bufferData(size) clears untouched bytes. The clears never overlap the immediate queue write.
      const encoder = this._device._getCommandEncoder();
      if (aligned) encoder.clearBuffer(this._gpuBuffer, 0, aligned);
      if (aligned + length < this._allocationSize) encoder.clearBuffer(this._gpuBuffer, aligned + length);
      this._markUsed();
    }
    if (!length) return;
    if (aligned === offset && length === source.length) {
      if (orderedWrite) {
        this._device._writeBufferInOrder(this._gpuBuffer, offset, source);
        this._markUsed(offset, source.length);
      } else this._device.device.queue.writeBuffer(this._gpuBuffer, offset, source);
    } else if (discard || (aligned === offset && end === this.byteLength)) {
      const padded = new Uint8Array(length);
      padded.set(source, offset - aligned);
      if (orderedWrite) {
        this._device._writeBufferInOrder(this._gpuBuffer, aligned, padded);
        this._markUsed(aligned, padded.length);
      } else this._device.device.queue.writeBuffer(this._gpuBuffer, aligned, padded);
    } else {
      const staging = this._device.device.createBuffer({
        size: Math.ceil(source.length / 4) * 4,
        usage: GPUBufferUsage.STORAGE,
        mappedAtCreation: true
      });
      new Uint8Array(staging.getMappedRange()).set(source);
      staging.unmap();
      this._device._copyBytes(staging, this._gpuBuffer, 0, offset, source.length);
      this._device._retireBuffer(staging);
      this._markUsed(aligned, length);
    }
  }

  getData(): never {
    throw new Error("Use getDataAsync() for WebGPU buffer readback.");
  }

  getDataAsync(data: ArrayBufferView, offset = 0, dataOffset = 0, dataLength?: number): Promise<void> {
    let staging: GPUBuffer;
    return new Promise<void>((resolve) => {
      const destination = WebGPUBuffer._getSourceRange(data, dataOffset, dataLength);
      if (offset < 0 || offset + destination.length > this.byteLength)
        throw new RangeError("WebGPU buffer read exceeds allocation.");
      if (!destination.length) {
        resolve();
        return;
      }
      const start = Math.floor(offset / 4) * 4;
      const size = Math.ceil((offset + destination.length - start) / 4) * 4;
      staging = this._device.device.createBuffer({
        size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });
      this._device._getCommandEncoder().copyBufferToBuffer(this._gpuBuffer, start, staging, 0, size);
      this._device.flush();
      resolve(
        staging.mapAsync(GPUMapMode.READ).then(() => {
          destination.set(new Uint8Array(staging.getMappedRange(), offset - start, destination.length));
        })
      );
    }).finally(() => staging?.destroy());
  }

  copyFromBuffer(source: IPlatformBuffer, sourceOffset: number, offset: number, size: number): void {
    const src = source as WebGPUBuffer;
    if (
      sourceOffset < 0 ||
      offset < 0 ||
      size < 0 ||
      sourceOffset + size > src.byteLength ||
      offset + size > this.byteLength
    )
      throw new RangeError("WebGPU buffer copy exceeds allocation.");
    if (!size) return;
    this._contentVersion++;
    if ((sourceOffset | offset | size) & 3 || src === this) {
      let input = src._gpuBuffer,
        start = sourceOffset;
      if (src === this) {
        const aligned = Math.floor(sourceOffset / 4) * 4,
          length = Math.ceil((sourceOffset - aligned + size) / 4) * 4;
        input = this._device.device.createBuffer({
          size: length,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        });
        this._device._getCommandEncoder().copyBufferToBuffer(src._gpuBuffer, aligned, input, 0, length);
        start -= aligned;
        this._device._retireBuffer(input);
      }
      this._device._copyBytes(input, this._gpuBuffer, start, offset, size);
    } else {
      this._device._getCommandEncoder().copyBufferToBuffer(src._gpuBuffer, sourceOffset, this._gpuBuffer, offset, size);
    }
    src._markUsed(sourceOffset, size);
    this._markUsed(offset, size);
  }

  /** Expand external UInt8 indices on the GPU. Only index buffers actually drawn as UInt8 allocate this view. */
  _getUInt16Indices(): GPUBuffer {
    if (this._expandedVersion === this._contentVersion) return this._expandedIndices!;
    this._expandedIndices ??= this._device.device.createBuffer({
      size: this._allocationSize * 2,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.STORAGE
    });
    this._device._expandIndices(this._gpuBuffer, this._expandedIndices, this._allocationSize / 4);
    this._markUsed();
    this._expandedVersion = this._contentVersion;
    return this._expandedIndices;
  }

  destroy(): void {
    this._device._retireBuffer(this._gpuBuffer);
    if (this._expandedIndices) this._device._retireBuffer(this._expandedIndices);
    if (this._spares) {
      for (const spare of this._spares) this._device._retireBuffer(spare.buffer);
      this._spares.length = 0;
    }
  }

  /** After submission, queue writes to a previous backing are ordered after all commands that consumed it. */
  private _rotateBacking(): boolean {
    const spares = (this._spares ??= []);
    const submission = this._device.submissionSerial;
    for (let i = 0; i < spares.length; i++) {
      const spare = spares[i];
      if (spare.submission === submission) continue;
      const previous = this._gpuBuffer;
      this._gpuBuffer = spare.buffer;
      spare.buffer = previous;
      spare.submission = submission;
      return true;
    }
    // Bound idle native memory retained by a single buffer after an unusually large submission.
    if (spares.length < 64 && (spares.length + 1) * this._allocationSize <= 8 * 1024 * 1024) {
      spares.push({ buffer: this._gpuBuffer, submission });
    } else {
      this._device._retireBuffer(this._gpuBuffer);
    }
    this._gpuBuffer = this._allocate();
    return false;
  }

  private _allocate(): GPUBuffer {
    return this._device.device.createBuffer({ size: this._allocationSize, usage: this._usage });
  }

  private static _getSourceRange(
    data: ArrayBuffer | ArrayBufferView,
    dataOffset: number,
    dataLength?: number
  ): Uint8Array {
    if (data instanceof ArrayBuffer) {
      const length = dataLength ?? data.byteLength - dataOffset;
      return new Uint8Array(data, dataOffset, length);
    }

    const bytesPerElement = (data as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
    const byteOffset = data.byteOffset + dataOffset * bytesPerElement;
    const byteLength =
      dataLength === undefined ? data.byteLength - dataOffset * bytesPerElement : dataLength * bytesPerElement;
    return new Uint8Array(data.buffer, byteOffset, byteLength);
  }
}
