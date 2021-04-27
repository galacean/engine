import { SpriteMaskInteraction, SpriteRenderer } from "../2d";
import { Engine } from "../Engine";
import { MeshTopology, SubMesh } from "../graphic";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";
import { BufferMesh } from "../mesh/BufferMesh";
import { Shader } from "../shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { SystemInfo } from "../SystemInfo";
import { SpriteElement } from "./SpriteElement";
import { SpriteMaskManager } from "./SpriteMaskManager";

/**
 * @internal
 */
export class SpriteBatcher {
  private static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_spriteTexture");
  /** The maximum number of vertex. */
  private static MAX_VERTEX_COUNT: number = 4096;
  private static _canUploadSameBuffer: boolean = !SystemInfo._isIos();
  private static _subMeshPool: SubMesh[] = [];
  private static _subMeshPoolIndex: number = 0;

  static _getSubMeshFromPool(start: number, count: number, topology: MeshTopology = MeshTopology.Triangles): SubMesh {
    const { _subMeshPoolIndex: index, _subMeshPool: pool } = SpriteBatcher;
    SpriteBatcher._subMeshPoolIndex++;
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
    SpriteBatcher._subMeshPoolIndex = 0;
  }

  private _batchedQueue: SpriteElement[] = [];
  private _meshes: BufferMesh[] = [];
  private _meshCount: number = 1;
  private _vertexBuffers: Buffer[] = [];
  private _indiceBuffers: Buffer[] = [];
  private _vertices: Float32Array;
  private _indices: Uint16Array;
  private _vertexCount: number = 0;
  private _spriteCount: number = 0;
  private _flushId: number = 0;

  constructor(engine: Engine) {
    const { MAX_VERTEX_COUNT } = SpriteBatcher;
    this._vertices = new Float32Array(MAX_VERTEX_COUNT * 9);
    this._indices = new Uint16Array(MAX_VERTEX_COUNT * 3);

    const { _meshes, _meshCount } = this;
    for (let i = 0; i < _meshCount; i++) {
      _meshes[i] = this._createMesh(engine, i);
    }
  }

  /**
   * Flush all sprites.
   */
  flush(engine: Engine): void {
    const { _batchedQueue } = this;

    if (_batchedQueue.length === 0) {
      return;
    }

    this._updateData(engine);
    this._drawBatches(engine);

    if (!SpriteBatcher._canUploadSameBuffer) {
      this._flushId++;
    }

    SpriteBatcher._restPool();
    this._batchedQueue.length = 0;
    this._vertexCount = 0;
    this._spriteCount = 0;
  }

  drawSprite(spriteElement: SpriteElement): void {
    const len = spriteElement.positions.length;
    if (this._vertexCount + len > SpriteBatcher.MAX_VERTEX_COUNT) {
      this.flush(spriteElement.camera.engine);
    }

    this._vertexCount += len;
    this._batchedQueue[this._spriteCount++] = spriteElement;
  }

  clear(): void {
    this._flushId = 0;
    this._vertexCount = 0;
    this._spriteCount = 0;
    this._batchedQueue.length = 0;
  }

  private _createMesh(engine: Engine, index: number): BufferMesh {
    const { MAX_VERTEX_COUNT } = SpriteBatcher;
    const mesh = new BufferMesh(engine, `SpriteBatchBufferMesh${index}`);

    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0),
      new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0)
    ];
    const vertexStride = 36;

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

    if (!SpriteBatcher._canUploadSameBuffer && this._meshCount <= _flushId) {
      this._meshCount++;
      _meshes[_flushId] = this._createMesh(engine, _flushId);
    }

    const { _getSubMeshFromPool } = SpriteBatcher;
    const { _batchedQueue, _vertices, _indices } = this;
    const mesh = _meshes[_flushId];
    mesh.clearSubMesh();

    let vertexIndex = 0;
    let indiceIndex = 0;
    let vertexStartIndex = 0;
    let vertexCount = 0;
    let curIndiceStartIndex = 0;
    let curMeshIndex = 0;
    let preSpriteElement: SpriteElement = null;
    for (let i = 0, len = _batchedQueue.length; i < len; i++) {
      const curSpriteElement = _batchedQueue[i];
      const { positions, uv, triangles, color } = curSpriteElement;

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
        _vertices[vertexIndex++] = color.r;
        _vertices[vertexIndex++] = color.g;
        _vertices[vertexIndex++] = color.b;
        _vertices[vertexIndex++] = color.a;
      }

      // Batch indice
      const triangleNum = triangles.length;
      for (let j = 0; j < triangleNum; j++) {
        _indices[indiceIndex++] = triangles[j] + curIndiceStartIndex;
      }

      curIndiceStartIndex += verticesNum;

      if (preSpriteElement === null) {
        vertexCount += triangleNum;
      } else {
        if (this._canBatch(preSpriteElement, curSpriteElement)) {
          vertexCount += triangleNum;
        } else {
          mesh.addSubMesh(_getSubMeshFromPool(vertexStartIndex, vertexCount));
          vertexStartIndex += vertexCount;
          vertexCount = triangleNum;
          _batchedQueue[curMeshIndex++] = preSpriteElement;
        }
      }

      preSpriteElement = curSpriteElement;
    }

    mesh.addSubMesh(_getSubMeshFromPool(vertexStartIndex, vertexCount));
    _batchedQueue[curMeshIndex] = preSpriteElement;

    this._vertexBuffers[_flushId].setData(_vertices, 0, 0, vertexIndex);
    this._indiceBuffers[_flushId].setData(_indices, 0, 0, indiceIndex);
  }

  private _drawBatches(engine: Engine): void {
    const mesh = this._meshes[this._flushId];
    const subMeshes = mesh.subMeshes;
    const { _batchedQueue } = this;
    const maskManager = SpriteMaskManager.getInstance(engine);

    for (let i = 0, len = subMeshes.length; i < len; i++) {
      const subMesh = subMeshes[i];
      const spriteElement = _batchedQueue[i];

      if (!subMesh || !spriteElement) {
        return;
      }

      const renderer = <SpriteRenderer>spriteElement.component;
      const camera = spriteElement.camera;
      maskManager.preRender(renderer, camera);

      const compileMacros = Shader._compileMacros;
      compileMacros.clear();

      const material = spriteElement.material;
      const program = material.shader._getShaderProgram(engine, compileMacros);
      if (!program.isValid) {
        return;
      }

      program.bind();
      program.groupingOtherUniformBlock();
      program.uploadAll(program.sceneUniformBlock, camera.scene.shaderData);
      program.uploadAll(program.cameraUniformBlock, camera.shaderData);
      program.uploadAll(program.rendererUniformBlock, renderer.shaderData);
      program.uploadAll(program.materialUniformBlock, material.shaderData);

      material.renderState._apply(engine);

      engine._hardwareRenderer.drawPrimitive(mesh, subMesh, program);

      maskManager.postRender(renderer, camera);
    }
  }

  private _canBatch(preSpriteElement: SpriteElement, curSpriteElement: SpriteElement): boolean {
    const preSpriteRenderer = <SpriteRenderer>preSpriteElement.component;
    const curSpriteRenderer = <SpriteRenderer>curSpriteElement.component;

    // Compare mask
    if (!this._checkBatchByMask(preSpriteRenderer, curSpriteRenderer)) {
      return false;
    }

    // Compare texture
    const { _textureProperty } = SpriteBatcher;
    const preTexture = preSpriteRenderer.shaderData.getTexture(_textureProperty);
    const curTexture = curSpriteRenderer.shaderData.getTexture(_textureProperty);
    if (preTexture !== curTexture) {
      return false;
    }

    return (
      preSpriteElement.material === curSpriteElement.material && preSpriteElement.camera === curSpriteElement.camera
    );
  }

  private _checkBatchByMask(sr1: SpriteRenderer, sr2: SpriteRenderer): boolean {
    const maskInteraction1 = sr1.maskInteraction;
    if (maskInteraction1 !== sr2.maskInteraction) {
      return false;
    }

    if (maskInteraction1 === SpriteMaskInteraction.None) {
      return true;
    }

    return sr1.maskLayer === sr2.maskLayer;
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
}
