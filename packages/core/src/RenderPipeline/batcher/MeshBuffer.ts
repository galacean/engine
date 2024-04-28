import { Engine } from "../../Engine";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  IndexFormat,
  MeshTopology,
  SetDataOptions,
  SubMesh,
  VertexElement,
  VertexElementFormat
} from "../../graphic";
import { BufferMesh } from "../../mesh";
import { IPoolElement, Pool } from "../../utils/Pool";
import { Batcher2D } from "./Batcher2D";

/**
 * @internal
 */
export class MBChunk implements IPoolElement {
  _mbId: number = -1;
  _meshBuffer: MeshBuffer;
  _subMesh: SubMesh;
  _vEntry: Entry;
  _indices: number[];

  reset() {
    this._mbId = -1;
    this._meshBuffer = null;
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
export class MeshBuffer {
  /** @internal */
  _mesh: BufferMesh;
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
  _iFreeEntries: Entry[] = [];
  /** @internal */
  _entryPool: Pool<Entry> = new Pool(Entry, 10);
  /** @internal */
  _chunkPool: Pool<MBChunk> = new Pool(MBChunk, 10);
  /** @internal */
  _subMeshPool: Pool<SubMesh> = new Pool(SubMesh, 10);

  constructor(engine: Engine, maxVertexCount: number = Batcher2D.MAX_VERTEX_COUNT) {
    const mesh = (this._mesh = new BufferMesh(engine));
    mesh.isGCIgnored = true;

    const vertexElements: VertexElement[] = [];
    const vertexStride = this.createVertexElements(vertexElements);
    // vertices
    const vertexBuffer = (this._vBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      maxVertexCount * vertexStride,
      BufferUsage.Dynamic
    ));
    vertexBuffer.isGCIgnored = true;
    // indices
    const indiceBuffer = (this._iBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      maxVertexCount * 8,
      BufferUsage.Dynamic
    ));
    indiceBuffer.isGCIgnored = true;
    mesh.setVertexBufferBinding(vertexBuffer, vertexStride);
    mesh.setIndexBufferBinding(indiceBuffer, IndexFormat.UInt16);
    mesh.setVertexElements(vertexElements);

    const vertexLen = maxVertexCount * 9;
    const indiceLen = maxVertexCount * 4;
    this._vertices = new Float32Array(vertexLen);
    this._indices = new Uint16Array(indiceLen);
    this._vFreeEntries.push(new Entry(0, vertexLen));
    this._iFreeEntries.push(new Entry(0, indiceLen));
  }

  destroy(): void {
    this._mesh.destroy();
    this._mesh = null;
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
    this._mesh.clearSubMesh();
    this._vLen = this._iLen = 0;
  }

  uploadBuffer(): void {
    // Set data option use Discard, or will resulted in performance slowdown when open antialias and cross-rendering of 3D and 2D elements.
    // Device: iphone X(16.7.2)、iphone 15 pro max(17.1.1)、iphone XR(17.1.2) etc.
    this._vBuffer.setData(this._vertices, 0, 0, this._vLen, SetDataOptions.Discard);
    this._iBuffer.setData(this._indices, 0, 0, this._iLen, SetDataOptions.Discard);
  }

  allocateChunk(vertexCount: number): MBChunk | null {
    const vEntry = this._allocateEntry(this._vFreeEntries, vertexCount * 9);
    if (vEntry) {
      const chunk = this._chunkPool.alloc();
      chunk._meshBuffer = this;
      chunk._vEntry = vEntry;
      chunk._subMesh = this._subMeshPool.alloc();
      const { _subMesh: subMesh } = chunk;
      subMesh.topology = MeshTopology.Triangles;
      return chunk;
    }

    return null;
  }

  freeChunk(chunk: MBChunk): void {
    this._freeEntry(this._vFreeEntries, chunk._vEntry);
    this._subMeshPool.free(chunk._subMesh);
    chunk.reset();
    this._chunkPool.free(chunk);
  }

  createVertexElements(vertexElements: VertexElement[]): number {
    vertexElements[0] = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
    vertexElements[1] = new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0);
    vertexElements[2] = new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0);
    return 36;
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
    for (let i = 0; i < entryLen; ++i) {
      const curEntry = entries[i];
      const { start, len } = preEntry;
      const preEnd = start + len;
      const curEnd = curEntry.start + curEntry.len;
      if (preEnd < curEntry.start) {
        entries.splice(i, 0, preEntry);
        return;
      } else if (preEnd === curEntry.start) {
        curEntry.start = preEntry.start;
        curEntry.len += preEntry.len;
        pool.free(preEntry);
        preEntry = curEntry;
      } else if (start === curEnd) {
        curEntry.len += preEntry.len;
        pool.free(preEntry);
        preEntry = curEntry;
      } else if (start > curEnd) {
        entries.splice(i + 1, 0, preEntry);
        preEntry = curEntry;
      }
    }
  }
}
