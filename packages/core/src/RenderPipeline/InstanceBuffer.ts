import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { SetDataOptions } from "../graphic/enums/SetDataOptions";
import { Renderer } from "../Renderer";
import { ShaderMacro } from "../shader/ShaderMacro";
import { InstanceBufferLayout } from "../shader/ShaderFactory";

/**
 * @internal
 * Manages a rotating pool of UBOs for GPU instancing, packing per-instance renderer data (ModelMat, Layer, etc.).
 * Rotating distinct WebGLBuffers across draws and frames avoids both mid-frame write-after-read stalls and
 * per-draw `gl.bufferData` Discard orphan thrashing on mobile TBDR GPUs.
 */
export class InstanceBuffer {
  static gpuInstanceMacro = ShaderMacro.getByName("RENDERER_GPU_INSTANCE");
  private static readonly _maxPoolSize = 192;
  private static readonly _frameSafetyDistance = 2;

  buffer: Buffer;

  private _engine: Engine;
  private _layout: InstanceBufferLayout;
  private _data: ArrayBuffer;
  private _floatView: Float32Array;
  private _intView: Int32Array;
  private _requiredBytes: number = 0;
  private _pool: Buffer[] = [];
  private _poolLastFrame: number[] = [];
  private _cursor: number = 0;

  constructor(engine: Engine) {
    this._engine = engine;
  }

  /**
   * Set UBO layout and allocate staging / initial buffer if needed.
   */
  setLayout(layout: InstanceBufferLayout): void {
    this._layout = layout;
    const totalBytes = layout.instanceMaxCount * layout.structSize;
    if (totalBytes > this._requiredBytes) {
      this._requiredBytes = totalBytes;
      this._data = new ArrayBuffer(totalBytes);
      this._floatView = new Float32Array(this._data);
      this._intView = new Int32Array(this._data);
      // Provide a correctly sized buffer immediately without disturbing the age order of the ring.
      if (this._pool.length === 0) {
        const initial = this._createSlotBuffer(totalBytes);
        this._pool.push(initial);
        this._poolLastFrame.push(-InstanceBuffer._frameSafetyDistance);
        this.buffer = initial;
      } else if (!this.buffer || this.buffer.byteLength < totalBytes) {
        const replacement = this._createSlotBuffer(totalBytes);
        const oldest = this._cursor;
        this._pool[oldest].destroy();
        this._pool[oldest] = replacement;
        this._poolLastFrame[oldest] = -InstanceBuffer._frameSafetyDistance;
        this.buffer = replacement;
      }
    }
  }

  /**
   * Pack renderer data into a free UBO slot and upload to GPU.
   * Updates `this.buffer` to the acquired slot before returning so callers bind the exact uploaded buffer.
   */
  upload(renderers: Renderer[], start: number, count: number): void {
    const { instanceFields, structSize } = this._layout;
    const elementsPerInstance = structSize / 4;
    const { _floatView: floatView, _intView: intView } = this;
    const modelMatId = Renderer._worldMatrixProperty._uniqueId;

    for (let i = 0; i < count; i++) {
      const renderer = renderers[start + i];
      const propertyValueMap = renderer.shaderData._propertyValueMap;
      const baseOffset = i * elementsPerInstance;

      for (let j = 0, n = instanceFields.length; j < n; j++) {
        const field = instanceFields[j];
        const fieldOffset = baseOffset + field.offsetInElements;
        const propertyId = field.property._uniqueId;

        if (propertyId === modelMatId) {
          // Instancing skips _updateTransformShaderData; mirror its transform source
          // @ts-ignore — _transformEntity is protected
          field.pack(floatView, fieldOffset, renderer._transformEntity.transform.worldMatrix);
        } else {
          const value = propertyValueMap[propertyId];
          if (value != null) {
            field.pack(field.useIntView ? intView : floatView, fieldOffset, value);
          }
        }
      }
    }

    const currentFrame = this._engine.time.frameCount;
    const options = this._acquireSlot(currentFrame);
    this.buffer.setData(floatView, 0, 0, count * elementsPerInstance, options);
  }

  destroy(): void {
    for (let i = 0, n = this._pool.length; i < n; i++) {
      this._pool[i]?.destroy();
    }
    this._pool.length = 0;
    this._poolLastFrame.length = 0;
    this._cursor = 0;
    this._requiredBytes = 0;
    this.buffer = null!;
    this._data = null!;
    this._floatView = null!;
    this._intView = null!;
  }

  private _createSlotBuffer(byteLength: number): Buffer {
    const buf = new Buffer(this._engine, BufferBindFlag.ConstantBuffer, byteLength, BufferUsage.Dynamic);
    buf.isGCIgnored = true;
    return buf;
  }

  private _acquireSlot(currentFrame: number): SetDataOptions {
    const pool = this._pool;
    const lastFrames = this._poolLastFrame;
    const oldest = this._cursor;
    const requiredBytes = this._requiredBytes;
    const busy = currentFrame - lastFrames[oldest] < InstanceBuffer._frameSafetyDistance;

    if (busy && pool.length < InstanceBuffer._maxPoolSize) {
      const slot = this._createSlotBuffer(requiredBytes);
      // The slot before the oldest is the tail of the logical ring, including after wraparound.
      pool.splice(oldest, 0, slot);
      lastFrames.splice(oldest, 0, currentFrame);
      this._cursor = oldest + 1;
      this.buffer = slot;
      return SetDataOptions.None;
    }

    let slot = pool[oldest];
    let options = busy ? SetDataOptions.Discard : SetDataOptions.None;
    if (slot.byteLength < requiredBytes) {
      const replacement = this._createSlotBuffer(requiredBytes);
      slot.destroy();
      slot = pool[oldest] = replacement;
      options = SetDataOptions.None;
    }
    lastFrames[oldest] = currentFrame;
    this._cursor = (oldest + 1) % pool.length;
    this.buffer = slot;
    return options;
  }
}
