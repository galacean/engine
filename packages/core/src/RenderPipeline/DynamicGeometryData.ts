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
  _subMesh: SubMesh;
  _vEntry: Entry;
  _indices: number[];

  reset() {
    this._id = -1;
    this._data = null;
    this._subMesh = null;
    this._vEntry = null;
    this._indices = null;
  }

  dispose?(): void {
    this.reset();
  }
}

/**
 * @internal
 */
class Entry implements IPoolElement {
  constructor(
    public start: number = -1,
    public len: number = 0
  ) {}

  dispose?(): void {}
}

/**
 * @internal
 */
export class DynamicGeometryData {
  /** @internal */
  _primitive: Primitive;
  /** @internal */
  _vBuffer: Buffer;
  /** @internal */
  _iBuffer: Buffer;
  /** @internal */
  _vertices: Float32Array;
  /** @internal */
  _indices: Uint16Array;

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
  _vFreeEntries: Entry[] = [];
  /** @internal */
  _entryPool: Pool<Entry> = new Pool(Entry, 10);
  /** @internal */
  _chunkPool: Pool<Chunk> = new Pool(Chunk, 10);
  /** @internal */
  _subMeshPool: Pool<SubMesh> = new Pool(SubMesh, 10);

  constructor(engine: Engine, maxVertexCount: number) {
    const primitive = (this._primitive = new Primitive(engine));
    primitive.isGCIgnored = true;
    // vertex element
    primitive.addVertexElement(new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0));
    primitive.addVertexElement(new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0));
    primitive.addVertexElement(new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0));
    const vertexStride = 36;
    // vertices
    const vertexBuffer = (this._vBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      maxVertexCount * vertexStride,
      BufferUsage.Dynamic
    ));
    vertexBuffer.isGCIgnored = true;
    primitive.vertexBufferBindings.length = 1;
    primitive.setVertexBufferBinding(0, new VertexBufferBinding(vertexBuffer, vertexStride));
    // indices
    const indexBuffer = (this._iBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      maxVertexCount * 8,
      BufferUsage.Dynamic
    ));
    indexBuffer.isGCIgnored = true;
    primitive.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, IndexFormat.UInt16));

    const vertexLen = maxVertexCount * 9;
    const indiceLen = maxVertexCount * 4;
    this._vertices = new Float32Array(vertexLen);
    this._indices = new Uint16Array(indiceLen);
    this._vFreeEntries.push(new Entry(0, vertexLen));
  }

  destroy(): void {
    this._primitive.destroy();
    this._primitive = null;
    this._vBuffer.destroy();
    this._vBuffer = null;
    this._iBuffer.destroy();
    this._iBuffer = null;
    this._vertices = null;
    this._indices = null;
    this._entryPool.dispose();
    this._entryPool = null;
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
    const vEntry = this._allocateEntry(this._vFreeEntries, vertexCount * 9);
    if (vEntry) {
      const chunk = this._chunkPool.alloc();
      chunk._data = this;
      chunk._vEntry = vEntry;
      chunk._subMesh = this._subMeshPool.alloc();
      const { _subMesh: subMesh } = chunk;
      subMesh.topology = MeshTopology.Triangles;
      return chunk;
    }

    return null;
  }

  freeChunk(chunk: Chunk): void {
    this._freeEntry(this._vFreeEntries, chunk._vEntry);
    this._subMeshPool.free(chunk._subMesh);
    chunk.reset();
    this._chunkPool.free(chunk);
  }

  private _allocateEntry(entries: Entry[], needLen: number): Entry | null {
    const { _entryPool: pool } = this;
    for (let i = 0, l = entries.length; i < l; ++i) {
      const entry = entries[i];
      const len = entry.len;
      if (len > needLen) {
        const newEntry = pool.alloc();
        newEntry.start = entry.start;
        newEntry.len = needLen;
        entry.start += needLen;
        entry.len -= needLen;
        return newEntry;
      } else if (len === needLen) {
        entries.splice(i, 1);
        return entry;
      }
    }
    return null;
  }

  private _freeEntry(entries: Entry[], entry: Entry): void {
    const entryLen = entries.length;
    if (entryLen === 0) {
      entries.push(entry);
      return;
    }

    const { _entryPool: pool } = this;
    let preEntry = entry;
    let notMerge = true;
    for (let i = 0; i < entryLen; ++i) {
      const curEntry = entries[i];
      const { start, len } = preEntry;
      const preEnd = start + len;
      const curEnd = curEntry.start + curEntry.len;
      if (preEnd < curEntry.start) {
        notMerge && entries.splice(i, 0, preEntry);
        return;
      } else if (preEnd === curEntry.start) {
        curEntry.start = preEntry.start;
        curEntry.len += preEntry.len;
        pool.free(preEntry);
        preEntry = curEntry;
        notMerge = false;
      } else if (start === curEnd) {
        curEntry.len += preEntry.len;
        pool.free(preEntry);
        preEntry = curEntry;
        notMerge = false;
      } else if (start > curEnd) {
        i + 1 === entryLen && entries.push(preEntry);
      }
    }
  }
}
