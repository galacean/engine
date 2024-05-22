import { Engine } from "../../Engine";
import { ShaderTagKey } from "../../shader";
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
  }

  clear() {
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

  protected _uploadBuffer(): void {
    const { _meshBuffers: meshBuffers } = this;
    for (let i = 0, l = meshBuffers.length; i < l; ++i) {
      meshBuffers[i].uploadBuffer();
    }
  }
}
