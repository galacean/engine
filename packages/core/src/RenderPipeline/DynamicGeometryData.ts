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
import { Chunk } from "./Chunk";

/**
 * @internal
 */
export class DynamicGeometryData {
  /** @internal */
  primitive: Primitive;
  /** @internal */
  vertices: Float32Array;
  /** @internal */
  indices: Uint16Array;

  /**
   * @internal
   * The length of _vertices needed to be uploaded.
   * */
  vertexLen = 0;
  /**
   * @internal
   * The length of _indices needed to be uploaded.
   * */
  indexLen = 0;

  /** @internal */
  vertexFreeAreas: Area[] = [];
  /** @internal */
  areaPool: Pool<Area> = new Pool(Area, 10);
  /** @internal */
  chunkPool = new Pool(Chunk, 10);
  /** @internal */
  subMeshPool = new Pool(SubMesh, 10);

  constructor(engine: Engine, maxVertexCount: number) {
    const primitive = (this.primitive = new Primitive(engine));
    primitive.isGCIgnored = true;
    // vertex element
    primitive.addVertexElement(new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0));
    primitive.addVertexElement(new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0));
    primitive.addVertexElement(new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0));
    const vertexStride = 36;
    // vertices
    const vertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      maxVertexCount * vertexStride,
      BufferUsage.Dynamic,
      true
    );
    vertexBuffer.isGCIgnored = true;
    primitive.vertexBufferBindings.length = 1;
    primitive.setVertexBufferBinding(0, new VertexBufferBinding(vertexBuffer, vertexStride));
    // index
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, maxVertexCount * 8, BufferUsage.Dynamic, true);
    indexBuffer.isGCIgnored = true;
    primitive.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, IndexFormat.UInt16));

    this.vertices = new Float32Array(vertexBuffer.data.buffer);
    this.indices = new Uint16Array(indexBuffer.data.buffer);
    this.vertexFreeAreas.push(new Area(0, maxVertexCount * 9));
  }

  destroy(): void {
    this.primitive.destroy();
    this.primitive = null;
    this.vertices = null;
    this.indices = null;
    this.areaPool.dispose();
    this.areaPool = null;
  }

  clear(): void {
    this.vertexLen = this.indexLen = 0;
  }

  uploadBuffer(): void {
    // Set data option use Discard, or will resulted in performance slowdown when open antialias and cross-rendering of 3D and 2D elements.
    // Device: iphone X(16.7.2)、iphone 15 pro max(17.1.1)、iphone XR(17.1.2) etc.
    const primitive = this.primitive;
    primitive.vertexBufferBindings[0].buffer.setData(this.vertices, 0, 0, this.vertexLen, SetDataOptions.Discard);
    primitive.indexBufferBinding.buffer.setData(this.indices, 0, 0, this.indexLen, SetDataOptions.Discard);
  }

  allocateChunk(vertexCount: number): Chunk | null {
    const vArea = this._allocateArea(this.vertexFreeAreas, vertexCount * 9);
    if (vArea) {
      const chunk = this.chunkPool.alloc();
      chunk.data = this;
      chunk.vertexArea = vArea;
      chunk.subMesh = this.subMeshPool.alloc();
      const { subMesh: subMesh } = chunk;
      subMesh.topology = MeshTopology.Triangles;
      return chunk;
    }

    return null;
  }

  freeChunk(chunk: Chunk): void {
    this._freeArea(this.vertexFreeAreas, chunk.vertexArea);
    this.subMeshPool.free(chunk.subMesh);
    this.chunkPool.free(chunk);
  }

  private _allocateArea(entries: Area[], needLen: number): Area | null {
    const { areaPool: pool } = this;
    for (let i = 0, l = entries.length; i < l; ++i) {
      const area = entries[i];
      const len = area.size;
      if (len > needLen) {
        const newArea = pool.alloc();
        newArea.start = area.start;
        newArea.size = needLen;
        area.start += needLen;
        area.size -= needLen;
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

    const { areaPool: pool } = this;
    let preArea = area;
    let notMerge = true;
    for (let i = 0; i < areaLen; ++i) {
      const curArea = areas[i];
      const { start, size: len } = preArea;
      const preEnd = start + len;
      const curEnd = curArea.start + curArea.size;
      if (preEnd < curArea.start) {
        notMerge && areas.splice(i, 0, preArea);
        return;
      } else if (preEnd === curArea.start) {
        curArea.start = preArea.start;
        curArea.size += preArea.size;
        pool.free(preArea);
        preArea = curArea;
        notMerge = false;
      } else if (start === curEnd) {
        curArea.size += preArea.size;
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
export class Area implements IPoolElement {
  constructor(
    public start: number = -1,
    public size: number = 0
  ) {}

  dispose?(): void {}
}
