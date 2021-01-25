import { BoundingBox, Vector3 } from "@oasis-engine/math";
import { EngineObject } from "../base";
import { Engine } from "../Engine";
import { PrimitiveTopology, SubPrimitive } from "../graphic";
import { Buffer } from "../graphic/Buffer";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { Primitive } from "../graphic/Primitive";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";

/**
 * BufferGeometry.
 */
export class BufferGeometry extends EngineObject {
  /** Geometry name */
  name: string;

  /** @internal */
  _primitive: Primitive;

  readonly bounds: BoundingBox = new BoundingBox();
  private _subGeometries: SubPrimitive[] = [];

  /**
   * Vertex buffer binding collection.
   */
  get vertexBufferBindings(): Readonly<VertexBufferBinding[]> {
    return this._primitive.vertexBufferBindings;
  }

  /**
   * Index buffer binding.
   */
  get indexBufferBinding(): IndexBufferBinding {
    return this._primitive.indexBufferBinding;
  }

  /**
   * Vertex element collection.
   */
  get vertexElements(): Readonly<VertexElement[]> {
    return this._primitive.vertexElements;
  }

  /**
   * First sub-geometry. Rendered using the first material. For more details, please refer to the subGeometrys property.
   */
  get subGeometry(): SubPrimitive | null {
    return this._subGeometries[0] || null;
  }

  /**
   * A collection of sub-geometry, each sub-geometry can be rendered with an independent material.
   */
  get subGeometries(): Readonly<SubPrimitive[]> {
    return this._subGeometries;
  }

  /**
   * Instanced count, 0 means disable.
   */
  get instanceCount(): number {
    return this._primitive.instanceCount;
  }

  set instanceCount(count: number) {
    this._primitive.instanceCount = count;
  }

  /**
   * Create buffer geometry.
   * @param engine - Engine
   * @param name - Geometry name
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this._primitive = new Primitive(engine);
    this.name = name;
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
    stride: number = 0,
    firstIndex: number = 0
  ): void {
    this._primitive.setVertexBufferBinding(<Buffer>bufferOrBinding, stride, firstIndex);
  }

  /**
   * Set vertex buffer binding.
   * @param vertexBufferBindings - Vertex buffer binding
   * @param firstIndex - First vertex buffer index, the default value is 0
   */
  setVertexBufferBindings(vertexBufferBindings: VertexBufferBinding[], firstIndex: number = 0): void {
    this._primitive.setVertexBufferBindings(vertexBufferBindings, firstIndex);
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
    this._primitive.setIndexBufferBinding(<Buffer>bufferOrBinding, format);
  }

  /**
   * Set vertex elements.
   * @param elements - Vertex element collection
   */
  setVertexElements(elements: VertexElement[]): void {
    this._primitive.setVertexElements(elements);
  }

  /**
   * Add sub-geometry, each sub-geometry can correspond to an independent material.
   * @param start - Start drawing offset, if the index buffer is set, it means the offset in the index buffer, if not set, it means the offset in the vertex buffer
   * @param count - Drawing count, if the index buffer is set, it means the count in the index buffer, if not set, it means the count in the vertex buffer
   * @param topology - Drawing topology, default is PrimitiveTopology.Triangles
   */
  addSubGeometry(
    start: number,
    count: number,
    topology: PrimitiveTopology = PrimitiveTopology.Triangles
  ): SubPrimitive {
    const subGeometry = new SubPrimitive(start, count, topology);
    this._subGeometries.push(subGeometry);
    return subGeometry;
  }

  /**
   * Remove sub geometry.
   * @param subGeometry - SubGeometry needs to be removed
   */
  removeSubGeometry(subGeometry: SubPrimitive): void {
    const subGeometries = this._subGeometries;
    const index = subGeometries.indexOf(subGeometry);
    if (index !== -1) {
      subGeometries.splice(index, 1);
    }
  }

  /**
   * Clear all sub geometries
   */
  clearSubGeometry(): void {
    this._subGeometries.length = 0;
  }

  /**
   * Destroy.
   */
  destroy(): void {
    if (this._primitive) {
      this._primitive.destroy();
      this._primitive = null;
    }
  }
}
