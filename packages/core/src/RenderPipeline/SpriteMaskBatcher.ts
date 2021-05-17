import { SpriteMask } from "../2d/sprite/SpriteMask";
import { Engine } from "../Engine";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";
import { StencilOperation } from "../shader/enums/StencilOperation";
import { Shader } from "../shader/Shader";
import { Basic2DBatcher } from "./Basic2DBatcher";
import { SpriteMaskElement } from "./SpriteMaskElement";

export class SpriteMaskBatcher extends Basic2DBatcher {
  _createVertexElements(vertexElements: VertexElement[]): number {
    vertexElements[0] = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
    vertexElements[1] = new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0);
    return 20;
  }

  _canBatch(preElement: SpriteMaskElement, curElement: SpriteMaskElement): boolean {
    if (preElement.isAdd !== curElement.isAdd) {
      return false;
    }

    const preMask = <SpriteMask>preElement.component;
    const curMask = <SpriteMask>curElement.component;
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

  _updateVertices(element: SpriteMaskElement, vertices: Float32Array, vertexIndex: number): number {
    const { positions, uv } = element;
    const verticesNum = positions.length;
    for (let i = 0; i < verticesNum; i++) {
      const curPos = positions[i];
      const curUV = uv[i];

      vertices[vertexIndex++] = curPos.x;
      vertices[vertexIndex++] = curPos.y;
      vertices[vertexIndex++] = curPos.z;
      vertices[vertexIndex++] = curUV.x;
      vertices[vertexIndex++] = curUV.y;
    }

    return vertexIndex;
  }

  _drawBatches(engine: Engine): void {
    const mesh = this._meshes[this._flushId];
    const subMeshes = mesh.subMeshes;
    const batchedQueue = this._batchedQueue;

    for (let i = 0, len = subMeshes.length; i < len; i++) {
      const subMesh = subMeshes[i];
      const spriteMaskElement = <SpriteMaskElement>batchedQueue[i];

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

      const camera = spriteMaskElement.camera;
      const renderer = <SpriteMask>spriteMaskElement.component;

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
}
