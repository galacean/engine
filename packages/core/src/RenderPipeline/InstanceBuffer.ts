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
 * Manages a UBO for GPU instancing, packing per-instance renderer data (ModelMat, Layer, etc.).
 */
export class InstanceBuffer {
  static gpuInstanceMacro = ShaderMacro.getByName("RENDERER_GPU_INSTANCE");

  buffer: Buffer;

  private _engine: Engine;
  private _layout: InstanceBufferLayout;
  private _data: ArrayBuffer;
  private _floatView: Float32Array;
  private _intView: Int32Array;
  private _cursor: number = 0;
  private _maxBlockBytes: number = 0;

  constructor(engine: Engine) {
    this._engine = engine;
  }

  /**
   * Set UBO layout and allocate ring buffer if needed.
   */
  setLayout(layout: InstanceBufferLayout): void {
    this._layout = layout;
    const totalBytes = layout.instanceMaxCount * layout.structSize;
    if (!this._data || totalBytes > this._data.byteLength) {
      this._data = new ArrayBuffer(totalBytes);
      this._floatView = new Float32Array(this._data);
      this._intView = new Int32Array(this._data);
    }
    const supportsRange = typeof this._engine._hardwareRenderer.bindUniformBufferRange === "function";
    const requiredBufferBytes = supportsRange ? Math.max(totalBytes * 8, 512 * 1024) : totalBytes;
    // Only reallocate when GPU ring buffer is too small for a full UBO block
    if (!this.buffer || totalBytes > this._maxBlockBytes || totalBytes > this.buffer.byteLength) {
      this.buffer?.destroy();
      this.buffer = new Buffer(this._engine, BufferBindFlag.ConstantBuffer, requiredBufferBytes, BufferUsage.Dynamic);
      this.buffer.isGCIgnored = true;
      this._maxBlockBytes = totalBytes;
      this._cursor = 0;
    }
  }

  /**
   * Pack renderer data into the ring UBO and upload to GPU, returning the bound byte offset.
   */
  upload(renderers: Renderer[], start: number, count: number): number {
    const { instanceFields, structSize, instanceMaxCount } = this._layout;
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

    const rhi = this._engine._hardwareRenderer;
    if (typeof rhi.bindUniformBufferRange !== "function") {
      this.buffer.setData(floatView, 0, 0, count * elementsPerInstance, SetDataOptions.Discard);
      return 0;
    }

    const blockBytes = instanceMaxCount * structSize;
    if (this._cursor + blockBytes > this.buffer.byteLength) {
      this._cursor = 0;
    }
    const offset = this._cursor;
    // Orphan the ring buffer only on wrap to offset 0; sub-allocations write disjoint ranges.
    const options = offset === 0 ? SetDataOptions.Discard : SetDataOptions.None;
    this.buffer.setData(floatView, offset, 0, count * elementsPerInstance, options);

    const align = rhi.uniformBufferOffsetAlignment || 256;
    const usedBytes = count * structSize;
    this._cursor = offset + Math.ceil(usedBytes / align) * align;
    return offset;
  }

  destroy(): void {
    this.buffer?.destroy();
    this._data = null!;
    this._floatView = null!;
    this._intView = null!;
    this._cursor = 0;
    this._maxBlockBytes = 0;
  }
}
