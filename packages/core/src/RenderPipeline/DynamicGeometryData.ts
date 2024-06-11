import { Engine } from "../Engine";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  IndexBufferBinding,
  IndexFormat,
  MeshTopology,
  Primitive,
  SetDataOptions,
  SubMesh,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "../graphic";
import { IPoolElement, Pool } from "../utils/Pool";

/**
 * @internal
 */
export class Chunk implements IPoolElement {
  _id = -1;
  _data: DynamicGeometryData;
  _primitive: Primitive;
  _subMesh: SubMesh;
  _indices: number[];

  reset() {
    this._id = -1;
    this._data = null;
    this._subMesh = null;
    this._indices = null;
  }

  dispose?(): void {
    this.reset();
  }
}

/**
 * @internal
 */
export class DynamicGeometryData {
  static POSITION = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
  static TEXCOORD_0 = new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0);
  static COLOR_0 = new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0);

  static createPrimitive(engine: Engine): Primitive {
    const primitive = new Primitive(engine);
    primitive.isGCIgnored = true;
    primitive.addVertexElement(this.POSITION);
    primitive.addVertexElement(this.TEXCOORD_0);
    primitive.addVertexElement(this.COLOR_0);
    primitive.vertexBufferBindings.length = 1;
    return primitive;
  }

  /** @internal */
  _engine: Engine;
  /** @internal */
  _vBuffer: Buffer;
  /** @internal */
  _iBuffer: Buffer;
  /** @internal */
  _vertices: Float32Array;
  /** @internal */
  _indices: Uint16Array;
  /** @internal */
  _indexBufferBinding: IndexBufferBinding;

  /**
   * @internal
   * The length of _vertices needed to be uploaded.
   * */
  _vertexLen = 0;
  /**
   * @internal
   * The length of _indices needed to be uploaded.
   * */
  _indexLen = 0;

  /** @internal */
  _chunkPool = new Pool(Chunk, 10);
  /** @internal */
  _subMeshPool = new Pool(SubMesh, 10);

  constructor(engine: Engine, maxVertexCount: number) {
    this._engine = engine;
    const vertexStride = 36;
    // vertices
    const vertexBuffer = (this._vBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      maxVertexCount * vertexStride,
      BufferUsage.Dynamic,
      true
    ));
    vertexBuffer.isGCIgnored = true;
    // index
    const indexBuffer = (this._iBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      maxVertexCount * 8,
      BufferUsage.Dynamic,
      true
    ));
    indexBuffer.isGCIgnored = true;

    this._vertices = new Float32Array(vertexBuffer.data.buffer);
    this._indices = new Uint16Array(indexBuffer.data.buffer);
    this._indexBufferBinding = new IndexBufferBinding(this._iBuffer, IndexFormat.UInt16);
  }

  destroy(): void {
    this._vBuffer.destroy();
    this._vBuffer = null;
    this._iBuffer.destroy();
    this._iBuffer = null;
    this._vertices = null;
    this._indices = null;
  }

  clear(): void {
    this._vertexLen = this._indexLen = 0;
  }

  uploadBuffer(): void {
    // Set data option use Discard, or will resulted in performance slowdown when open antialias and cross-rendering of 3D and 2D elements.
    // Device: iphone X(16.7.2)、iphone 15 pro max(17.1.1)、iphone XR(17.1.2) etc.
    this._vBuffer.setData(this._vertices, 0, 0, this._vertexLen, SetDataOptions.Discard);
    this._iBuffer.setData(this._indices, 0, 0, this._indexLen, SetDataOptions.Discard);
  }

  allocateChunk(vertexCount: number): Chunk | null {
    const needByte = vertexCount * 36;
    const offset = this._vBuffer.allocate(needByte);
    if (offset !== -1) {
      const chunk = this._chunkPool.alloc();
      chunk._data = this;
      const primitive = (chunk._primitive ||= DynamicGeometryData.createPrimitive(this._engine));
      primitive.setIndexBufferBinding(this._indexBufferBinding);
      const vertexBufferBinding = primitive.vertexBufferBindings[0];
      if (vertexBufferBinding) {
        vertexBufferBinding._offset = offset;
        vertexBufferBinding._size = needByte;
      } else {
        primitive.setVertexBufferBinding(0, new VertexBufferBinding(this._vBuffer, 36, offset, needByte));
      }
      chunk._subMesh = this._subMeshPool.alloc();
      const { _subMesh: subMesh } = chunk;
      subMesh.topology = MeshTopology.Triangles;
      return chunk;
    }

    return null;
  }

  freeChunk(chunk: Chunk): void {
    const { offset, size } = chunk._primitive.vertexBufferBindings[0];
    this._vBuffer.free(offset, size);
    this._subMeshPool.free(chunk._subMesh);
    chunk.reset();
    this._chunkPool.free(chunk);
  }
}
