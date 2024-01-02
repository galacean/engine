import { Camera } from "../Camera";
import { Engine } from "../Engine";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  IndexFormat,
  MeshTopology,
  SetDataOptions,
  SubMesh,
  VertexElement
} from "../graphic";
import { BufferMesh } from "../mesh";
import { ShaderTagKey } from "../shader/ShaderTagKey";
import { ClassPool } from "./ClassPool";
import { RenderElement } from "./RenderElement";
import { SpriteMaskRenderData } from "./SpriteMaskRenderData";
import { SpriteRenderData } from "./SpriteRenderData";
import { TextRenderData } from "./TextRenderData";

type SpriteData = SpriteRenderData | SpriteMaskRenderData;

export abstract class Basic2DBatcher {
  protected static _disableBatchTag: ShaderTagKey = ShaderTagKey.getByName("spriteDisableBatching");

  /** The maximum number of vertex. */
  static MAX_VERTEX_COUNT: number = 4096;
  static _canUploadSameBuffer: boolean = true;

  /** @internal */
  _engine: Engine;
  /** @internal */
  _subMeshPool: ClassPool<SubMesh> = new ClassPool(SubMesh);
  /** @internal */
  _batchedQueue: RenderElement[] = [];
  /** @internal */
  _meshes: BufferMesh[] = [];
  /** @internal */
  _meshCount: number = 1;
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
  _vertexCount: number = 0;
  /** @internal */
  _elementCount: number = 0;

  constructor(engine: Engine) {
    this._engine = engine;
    this._initMeshes(engine);
  }

  drawElement(element: RenderElement, camera: Camera): void {
    const data = element.data;

    if (data.multiRenderData) {
      const charsData = (<TextRenderData>data).charsData;
      const pool = camera.engine._renderElementPool;

      for (let i = 0, n = charsData.length; i < n; ++i) {
        const charRenderElement = pool.getFromPool();
        charRenderElement.set(charsData[i], element.shaderPasses);
        this._drawSubElement(charRenderElement, camera);
      }
    } else {
      this._drawSubElement(element, camera);
    }
  }

  /**
   * @internal
   * Standalone for canvas 2d renderer plugin.
   */
  _initMeshes(engine: Engine) {
    const { MAX_VERTEX_COUNT } = Basic2DBatcher;
    this._vertices = new Float32Array(MAX_VERTEX_COUNT * 9);
    this._indices = new Uint16Array(MAX_VERTEX_COUNT * 3);

    const { _meshes, _meshCount } = this;
    for (let i = 0; i < _meshCount; i++) {
      _meshes[i] = this._createMesh(engine, i);
    }
  }

  flush(camera: Camera): void {
    const batchedQueue = this._batchedQueue;

    if (batchedQueue.length === 0) {
      return;
    }
    this._updateData(this._engine);
    this.drawBatches(camera);

    if (!Basic2DBatcher._canUploadSameBuffer) {
      this._flushId++;
    }

    batchedQueue.length = 0;
    this._subMeshPool.resetPool();
    this._vertexCount = 0;
    this._elementCount = 0;
  }

  clear(): void {
    this._flushId = 0;
    this._vertexCount = 0;
    this._elementCount = 0;
    this._batchedQueue.length = 0;
  }

  destroy(): void {
    this._batchedQueue = null;

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

  private _drawSubElement(element: RenderElement, camera: Camera): void {
    const vertexCount = (<SpriteRenderData | SpriteMaskRenderData>element.data).verticesData.vertexCount;
    if (this._vertexCount + vertexCount > Basic2DBatcher.MAX_VERTEX_COUNT) {
      this.flush(camera);
    }

    this._vertexCount += vertexCount;
    this._batchedQueue[this._elementCount++] = element;
  }

  private _createMesh(engine: Engine, index: number): BufferMesh {
    const { MAX_VERTEX_COUNT } = Basic2DBatcher;
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
      MAX_VERTEX_COUNT * 6,
      BufferUsage.Dynamic
    ));
    indiceBuffer.isGCIgnored = true;
    mesh.setVertexBufferBinding(vertexBuffer, vertexStride);
    mesh.setIndexBufferBinding(indiceBuffer, IndexFormat.UInt16);
    mesh.setVertexElements(vertexElements);

    return mesh;
  }

  private _updateData(engine: Engine): void {
    const { _meshes, _flushId } = this;

    if (!Basic2DBatcher._canUploadSameBuffer && this._meshCount <= _flushId) {
      this._meshCount++;
      _meshes[_flushId] = this._createMesh(engine, _flushId);
    }

    const { _batchedQueue: batchedQueue, _vertices: vertices, _indices: indices } = this;
    const mesh = _meshes[_flushId];
    mesh.clearSubMesh();

    let vertexIndex = 0;
    let indiceIndex = 0;
    let vertexStartIndex = 0;
    let vertexCount = 0;
    let curIndiceStartIndex = 0;
    let curMeshIndex = 0;
    let preElement: RenderElement = null;
    for (let i = 0, len = batchedQueue.length; i < len; i++) {
      const curElement = batchedQueue[i];
      const curData = <SpriteData>curElement.data;

      // Batch vertex
      vertexIndex = this.updateVertices(curData, vertices, vertexIndex);

      // Batch indice
      const { triangles } = curData.verticesData;
      const triangleNum = triangles.length;
      for (let j = 0; j < triangleNum; j++) {
        indices[indiceIndex++] = triangles[j] + curIndiceStartIndex;
      }

      curIndiceStartIndex += curData.verticesData.vertexCount;

      if (preElement === null) {
        vertexCount += triangleNum;
      } else {
        if (this.canBatch(preElement, curElement)) {
          vertexCount += triangleNum;
        } else {
          mesh.addSubMesh(this._getSubMeshFromPool(vertexStartIndex, vertexCount));
          vertexStartIndex += vertexCount;
          vertexCount = triangleNum;
          batchedQueue[curMeshIndex++] = preElement;
        }
      }

      preElement = curElement;
    }

    mesh.addSubMesh(this._getSubMeshFromPool(vertexStartIndex, vertexCount));
    batchedQueue[curMeshIndex] = preElement;

    // Set data option use Discard, or will resulted in performance slowdown when open antialias and cross-rendering of 3D and 2D elements.
    // Device: iphoneX or newer iphone.
    this._vertexBuffers[_flushId].setData(vertices, 0, 0, vertexIndex, SetDataOptions.Discard);
    this._indiceBuffers[_flushId].setData(indices, 0, 0, indiceIndex, SetDataOptions.Discard);
  }

  private _getSubMeshFromPool(start: number, count: number): SubMesh {
    const subMesh = this._subMeshPool.getFromPool();
    subMesh.start = start;
    subMesh.count = count;
    subMesh.topology = MeshTopology.Triangles;
    return subMesh;
  }

  /**
   * @internal
   */
  abstract createVertexElements(vertexElements: VertexElement[]): number;

  /**
   * @internal
   */
  abstract canBatch(preElement: RenderElement, curElement: RenderElement): boolean;

  /**
   * @internal
   */
  abstract updateVertices(element: SpriteData, vertices: Float32Array, vertexIndex: number): number;

  /**
   * @internal
   */
  abstract drawBatches(camera: Camera): void;
}
