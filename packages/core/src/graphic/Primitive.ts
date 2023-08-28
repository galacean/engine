import { IPlatformPrimitive } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { GraphicsResource } from "../asset/GraphicsResource";
import { ShaderProgram } from "../shader/ShaderProgram";
import { BufferUtil } from "./BufferUtil";
import { IndexBufferBinding } from "./IndexBufferBinding";
import { SubPrimitive } from "./SubPrimitive";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";

/**
 * @internal
 * Primitive.
 */
export class Primitive extends GraphicsResource {
  enableVAO: boolean = true;
  instanceCount: number;
  vertexBufferBindings: VertexBufferBinding[] = [];

  /** @internal */
  _vertexElementMap: Record<string, VertexElement> = {};
  /** @internal */
  _glIndexType: number;
  /** @internal */
  _glIndexByteCount: number;
  /** @internal */
  _bufferStructChanged: boolean = false;

  private _vertexElements: VertexElement[] = [];
  private _indexBufferBinding: IndexBufferBinding;
  private _platformPrimitive: IPlatformPrimitive;

  get vertexElements(): VertexElement[] {
    return this._vertexElements;
  }

  get indexBufferBinding(): IndexBufferBinding {
    return this._indexBufferBinding;
  }

  set indexBufferBinding(value: IndexBufferBinding) {
    const lastBinding = this._indexBufferBinding;
    if (lastBinding !== value) {
      this._indexBufferBinding = value;
      if (value) {
        this._glIndexType = BufferUtil._getGLIndexType(value.format);
        this._glIndexByteCount = BufferUtil._getGLIndexByteCount(value.format);
      } else {
        this._glIndexType = undefined;
      }
      this._bufferStructChanged = lastBinding?.buffer !== value?.buffer;
    }
  }

  constructor(engine: Engine) {
    super(engine);
    this._platformPrimitive = engine._hardwareRenderer.createPlatformPrimitive(this);
  }

  addVertexElement(element: VertexElement): void {
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
    const vertexElements = this._vertexElements;
    // Delete the old vertex element
    const vertexElement = vertexElements[index];
    vertexElements.splice(index, 1);
    delete this._vertexElementMap[vertexElement.attribute];
    this._bufferStructChanged = true;
  }

  clearVertexElements(): void {
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
    const vertexElementMap = this._vertexElementMap;
    const vertexElements = this._vertexElements;

    for (let i = length, n = vertexElements.length; i < n; i++) {
      const element = vertexElements[i];
      delete vertexElementMap[element.attribute];
    }
    vertexElements.length = length;
  }

  setVertexBufferBinding(index: number, binding: VertexBufferBinding): void {
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
  setVertexBufferBindings(vertexBufferBindings: VertexBufferBinding[], firstIndex: number = 0): void {
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
    if (referCount > 0) {
      lastBinding?.buffer._addReferCount(-referCount);
      binding?.buffer._addReferCount(referCount);
    }
    this.indexBufferBinding = binding;
  }

  draw(shaderProgram: ShaderProgram, subMesh: SubPrimitive): void {
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
  }

  protected override _onDestroy(): void {
    this._platformPrimitive.destroy();
    this._vertexElementMap = null;
  }
}
