import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { SetDataOptions } from "../graphic/enums/SetDataOptions";
import { Renderer } from "../Renderer";
import { ShaderData } from "../shader/ShaderData";
import { ConstantBufferBindingPoint } from "../shader/enums/ConstantBufferBindingPoint";
import { ShaderMacro } from "../shader/ShaderMacro";
import { InstanceBufferLayout } from "../shader/ShaderFactory";
import { Std140FieldWriter } from "../shader/Std140FieldWriter";
import type { RenderContext } from "./RenderContext";

/**
 * @internal
 * Manages a rotating pool of UBOs for GPU instancing, packing per-instance renderer data (ModelMat, Layer, etc.).
 * Rotating distinct WebGLBuffers across draws and frames avoids both mid-frame write-after-read stalls and
 * per-draw `gl.bufferData` Discard orphan thrashing on mobile TBDR GPUs.
 */
export class InstanceBuffer {
  static gpuInstanceMacro = ShaderMacro.getByName("RENDERER_GPU_INSTANCE");
  private static readonly _matrixWriter = new Std140FieldWriter("mat4");
  private static readonly _maxPoolSize = 192;
  private static readonly _frameSafetyDistance = 2;

  buffer: Buffer;

  private _engine: Engine;
  private _layout: InstanceBufferLayout;
  private _rangeBytes: number;
  private _rangeStride: number;
  private _nextOffset = 0;
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
    const totalBytes = (layout.headerBytes ?? 0) + layout.instanceMaxCount * layout.structSize;
    this._rangeBytes = totalBytes;
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
  upload(
    renderers: Renderer[],
    start: number,
    count: number,
    context?: RenderContext,
    material?: ShaderData,
    element?: ShaderData
  ): void {
    const { instanceFields, structSize, headerBytes = 0, headerFields } = this._layout;
    const elementsPerInstance = structSize / 4;
    const { _floatView: floatView, _intView: intView } = this;
    const modelMatId = Renderer._worldMatrixProperty._uniqueId;
    const camera = context?.camera.shaderData;
    const scene = context?.camera.scene!.shaderData;
    if (headerFields) {
      const renderer = renderers[start].shaderData;
      for (let i = 0; i < headerFields.length; ++i) {
        const { property, offsetInElements, sceneOnly } = headerFields[i];
        const id = property._uniqueId;
        const value = sceneOnly
          ? scene?._propertyValueMap[id]
          : ShaderData._findValue(id, scene, camera, renderer, material, element, property._groups);
        InstanceBuffer._matrixWriter.write(floatView, offsetInElements, value);
      }
    }

    for (let i = 0; i < count; i++) {
      const renderer = renderers[start + i];
      const baseOffset = headerBytes / 4 + i * elementsPerInstance;

      for (let j = 0, n = instanceFields.length; j < n; j++) {
        const field = instanceFields[j];
        const fieldOffset = baseOffset + field.offsetInElements;
        const propertyId = field.property._uniqueId;

        if (field.worldTransform ?? propertyId === modelMatId) {
          // Instancing skips _updateTransformShaderData; mirror its transform source
          // @ts-ignore — _transformEntity is protected
          field.pack(floatView, fieldOffset, renderer._transformEntity.transform.worldMatrix);
        } else {
          const value = ShaderData._findValue(
            propertyId,
            scene,
            camera,
            renderer.shaderData,
            material,
            element,
            field.property._groups
          );
          if (value != null) {
            field.pack(field.useIntView ? intView : floatView, fieldOffset, value);
          } else {
            const end = baseOffset + (instanceFields[j + 1]?.offsetInElements ?? elementsPerInstance);
            intView.fill(0, fieldOffset, end);
          }
        }
      }
    }

    // Drivers validate the size of the entire declared array, even for a short final segment.
    const activeWords = headerBytes / 4 + count * elementsPerInstance;
    const platform = this.buffer._platformBuffer;
    let offset = 0;
    let boundPlatform = platform;
    if (platform.writeInstanceData) {
      offset = platform.writeInstanceData(floatView, activeWords, this._rangeBytes);
    } else {
      const currentFrame = this._engine.time.frameCount;
      const options = this._acquireSlot(currentFrame);
      this.buffer.setData(floatView, 0, 0, activeWords, options);
      boundPlatform = this.buffer._platformBuffer;
    }
    this._engine._hardwareRenderer.bindUniformBufferRange(
      ConstantBufferBindingPoint.RendererInstance,
      boundPlatform,
      offset,
      this._rangeBytes
    );
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
