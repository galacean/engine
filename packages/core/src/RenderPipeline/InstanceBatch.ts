import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { SetDataOptions } from "../graphic/enums/SetDataOptions";
import { Renderer } from "../Renderer";
import { ShaderBlockProperty } from "../shader/ShaderBlockProperty";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ConstantBufferBindingPoint } from "../shader/enums/ConstantBufferBindingPoint";
import { InstanceFieldInfo, ShaderFactory } from "../shaderlib/ShaderFactory";

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

  instanceFields: InstanceFieldInfo[];
  nativeBuffer: Buffer;

  private _engine: Engine;
  private _uboData: ArrayBuffer;
  private _floatView: Float32Array;
  private _intView: Int32Array;
  private _structSize = 0;

  constructor(engine: Engine) {
    this._engine = engine;
  }

  /**
   * Set UBO layout and allocate buffer if needed.
   */
  setLayout(instanceFields: InstanceFieldInfo[], maxInstanceCount: number, structSize: number): void {
    this.instanceFields = instanceFields;
    this._structSize = structSize;
    const totalBytes = maxInstanceCount * structSize;
    // Only reallocate when buffer is too small
    if (!this.nativeBuffer || totalBytes > this.nativeBuffer.byteLength) {
      this._uboData = new ArrayBuffer(totalBytes);
      this._floatView = new Float32Array(this._uboData);
      this._intView = new Int32Array(this._uboData);
      this.nativeBuffer?.destroy();
      this.nativeBuffer = new Buffer(this._engine, BufferBindFlag.ConstantBuffer, totalBytes, BufferUsage.Dynamic);
    }
  }

  /**
   * Pack renderer data into UBO and upload to GPU.
   */
  upload(renderers: Renderer[], start: number, count: number): void {
    const fields = this.instanceFields;
    if (!fields) return;
    const structSize = this._structSize;
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
    this.nativeBuffer.setData(floatView, 0, 0, uploadElements, SetDataOptions.Discard);
  }

  destroy(): void {
    this.nativeBuffer?.destroy();
    this._uboData = null;
    this._floatView = null;
    this._intView = null;
  }
}
