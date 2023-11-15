import { IndexBufferBinding, IndexFormat, Mesh, Buffer, VertexBufferBinding, VertexElement } from "../graphic";

/**
 * BufferMesh.
 */
export class BufferMesh extends Mesh {
  /**
   * Instanced count, disable instanced drawing when set zero.
   */
  get instanceCount(): number {
    return this._primitive.instanceCount;
  }

  set instanceCount(value: number) {
    this._primitive.instanceCount = value;
  }

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
   * Set vertex elements.
   * @param elements - Vertex element collection
   */
  setVertexElements(elements: VertexElement[]): void {
    this._setVertexElements(elements);
  }

  /**
   * Set vertex buffer binding.
   * @param vertexBufferBinding - Vertex buffer binding
   * @param index - Vertex buffer index, the default value is 0
   */
  setVertexBufferBinding(vertexBufferBinding: VertexBufferBinding, index?: number): void;

  /**
   * Set vertex buffer binding.
   * @param vertexBuffer - Vertex buffer
   * @param stride - Vertex buffer data stride
   * @param index - Vertex buffer index, the default value is 0
   */
  setVertexBufferBinding(vertexBuffer: Buffer, stride: number, index?: number): void;

  setVertexBufferBinding(
    bufferOrBinding: Buffer | VertexBufferBinding,
    strideOrFirstIndex: number = 0,
    index: number = 0
  ): void {
    let binding = <VertexBufferBinding>bufferOrBinding;
    const isBinding = binding.buffer !== undefined;
    isBinding || (binding = new VertexBufferBinding(<Buffer>bufferOrBinding, strideOrFirstIndex));

    const bindings = this._primitive.vertexBufferBindings;
    bindings.length <= index && (bindings.length = index + 1);
    this._setVertexBufferBinding(isBinding ? strideOrFirstIndex : index, binding);
  }

  /**
   * Set vertex buffer binding.
   * @param vertexBufferBindings - Vertex buffer binding
   * @param firstIndex - First vertex buffer index, the default value is 0
   */
  setVertexBufferBindings(vertexBufferBindings: VertexBufferBinding[], firstIndex: number = 0): void {
    const bindings = this._primitive.vertexBufferBindings;
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
   * @remarks When bufferBinding is null, it will clear IndexBufferBinding
   */
  setIndexBufferBinding(bufferBinding: IndexBufferBinding | null): void;

  setIndexBufferBinding(bufferOrBinding: Buffer | IndexBufferBinding | null, format?: IndexFormat): void {
    let binding = <IndexBufferBinding>bufferOrBinding;
    if (binding) {
      const isBinding = binding.buffer !== undefined;
      isBinding || (binding = new IndexBufferBinding(<Buffer>bufferOrBinding, format));
    }
    this._setIndexBufferBinding(binding);
  }
}
