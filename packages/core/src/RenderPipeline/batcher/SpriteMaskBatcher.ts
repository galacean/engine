import { SpriteMask } from "../../2d/sprite/SpriteMask";
import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { Buffer, BufferBindFlag, BufferUsage, IndexFormat, MeshTopology, SubMesh, VertexElement } from "../../graphic";
import { VertexElementFormat } from "../../graphic/enums/VertexElementFormat";
import { BufferMesh } from "../../mesh";
import { ShaderTagKey } from "../../shader";
import { StencilOperation } from "../../shader/enums/StencilOperation";
import { Shader } from "../../shader/Shader";
import { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import { ClassPool } from "../ClassPool";
import { RenderElement } from "../RenderElement";
import { SpriteRenderData } from "../SpriteRenderData";

export class SpriteMaskBatcher {
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
  _stencilOps: StencilOperation[] = [];
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

  createVertexElements(vertexElements: VertexElement[]): number {
    vertexElements[0] = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
    vertexElements[1] = new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0);
    return 20;
  }

  drawElement(element: RenderElement, camera: Camera, op: StencilOperation): void {
    const vertexCount = (<SpriteRenderData>element.data).verticesData.vertexCount;
    if (this._vertexCount + vertexCount > SpriteMaskBatcher.MAX_VERTEX_COUNT) {
      this.flush(camera);
    }

    this._vertexCount += vertexCount;
    this._batchedQueue[this._elementCount] = element;
    this._stencilOps[this._elementCount++] = op;
  }

  flush(camera: Camera): void {
    const batchedQueue = this._batchedQueue;

    if (batchedQueue.length === 0) {
      return;
    }
    this._updateData(this._engine);
    this.drawBatches(camera);

    if (!SpriteMaskBatcher._canUploadSameBuffer) {
      this._flushId++;
    }

    batchedQueue.length = 0;
    this._stencilOps.length = 0;
    this._subMeshPool.resetPool();
    this._vertexCount = 0;
    this._elementCount = 0;
  }

  clear(): void {
    this._flushId = 0;
    this._vertexCount = 0;
    this._elementCount = 0;
    this._batchedQueue.length = 0;
    this._stencilOps.length = 0;
  }

  destroy(): void {
    this._batchedQueue = null;
    this._stencilOps = null;

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

  canBatch(
    preElement: RenderElement,
    curElement: RenderElement,
    preStencilOp: StencilOperation,
    curStencilOp: StencilOperation
  ): boolean {
    const preSpriteData = <SpriteRenderData>preElement.data;
    const curSpriteData = <SpriteRenderData>curElement.data;

    if (preStencilOp !== curStencilOp) {
      return false;
    }

    // Compare renderer property
    const preShaderData = (<SpriteMask>preSpriteData.component).shaderData;
    const curShaderData = (<SpriteMask>curSpriteData.component).shaderData;
    const textureProperty = SpriteMask._textureProperty;
    const alphaCutoffProperty = SpriteMask._alphaCutoffProperty;

    return (
      preShaderData.getTexture(textureProperty) === curShaderData.getTexture(textureProperty) &&
      preShaderData.getTexture(alphaCutoffProperty) === curShaderData.getTexture(alphaCutoffProperty)
    );
  }

  updateVertices(element: SpriteRenderData, vertices: Float32Array, vertexIndex: number): number {
    const { positions, uvs, vertexCount } = element.verticesData;
    for (let i = 0; i < vertexCount; i++) {
      const curPos = positions[i];
      const curUV = uvs[i];
      vertices[vertexIndex++] = curPos.x;
      vertices[vertexIndex++] = curPos.y;
      vertices[vertexIndex++] = curPos.z;
      vertices[vertexIndex++] = curUV.x;
      vertices[vertexIndex++] = curUV.y;
    }

    return vertexIndex;
  }

  drawBatches(camera: Camera): void {
    const { _engine: engine, _batchedQueue: batchedQueue, _stencilOps: stencilOps } = this;
    const mesh = this._meshes[this._flushId];
    const subMeshes = mesh.subMeshes;
    const sceneData = camera.scene.shaderData;
    const cameraData = camera.shaderData;

    for (let i = 0, len = subMeshes.length; i < len; i++) {
      const subMesh = subMeshes[i];
      const spriteMaskElement = batchedQueue[i];
      const stencilOp = stencilOps[i];
      const renderData = <SpriteRenderData>spriteMaskElement.data;

      if (!subMesh || !spriteMaskElement) {
        return;
      }

      const renderer = <SpriteMask>renderData.component;
      const material = renderData.material;

      const compileMacros = Shader._compileMacros;
      // union render global macro and material self macro.
      ShaderMacroCollection.unionCollection(
        renderer._globalShaderMacro,
        material.shaderData._macroCollection,
        compileMacros
      );

      // Update stencil state
      const stencilState = material.renderState.stencilState;
      stencilState.passOperationFront = stencilOp;
      stencilState.passOperationBack = stencilOp;

      const pass = material.shader.subShaders[0].passes[0];
      const program = pass._getShaderProgram(engine, compileMacros);
      if (!program.isValid) {
        return;
      }

      program.bind();
      program.groupingOtherUniformBlock();
      program.uploadAll(program.sceneUniformBlock, sceneData);
      program.uploadAll(program.cameraUniformBlock, cameraData);
      program.uploadAll(program.rendererUniformBlock, renderer.shaderData);
      program.uploadAll(program.materialUniformBlock, material.shaderData);

      material.renderState._apply(engine, false, pass._renderStateDataMap, material.shaderData);

      engine._hardwareRenderer.drawPrimitive(mesh, subMesh, program);
    }
  }

  /**
   * @internal
   * Standalone for canvas 2d renderer plugin.
   */
  _initMeshes(engine: Engine) {
    const { MAX_VERTEX_COUNT } = SpriteMaskBatcher;
    this._vertices = new Float32Array(MAX_VERTEX_COUNT * 5);
    this._indices = new Uint16Array(MAX_VERTEX_COUNT * 1.5);

    const { _meshes, _meshCount } = this;
    for (let i = 0; i < _meshCount; i++) {
      _meshes[i] = this._createMesh(engine, i);
    }
  }

  private _createMesh(engine: Engine, index: number): BufferMesh {
    const { MAX_VERTEX_COUNT } = SpriteMaskBatcher;
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
      MAX_VERTEX_COUNT * 3,
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

    if (!SpriteMaskBatcher._canUploadSameBuffer && this._meshCount <= _flushId) {
      this._meshCount++;
      _meshes[_flushId] = this._createMesh(engine, _flushId);
    }

    const { _batchedQueue: batchedQueue, _stencilOps: stencilOps, _vertices: vertices, _indices: indices } = this;
    const mesh = _meshes[_flushId];
    mesh.clearSubMesh();

    let vertexIndex = 0;
    let indiceIndex = 0;
    let vertexStartIndex = 0;
    let vertexCount = 0;
    let curIndiceStartIndex = 0;
    let curMeshIndex = 0;
    let preElement: RenderElement = null;
    let preStencilOp: StencilOperation = null;
    for (let i = 0, len = batchedQueue.length; i < len; i++) {
      const curElement = batchedQueue[i];
      const curStencilOp = stencilOps[i];
      const curData = <SpriteRenderData>curElement.data;

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
        if (this.canBatch(preElement, curElement, preStencilOp, curStencilOp)) {
          vertexCount += triangleNum;
        } else {
          mesh.addSubMesh(this._getSubMeshFromPool(vertexStartIndex, vertexCount));
          vertexStartIndex += vertexCount;
          vertexCount = triangleNum;
          batchedQueue[curMeshIndex++] = preElement;
        }
      }

      preElement = curElement;
      preStencilOp = curStencilOp;
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
}
