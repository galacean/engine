import { SpriteMaskInteraction, SpriteRenderer } from "../../2d";
import { Engine } from "../../Engine";
import { MeshTopology, SubMesh } from "../../graphic";
import { ShaderProperty, ShaderTagKey } from "../../shader";
import { ClassPool } from "../ClassPool";
import { RenderContext } from "../RenderContext";
import { SpriteRenderData } from "../SpriteRenderData";
import { MBChunk, MeshBuffer } from "./MeshBuffer";

/**
 * @internal
 */
export class Batcher2D {
  /** The maximum number of vertex. */
  static MAX_VERTEX_COUNT: number = 4096;

  protected static _disableBatchTag: ShaderTagKey = ShaderTagKey.getByName("spriteDisableBatching");
  private static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_SpriteTexture");

  /** @internal */
  _engine: Engine;
  /** @internal */
  _subMeshPool: ClassPool<SubMesh> = new ClassPool(SubMesh);

  /** @internal */
  _meshBuffers: MeshBuffer[] = [];
  /** @internal */
  _preContext: RenderContext = null;
  /** @internal */
  _preRenderData: SpriteRenderData = null;

  constructor(engine: Engine) {
    this._engine = engine;
    this._createMeshBuffer(0);
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
  }

  commitRenderData(context: RenderContext, data: SpriteRenderData): void {
    const { _preRenderData: preRenderData } = this;
    if (preRenderData) {
      if (this._canBatch(preRenderData, data)) {
        this._udpateRenderData(context, preRenderData, data, true);
      } else {
        this.flush();
        this._udpateRenderData(context, preRenderData, data, false);
      }
    } else {
      this._udpateRenderData(context, preRenderData, data, false);
    }
  }

  flush(): void {
    const { _preRenderData: preRenderData } = this;
    if (preRenderData) {
      preRenderData.component.shaderData.setTexture(Batcher2D._textureProperty, preRenderData.texture);
      this._preContext.camera._renderPipeline.pushRenderData(this._preContext, preRenderData);
    }
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

  allocateChunk(vertexCount, indiceCount): MBChunk | null {
    const { _meshBuffers } = this;
    let chunk: MBChunk = null;
    let i = 0;
    const len = _meshBuffers.length;
    for (; i < len; ++i) {
      chunk = _meshBuffers[i].allocateChunk(vertexCount, indiceCount);
      if (chunk) {
        chunk._mbId = i;
        return chunk;
      }
    }

    const meshBuffer = this._createMeshBuffer(len);
    chunk = meshBuffer.allocateChunk(vertexCount, indiceCount);
    if (chunk) {
      chunk._mbId = len;
      return chunk;
    }
    return null;
  }

  freeChunk(chunk: MBChunk): void {
    const meshBuffer = this._meshBuffers[chunk._mbId];
    meshBuffer && meshBuffer.freeChunk(chunk);
  }

  protected _createMeshBuffer(index: number): MeshBuffer {
    const { _meshBuffers } = this;
    if (_meshBuffers[index]) {
      return _meshBuffers[index];
    }

    const meshBuffer = (_meshBuffers[index] = new MeshBuffer(this._engine));
    return meshBuffer;
  }

  protected _getSubMeshFromPool(start: number, count: number): SubMesh {
    const subMesh = this._subMeshPool.getFromPool();
    subMesh.start = start;
    subMesh.count = count;
    subMesh.topology = MeshTopology.Triangles;
    return subMesh;
  }

  private _canBatch(preRenderData: SpriteRenderData, curRenderData: SpriteRenderData): boolean {
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

  private _udpateRenderData(
    context: RenderContext,
    preRenderData: SpriteRenderData,
    curRenderData: SpriteRenderData,
    canBatch: boolean
  ): void {
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
      this._preContext = context;
      this._preRenderData = curRenderData;
    }
  }

  private _reset(): void {
    this._preContext = null;
    this._preRenderData = null;
  }
}
