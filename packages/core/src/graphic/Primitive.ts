import { Engine } from "../Engine";
import { GraphicsResource } from "../asset/GraphicsResource";
import type { IPlatformPrimitive, IPlatformShaderProgram } from "../renderingHardwareInterface";
import { IndexBufferBinding } from "./IndexBufferBinding";
import { SubPrimitive } from "./SubPrimitive";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";
import { VertexElementFormat } from "./enums/VertexElementFormat";
import type { WebGPUShaderInputType } from "@galacean/engine-design";

/**
 * @internal
 * Primitive.
 */
export class Primitive extends GraphicsResource {
  // Independently uploaded meshes frequently use the same vertex input types.
  // Keep one descriptor for those meshes without retaining an unbounded set of user layouts.
  private static _lastShaderInputs?: { key: string; types: Record<string, WebGPUShaderInputType> };
  enableVAO: boolean = true;
  instanceCount: number = 0;
  vertexBufferBindings: (VertexBufferBinding | null)[] = [];

  /** @internal */
  _vertexElementMap: Record<string, VertexElement> = {};
  /** @internal */
  _bufferStructChanged: boolean = false;

  private _vertexElements: VertexElement[] = [];
  private _indexBufferBinding: IndexBufferBinding | null;
  private _platformPrimitive: IPlatformPrimitive;
  private _shaderInputs?: { key: string; types: Record<string, WebGPUShaderInputType> };

  /** @internal WebGPU stage input types depend on integer versus normalized vertex fetch. */
  _getShaderInputs(): { key: string; types: Record<string, WebGPUShaderInputType> } {
    if (this._shaderInputs) return this._shaderInputs;
    const types: Record<string, WebGPUShaderInputType> = Object.create(null);
    const fields: string[] = [];
    for (const element of this._vertexElements) {
      const f = element.format;
      const type =
        f === VertexElementFormat.Byte4 || f === VertexElementFormat.Short2 || f === VertexElementFormat.Short4
          ? "sint"
          : f === VertexElementFormat.UByte4 ||
              f === VertexElementFormat.UShort2 ||
              f === VertexElementFormat.UShort4 ||
              f === VertexElementFormat.UInt4
            ? "uint"
            : "float";
      types[element.attribute] = type;
      fields.push(element.attribute.length + ":" + element.attribute + ":" + type);
    }
    const key = fields.sort().join(",");
    const previous = Primitive._lastShaderInputs;
    return (this._shaderInputs = previous?.key === key ? previous : (Primitive._lastShaderInputs = { key, types }));
  }

  get vertexElements(): VertexElement[] {
    return this._vertexElements;
  }

  get indexBufferBinding(): IndexBufferBinding | null {
    return this._indexBufferBinding;
  }

  constructor(engine: Engine) {
    super(engine);
    this._platformPrimitive = engine._hardwareRenderer.createPlatformPrimitive(this);
  }

  addVertexElement(element: VertexElement): void {
    this._shaderInputs = undefined;
    const vertexElementMap = this._vertexElementMap;
    const vertexElements = this._vertexElements;

    const semantic = element.attribute;
    const oldVertexElement = vertexElementMap[semantic];
    if (oldVertexElement) {
      console.warn(`VertexElement ${semantic} already exists.`);
      vertexElements.splice(vertexElements.indexOf(oldVertexElement), 1);
    }
    vertexElementMap[semantic] = element;
    vertexElements.push(element);
    this._bufferStructChanged = true;
  }

  removeVertexElement(index: number): void {
    this._shaderInputs = undefined;
    const vertexElements = this._vertexElements;
    // Delete the old vertex element
    const vertexElement = vertexElements[index];
    vertexElements.splice(index, 1);
    delete this._vertexElementMap[vertexElement.attribute];
    this._bufferStructChanged = true;
  }

  clearVertexElements(): void {
    this._shaderInputs = undefined;
    this._vertexElements.length = 0;
    const vertexElementMap = this._vertexElementMap;
    for (const k in vertexElementMap) {
      delete vertexElementMap[k];
    }
    this._bufferStructChanged = true;
  }

  /**
   * @remarks should use together with `setVertexElementsLength`
   */
  setVertexElement(index: number, element: VertexElement): void {
    this._shaderInputs = undefined;
    const vertexElementMap = this._vertexElementMap;
    const vertexElements = this._vertexElements;

    // Delete the old vertex element
    const oldVertexElement = vertexElements[index];
    oldVertexElement && delete vertexElementMap[oldVertexElement.attribute];

    vertexElementMap[element.attribute] = element;
    vertexElements[index] = element;
    this._bufferStructChanged = true;
  }

  setVertexElementsLength(length: number): void {
    this._shaderInputs = undefined;
    const vertexElementMap = this._vertexElementMap;
    const vertexElements = this._vertexElements;

    for (let i = length, n = vertexElements.length; i < n; i++) {
      const element = vertexElements[i];
      delete vertexElementMap[element.attribute];
    }
    vertexElements.length = length;
  }

  setVertexBufferBinding(index: number, binding: VertexBufferBinding | null): void {
    const referCount = this._getReferCount();
    const vertexBufferBindings = this.vertexBufferBindings;
    if (referCount > 0) {
      vertexBufferBindings[index]?.buffer._addReferCount(-referCount);
      binding?.buffer._addReferCount(referCount);
    }
    vertexBufferBindings[index] = binding;
    this._bufferStructChanged = true;
  }

  /**
   * Set vertex buffer binding.
   * @param vertexBufferBindings - Vertex buffer binding
   * @param firstIndex - First vertex buffer index, the default value is 0
   */
  setVertexBufferBindings(vertexBufferBindings: (VertexBufferBinding | null)[], firstIndex: number = 0): void {
    const bindings = this.vertexBufferBindings;
    const count = vertexBufferBindings.length;
    const needLength = firstIndex + count;
    bindings.length < needLength && (bindings.length = needLength);
    for (let i = 0; i < count; i++) {
      this.setVertexBufferBinding(firstIndex + i, vertexBufferBindings[i]);
    }
  }

  setIndexBufferBinding(binding: IndexBufferBinding | null): void {
    const lastBinding = this.indexBufferBinding;
    const referCount = this._getReferCount();

    if (lastBinding !== binding) {
      this._indexBufferBinding = binding;
      referCount > 0 && lastBinding?.buffer._addReferCount(-referCount);
      if (referCount > 0) binding?.buffer._addReferCount(referCount);
      this._bufferStructChanged ||= lastBinding?.buffer !== binding?.buffer;
    }
  }

  draw(shaderProgram: IPlatformShaderProgram, subMesh: SubPrimitive): void {
    this._platformPrimitive.draw(shaderProgram, subMesh);
    this._bufferStructChanged = false;
  }

  override _addReferCount(value: number): void {
    super._addReferCount(value);
    const vertexBufferBindings = this.vertexBufferBindings;
    for (let i = 0, n = vertexBufferBindings.length; i < n; i++) {
      vertexBufferBindings[i]?.buffer._addReferCount(value);
    }
    this.indexBufferBinding?._buffer._addReferCount(value);
  }

  override _rebuild(): void {
    this._engine._hardwareRenderer.createPlatformPrimitive(this);
    this._isContentLost = false;
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._platformPrimitive.destroy();
    this._vertexElementMap = null!;
  }
}
