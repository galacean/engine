import { SpriteMask } from "../2d/sprite/SpriteMask";
import { Camera } from "../Camera";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";
import { StencilOperation } from "../shader/enums/StencilOperation";
import { Shader } from "../shader/Shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { Basic2DBatcher } from "./Basic2DBatcher";
import { RenderElement } from "./RenderElement";
import { SpriteMaskRenderData } from "./SpriteMaskRenderData";

export class SpriteMaskBatcher extends Basic2DBatcher {
  createVertexElements(vertexElements: VertexElement[]): number {
    vertexElements[0] = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
    vertexElements[1] = new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0);
    return 20;
  }

  canBatch(preElement: RenderElement, curElement: RenderElement): boolean {
    const preSpriteData = <SpriteMaskRenderData>preElement.data;
    const curSpriteData = <SpriteMaskRenderData>curElement.data;

    if (preSpriteData.isAdd !== curSpriteData.isAdd) {
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

  updateVertices(element: SpriteMaskRenderData, vertices: Float32Array, vertexIndex: number): number {
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
    const { _engine: engine, _batchedQueue: batchedQueue } = this;
    const mesh = this._meshes[this._flushId];
    const { subMeshes, _primitive: primitive } = mesh;
    const sceneData = camera.scene.shaderData;
    const cameraData = camera.shaderData;

    for (let i = 0, len = subMeshes.length; i < len; i++) {
      const subMesh = subMeshes[i];
      const spriteMaskElement = batchedQueue[i];
      const spritMaskData = <SpriteMaskRenderData>spriteMaskElement.data;

      if (!subMesh || !spriteMaskElement) {
        return;
      }

      const renderer = <SpriteMask>spritMaskData.component;
      const material = spritMaskData.material;

      const compileMacros = Shader._compileMacros;
      // union render global macro and material self macro.
      ShaderMacroCollection.unionCollection(
        renderer._globalShaderMacro,
        material.shaderData._macroCollection,
        compileMacros
      );

      // Update stencil state
      const stencilState = material.renderState.stencilState;
      const op = spritMaskData.isAdd ? StencilOperation.IncrementSaturate : StencilOperation.DecrementSaturate;
      stencilState.passOperationFront = op;
      stencilState.passOperationBack = op;

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

      engine._hardwareRenderer.drawPrimitive(primitive, subMesh, program);
    }
  }
}
