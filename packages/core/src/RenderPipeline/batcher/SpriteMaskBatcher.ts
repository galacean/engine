import { SpriteMask } from "../../2d/sprite/SpriteMask";
import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { StencilOperation } from "../../shader/enums/StencilOperation";
import { Shader } from "../../shader/Shader";
import { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import { RenderElement } from "../RenderElement";
import { SpriteRenderData } from "../SpriteRenderData";
import { Batcher2D } from "./Batcher2D";

export class SpriteMaskBatcher extends Batcher2D {
  static override MAX_VERTEX_COUNT: number = 128;
  static _canUploadSameBuffer: boolean = true;

  /** @internal */
  _batchedQueue: RenderElement[] = [];
  /** @internal */
  _stencilOps: StencilOperation[] = [];
  /** @internal */
  _elementCount: number = 0;

  constructor(engine: Engine) {
    super(engine);
  }

  drawElement(element: RenderElement, camera: Camera, op: StencilOperation): void {
    const vertexCount = (<SpriteRenderData>element.data).verticesData.vertexCount;
    if (this._vertexCount + vertexCount > SpriteMaskBatcher.MAX_VERTEX_COUNT) {
      this.uploadAndDraw(camera);
    }

    this._vertexCount += vertexCount;
    this._batchedQueue[this._elementCount] = element;
    this._stencilOps[this._elementCount++] = op;
  }

  uploadAndDraw(camera: Camera): void {
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

  override clear(): void {
    super.clear();
    this._vertexCount = 0;
    this._elementCount = 0;
    this._batchedQueue.length = 0;
    this._stencilOps.length = 0;
  }

  override destroy(): void {
    this._batchedQueue = null;
    this._stencilOps = null;
    super.destroy();
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
      vertices[vertexIndex++] = 1;
      vertices[vertexIndex++] = 1;
      vertices[vertexIndex++] = 1;
      vertices[vertexIndex++] = 1;
    }

    return vertexIndex;
  }

  drawBatches(camera: Camera): void {
    const { _engine: engine, _batchedQueue: batchedQueue, _stencilOps: stencilOps } = this;
    const mesh = this._meshBuffers[this._flushId]._mesh;
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

      engine._hardwareRenderer.drawPrimitive(mesh._primitive, subMesh, program);
    }
  }

  private _updateData(engine: Engine): void {
    const { _meshBuffers, _flushId } = this;

    if (!SpriteMaskBatcher._canUploadSameBuffer && _meshBuffers.length <= _flushId) {
      this._createMeshBuffer(engine, _flushId);
    }

    const { _batchedQueue: batchedQueue, _stencilOps: stencilOps } = this;
    const meshBuffer = _meshBuffers[_flushId];
    const { _vertices: vertices, _indices: indices, _mesh: mesh } = meshBuffer;
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
    meshBuffer.uploadBuffer(vertexIndex, indiceIndex);
  }
}
