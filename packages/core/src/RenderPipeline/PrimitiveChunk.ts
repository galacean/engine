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
import { ReturnableObjectPool } from "../utils/ReturnableObjectPool";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";
import { VertexArea } from "./VertexArea";

/**
 * @internal
 */
export class PrimitiveChunk {
  static areaPool = new ReturnableObjectPool(VertexArea, 10);
  static subChunkPool = new ReturnableObjectPool(SubPrimitiveChunk, 10);
  static subMeshPool = new ReturnableObjectPool(SubMesh, 10);

  primitive: Primitive;
  vertices: Float32Array;
  indices: Uint16Array;

  updateVertexStart = Number.MAX_SAFE_INTEGER;
  updateVertexEnd = Number.MIN_SAFE_INTEGER;
  updateIndexLength = 0;

  vertexFreeAreas: Array<VertexArea>;

  private _engine: Engine;
  private _gpuVboSnapshot: Float32Array;
  private _gpuVboValidEnd = 0;
  private _gpuIboSnapshot: Uint16Array;
  private _gpuIboValidEnd = 0;
  private _indexUploadStart = 0;
  private _passIndexStart = 0;
  private _passSubMeshes: SubMesh[] = [];
  private _indexCompacted = false;
  private _lastIndexFrame = -1;
  private _lastIndexRenderCount = -1;

  constructor(engine: Engine, maxVertexCount: number) {
    this._engine = engine;
    const primitive = new Primitive(engine);

    // Vertex elements
    primitive.addVertexElement(new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0));
    primitive.addVertexElement(new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0));
    primitive.addVertexElement(new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0));
    primitive._addReferCount(1);

    // Vertices
    const vertexStride = 36;
    const vertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      maxVertexCount * vertexStride,
      BufferUsage.Dynamic,
      true
    );
    primitive.setVertexBufferBinding(0, new VertexBufferBinding(vertexBuffer, vertexStride));

    // Indices
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, maxVertexCount * 8, BufferUsage.Dynamic, true);
    primitive.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, IndexFormat.UInt16));

    this.primitive = primitive;
    this.vertices = new Float32Array(vertexBuffer.data!.buffer);
    this.indices = new Uint16Array(indexBuffer.data!.buffer);
    this._gpuVboSnapshot = new Float32Array(this.vertices.length);
    this._gpuIboSnapshot = new Uint16Array(this.indices.length);
    this.vertexFreeAreas = [new VertexArea(0, maxVertexCount * 9)];
  }

  /** Resets the per-frame index write cursor once per rendered frame (or per standalone manual camera.render()),
   * compacts the current unuploaded pass to offset 0 when the dead uploaded prefix can be reclaimed,
   * and grows the IBO losslessly only if a single unuploaded pass genuinely exceeds current capacity. */
  prepareIndexAppend(indexCount: number): void {
    const frameCount = this._engine.time.frameCount;
    const renderCount = this._engine._renderCount;
    if (
      frameCount !== this._lastIndexFrame ||
      (!this._engine._frameInProcess && renderCount !== this._lastIndexRenderCount)
    ) {
      this._lastIndexFrame = frameCount;
      this._lastIndexRenderCount = renderCount;
      this.updateIndexLength = 0;
      this._passIndexStart = 0;
      this._passSubMeshes.length = 0;
      this._indexUploadStart = 0;
      this._indexCompacted = false;
    }

    if (this.updateIndexLength + indexCount > this.indices.length) {
      if (this._passIndexStart > 0) {
        const shift = this._passIndexStart;
        const liveLength = this.updateIndexLength - shift;
        if (liveLength > 0) {
          this.indices.copyWithin(0, shift, this.updateIndexLength);
          const subMeshes = this._passSubMeshes;
          const subMeshCount = subMeshes.length;
          if (subMeshCount === 1) {
            subMeshes[0].start -= shift;
          } else if (subMeshCount > 1) {
            const shifted = new Set<SubMesh>();
            for (let i = 0; i < subMeshCount; ++i) {
              const sm = subMeshes[i];
              if (!shifted.has(sm)) {
                shifted.add(sm);
                sm.start -= shift;
              }
            }
          }
        }
        this.updateIndexLength = liveLength;
        this._passIndexStart = 0;
        this._indexUploadStart = 0;
        this._indexCompacted = true;
      }

      const requiredLength = this.updateIndexLength + indexCount;
      if (requiredLength > this.indices.length) {
        this._growIndexBuffer(requiredLength);
      }
    }
  }

  /** Records a SubMesh belonging to the current unuploaded pass so compaction can relocate its start offset. */
  recordPassSubMesh(subMesh: SubMesh): void {
    this._passSubMeshes.push(subMesh);
  }

  private _growIndexBuffer(requiredLength: number): void {
    let newLength = Math.max(this.indices.length, 1);
    while (newLength < requiredLength) {
      newLength *= 2;
    }
    const oldBuffer = this.primitive.indexBufferBinding?.buffer;
    const newBuffer = new Buffer(
      this._engine,
      BufferBindFlag.IndexBuffer,
      newLength * Uint16Array.BYTES_PER_ELEMENT,
      BufferUsage.Dynamic,
      true
    );
    const newIndices = new Uint16Array(newBuffer.data!.buffer);
    if (this.updateIndexLength > 0) {
      newIndices.set(this.indices.subarray(0, this.updateIndexLength), 0);
    }
    this.primitive.setIndexBufferBinding(new IndexBufferBinding(newBuffer, IndexFormat.UInt16));
    oldBuffer?.destroy();
    this.indices = newIndices;
    this._gpuIboSnapshot = new Uint16Array(newLength);
    this._gpuIboValidEnd = 0;
    this._indexUploadStart = 0;
    this._indexCompacted = false;
  }

  allocateSubChunk(vertexCount: number): SubPrimitiveChunk | null {
    const area = this._allocateArea(vertexCount * 9);
    if (area) {
      const subChunk = PrimitiveChunk.subChunkPool.get();
      subChunk.chunk = this;
      subChunk.vertexArea = area;

      const subMesh = PrimitiveChunk.subMeshPool.get();
      subMesh.topology = MeshTopology.Triangles;
      subChunk.subMesh = subMesh;
      return subChunk;
    }

    return null;
  }

  freeSubChunk(subChunk: SubPrimitiveChunk): void {
    this._freeArea(subChunk.vertexArea);
    PrimitiveChunk.subMeshPool.return(subChunk.subMesh);
    PrimitiveChunk.subChunkPool.return(subChunk);
  }

  uploadBuffer(): void {
    // Set data option use Discard when data changes, or will result in performance slowdown when open antialias
    // and cross-rendering of 3D and 2D elements on iOS Metal (iphone X / 15 pro max / XR).
    // When vertices or indices are unchanged since the last GPU upload, skip setData completely (0 orphans, 0 stalls).
    const { primitive, updateVertexStart, updateVertexEnd } = this;
    const vboBuffer = primitive.vertexBufferBindings[0]!.buffer;
    const hasVertexUpdate =
      updateVertexStart !== Number.MAX_SAFE_INTEGER && updateVertexEnd !== Number.MIN_SAFE_INTEGER;
    const vboLost = vboBuffer.isContentLost;
    if (hasVertexUpdate || vboLost) {
      const vertices = this.vertices;
      const vboSnap = this._gpuVboSnapshot;
      const prevVboValidEnd = this._gpuVboValidEnd;
      if (vboLost) {
        this._gpuVboValidEnd = 0;
      }
      const uploadEnd = Math.max(prevVboValidEnd, hasVertexUpdate ? updateVertexEnd : 0);
      let vboDirty = vboLost ? uploadEnd > 0 : updateVertexEnd > this._gpuVboValidEnd;
      if (!vboDirty && hasVertexUpdate) {
        for (let i = updateVertexStart; i < updateVertexEnd; i++) {
          if (vertices[i] !== vboSnap[i]) {
            vboDirty = true;
            break;
          }
        }
      }
      if (vboDirty) {
        vboSnap.set(vertices.subarray(0, uploadEnd), 0);
        vboBuffer.setData(vertices, 0, 0, uploadEnd, SetDataOptions.Discard);
        this._gpuVboValidEnd = uploadEnd;
      }

      this.updateVertexStart = Number.MAX_SAFE_INTEGER;
      this.updateVertexEnd = Number.MIN_SAFE_INTEGER;
    }

    const iboBuffer = primitive.indexBufferBinding!.buffer;
    const iboLost = iboBuffer.isContentLost;
    const indexStart = this._indexUploadStart;
    const indexEnd = this.updateIndexLength;
    if (indexEnd > indexStart || iboLost) {
      const indices = this.indices;
      const iboSnap = this._gpuIboSnapshot;
      const prevIboValidEnd = this._gpuIboValidEnd;
      if (iboLost) {
        this._gpuIboValidEnd = 0;
      }
      const uploadEnd = this._indexCompacted ? indexEnd : Math.max(prevIboValidEnd, indexEnd);
      let iboDirty = iboLost ? uploadEnd > 0 : indexEnd > this._gpuIboValidEnd;
      if (!iboDirty && indexEnd > indexStart) {
        for (let i = indexStart; i < indexEnd; i++) {
          if (indices[i] !== iboSnap[i]) {
            iboDirty = true;
            break;
          }
        }
      }
      if (iboDirty) {
        iboSnap.set(indices.subarray(0, uploadEnd), 0);
        iboBuffer.setData(indices, 0, 0, uploadEnd, SetDataOptions.Discard);
        this._gpuIboValidEnd = uploadEnd;
      }
      this._indexUploadStart = indexEnd;
      this._passIndexStart = indexEnd;
      this._passSubMeshes.length = 0;
      this._indexCompacted = false;
    }
  }

  destroy(): void {
    const vertexBuffer = this.primitive.vertexBufferBindings[0]?.buffer;
    const indexBuffer = this.primitive.indexBufferBinding?.buffer;
    this.primitive._addReferCount(-1);
    this.primitive.destroy();
    vertexBuffer?.destroy();
    indexBuffer?.destroy();
    this.primitive = null!;
    this.vertices = null!;
    this.indices = null!;
    this._gpuVboSnapshot = null!;
    this._gpuIboSnapshot = null!;
    this._passSubMeshes.length = 0;
    this._passSubMeshes = null!;
    this._engine = null!;
  }

  private _allocateArea(needSize: number): VertexArea | null {
    const areas = this.vertexFreeAreas;
    const pool = PrimitiveChunk.areaPool;
    for (let i = 0, n = areas.length; i < n; ++i) {
      const area = areas[i];
      const size = area.size;
      if (size > needSize) {
        const newArea = pool.get();
        newArea.start = area.start;
        newArea.size = needSize;
        area.start += needSize;
        area.size -= needSize;
        return newArea;
      } else if (size === needSize) {
        areas.splice(i, 1);
        return area;
      }
    }
    return null;
  }

  private _freeArea(area: VertexArea): void {
    const { start, size } = area;
    const freeAreas = this.vertexFreeAreas;
    const end = start + size;
    const pool = PrimitiveChunk.areaPool;
    for (let i = 0, areaLen = freeAreas.length; i < areaLen; ++i) {
      const curFreeArea = freeAreas[i];
      const curStart = curFreeArea.start;
      const curEnd = curStart + curFreeArea.size;

      if (end < curStart) {
        // The area to be freed is to the left of the current free area and is not connected
        freeAreas.splice(i, 0, area);
        return;
      } else if (end === curStart) {
        // The area to be freed is to the left of the current free area and is connected
        curFreeArea.start = start;
        curFreeArea.size += size;
        pool.return(area);
        return;
      } else if (start === curEnd) {
        // The area to be freed is to the right of the current free area and is connected
        curFreeArea.size += size;
        pool.return(area);
        const nextIndex = i + 1;
        if (nextIndex < areaLen) {
          const nextFreeArea = freeAreas[nextIndex];
          if (end === nextFreeArea.start) {
            // The cur free area after merge is to the left of the next free area and is connected
            curFreeArea.size += nextFreeArea.size;
            freeAreas.splice(nextIndex, 1);
            pool.return(nextFreeArea);
          }
        }
        return;
      }
    }

    // The area to be freed is to the right of the last free area and is not connected or free areas is empty
    freeAreas.push(area);
  }
}
