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
import { IPoolElement } from "../utils/ObjectPool";
import { ReturnableObjectPool } from "../utils/ReturnableObjectPool";
import { Chunk } from "./Chunk";

/**
 * @internal
 */
export class DynamicGeometryData {
  primitive: Primitive;
  vertices: Float32Array;
  indices: Uint16Array;

  /** The length of _vertices needed to be uploaded. */
  vertexLen = 0;
  /** The length of _indices needed to be uploaded. */
  indexLen = 0;

  vertexFreeAreas = new Array<Area>();
  areaPool = new ReturnableObjectPool(Area, 10);
  chunkPool = new ReturnableObjectPool(Chunk, 10);
  subMeshPool = new ReturnableObjectPool(SubMesh, 10);

  constructor(engine: Engine, maxVertexCount: number) {
    const primitive = (this.primitive = new Primitive(engine));
    primitive._addReferCount(1);

    // Vertex element
    primitive.addVertexElement(new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0));
    primitive.addVertexElement(new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0));
    primitive.addVertexElement(new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0));
    const vertexStride = 36;

    // Vertices
    const vertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      maxVertexCount * vertexStride,
      BufferUsage.Dynamic,
      true
    );
    primitive.setVertexBufferBinding(0, new VertexBufferBinding(vertexBuffer, vertexStride));

    // Index
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, maxVertexCount * 8, BufferUsage.Dynamic, true);
    primitive.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, IndexFormat.UInt16));

    this.vertices = new Float32Array(vertexBuffer.data.buffer);
    this.indices = new Uint16Array(indexBuffer.data.buffer);
    this.vertexFreeAreas.push(new Area(0, maxVertexCount * 9));
  }

  destroy(): void {
    this.primitive._addReferCount(-1);
    this.primitive.destroy();
    this.primitive = null;
    this.vertices = null;
    this.indices = null;
    this.areaPool.garbageCollection();
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
    const area = this._allocateArea(this.vertexFreeAreas, vertexCount * 9);
    if (area) {
      const chunk = this.chunkPool.get();
      chunk.data = this;
      chunk.vertexArea = area;
      chunk.subMesh = this.subMeshPool.get();
      const { subMesh: subMesh } = chunk;
      subMesh.topology = MeshTopology.Triangles;
      return chunk;
    }

    return null;
  }

  freeChunk(chunk: Chunk): void {
    this._freeArea(this.vertexFreeAreas, chunk.vertexArea);
    this.subMeshPool.return(chunk.subMesh);
    this.chunkPool.return(chunk);
  }

  private _allocateArea(entries: Area[], needSize: number): Area | null {
    const pool = this.areaPool;
    for (let i = 0, n = entries.length; i < n; ++i) {
      const area = entries[i];
      const size = area.size;
      if (size > needSize) {
        const newArea = pool.get();
        newArea.start = area.start;
        newArea.size = needSize;
        area.start += needSize;
        area.size -= needSize;
        return newArea;
      } else if (size === needSize) {
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
      const { start, size } = preArea;
      const preEnd = start + size;
      const curEnd = curArea.start + curArea.size;
      if (preEnd < curArea.start) {
        notMerge && areas.splice(i, 0, preArea);
        return;
      } else if (preEnd === curArea.start) {
        curArea.start = preArea.start;
        curArea.size += preArea.size;
        pool.return(preArea);
        preArea = curArea;
        notMerge = false;
      } else if (start === curEnd) {
        curArea.size += preArea.size;
        pool.return(preArea);
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
    public start: number,
    public size: number
  ) {}

  dispose?(): void {}
}
