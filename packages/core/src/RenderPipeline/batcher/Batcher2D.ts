import { SpriteMaskInteraction, SpriteRenderer } from "../../2d";
import { Engine } from "../../Engine";
import { RenderQueueType, ShaderTagKey } from "../../shader";
import { RenderContext } from "../RenderContext";
import { SpriteRenderData } from "../SpriteRenderData";
import { MBChunk, MeshBuffer } from "./MeshBuffer";

interface TempRenderInfo {
  context: RenderContext;
  data: SpriteRenderData;
}

/**
 * @internal
 */
export class Batcher2D {
  /** The maximum number of vertex. */
  static MAX_VERTEX_COUNT: number = 4096;

  /**
   * @internal
   */
  static _sort(a: TempRenderInfo, b: TempRenderInfo): number {
    const dataA = a.data;
    const dataB = b.data;
    const renderQueueTypeA = dataA.material.renderState.renderQueueType;
    const renderQueueTypeB = dataB.material.renderState.renderQueueType;
    const renderQueueTypeOrder = renderQueueTypeA - renderQueueTypeB;
    if (renderQueueTypeOrder !== 0) {
      return renderQueueTypeOrder;
    }

    const componentA = dataA.component;
    const componentB = dataB.component;
    const priorityOrder = componentA.priority - componentB.priority;
    if (priorityOrder !== 0) {
      return priorityOrder;
    }

    // make suer from the same renderer.
    if (componentA.instanceId === componentB.instanceId) {
      return dataA.material._priority - dataB.material._priority;
    } else {
      const distanceDiff =
        renderQueueTypeA == RenderQueueType.Transparent
          ? componentB._distanceForSort - componentA._distanceForSort
          : componentA._distanceForSort - componentB._distanceForSort;
      if (distanceDiff === 0) {
        return componentA.instanceId - componentB.instanceId;
      } else {
        return distanceDiff;
      }
    }
  }

  protected static _disableBatchTag: ShaderTagKey = ShaderTagKey.getByName("spriteDisableBatching");

  /** @internal */
  _engine: Engine;

  /** @internal */
  _meshBuffers: MeshBuffer[] = [];
  /** @internal */
  _maxVertexCount: number;
  /** @internal */
  _preContext: RenderContext = null;
  /** @internal */
  _preRenderData: SpriteRenderData = null;
  /** @internal */
  _tempRenderInfos: Array<TempRenderInfo> = [];

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
  }

  commitRenderData(context: RenderContext, data: SpriteRenderData): void {
    this._tempRenderInfos.push({
      context,
      data
    });
  }

  sortAndHandleRenderData(): void {
    const { _tempRenderInfos } = this;
    _tempRenderInfos.sort(Batcher2D._sort);
    for (let i = 0, l = _tempRenderInfos.length; i < l; ++i) {
      const info = _tempRenderInfos[i];
      this._handleRenderData(info.context, info.data);
    }
  }

  flush(): void {
    const { _preRenderData: preRenderData } = this;
    preRenderData && this._preContext.camera._renderPipeline.pushRenderData(this._preContext, preRenderData);
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
    this._tempRenderInfos.length = 0;
  }

  allocateChunk(vertexCount: number): MBChunk | null {
    const { _meshBuffers } = this;
    let chunk: MBChunk = null;
    let i = 0;
    const len = _meshBuffers.length;
    for (; i < len; ++i) {
      chunk = _meshBuffers[i].allocateChunk(vertexCount);
      if (chunk) {
        chunk._mbId = i;
        return chunk;
      }
    }

    const meshBuffer = this._createMeshBuffer(len, this._maxVertexCount);
    chunk = meshBuffer.allocateChunk(vertexCount);
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

  protected _createMeshBuffer(index: number, maxVertexCount: number = Batcher2D.MAX_VERTEX_COUNT): MeshBuffer {
    return (this._meshBuffers[index] ||= new MeshBuffer(this._engine, maxVertexCount));
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

  private _handleRenderData(context: RenderContext, data: SpriteRenderData): void {
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
