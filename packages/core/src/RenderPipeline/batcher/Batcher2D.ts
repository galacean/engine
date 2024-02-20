import { SpriteMaskInteraction, SpriteRenderer } from "../../2d";
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
import { ShaderProperty, ShaderTagKey } from "../../shader";
import { ClassPool } from "../ClassPool";
import { RenderContext } from "../RenderContext";
import { SpriteRenderData } from "../SpriteRenderData";
import { RenderDataUsage } from "../enums/RenderDataUsage";
import { IBatcher } from "./IBatcher";

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
  _meshes: BufferMesh[] = [];
  /** @internal */
  _meshCount: number = 1;
  /** @internal */
  _subMeshPool: ClassPool<SubMesh> = new ClassPool(SubMesh);
  /** @internal */
  _vertexBuffers: Buffer[] = [];
  /** @internal */
  _indiceBuffers: Buffer[] = [];
  /** @internal */
  _vertices: Float32Array;
  /** @internal */
  _indices: Uint16Array;
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
    this._initMeshes(engine);
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {
    const { _meshes: meshes, _vertexBuffers: vertexBuffers, _indiceBuffers: indiceBuffers } = this;

    for (let i = 0, n = meshes.length; i < n; ++i) {
      meshes[i].destroy();
    }
    this._meshes = null;

    for (let i = 0, n = vertexBuffers.length; i < n; ++i) {
      vertexBuffers[i].destroy();
    }
    this._vertexBuffers = null;

    for (let i = 0, n = indiceBuffers.length; i < n; ++i) {
      indiceBuffers[i].destroy();
    }
    this._indiceBuffers = null;
  }

  commitRenderData(context: RenderContext, data: SpriteRenderData): void {
    if (this._preSpriteRenderData) {
      if (this._vertexCount + data.verticesData.vertexCount > Batcher2D.MAX_VERTEX_COUNT) {
        this.flush();
        this.uploadBuffer();
        const newFlushId = this._flushId + 1;
        this._createMesh(this._engine, newFlushId);
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
    const mesh = this._meshes[this._flushId];
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
    const { _flushId } = this;
    // Set data option use Discard, or will resulted in performance slowdown when open antialias and cross-rendering of 3D and 2D elements.
    // Device: iphone X(16.7.2)、iphone 15 pro max(17.1.1)、iphone XR(17.1.2) etc.
    this._vertexBuffers[_flushId].setData(this._vertices, 0, 0, this._vStartIndex, SetDataOptions.Discard);
    this._indiceBuffers[_flushId].setData(this._indices, 0, 0, this._iStartIndex, SetDataOptions.Discard);
  }

  clear() {
    this._reset();
    this._subMeshPool.resetPool();
    const { _meshes, _meshCount } = this;
    for (let i = 0; i < _meshCount; ++i) {
      _meshes[i].clearSubMesh();
    }
  }

  createVertexElements(vertexElements: VertexElement[]): number {
    vertexElements[0] = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
    vertexElements[1] = new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0);
    vertexElements[2] = new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0);
    return 36;
  }

  protected _createMesh(engine: Engine, index: number): BufferMesh {
    const { _meshes } = this;
    if (_meshes[index]) {
      return _meshes[index];
    }

    const { MAX_VERTEX_COUNT } = Batcher2D;
    const mesh = new BufferMesh(engine, `BufferMesh${index}`);
    mesh.isGCIgnored = true;
    const vertexElements: VertexElement[] = [];
    const vertexStride = this.createVertexElements(vertexElements);

    // vertices
    const vertexBuffer = (this._vertexBuffers[index] = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      MAX_VERTEX_COUNT * vertexStride,
      BufferUsage.Dynamic
    ));
    vertexBuffer.isGCIgnored = true;
    // indices
    const indiceBuffer = (this._indiceBuffers[index] = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      MAX_VERTEX_COUNT * 8,
      BufferUsage.Dynamic
    ));
    indiceBuffer.isGCIgnored = true;
    mesh.setVertexBufferBinding(vertexBuffer, vertexStride);
    mesh.setIndexBufferBinding(indiceBuffer, IndexFormat.UInt16);
    mesh.setVertexElements(vertexElements);
    index >= this._meshCount && (this._meshCount = index + 1);
    this._meshes[index] = mesh;

    return mesh;
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
    const { _vertices, _indices, _vertexCount } = this;
    const { positions, uvs, color, vertexCount, triangles } = data.verticesData;

    let index = this._vIndex;
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

  private _initMeshes(engine: Engine) {
    const { MAX_VERTEX_COUNT } = Batcher2D;
    this._vertices = new Float32Array(MAX_VERTEX_COUNT * 9);
    this._indices = new Uint16Array(MAX_VERTEX_COUNT * 4);
    this._createMesh(engine, 0);
  }
}
