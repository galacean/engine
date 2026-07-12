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

  constructor(engine: Engine) {
    this._engine = engine;
  }

  /**
   * Set UBO layout and allocate buffer if needed.
   */
  setLayout(layout: InstanceBufferLayout): void {
    this._layout = layout;
    const totalBytes = layout.instanceMaxCount * layout.structSize;
    // Only reallocate when buffer is too small
    if (!this.buffer || totalBytes > this.buffer.byteLength) {
      this._data = new ArrayBuffer(totalBytes);
      this._floatView = new Float32Array(this._data);
      this._intView = new Int32Array(this._data);
      this.buffer?.destroy();
      this.buffer = new Buffer(this._engine, BufferBindFlag.ConstantBuffer, totalBytes, BufferUsage.Dynamic);
      // This buffer is owned by BatcherManager rather than a component reference.
      // ResourceManager.gc() must not reclaim it while the render pipeline is active.
      this.buffer.isGCIgnored = true;
    }
  }

  /**
   * Pack renderer data into UBO and upload to GPU.
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

    this.buffer.setData(floatView, 0, 0, count * elementsPerInstance, SetDataOptions.Discard);
  }

  destroy(): void {
    this.buffer?.destroy();
    this._data = null;
    this._floatView = null;
    this._intView = null;
  }
}
