import { SpriteMaskInteraction, SpriteRenderer } from "../../2d";
import { Engine } from "../../Engine";
import { MeshTopology, SetDataOptions, SubMesh } from "../../graphic";
import { ShaderProperty, ShaderTagKey } from "../../shader";
import { ClassPool } from "../ClassPool";
import { RenderContext } from "../RenderContext";
import { SpriteRenderData } from "../SpriteRenderData";
import { RenderDataUsage } from "../enums/RenderDataUsage";
import { IBatcher } from "./IBatcher";
import { MeshBuffer } from "./MeshBuffer";

/**
 * @internal
 */
export class Batcher2D implements IBatcher {
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
  _flushId: number = 0;

  /** @internal */
  _vStartIndex: number = 0;
  /** @internal */
  _vIndex: number = 0;
  /** @internal */
  _iStartIndex: number = 0;
  /** @internal */
  _iIndex: number = 0;
  /** @internal */
  _vertexStartIndex: number = 0;
  /** @internal */
  _vertexCount: number = 0;
  /** @internal */
  _preContext: RenderContext = null;
  /** @internal */
  _preSpriteRenderData: SpriteRenderData = null;

  constructor(engine: Engine) {
    this._engine = engine;
    this._createMeshBuffer(engine, 0);
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
    if (this._preSpriteRenderData) {
      if (this._vertexCount + data.verticesData.vertexCount > Batcher2D.MAX_VERTEX_COUNT) {
        this.flush();
        this.uploadBuffer();
        const newFlushId = this._flushId + 1;
        this._createMeshBuffer(this._engine, newFlushId);
        this._reset();
        this._flushId = newFlushId;
      } else {
        if (!this._canBatch(this._preSpriteRenderData, data)) {
          this.flush();
        }
      }
    }

    this._preContext = context;
    this._preSpriteRenderData = data;
    this._fillRenderData(data);
  }

  flush(): void {
    if (!this._preSpriteRenderData) {
      return;
    }

    const { _preSpriteRenderData, _iStartIndex, _iIndex } = this;
    const mesh = this._meshBuffers[this._flushId]._mesh;
    const iCount = _iIndex - _iStartIndex;
    const subMesh = this._getSubMeshFromPool(_iStartIndex, iCount);
    mesh.addSubMesh(subMesh);

    this._vertexStartIndex += this._vertexCount;
    this._vStartIndex = this._vIndex;
    this._iStartIndex = _iIndex;

    const renderData = this._engine._renderDataPool.getFromPool();
    renderData.usage = RenderDataUsage.Sprite;
    renderData.set(_preSpriteRenderData.component, _preSpriteRenderData.material, mesh._primitive, subMesh);
    renderData.component.shaderData.setTexture(Batcher2D._textureProperty, _preSpriteRenderData.texture);
    this._preContext.camera._renderPipeline.pushRenderData(this._preContext, renderData);
  }

  uploadBuffer(): void {
    this._meshBuffers[this._flushId].uploadBuffer(this._vStartIndex, this._iStartIndex);
  }

  clear() {
    this._reset();
    this._subMeshPool.resetPool();
    const { _meshBuffers } = this;
    for (let i = 0, l = _meshBuffers.length; i < l; ++i) {
      _meshBuffers[i]._mesh.clearSubMesh();
    }
  }

  getInfo(vertexCount, indiceCount) {
    // TODO
  }

  protected _createMeshBuffer(engine: Engine, index: number): MeshBuffer {
    const { _meshBuffers } = this;
    if (_meshBuffers[index]) {
      return _meshBuffers[index];
    }

    const meshBuffer = (_meshBuffers[index] = new MeshBuffer(engine));
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

  private _fillRenderData(data: SpriteRenderData): void {
    const { _flushId, _vertexCount } = this;
    const { positions, uvs, color, vertexCount, triangles } = data.verticesData;

    let index = this._vIndex;
    const _vertices = this._meshBuffers[_flushId]._vertices;
    const _indices = this._meshBuffers[_flushId]._indices;
    for (let i = 0; i < vertexCount; ++i) {
      const curPos = positions[i];
      const curUV = uvs[i];
      _vertices[index++] = curPos.x;
      _vertices[index++] = curPos.y;
      _vertices[index++] = curPos.z;
      _vertices[index++] = curUV.x;
      _vertices[index++] = curUV.y;
      _vertices[index++] = color.r;
      _vertices[index++] = color.g;
      _vertices[index++] = color.b;
      _vertices[index++] = color.a;
    }
    this._vIndex = index;

    index = this._iIndex;
    for (let i = 0, len = triangles.length; i < len; ++i) {
      _indices[index++] = triangles[i] + _vertexCount;
    }
    this._iIndex = index;
    this._vertexCount += vertexCount;
  }

  private _reset(): void {
    this._flushId = 0;
    this._vIndex = 0;
    this._iIndex = 0;
    this._vStartIndex = 0;
    this._iStartIndex = 0;
    this._vertexStartIndex = 0;
    this._vertexCount = 0;
    this._preContext = null;
    this._preSpriteRenderData = null;
  }
}
