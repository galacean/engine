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
 * Manages a UBO for GPU instancing, packing per-instance renderer data (ModelMat, Layer, etc.).
 */
export class InstanceBuffer {
  static gpuInstanceMacro = ShaderMacro.getByName("RENDERER_GPU_INSTANCE");
  private static readonly _matrixWriter = new Std140FieldWriter("mat4");

  buffer: Buffer;

  private _engine: Engine;
  private _layout: InstanceBufferLayout;
  private _rangeBytes: number;
  private _rangeStride: number;
  private _nextOffset = 0;
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
    const totalBytes = (layout.headerBytes ?? 0) + layout.instanceMaxCount * layout.structSize;
    const alignment = this._engine._hardwareRenderer.uniformBufferOffsetAlignment;
    this._rangeBytes = totalBytes;
    this._rangeStride = Math.ceil(totalBytes / alignment) * alignment;
    // Only reallocate when buffer is too small
    if (!this.buffer || totalBytes > this._data.byteLength) {
      this._data = new ArrayBuffer(totalBytes);
      this._floatView = new Float32Array(this._data);
      this._intView = new Int32Array(this._data);
      this.buffer?.destroy();
      this.buffer = new Buffer(this._engine, BufferBindFlag.ConstantBuffer, 2 * this._rangeStride, BufferUsage.Dynamic);
      this.buffer.isGCIgnored = true;
      this._nextOffset = 0;
    }
  }

  /**
   * Pack renderer data into UBO and upload to GPU.
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
    const buffer = this.buffer;
    const platform = buffer._platformBuffer;
    const activeWords = headerBytes / 4 + count * elementsPerInstance;
    let offset: number;
    if (platform.writeInstanceData) {
      offset = platform.writeInstanceData(floatView, activeWords, this._rangeBytes);
    } else {
      const wrap = this._nextOffset + this._rangeBytes > buffer.byteLength;
      offset = wrap ? 0 : this._nextOffset;
      buffer.setData(floatView, offset, 0, activeWords, wrap ? SetDataOptions.Discard : SetDataOptions.None);
      this._nextOffset = offset + this._rangeStride;
    }
    this._engine._hardwareRenderer.bindUniformBufferRange(
      ConstantBufferBindingPoint.RendererInstance,
      platform,
      offset,
      this._rangeBytes
    );
  }

  destroy(): void {
    this.buffer?.destroy();
    this._data = null!;
    this._floatView = null!;
    this._intView = null!;
  }
}
