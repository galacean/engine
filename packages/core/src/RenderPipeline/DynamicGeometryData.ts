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
  _id: number = -1;
  _data: DynamicGeometryData;
  _primitive: Primitive;
  _subMesh: SubMesh;
  _vArea: Area;
  _indices: number[];

  reset() {
    this._id = -1;
    this._data = null;
    this._subMesh = null;
    this._vArea = null;
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
  _vLen: number = 0;
  /**
   * @internal
   * The length of _indices needed to be uploaded.
   * */
  _iLen: number = 0;

  /** @internal */
  _vFreeAreas: Area[] = [];
  /** @internal */
  _areaPool: Pool<Area> = new Pool(Area, 10);
  /** @internal */
  _chunkPool: Pool<Chunk> = new Pool(Chunk, 10);
  /** @internal */
  _subMeshPool: Pool<SubMesh> = new Pool(SubMesh, 10);

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
    this._vFreeAreas.push(new Area(0, maxVertexCount * 9));
  }

  destroy(): void {
    this._vBuffer.destroy();
    this._vBuffer = null;
    this._iBuffer.destroy();
    this._iBuffer = null;
    this._vertices = null;
    this._indices = null;
    this._areaPool.dispose();
    this._areaPool = null;
  }

  clear(): void {
    this._vLen = this._iLen = 0;
  }

  uploadBuffer(): void {
    // Set data option use Discard, or will resulted in performance slowdown when open antialias and cross-rendering of 3D and 2D elements.
    // Device: iphone X(16.7.2)、iphone 15 pro max(17.1.1)、iphone XR(17.1.2) etc.
    this._vBuffer.setData(this._vertices, 0, 0, this._vLen, SetDataOptions.Discard);
    this._iBuffer.setData(this._indices, 0, 0, this._iLen, SetDataOptions.Discard);
  }

  allocateChunk(vertexCount: number): Chunk | null {
    const vArea = this._allocateArea(this._vFreeAreas, vertexCount * 9);
    if (vArea) {
      const chunk = this._chunkPool.alloc();
      chunk._data = this;
      chunk._vArea = vArea;
      const primitive = (chunk._primitive ||= DynamicGeometryData.createPrimitive(this._engine));
      primitive.setIndexBufferBinding(this._indexBufferBinding);
      const vertexBufferBinding = primitive.vertexBufferBindings[0];
      if (vertexBufferBinding) {
        vertexBufferBinding._offset = vArea.start;
        vertexBufferBinding._size = vArea.len;
      } else {
        primitive.setVertexBufferBinding(0, new VertexBufferBinding(this._vBuffer, 36, vArea.start, vArea.len));
      }
      chunk._subMesh = this._subMeshPool.alloc();
      const { _subMesh: subMesh } = chunk;
      subMesh.topology = MeshTopology.Triangles;
      return chunk;
    }

    return null;
  }

  freeChunk(chunk: Chunk): void {
    this._freeArea(this._vFreeAreas, chunk._vArea);
    this._subMeshPool.free(chunk._subMesh);
    chunk.reset();
    this._chunkPool.free(chunk);
  }

  private _allocateArea(entries: Area[], needLen: number): Area | null {
    const { _areaPool: pool } = this;
    for (let i = 0, l = entries.length; i < l; ++i) {
      const area = entries[i];
      const len = area.len;
      if (len > needLen) {
        const newArea = pool.alloc();
        newArea.start = area.start;
        newArea.len = needLen;
        area.start += needLen;
        area.len -= needLen;
        return newArea;
      } else if (len === needLen) {
        entries.splice(i, 1);
        return area;
      }
    }
    return null;
  }

  private _freeArea(areas: Area[], area: Area): void {
    const areaLen = areas.length;
    if (areaLen === 0) {
      areas.push(area);
      return;
    }

    const { _areaPool: pool } = this;
    let preArea = area;
    let notMerge = true;
    for (let i = 0; i < areaLen; ++i) {
      const curArea = areas[i];
      const { start, len } = preArea;
      const preEnd = start + len;
      const curEnd = curArea.start + curArea.len;
      if (preEnd < curArea.start) {
        notMerge && areas.splice(i, 0, preArea);
        return;
      } else if (preEnd === curArea.start) {
        curArea.start = preArea.start;
        curArea.len += preArea.len;
        pool.free(preArea);
        preArea = curArea;
        notMerge = false;
      } else if (start === curEnd) {
        curArea.len += preArea.len;
        pool.free(preArea);
        preArea = curArea;
        notMerge = false;
      } else if (start > curEnd) {
        i + 1 === areaLen && areas.push(preArea);
      }
    }
  }
}

/**
 * @internal
 */
class Area implements IPoolElement {
  constructor(
    public start: number = -1,
    public len: number = 0
  ) {}

  dispose?(): void {}
}
