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

  private static readonly _vertexStride = 36;
  // `_maxSlots = _frameSafetyDistance + 1` (4 slots for 3-frame safety):
  // When multiple UICanvases share one chunk in the same frame (UIUtils.renderOverlay), a static
  // Canvas 0 reads the previous frame's active slot (stamping lastFrame = F) before a dynamic
  // Canvas 1 writes a fresh slot (also stamped F). That keeps 2 slots active per frame, so a
  // single dynamic canvas uses 3 slots (0->1->2->0) while multi-canvas uses 4 (0->1->2->3->0)
  // without ever deadlocking into SetDataOptions.Discard. Fits exact 2-bit VAO slot keys (0..15).
  private static readonly _maxSlots = 4;
  private static readonly _frameSafetyDistance = 3;
  private static readonly _minSnapshotCapacity = 64;
  private static readonly _minVboBytes = 4096;
  private static readonly _minIboBytes = 1024;

  primitive: Primitive;
  vertices: Float32Array;
  indices: Uint16Array;

  updateVertexStart = Number.MAX_SAFE_INTEGER;
  updateVertexEnd = Number.MIN_SAFE_INTEGER;
  updateIndexLength = 0;

  vertexFreeAreas: Array<VertexArea>;

  private _engine: Engine;
  private _maxVboByteLength: number;
  private _maxIboByteLength: number;
  private _vboBindings: VertexBufferBinding[];
  private _vboLastFrame: number[];
  private _activeVboSlot = 0;
  private _iboBindings: IndexBufferBinding[];
  private _iboLastFrame: number[];
  private _activeIboSlot = 0;
  private _gpuVboSnapshot: Float32Array | null = null;
  private _gpuVboValidEnd = 0;
  private _gpuIboSnapshot: Uint16Array | null = null;
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

    // CPU staging arrays stay stable across GPU ring-buffer slot rotations; GPU buffers use
    // readable=false and size lazily by power-of-2 active prefix (min 4 KB VBO / 1 KB IBO) so
    // small UI chunks use less VRAM across all 4 ring slots than a single eager 176 KB allocation.
    const vertexStride = PrimitiveChunk._vertexStride;
    this._maxVboByteLength = maxVertexCount * vertexStride;
    this._maxIboByteLength = maxVertexCount * 8;
    this.vertices = new Float32Array(maxVertexCount * 9);
    this.indices = new Uint16Array(maxVertexCount * 4);

    // Start both VBO and IBO rings at 1 tightly-sized slot so static chunks incur minimal VRAM.
    const initialVboBytes = Math.min(PrimitiveChunk._minVboBytes, this._maxVboByteLength);
    const vertexBuffer = this._createGpuBuffer(BufferBindFlag.VertexBuffer, initialVboBytes);
    const vboBinding = new VertexBufferBinding(vertexBuffer, vertexStride);
    this._vboBindings = [vboBinding];
    this._vboLastFrame = [-PrimitiveChunk._frameSafetyDistance];
    primitive.setVertexBufferBinding(0, vboBinding);

    const initialIboBytes = Math.min(PrimitiveChunk._minIboBytes, this._maxIboByteLength);
    const indexBuffer = this._createGpuBuffer(BufferBindFlag.IndexBuffer, initialIboBytes);
    const iboBinding = new IndexBufferBinding(indexBuffer, IndexFormat.UInt16);
    this._iboBindings = [iboBinding];
    this._iboLastFrame = [-PrimitiveChunk._frameSafetyDistance];
    primitive.setIndexBufferBinding(iboBinding);

    this.primitive = primitive;
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
    const newIndices = new Uint16Array(newLength);
    if (this.updateIndexLength > 0) {
      newIndices.set(this.indices.subarray(0, this.updateIndexLength), 0);
    }
    const newMaxByteLength = newLength * Uint16Array.BYTES_PER_ELEMENT;
    const initialGpuBytes = PrimitiveChunk._nextBufferByteLength(
      requiredLength * Uint16Array.BYTES_PER_ELEMENT,
      newMaxByteLength,
      PrimitiveChunk._minIboBytes
    );
    const newBuffer = this._createGpuBuffer(BufferBindFlag.IndexBuffer, initialGpuBytes);
    const newBinding = new IndexBufferBinding(newBuffer, IndexFormat.UInt16);
    const oldBindings = this._iboBindings;

    // Structural rebind clears all VAOs referencing old IBO slots and drops the active old IBO refCount.
    this.primitive.setIndexBufferBinding(newBinding);
    this.primitive._vaoSlotKey = this._activeVboSlot << 2;
    for (let i = 0, n = oldBindings.length; i < n; ++i) {
      oldBindings[i].buffer.destroy();
    }

    this._maxIboByteLength = newMaxByteLength;
    this._iboBindings = [newBinding];
    this._iboLastFrame = [-PrimitiveChunk._frameSafetyDistance];
    this._activeIboSlot = 0;
    this.indices = newIndices;
    this._gpuIboSnapshot = null;
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
    // Rotating 3-frame VBO/IBO ring buffer:
    // - Static frames skip setData completely (0 uploads, 0 orphans) while refreshing the active
    //   slot's last-used frame so an upcoming dynamic frame never overwrites an in-flight buffer.
    // - Dynamic frames acquire a frame-safe slot (currentFrame - lastUsedFrame >= 3, lazily grown
    //   1 -> 2 -> 3) and upload only the active prefix with SetDataOptions.None (gl.bufferSubData),
    //   yielding zero Discard orphans and zero write-after-read stalls on Android TBDR & iOS Metal MSAA.
    // - SetDataOptions.Discard is only used as a safety fallback if >3 uploads occur within 3 frames
    //   (e.g., dense same-frame multi-pass MaskManager loops).
    const primitive = this.primitive;
    const currentFrame = this._engine.time.frameCount;
    let bindingsChanged = false;

    const { updateVertexStart, updateVertexEnd } = this;
    const hasVertexUpdate =
      updateVertexStart !== Number.MAX_SAFE_INTEGER && updateVertexEnd !== Number.MIN_SAFE_INTEGER;
    const activeVbo = this._vboBindings[this._activeVboSlot].buffer;
    const vboLost = activeVbo.isContentLost;
    if (hasVertexUpdate || vboLost) {
      const vertices = this.vertices;
      const prevVboValidEnd = this._gpuVboValidEnd;
      if (vboLost) {
        this._gpuVboValidEnd = 0;
        this._resetSlotFrames(this._vboLastFrame);
        primitive._bufferStructChanged = true;
      }
      const uploadEnd = Math.max(prevVboValidEnd, hasVertexUpdate ? updateVertexEnd : 0);
      let vboSnap = this._gpuVboSnapshot;
      let vboDirty = vboLost ? uploadEnd > 0 : updateVertexEnd > this._gpuVboValidEnd;
      if (!vboDirty && hasVertexUpdate && vboSnap) {
        for (let i = updateVertexStart; i < updateVertexEnd; i++) {
          if (vertices[i] !== vboSnap[i]) {
            vboDirty = true;
            break;
          }
        }
      }
      if (vboDirty) {
        vboSnap = this._ensureVboSnapshot(uploadEnd);
        vboSnap.set(vertices.subarray(0, uploadEnd), 0);
        const requiredBytes = uploadEnd * Float32Array.BYTES_PER_ELEMENT;
        const { slotIndex, needsDiscard } = this._acquireVboSlot(currentFrame, vboLost, requiredBytes);
        const targetVbo = this._vboBindings[slotIndex].buffer;
        if (targetVbo.isContentLost) {
          primitive._bufferStructChanged = true;
        }
        targetVbo.setData(vertices, 0, 0, uploadEnd, needsDiscard ? SetDataOptions.Discard : SetDataOptions.None);
        if (slotIndex !== this._activeVboSlot) {
          this._activeVboSlot = slotIndex;
          bindingsChanged = true;
        }
        this._gpuVboValidEnd = uploadEnd;
      } else if (hasVertexUpdate && this._gpuVboValidEnd > 0) {
        this._vboLastFrame[this._activeVboSlot] = currentFrame;
      }

      this.updateVertexStart = Number.MAX_SAFE_INTEGER;
      this.updateVertexEnd = Number.MIN_SAFE_INTEGER;
    }

    const activeIbo = this._iboBindings[this._activeIboSlot].buffer;
    const iboLost = activeIbo.isContentLost;
    const indexStart = this._indexUploadStart;
    const indexEnd = this.updateIndexLength;
    if (indexEnd > indexStart || iboLost) {
      const indices = this.indices;
      const prevIboValidEnd = this._gpuIboValidEnd;
      if (iboLost) {
        this._gpuIboValidEnd = 0;
        this._resetSlotFrames(this._iboLastFrame);
        primitive._bufferStructChanged = true;
      }
      const uploadEnd = this._indexCompacted ? indexEnd : Math.max(prevIboValidEnd, indexEnd);
      let iboSnap = this._gpuIboSnapshot;
      let iboDirty = iboLost ? uploadEnd > 0 : indexEnd > this._gpuIboValidEnd;
      if (!iboDirty && indexEnd > indexStart && iboSnap) {
        for (let i = indexStart; i < indexEnd; i++) {
          if (indices[i] !== iboSnap[i]) {
            iboDirty = true;
            break;
          }
        }
      }
      if (iboDirty) {
        iboSnap = this._ensureIboSnapshot(uploadEnd);
        iboSnap.set(indices.subarray(0, uploadEnd), 0);
        const requiredBytes = uploadEnd * Uint16Array.BYTES_PER_ELEMENT;
        const { slotIndex, needsDiscard } = this._acquireIboSlot(currentFrame, iboLost, requiredBytes);
        const targetIbo = this._iboBindings[slotIndex].buffer;
        if (targetIbo.isContentLost) {
          primitive._bufferStructChanged = true;
        }
        targetIbo.setData(indices, 0, 0, uploadEnd, needsDiscard ? SetDataOptions.Discard : SetDataOptions.None);
        if (slotIndex !== this._activeIboSlot) {
          this._activeIboSlot = slotIndex;
          bindingsChanged = true;
        }
        this._gpuIboValidEnd = uploadEnd;
      } else if (indexEnd > indexStart && this._gpuIboValidEnd > 0) {
        this._iboLastFrame[this._activeIboSlot] = currentFrame;
      }
      this._indexUploadStart = indexEnd;
      this._passIndexStart = indexEnd;
      this._passSubMeshes.length = 0;
      this._indexCompacted = false;
    }

    if (bindingsChanged) {
      primitive._swapRingBufferBindings(
        this._vboBindings[this._activeVboSlot],
        this._iboBindings[this._activeIboSlot],
        (this._activeVboSlot << 2) | this._activeIboSlot
      );
    }
  }

  destroy(): void {
    const vboBindings = this._vboBindings;
    const iboBindings = this._iboBindings;
    this.primitive._addReferCount(-1);
    this.primitive.destroy();
    for (let i = 0, n = vboBindings.length; i < n; ++i) {
      vboBindings[i].buffer.destroy();
    }
    for (let i = 0, n = iboBindings.length; i < n; ++i) {
      iboBindings[i].buffer.destroy();
    }
    this._vboBindings = null!;
    this._vboLastFrame = null!;
    this._iboBindings = null!;
    this._iboLastFrame = null!;
    this.primitive = null!;
    this.vertices = null!;
    this.indices = null!;
    this._gpuVboSnapshot = null;
    this._gpuIboSnapshot = null;
    this._passSubMeshes.length = 0;
    this._passSubMeshes = null!;
    this._engine = null!;
  }

  private _createGpuBuffer(bindFlag: BufferBindFlag, byteLength: number): Buffer {
    const buffer = new Buffer(this._engine, bindFlag, byteLength, BufferUsage.Dynamic, false);
    // Ring slots not currently bound to `this.primitive` have refCount=0; keep them owned by the chunk.
    buffer.isGCIgnored = true;
    return buffer;
  }

  private _resetSlotFrames(lastFrames: number[]): void {
    const sentinel = -PrimitiveChunk._frameSafetyDistance;
    for (let i = 0, n = lastFrames.length; i < n; ++i) {
      lastFrames[i] = sentinel;
    }
  }

  private _ensureVboSnapshot(requiredLength: number): Float32Array {
    let snap = this._gpuVboSnapshot;
    if (!snap || snap.length < requiredLength) {
      const cap = PrimitiveChunk._nextSnapshotCapacity(requiredLength, this.vertices.length);
      snap = new Float32Array(cap);
      this._gpuVboSnapshot = snap;
    }
    return snap;
  }

  private _ensureIboSnapshot(requiredLength: number): Uint16Array {
    let snap = this._gpuIboSnapshot;
    if (!snap || snap.length < requiredLength) {
      const cap = PrimitiveChunk._nextSnapshotCapacity(requiredLength, this.indices.length);
      snap = new Uint16Array(cap);
      this._gpuIboSnapshot = snap;
    }
    return snap;
  }

  private static _nextSnapshotCapacity(requiredLength: number, maxLength: number): number {
    let cap = PrimitiveChunk._minSnapshotCapacity;
    while (cap < requiredLength) {
      cap *= 2;
    }
    return Math.min(cap, maxLength);
  }

  private static _nextBufferByteLength(requiredBytes: number, maxBytes: number, minBytes: number): number {
    let cap = Math.min(minBytes, maxBytes);
    while (cap < requiredBytes && cap < maxBytes) {
      cap *= 2;
    }
    return Math.min(cap, maxBytes);
  }

  private _ensureVboSlotCapacity(slotIndex: number, requiredBytes: number): boolean {
    const bindings = this._vboBindings;
    const oldBinding = bindings[slotIndex];
    if (oldBinding.buffer.byteLength >= requiredBytes) {
      return false;
    }
    const nextBytes = PrimitiveChunk._nextBufferByteLength(
      requiredBytes,
      this._maxVboByteLength,
      PrimitiveChunk._minVboBytes
    );
    const newBuffer = this._createGpuBuffer(BufferBindFlag.VertexBuffer, nextBytes);
    const newBinding = new VertexBufferBinding(newBuffer, PrimitiveChunk._vertexStride);
    bindings[slotIndex] = newBinding;
    if (slotIndex === this._activeVboSlot) {
      this.primitive.setVertexBufferBinding(0, newBinding);
    } else {
      this.primitive._bufferStructChanged = true;
    }
    oldBinding.buffer.destroy();
    return true;
  }

  private _ensureIboSlotCapacity(slotIndex: number, requiredBytes: number): boolean {
    const bindings = this._iboBindings;
    const oldBinding = bindings[slotIndex];
    if (oldBinding.buffer.byteLength >= requiredBytes) {
      return false;
    }
    const nextBytes = PrimitiveChunk._nextBufferByteLength(
      requiredBytes,
      this._maxIboByteLength,
      PrimitiveChunk._minIboBytes
    );
    const newBuffer = this._createGpuBuffer(BufferBindFlag.IndexBuffer, nextBytes);
    const newBinding = new IndexBufferBinding(newBuffer, IndexFormat.UInt16);
    bindings[slotIndex] = newBinding;
    if (slotIndex === this._activeIboSlot) {
      this.primitive.setIndexBufferBinding(newBinding);
    } else {
      this.primitive._bufferStructChanged = true;
    }
    oldBinding.buffer.destroy();
    return true;
  }

  private _acquireVboSlot(
    currentFrame: number,
    preferActive: boolean,
    requiredBytes: number
  ): { slotIndex: number; needsDiscard: boolean } {
    const bindings = this._vboBindings;
    const lastFrames = this._vboLastFrame;
    const len = bindings.length;
    const safeDelta = PrimitiveChunk._frameSafetyDistance;
    const startOffset = preferActive ? 0 : 1;

    for (let step = 0; step < len; step++) {
      const idx = (this._activeVboSlot + startOffset + step) % len;
      if (currentFrame - lastFrames[idx] >= safeDelta) {
        this._ensureVboSlotCapacity(idx, requiredBytes);
        lastFrames[idx] = currentFrame;
        return { slotIndex: idx, needsDiscard: false };
      }
    }

    if (len < PrimitiveChunk._maxSlots) {
      const slotBytes = PrimitiveChunk._nextBufferByteLength(
        requiredBytes,
        this._maxVboByteLength,
        PrimitiveChunk._minVboBytes
      );
      const buffer = this._createGpuBuffer(BufferBindFlag.VertexBuffer, slotBytes);
      bindings.push(new VertexBufferBinding(buffer, PrimitiveChunk._vertexStride));
      lastFrames.push(currentFrame);
      return { slotIndex: len, needsDiscard: false };
    }

    const idx = (this._activeVboSlot + 1) % len;
    const resized = this._ensureVboSlotCapacity(idx, requiredBytes);
    const needsDiscard = !resized && currentFrame - lastFrames[idx] < safeDelta;
    lastFrames[idx] = currentFrame;
    return { slotIndex: idx, needsDiscard };
  }

  private _acquireIboSlot(
    currentFrame: number,
    preferActive: boolean,
    requiredBytes: number
  ): { slotIndex: number; needsDiscard: boolean } {
    const bindings = this._iboBindings;
    const lastFrames = this._iboLastFrame;
    const len = bindings.length;
    const safeDelta = PrimitiveChunk._frameSafetyDistance;
    const startOffset = preferActive ? 0 : 1;

    for (let step = 0; step < len; step++) {
      const idx = (this._activeIboSlot + startOffset + step) % len;
      if (currentFrame - lastFrames[idx] >= safeDelta) {
        this._ensureIboSlotCapacity(idx, requiredBytes);
        lastFrames[idx] = currentFrame;
        return { slotIndex: idx, needsDiscard: false };
      }
    }

    if (len < PrimitiveChunk._maxSlots) {
      const slotBytes = PrimitiveChunk._nextBufferByteLength(
        requiredBytes,
        this._maxIboByteLength,
        PrimitiveChunk._minIboBytes
      );
      const buffer = this._createGpuBuffer(BufferBindFlag.IndexBuffer, slotBytes);
      bindings.push(new IndexBufferBinding(buffer, IndexFormat.UInt16));
      lastFrames.push(currentFrame);
      return { slotIndex: len, needsDiscard: false };
    }

    const idx = (this._activeIboSlot + 1) % len;
    const resized = this._ensureIboSlotCapacity(idx, requiredBytes);
    const needsDiscard = !resized && currentFrame - lastFrames[idx] < safeDelta;
    lastFrames[idx] = currentFrame;
    return { slotIndex: idx, needsDiscard };
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
