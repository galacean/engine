import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { SpriteMask } from "../2d/sprite/SpriteMask";
import { SpriteRenderer } from "../2d/sprite/SpriteRenderer";
import { Camera } from "../Camera";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { SubMesh } from "../graphic/SubMesh";
import { VertexElement } from "../graphic/VertexElement";
import { BufferMesh } from "../mesh/BufferMesh";
import { StencilOperation } from "../shader/enums/StencilOperation";
import { Shader } from "../shader/Shader";
import { SystemInfo } from "../SystemInfo";
import { ClassPool } from "./ClassPool";
import { SpriteMaskElement } from "./SpriteMaskElement";

export class SpriteMaskManager {
  private static _instance: SpriteMaskManager = null;
  private static _tempMasks: Set<SpriteMask> = new Set<SpriteMask>();
  /** The maximum number of vertex. */
  private static MAX_VERTEX_COUNT: number = 4096;
  private static _canUploadSameBuffer: boolean = !SystemInfo._isIos();

  static getInstance(engine: Engine): SpriteMaskManager {
    if (!SpriteMaskManager._instance) {
      SpriteMaskManager._instance = new SpriteMaskManager(engine);
    }

    return SpriteMaskManager._instance;
  }

  private _subMeshPool: ClassPool<SubMesh> = new ClassPool(SubMesh);
  private _batchedQueue: SpriteMaskElement[] = [];
  private _meshes: BufferMesh[] = [];
  private _meshCount: number = 1;
  private _vertexBuffers: Buffer[] = [];
  private _indiceBuffers: Buffer[] = [];
  private _vertices: Float32Array;
  private _indices: Uint16Array;
  private _vertexCount: number = 0;
  private _spriteMaskCount: number = 0;
  private _flushId: number = 0;

  private _curCamera: Camera = null;
  private _allMasks: DisorderedArray<SpriteMask> = new DisorderedArray();
  private _previousMasks: DisorderedArray<SpriteMask> = new DisorderedArray();
  private _curMasks: DisorderedArray<SpriteMask> = new DisorderedArray();

  constructor(engine: Engine) {
    const { MAX_VERTEX_COUNT } = SpriteMaskManager;
    this._vertices = new Float32Array(MAX_VERTEX_COUNT * 9);
    this._indices = new Uint16Array(MAX_VERTEX_COUNT * 3);

    const { _meshes, _meshCount } = this;
    for (let i = 0; i < _meshCount; i++) {
      _meshes[i] = this._createMesh(engine, i);
    }
  }

  addMask(mask: SpriteMask): void {
    this._allMasks.add(mask);
  }

  removeMask(mask: SpriteMask): void {
    this._allMasks.delete(mask);
  }

  preRender(renderer: SpriteRenderer, camera: Camera): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return;
    }

    this._curCamera = camera;
    this._clearDrawInfo();
    this._findMasks(renderer, this._curMasks);
    this._processMasksDiff();

    if (this._batchedQueue.length > 0) {
      this._flush(camera.engine);
    }
  }

  postRender(renderer: SpriteRenderer, camera: Camera): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return;
    }

    // Swap masks
    const temp = this._previousMasks;
    this._previousMasks = this._curMasks;
    this._curMasks = temp;
    this._curMasks.length = 0;
  }

  clear(): void {
    this._previousMasks.length = 0;
    this._curMasks.length = 0;
    this._clearDrawInfo();
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

  private _clearDrawInfo(): void {
    this._flushId = 0;
    this._vertexCount = 0;
    this._spriteMaskCount = 0;
    this._batchedQueue.length = 0;
  }

  private _createMesh(engine: Engine, index: number): BufferMesh {
    const MAX_VERTEX_COUNT = SpriteMaskManager.MAX_VERTEX_COUNT;
    const mesh = new BufferMesh(engine, `SpriteMaskBufferMesh${index}`);

    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0)
    ];
    const vertexStride = 20;

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

  /**
   * Find all masks that the renderer used.
   */
  private _findMasks(renderer: SpriteRenderer, masks: DisorderedArray<SpriteMask>): void {
    const { _curCamera: camera, _allMasks: allMasks } = this;
    const maskLayer = renderer.maskLayer;
    const elements = allMasks._elements;
    for (let i = 0, l = allMasks.length; i < l; ++i) {
      const element = elements[i];
      if (camera.cullingMask & element.entity.layer && maskLayer & element.influenceLayers) {
        masks.add(element);
      }
    }
  }

  /**
   * Process the differences between all current masks and all previous masks.
   */
  private _processMasksDiff(): void {
    const curMasks = this._previousMasks;
    const newMasks = this._curMasks;
    const curElements = curMasks._elements;
    const newElements = newMasks._elements;
    const curLen = curMasks.length;
    const newLen = newMasks.length;

    if (newLen === 0) {
      return;
    }

    if (curLen === 0) {
      for (let i = 0; i < newLen; ++i) {
        this._preDrawMask(newElements[i], true);
      }
      return;
    }

    const repeatMasks = SpriteMaskManager._tempMasks;
    repeatMasks.clear();
    for (let i = 0; i < curLen; ++i) {
      const curElement = curElements[i];
      for (let j = 0; j < newLen; ++j) {
        if (curElement === newElements[j]) {
          repeatMasks.add(curElement);
        }
      }
    }

    for (let i = 0; i < newLen; ++i) {
      const element = newElements[i];
      if (!repeatMasks.has(element)) {
        this._preDrawMask(element, true);
      }
    }

    for (let i = 0; i < curLen; ++i) {
      const element = curElements[i];
      if (!repeatMasks.has(element)) {
        this._preDrawMask(element, false);
      }
    }
  }

  private _preDrawMask(mask: SpriteMask, isAdd: boolean): void {
    const element = mask._getElement();
    if (element) {
      element.isAdd = isAdd;
      this._drawMask(element);
    }
  }

  private _drawMask(spriteMaskElement: SpriteMaskElement): void {
    const len = spriteMaskElement.positions.length;
    if (this._vertexCount + len > SpriteMaskManager.MAX_VERTEX_COUNT) {
      this._flush(this._curCamera.engine);
    }

    this._vertexCount += len;
    this._batchedQueue[this._spriteMaskCount++] = spriteMaskElement;
  }

  private _flush(engine: Engine): void {
    const { _batchedQueue } = this;

    if (_batchedQueue.length === 0) {
      return;
    }

    this._updateData(engine);
    this._drawBatches(engine);

    if (!SpriteMaskManager._canUploadSameBuffer) {
      this._flushId++;
    }

    this._subMeshPool.resetPool();
    this._batchedQueue.length = 0;
    this._vertexCount = 0;
    this._spriteMaskCount = 0;
  }

  private _updateData(engine: Engine): void {
    const { _meshes, _flushId } = this;

    if (!SpriteMaskManager._canUploadSameBuffer && this._meshCount <= _flushId) {
      this._meshCount++;
      _meshes[_flushId] = this._createMesh(engine, _flushId);
    }

    const { _batchedQueue, _vertices, _indices } = this;
    const mesh = _meshes[_flushId];
    mesh.clearSubMesh();

    let vertexIndex = 0;
    let indiceIndex = 0;
    let vertexStartIndex = 0;
    let vertexCount = 0;
    let curIndiceStartIndex = 0;
    let curMeshIndex = 0;
    let preSpriteMaskElement: SpriteMaskElement = null;
    for (let i = 0, len = _batchedQueue.length; i < len; i++) {
      const curSpriteMaskElement = _batchedQueue[i];
      const { positions, uv, triangles } = curSpriteMaskElement;

      // Batch vertex
      const verticesNum = positions.length;
      for (let j = 0; j < verticesNum; j++) {
        const curPos = positions[j];
        const curUV = uv[j];

        _vertices[vertexIndex++] = curPos.x;
        _vertices[vertexIndex++] = curPos.y;
        _vertices[vertexIndex++] = curPos.z;
        _vertices[vertexIndex++] = curUV.x;
        _vertices[vertexIndex++] = curUV.y;
      }

      // Batch indice
      const triangleNum = triangles.length;
      for (let j = 0; j < triangleNum; j++) {
        _indices[indiceIndex++] = triangles[j] + curIndiceStartIndex;
      }

      curIndiceStartIndex += verticesNum;

      if (preSpriteMaskElement === null) {
        vertexCount += triangleNum;
      } else {
        if (this._canBatch(preSpriteMaskElement, curSpriteMaskElement)) {
          vertexCount += triangleNum;
        } else {
          mesh.addSubMesh(this._getSubMeshFromPool(vertexStartIndex, vertexCount));
          vertexStartIndex += vertexCount;
          vertexCount = triangleNum;
          _batchedQueue[curMeshIndex++] = preSpriteMaskElement;
        }
      }

      preSpriteMaskElement = curSpriteMaskElement;
    }

    mesh.addSubMesh(this._getSubMeshFromPool(vertexStartIndex, vertexCount));
    _batchedQueue[curMeshIndex] = preSpriteMaskElement;

    this._vertexBuffers[_flushId].setData(_vertices, 0, 0, vertexIndex);
    this._indiceBuffers[_flushId].setData(_indices, 0, 0, indiceIndex);
  }

  private _drawBatches(engine: Engine): void {
    const mesh = this._meshes[this._flushId];
    const subMeshes = mesh.subMeshes;
    const { _batchedQueue } = this;

    for (let i = 0, len = subMeshes.length; i < len; i++) {
      const subMesh = subMeshes[i];
      const spriteMaskElement = _batchedQueue[i];

      if (!subMesh || !spriteMaskElement) {
        return;
      }

      const compileMacros = Shader._compileMacros;
      compileMacros.clear();

      const material = spriteMaskElement.material;
      // Update stencil state
      const stencilState = material.renderState.stencilState;
      const op = spriteMaskElement.isAdd ? StencilOperation.IncrementSaturate : StencilOperation.DecrementSaturate;
      stencilState.passOperationFront = op;
      stencilState.passOperationBack = op;

      const program = material.shader._getShaderProgram(engine, compileMacros);
      if (!program.isValid) {
        return;
      }

      const renderer = <SpriteMask>spriteMaskElement.component;
      const camera = this._curCamera;

      program.bind();
      program.groupingOtherUniformBlock();
      program.uploadAll(program.sceneUniformBlock, camera.scene.shaderData);
      program.uploadAll(program.cameraUniformBlock, camera.shaderData);
      program.uploadAll(program.rendererUniformBlock, renderer.shaderData);
      program.uploadAll(program.materialUniformBlock, material.shaderData);

      material.renderState._apply(engine);

      engine._hardwareRenderer.drawPrimitive(mesh, subMesh, program);
    }
  }

  private _canBatch(preSpriteMaskElement: SpriteMaskElement, curSpriteMaskElement: SpriteMaskElement): boolean {
    if (preSpriteMaskElement.isAdd !== curSpriteMaskElement.isAdd) {
      return false;
    }

    const preMask = <SpriteMask>preSpriteMaskElement.component;
    const curMask = <SpriteMask>curSpriteMaskElement.component;
    const preShaderData = preMask.shaderData;
    const curShaderData = curMask.shaderData;
    const textureProperty = SpriteMask._textureProperty;
    const alphaCutoffProperty = SpriteMask._alphaCutoffProperty;

    if (
      preShaderData.getTexture(textureProperty) === curShaderData.getTexture(textureProperty) &&
      preShaderData.getTexture(alphaCutoffProperty) === curShaderData.getTexture(alphaCutoffProperty)
    ) {
      return true;
    }

    return false;
  }

  private _getSubMeshFromPool(start: number, count: number): SubMesh {
    const subMesh = this._subMeshPool.getFromPool();
    subMesh.start = start;
    subMesh.count = count;
    subMesh.topology = MeshTopology.Triangles;
    return subMesh;
  }
}
