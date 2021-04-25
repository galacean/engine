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

  private _createMesh(engine: Engine, index: number): BufferMesh {
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
      16 * vertexStride,
      BufferUsage.Dynamic
    );
    // indices
    this._indiceBuffers[index] = new Buffer(engine, BufferBindFlag.IndexBuffer, 12, BufferUsage.Dynamic);
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

  _flush(engine: Engine): void {
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

  _updateData(engine: Engine): void {}

  _drawBatches(engine: Engine): void {}
}
