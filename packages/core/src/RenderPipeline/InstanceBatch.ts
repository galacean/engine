import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { SetDataOptions } from "../graphic/enums/SetDataOptions";
import { Renderer } from "../Renderer";
import { ShaderBlockProperty } from "../shader/ShaderBlockProperty";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ConstantBufferBindingPoint } from "../shader/enums/ConstantBufferBindingPoint";
import { InstanceLayout, ShaderFactory } from "../shaderlib/ShaderFactory";

/**
 * @internal
 * Manages a UBO for GPU instancing, packing per-instance renderer data (ModelMat, Layer, etc.).
 */
export class InstanceBatch {
  static gpuInstanceMacro = ShaderMacro.getByName("RENDERER_GPU_INSTANCE");

  static readonly uniformBlockBindingMap: Record<number, number> = {
    [ShaderBlockProperty.getByName(ShaderFactory.RENDERER_INSTANCE_BLOCK_NAME)._uniqueId]:
      ConstantBufferBindingPoint.RendererInstance
  };

  buffer: Buffer;

  private _engine: Engine;
  private _layout: InstanceLayout;
  private _data: ArrayBuffer;
  private _floatView: Float32Array;
  private _intView: Int32Array;

  constructor(engine: Engine) {
    this._engine = engine;
  }

  /**
   * Set UBO layout and allocate buffer if needed.
   */
  setLayout(layout: InstanceLayout): void {
    this._layout = layout;
    const totalBytes = layout.instanceMaxCount * layout.structSize;
    // Only reallocate when buffer is too small
    if (!this.buffer || totalBytes > this.buffer.byteLength) {
      this._data = new ArrayBuffer(totalBytes);
      this._floatView = new Float32Array(this._data);
      this._intView = new Int32Array(this._data);
      this.buffer?.destroy();
      this.buffer = new Buffer(this._engine, BufferBindFlag.ConstantBuffer, totalBytes, BufferUsage.Dynamic);
    }
  }

  /**
   * Pack renderer data into UBO and upload to GPU.
   */
  upload(renderers: Renderer[], start: number, count: number): void {
    const layout = this._layout;
    if (!layout) return;
    const { instanceFields: fields, structSize } = layout;
    const elementsPerInstance = structSize / 4;
    const floatView = this._floatView;
    const intView = this._intView;
    const modelMatId = Renderer._worldMatrixProperty._uniqueId;

    for (let i = 0; i < count; i++) {
      const renderer = renderers[start + i];
      const propertyValueMap = renderer.shaderData._propertyValueMap;
      const baseOffset = i * elementsPerInstance;

      for (let j = 0, n = fields.length; j < n; j++) {
        const field = fields[j];
        const fieldOffset = baseOffset + field.offset / 4;
        const propertyId = field.property._uniqueId;

        if (propertyId === modelMatId) {
          // ModelMat must go through getter to trigger Transform lazy update
          field.pack(floatView, fieldOffset, renderer.entity.transform.worldMatrix);
        } else {
          const value = propertyValueMap[propertyId];
          if (value != null) {
            field.pack(field.useIntView ? intView : floatView, fieldOffset, value);
          }
        }
      }
    }

    const uploadElements = count * elementsPerInstance;
    this.buffer.setData(floatView, 0, 0, uploadElements, SetDataOptions.Discard);
  }

  destroy(): void {
    this.buffer?.destroy();
    this._data = null;
    this._floatView = null;
    this._intView = null;
  }
}
