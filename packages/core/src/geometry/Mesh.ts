import { IPlatformPrimitive } from "@oasis-engine/design/types/renderingHardwareInterface/IPlatformPrimitive";
import { BoundingBox } from "@oasis-engine/math";
import { RefObject } from "../asset/RefObject";
import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferUtil } from "../graphic/BufferUtil";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { PrimitiveTopology } from "../graphic/enums/PrimitiveTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { Shader } from "../shader/Shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderProgram } from "../shader/ShaderProgram";

/**
 * Mesh.
 */
export class Mesh extends RefObject {
  //----------------------temp------------------
  private static _uvMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_UV");
  private static _normalMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_NORMAL");
  private static _tangentMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_TANGENT");
  private static _vertexColorMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_VERTEXCOLOR");
  private static _vertexAlphaMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_VERTEXALPHA");
  /** @internal */
  _macroCollection: ShaderMacroCollection = new ShaderMacroCollection();
  targets: any[] = [];
  //----------------------temp------------------

  /** Name. */
  name: string;
  /** Instanced count, disable instanced drawing when set zero */
  instanceCount: number = 0;
  /** The bounding volume of the mesh. */
  readonly bounds: BoundingBox = new BoundingBox();

  _vertexElementMap: object = {};
  _glIndexType: number;
  _platformPrimitive: IPlatformPrimitive;

  private _vertexBufferBindings: VertexBufferBinding[] = [];
  private _indexBufferBinding: IndexBufferBinding = null;
  private _vertexElements: VertexElement[] = [];
  private _subMeshes: SubPrimitive[] = [];

  /**
   * Vertex buffer binding collection.
   */
  get vertexBufferBindings(): Readonly<VertexBufferBinding[]> {
    return this._vertexBufferBindings;
  }

  /**
   * Index buffer binding.
   */
  get indexBufferBinding(): IndexBufferBinding {
    return this._indexBufferBinding;
  }

  /**
   * Vertex element collection.
   */
  get vertexElements(): Readonly<VertexElement[]> {
    return this._vertexElements;
  }

  /**
   * First sub-geometry. Rendered using the first material. For more details, please refer to the subGeometrys property.
   */
  get subMesh(): SubPrimitive | null {
    return this._subMeshes[0] || null;
  }

  /**
   * A collection of sub-geometry, each sub-geometry can be rendered with an independent material.
   */
  get subMeshes(): Readonly<SubPrimitive[]> {
    return this._subMeshes;
  }

  /**
   * Create buffer geometry.
   * @param engine - Engine
   * @param name - Geometry name
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name;
    this._platformPrimitive = this._engine._hardwareRenderer.createPlatformPrimitive(this);
  }

  /**
   * Set vertex buffer binding.
   * @param vertexBufferBindings - Vertex buffer binding
   * @param firstIndex - First vertex buffer index, the default value is 0
   */
  setVertexBufferBinding(vertexBufferBindings: VertexBufferBinding, firstIndex?: number): void;

  /**
   * Set vertex buffer binding.
   * @param vertexBuffer - Vertex buffer
   * @param stride - Vertex buffer data stride
   * @param firstIndex - First vertex buffer index, the default value is 0
   */
  setVertexBufferBinding(vertexBuffer: Buffer, stride: number, firstIndex?: number): void;

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
   * @param vertexBufferBindings - Vertex buffer binding
   * @param firstIndex - First vertex buffer index, the default value is 0
   */
  setVertexBufferBindings(vertexBufferBindings: VertexBufferBinding[], firstIndex: number = 0): void {
    const bindings = this._vertexBufferBindings;
    const count = vertexBufferBindings.length;
    const needLength = firstIndex + count;
    bindings.length < needLength && (bindings.length = needLength);
    for (let i = 0; i < count; i++) {
      this._setVertexBufferBinding(firstIndex + i, vertexBufferBindings[i]);
    }
  }

  /**
   * Set index buffer binding.
   * @param buffer - Index buffer
   * @param format - Index buffer format
   */
  setIndexBufferBinding(buffer: Buffer, format: IndexFormat): void;

  /**
   * Set index buffer binding.
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
   * Add sub-geometry, each sub-geometry can correspond to an independent material.
   * @param start - Start drawing offset, if the index buffer is set, it means the offset in the index buffer, if not set, it means the offset in the vertex buffer
   * @param count - Drawing count, if the index buffer is set, it means the count in the index buffer, if not set, it means the count in the vertex buffer
   * @param topology - Drawing topology, default is PrimitiveTopology.Triangles
   */
  addSubMesh(start: number, count: number, topology: PrimitiveTopology = PrimitiveTopology.Triangles): SubPrimitive {
    const subGeometry = new SubPrimitive(start, count, topology);
    this._subMeshes.push(subGeometry);
    return subGeometry;
  }

  /**
   * Remove sub geometry.
   * @param subGeometry - SubGeometry needs to be removed
   */
  removeSubMesh(subGeometry: SubPrimitive): void {
    const subGeometries = this._subMeshes;
    const index = subGeometries.indexOf(subGeometry);
    if (index !== -1) {
      subGeometries.splice(index, 1);
    }
  }

  /**
   * Clear all sub geometries
   */
  clearSubMesh(): void {
    this._subMeshes.length = 0;
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

    this._macroCollection.disable(Mesh._uvMacro);
    this._macroCollection.disable(Mesh._normalMacro);
    this._macroCollection.disable(Mesh._tangentMacro);
    this._macroCollection.disable(Mesh._vertexColorMacro);
    this._macroCollection.disable(Mesh._vertexAlphaMacro);
  }

  private _addVertexElement(element: VertexElement): void {
    const { semantic, format } = element;
    this._vertexElementMap[semantic] = element;
    this._vertexElements.push(element);

    // init primitive shaderData
    switch (semantic) {
      case "TEXCOORD_0":
        this._macroCollection.enable(Mesh._uvMacro);
        break;
      case "NORMAL":
        this._macroCollection.enable(Mesh._normalMacro);
        break;
      case "TANGENT":
        this._macroCollection.enable(Mesh._tangentMacro);
        break;
      case "COLOR_0":
        this._macroCollection.enable(Mesh._vertexColorMacro);
        if (format === VertexElementFormat.Vector4) this._macroCollection.enable(Mesh._vertexAlphaMacro);
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
