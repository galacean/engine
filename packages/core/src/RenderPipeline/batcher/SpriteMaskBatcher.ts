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
  /** @internal */
  _batchedQueue: RenderElement[] = [];
  /** @internal */
  _stencilOps: StencilOperation[] = [];
  /** @internal */
  _preRenderElement: RenderElement = null;
  /** @internal */
  _preOp: StencilOperation = null;

  constructor(engine: Engine, maxVertexCount: number = Batcher2D.MAX_VERTEX_COUNT) {
    super(engine, maxVertexCount);
  }

  drawElement(element: RenderElement, camera: Camera, op: StencilOperation): void {
    const { _preRenderElement: preRenderElement } = this;
    if (preRenderElement) {
      if (this.canBatch(preRenderElement, element, this._preOp, op)) {
        this._updateRenderElement(preRenderElement, element, true, op);
      } else {
        this._batchedQueue.push(preRenderElement);
        this._stencilOps.push(this._preOp);
        this._updateRenderElement(preRenderElement, element, false, op);
      }
    } else {
      this._updateRenderElement(preRenderElement, element, false, op);
    }
  }

  uploadAndDraw(camera: Camera): void {
    const { _batchedQueue: batchedQueue, _stencilOps: stencilOps } = this;
    if (this._preRenderElement) {
      batchedQueue.push(this._preRenderElement);
      stencilOps.push(this._preOp);
    }

    this.uploadBuffer();
    this.drawBatches(camera);
  }

  override clear(): void {
    super.clear();
    this._batchedQueue.length = 0;
    this._stencilOps.length = 0;
    this._preRenderElement = null;
    this._preOp = null;
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

    if (preSpriteData.chunk._meshBuffer !== curSpriteData.chunk._meshBuffer) {
      return false;
    }

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

  drawBatches(camera: Camera): void {
    const { _engine: engine, _batchedQueue: batchedQueue, _stencilOps: stencilOps } = this;
    const sceneData = camera.scene.shaderData;
    const cameraData = camera.shaderData;

    for (let i = 0, len = batchedQueue.length; i < len; i++) {
      // const subMesh = subMeshes[i];
      const spriteMaskElement = batchedQueue[i];
      const stencilOp = stencilOps[i];
      const renderData = <SpriteRenderData>spriteMaskElement.data;
      const mesh = renderData.chunk._meshBuffer._mesh;

      if (!spriteMaskElement) {
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

      engine._hardwareRenderer.drawPrimitive(mesh._primitive, renderData.chunk._subMesh, program);
    }
  }

  private _updateRenderElement(
    preRenderElement: RenderElement,
    curRenderElement: RenderElement,
    canBatch: boolean,
    op: StencilOperation
  ): void {
    const curRenderData = <SpriteRenderData>curRenderElement.data;
    const { chunk } = curRenderData;
    const { _meshBuffer: meshBuffer, _indices: tempIndices, _vEntry: vEntry } = chunk;
    const { _indices: indices } = meshBuffer;
    const vertexStartIndex = vEntry.start / 9;
    const len = tempIndices.length;
    let startIndex = meshBuffer._iLen;
    if (canBatch) {
      const preRenderData = <SpriteRenderData>preRenderElement.data;
      const { _subMesh } = preRenderData.chunk;
      _subMesh.count += len;
    } else {
      const { _subMesh } = chunk;
      _subMesh.start = startIndex;
      _subMesh.count = len;
      meshBuffer._mesh.addSubMesh(_subMesh);
    }
    for (let i = 0; i < len; ++i) {
      indices[startIndex++] = vertexStartIndex + tempIndices[i];
    }
    meshBuffer._iLen += len;
    meshBuffer._vLen = Math.max(meshBuffer._vLen, vEntry.start + vEntry.len);
    if (!canBatch) {
      this._preRenderElement = curRenderElement;
      this._preOp = op;
    }
  }
}
