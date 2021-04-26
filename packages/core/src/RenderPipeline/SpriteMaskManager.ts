import { SpriteMask, SpriteMaskInteraction, SpriteRenderer } from "../2d";
import { Camera } from "../Camera";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  IndexFormat,
  MeshTopology,
  SubMesh,
  VertexElement,
  VertexElementFormat
} from "../graphic";
import { BufferMesh } from "../mesh";
import { Shader, StencilOperation } from "../shader";
import { SystemInfo } from "../SystemInfo";
import { SpriteMaskElement } from "./SpriteMaskElement";

export class SpriteMaskManager {
  private static _instance: SpriteMaskManager = null;
  private static _tempMasks: Set<SpriteMask> = new Set<SpriteMask>();
  /** The maximum number of vertex. */
  private static MAX_VERTEX_COUNT: number = 4096;
  private static _canUploadSameBuffer: boolean = !SystemInfo._isIos();
  private static _subMeshPool: SubMesh[] = [];
  private static _subMeshPoolIndex: number = 0;

  static getInstance(engine: Engine): SpriteMaskManager {
    if (!SpriteMaskManager._instance) {
      SpriteMaskManager._instance = new SpriteMaskManager(engine);
    }

    return SpriteMaskManager._instance;
  }

  static _getSubMeshFromPool(start: number, count: number, topology: MeshTopology = MeshTopology.Triangles): SubMesh {
    const { _subMeshPoolIndex: index, _subMeshPool: pool } = SpriteMaskManager;
    SpriteMaskManager._subMeshPoolIndex++;
    let subMesh: SubMesh = null;

    if (pool.length === index) {
      subMesh = new SubMesh(start, count, topology);
      pool.push(subMesh);
    } else {
      subMesh = pool[index];
      subMesh.start = start;
      subMesh.count = count;
      subMesh.topology = topology;
    }

    return subMesh;
  }

  /**
   * @internal
   */
  static _restPool() {
    SpriteMaskManager._subMeshPoolIndex = 0;
  }

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
  private _curMasks: DisorderedArray<SpriteMask> = new DisorderedArray();
  private _newMasks: DisorderedArray<SpriteMask> = new DisorderedArray();

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
    this.clearDrawInfo();
    this._findMasks(renderer, this._newMasks);
    this._handleMaskDiff();

    if (this._batchedQueue.length > 0) {
      this._flush(camera.engine);
    }
  }

  postRender(renderer: SpriteRenderer, camera: Camera): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return;
    }

    // Swap masks
    const temp = this._curMasks;
    this._curMasks = this._newMasks;
    this._newMasks = temp;
    this._newMasks.length = 0;
  }

  clear(): void {
    this._curMasks.length = 0;
    this._newMasks.length = 0;
    this.clearDrawInfo();
  }

  clearDrawInfo(): void {
    this._flushId = 0;
    this._vertexCount = 0;
    this._spriteMaskCount = 0;
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

  private _handleMaskDiff(): void {
    const curMasks = this._curMasks;
    const newMasks = this._newMasks;
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
    const element = mask.getElement();
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

    SpriteMaskManager._restPool();
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

    const { _getSubMeshFromPool } = SpriteMaskManager;
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
          mesh.addSubMesh(_getSubMeshFromPool(vertexStartIndex, vertexCount));
          vertexStartIndex += vertexCount;
          vertexCount = triangleNum;
          _batchedQueue[curMeshIndex++] = preSpriteMaskElement;
        }
      }

      preSpriteMaskElement = curSpriteMaskElement;
    }

    mesh.addSubMesh(_getSubMeshFromPool(vertexStartIndex, vertexCount));
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

      const camera = this._curCamera;

      program.bind();
      program.groupingOtherUniformBlock();
      program.uploadAll(program.sceneUniformBlock, camera.scene.shaderData);
      program.uploadAll(program.cameraUniformBlock, camera.shaderData);
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
    const preMaterial = preMask.material;
    const curMaterial = curMask.material;
    const preShaderData = preMaterial.shaderData;
    const curShaderData = curMaterial.shaderData;
    const textureProperty = SpriteMask.textureProperty;
    const alphaCutoffProperty = SpriteMask.alphaCutoffProperty;

    if (
      preShaderData.getTexture(textureProperty) === curShaderData.getTexture(textureProperty) &&
      preShaderData.getTexture(alphaCutoffProperty) === curShaderData.getTexture(alphaCutoffProperty)
    ) {
      return true;
    }

    return false;
  }
}
