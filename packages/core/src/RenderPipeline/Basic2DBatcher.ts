import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Buffer, BufferBindFlag, BufferUsage, IndexFormat, MeshTopology, SubMesh, VertexElement } from "../graphic";
import { Material } from "../material";
import { BufferMesh } from "../mesh";
import { ClassPool } from "./ClassPool";
import { SpriteElement } from "./SpriteElement";
import { SpriteMaskElement } from "./SpriteMaskElement";
import { TextRenderElement } from "./TextRenderElement";

type Element = SpriteElement | SpriteMaskElement;

export abstract class Basic2DBatcher {
  /** The maximum number of vertex. */
  static MAX_VERTEX_COUNT: number = 4096;
  static _canUploadSameBuffer: boolean = true;

  /** @internal */
  _engine: Engine;
  /** @internal */
  _subMeshPool: ClassPool<SubMesh> = new ClassPool(SubMesh);
  /** @internal */
  _batchedQueue: Element[] = [];
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

    const { MAX_VERTEX_COUNT } = Basic2DBatcher;
    this._vertices = new Float32Array(MAX_VERTEX_COUNT * 9);
    this._indices = new Uint16Array(MAX_VERTEX_COUNT * 3);

    const { _meshes, _meshCount } = this;
    for (let i = 0; i < _meshCount; i++) {
      _meshes[i] = this._createMesh(engine, i);
    }
  }

  drawElement(
    element: SpriteMaskElement | SpriteElement | TextRenderElement,
    camera: Camera,
    replaceMaterial: Material
  ): void {
    if (element.multiRenderData) {
      const elements = (<TextRenderElement>element).charElements;
      for (let i = 0, n = elements.length; i < n; ++i) {
        this._drawSubElement(elements[i], camera, replaceMaterial);
      }
    } else {
      this._drawSubElement(<SpriteMaskElement | SpriteElement>element, camera, replaceMaterial);
    }
  }

  private _drawSubElement(element: SpriteMaskElement | SpriteElement, camera: Camera, replaceMaterial: Material) {
    const len = element.renderData.vertexCount;
    if (this._vertexCount + len > Basic2DBatcher.MAX_VERTEX_COUNT) {
      this.flush(camera, replaceMaterial);
    }

    this._vertexCount += len;
    this._batchedQueue[this._elementCount++] = element;
  }

  flush(camera: Camera, replaceMaterial: Material): void {
    const batchedQueue = this._batchedQueue;

    if (batchedQueue.length === 0) {
      return;
    }
    this._updateData(this._engine);
    this.drawBatches(camera, replaceMaterial);

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

  private _createMesh(engine: Engine, index: number): BufferMesh {
    const { MAX_VERTEX_COUNT } = Basic2DBatcher;
    const mesh = new BufferMesh(engine, `BufferMesh${index}`);

    const vertexElements: VertexElement[] = [];
    const vertexStride = this.createVertexElements(vertexElements);

    // vertices
    this._vertexBuffers[index] = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      MAX_VERTEX_COUNT * 4 * vertexStride,
      BufferUsage.Dynamic
    );
    // indices
    this._indiceBuffers[index] = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      MAX_VERTEX_COUNT * 3,
      BufferUsage.Dynamic
    );
    mesh.setVertexBufferBinding(this._vertexBuffers[index], vertexStride);
    mesh.setIndexBufferBinding(this._indiceBuffers[index], IndexFormat.UInt16);
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
    let preElement: Element = null;
    for (let i = 0, len = batchedQueue.length; i < len; i++) {
      const curElement = batchedQueue[i];

      // Batch vertex
      vertexIndex = this.updateVertices(curElement, vertices, vertexIndex);

      // Batch indice
      const { triangles } = curElement.renderData;
      const triangleNum = triangles.length;
      for (let j = 0; j < triangleNum; j++) {
        indices[indiceIndex++] = triangles[j] + curIndiceStartIndex;
      }

      curIndiceStartIndex += curElement.renderData.vertexCount;

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

    this._vertexBuffers[_flushId].setData(vertices, 0, 0, vertexIndex);
    this._indiceBuffers[_flushId].setData(indices, 0, 0, indiceIndex);
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
  abstract canBatch(preElement: Element, curElement: Element): boolean;

  /**
   * @internal
   */
  abstract updateVertices(element: Element, vertices: Float32Array, vertexIndex: number): number;

  /**
   * @internal
   */
  abstract drawBatches(camera: Camera, replaceMaterial: Material): void;
}
