import { IPlatformPrimitive } from "@oasis-engine/design";
import { RefObject } from "../asset/RefObject";
import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { Shader } from "../shader/Shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderProgram } from "../shader/ShaderProgram";
import { BufferUtil } from "./BufferUtil";
import { IndexFormat } from "./enums/IndexFormat";
import { VertexElementFormat } from "./enums/VertexElementFormat";
import { IndexBufferBinding } from "./IndexBufferBinding";
import { SubPrimitive } from "./SubPrimitive";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";

/**
 * @private
 */
export class Primitive extends RefObject {
  private static _uvMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_UV");
  private static _normalMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_NORMAL");
  private static _tangentMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_TANGENT");
  private static _vertexColorMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_VERTEXCOLOR");
  private static _vertexAlphaMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_VERTEXALPHA");

  /** Primitive name */
  name: string;
  /** Instanced count, disable instanced drawing when set zero */
  instanceCount: number = 0;

  /** @internal */
  _macroCollection: ShaderMacroCollection = new ShaderMacroCollection(); // CM&SS:temp
  _vertexElementMap: object = {};
  _glIndexType: number;
  _platformPrimitive: IPlatformPrimitive;

  private _vertexBufferBindings: VertexBufferBinding[] = [];
  private _indexBufferBinding: IndexBufferBinding = null;
  private _vertexElements: VertexElement[] = [];

  /**
   *
   */
  get vertexBufferBindings(): Readonly<VertexBufferBinding[]> {
    return this._vertexBufferBindings;
  }

  /**
   * Vertex element collection.
   */
  get vertexElements(): Readonly<VertexElement[]> {
    return this._vertexElements;
  }

  /**
   * Index buffer binding.
   */
  get indexBufferBinding(): IndexBufferBinding {
    return this._indexBufferBinding;
  }

  targets: any[] = [];

  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name;
    this._platformPrimitive = this._engine._hardwareRenderer.createPlatformPrimitive(this);
  }

  /**
   * Set vertex buffer binding.
   * @param vertexBuffer - Vertex buffer
   * @param stride - Vertex buffer stride
   * @param firstIndex - Vertex buffer binding index, default is 0
   */
  setVertexBufferBinding(vertexBuffer: Buffer, stride: number, firstIndex?: number): void;

  /**
   * Set vertex buffer binding.
   * @param vertexBufferBinding - Vertex buffer binding
   * @param firstIndex - Vertex buffer binding index, default is 0
   */
  setVertexBufferBinding(vertexBufferBinding: VertexBufferBinding, firstIndex?: number): void;

  setVertexBufferBinding(
    bufferOrBinding: Buffer | VertexBufferBinding,
    strideOrFirstIndex: number = 0,
    firstIndex: number = 0
  ): void {
    let binding = <VertexBufferBinding>bufferOrBinding;
    const isBinding = binding.buffer !== undefined;
    isBinding || (binding = new VertexBufferBinding(<Buffer>bufferOrBinding, strideOrFirstIndex));

    const bindings = this._vertexBufferBindings;
    bindings.length <= firstIndex && (bindings.length = firstIndex + 1);
    this._setVertexBufferBinding(isBinding ? strideOrFirstIndex : firstIndex, binding);
  }

  /**
   * Set vertex buffer binding.
   * @param bufferBindings - Vertex buffer binding collection
   * @param firstIndex - First buffer binding index
   */
  setVertexBufferBindings(bufferBindings: VertexBufferBinding[], firstIndex: number = 0): void {
    const bindings = this._vertexBufferBindings;
    const count = bufferBindings.length;
    const needLength = firstIndex + count;
    bindings.length < needLength && (bindings.length = needLength);
    for (let i = 0; i < count; i++) {
      this._setVertexBufferBinding(firstIndex + i, bufferBindings[i]);
    }
  }

  /**
   * Set index buffer.
   * @param buffer - Index buffer
   * @param format - Index buffer format
   */
  setIndexBufferBinding(buffer: Buffer, format: IndexFormat): void;

  /**
   * Set index buffer.
   * @param bufferBinding - Index buffer binding
   */
  setIndexBufferBinding(bufferBinding: IndexBufferBinding): void;

  setIndexBufferBinding(bufferOrBinding: Buffer | IndexBufferBinding, format?: IndexFormat): void {
    let binding = <IndexBufferBinding>bufferOrBinding;
    const isBinding = binding.buffer !== undefined;
    isBinding || (binding = new IndexBufferBinding(<Buffer>bufferOrBinding, format));
    this._indexBufferBinding = binding;
    this._glIndexType = BufferUtil._getGLIndexType(binding.format);
  }

  /**
   * Set vertex elements.
   * @param elements - Vertex element collection
   */
  setVertexElements(elements: VertexElement[]): void {
    this._clearVertexElements();
    for (let i = 0, n = elements.length; i < n; i++) {
      this._addVertexElement(elements[i]);
    }
  }

  /**
   * @internal
   */
  _draw(shaderProgram: ShaderProgram, subPrimitive: SubPrimitive): void {
    this._platformPrimitive.draw(shaderProgram, subPrimitive);
  }

  /**
   * @override
   */
  _addRefCount(value: number): void {
    super._addRefCount(value);
    const vertexBufferBindings = this._vertexBufferBindings;
    for (let i = 0, n = vertexBufferBindings.length; i < n; i++) {
      vertexBufferBindings[i]._buffer._addRefCount(value);
    }
  }

  /**
   * @override
   * Destroy.
   */
  _onDestroy() {
    this._vertexBufferBindings = null;
    this._indexBufferBinding = null;
    this._vertexElements = null;
    this._vertexElementMap = null;
    this._platformPrimitive.destroy();
  }

  private _clearVertexElements(): void {
    this._vertexElements.length = 0;
    const vertexElementMap = this._vertexElementMap;
    for (var k in vertexElementMap) {
      delete vertexElementMap[k];
    }

    this._macroCollection.disable(Primitive._uvMacro);
    this._macroCollection.disable(Primitive._normalMacro);
    this._macroCollection.disable(Primitive._tangentMacro);
    this._macroCollection.disable(Primitive._vertexColorMacro);
    this._macroCollection.disable(Primitive._vertexAlphaMacro);
  }

  private _addVertexElement(element: VertexElement): void {
    const { semantic, format } = element;
    this._vertexElementMap[semantic] = element;
    this._vertexElements.push(element);

    // init primitive shaderData
    switch (semantic) {
      case "TEXCOORD_0":
        this._macroCollection.enable(Primitive._uvMacro);
        break;
      case "NORMAL":
        this._macroCollection.enable(Primitive._normalMacro);
        break;
      case "TANGENT":
        this._macroCollection.enable(Primitive._tangentMacro);
        break;
      case "COLOR_0":
        this._macroCollection.enable(Primitive._vertexColorMacro);
        if (format === VertexElementFormat.Vector4) this._macroCollection.enable(Primitive._vertexAlphaMacro);
        break;
    }
  }

  private _setVertexBufferBinding(index: number, binding: VertexBufferBinding): void {
    if (this._getRefCount() > 0) {
      const lastBinding = this._vertexBufferBindings[index];
      lastBinding && lastBinding._buffer._addRefCount(-1);
      binding._buffer._addRefCount(1);
    }
    this._vertexBufferBindings[index] = binding;
  }
}
