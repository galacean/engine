import { SpriteMaskInteraction, SpriteRenderer } from "../../2d";
import { Engine } from "../../Engine";
import { ShaderTagKey } from "../../shader";
import { RenderElement } from "../RenderElement";
import { SpriteRenderData } from "../SpriteRenderData";
import { MBChunk, MeshBuffer } from "./MeshBuffer";

/**
 * @internal
 */
export class Batcher2D {
  /** The maximum number of vertex. */
  static MAX_VERTEX_COUNT: number = 4096;

  protected static _disableBatchTag: ShaderTagKey = ShaderTagKey.getByName("spriteDisableBatching");

  /** @internal */
  _engine: Engine;

  /** @internal */
  _meshBuffers: MeshBuffer[] = [];
  /** @internal */
  _maxVertexCount: number;
  /** @internal */
  _preElement: RenderElement = null;

  constructor(engine: Engine, maxVertexCount: number = Batcher2D.MAX_VERTEX_COUNT) {
    this._engine = engine;
    this._maxVertexCount = maxVertexCount;
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {
    const { _meshBuffers } = this;
    for (let i = 0, l = _meshBuffers.length; i < l; ++i) {
      _meshBuffers[i].destroy();
    }
    _meshBuffers.length = 0;
    this._meshBuffers = null;
    this._engine = null;
    this._preElement = null;
  }

  commitRenderElement(element: RenderElement): RenderElement | null {
    const { _preElement: preElement } = this;
    let batchElement = null;
    if (preElement) {
      if (this._canBatch(preElement, element)) {
        this._udpateRenderData(preElement, element, true);
      } else {
        batchElement = this._preElement;
        this._udpateRenderData(preElement, element, false);
      }
    } else {
      this._udpateRenderData(preElement, element, false);
    }

    return batchElement;
  }

  uploadBuffer(): void {
    const { _meshBuffers: meshBuffers } = this;
    for (let i = 0, l = meshBuffers.length; i < l; ++i) {
      meshBuffers[i].uploadBuffer();
    }
  }

  clear() {
    this._reset();
    const { _meshBuffers: meshBuffers } = this;
    for (let i = 0, l = meshBuffers.length; i < l; ++i) {
      meshBuffers[i].clear();
    }
  }

  allocateChunk(vertexCount: number): MBChunk | null {
    const { _meshBuffers } = this;
    const len = _meshBuffers.length;
    let chunk: MBChunk = null;
    for (let i = 0; i < len; ++i) {
      chunk = _meshBuffers[i].allocateChunk(vertexCount);
      if (chunk) {
        chunk._mbId = i;
        return chunk;
      }
    }

    const meshBuffer = this._createMeshBuffer(len, this._maxVertexCount);
    chunk = meshBuffer.allocateChunk(vertexCount);
    chunk._mbId = len;
    return chunk;
  }

  freeChunk(chunk: MBChunk): void {
    const meshBuffer = this._meshBuffers[chunk._mbId];
    meshBuffer && meshBuffer.freeChunk(chunk);
  }

  protected _createMeshBuffer(index: number, maxVertexCount: number = Batcher2D.MAX_VERTEX_COUNT): MeshBuffer {
    return (this._meshBuffers[index] ||= new MeshBuffer(this._engine, maxVertexCount));
  }

  private _canBatch(preElement: RenderElement, cureElement: RenderElement): boolean {
    const preRenderData = <SpriteRenderData>preElement.data;
    const curRenderData = <SpriteRenderData>cureElement.data;
    if (preRenderData.chunk._meshBuffer !== curRenderData.chunk._meshBuffer) {
      return false;
    }

    const preRender = <SpriteRenderer>preRenderData.component;
    const curRender = <SpriteRenderer>curRenderData.component;

    // Compare mask.
    if (!this._checkBatchWithMask(preRender, curRender)) {
      return false;
    }

    // Compare texture.
    if (preRenderData.texture !== curRenderData.texture) {
      return false;
    }

    // Compare material.
    return preRenderData.material === curRenderData.material;
  }

  private _checkBatchWithMask(left: SpriteRenderer, right: SpriteRenderer): boolean {
    const leftMaskInteraction = left.maskInteraction;

    if (leftMaskInteraction !== right.maskInteraction) {
      return false;
    }
    if (leftMaskInteraction === SpriteMaskInteraction.None) {
      return true;
    }
    return left.maskLayer === right.maskLayer;
  }

  private _udpateRenderData(preElement: RenderElement, curElement: RenderElement, canBatch: boolean): void {
    const preRenderData = preElement ? <SpriteRenderData>preElement.data : null;
    const curRenderData = <SpriteRenderData>curElement.data;
    const { chunk } = curRenderData;
    const { _meshBuffer: meshBuffer, _indices: tempIndices, _vEntry: vEntry } = chunk;
    const { _indices: indices } = meshBuffer;
    const vertexStartIndex = vEntry.start / 9;
    const len = tempIndices.length;
    let startIndex = meshBuffer._iLen;
    if (canBatch) {
      const { _subMesh } = preRenderData.chunk;
      _subMesh.count += len;
    } else {
      const { _subMesh } = chunk;
      _subMesh.start = startIndex;
      _subMesh.count = len;
      meshBuffer._mesh.addSubMesh(_subMesh);
    }
    for (let i = 0; i < len; ++i) {
      indices[startIndex++] = vertexStartIndex + tempIndices[i];
    }
    meshBuffer._iLen += len;
    meshBuffer._vLen = Math.max(meshBuffer._vLen, vEntry.start + vEntry.len);
    if (!canBatch) {
      this._preElement = curElement;
    }
  }

  private _reset(): void {
    this._preElement = null;
  }
}
