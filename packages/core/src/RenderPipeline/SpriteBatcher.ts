import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { SpriteRenderer } from "../2d/sprite/SpriteRenderer";
import { Engine } from "../Engine";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";
import { Shader } from "../shader/Shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Basic2DBatcher } from "./Basic2DBatcher";
import { SpriteElement } from "./SpriteElement";

/**
 * @internal
 */
export class SpriteBatcher extends Basic2DBatcher {
  private static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_spriteTexture");

  createVertexElements(vertexElements: VertexElement[]): number {
    vertexElements[0] = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
    vertexElements[1] = new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0);
    vertexElements[2] = new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0);
    return 36;
  }

  canBatch(preElement: SpriteElement, curElement: SpriteElement): boolean {
    const preRenderer = <SpriteRenderer>preElement.component;
    const curRenderer = <SpriteRenderer>curElement.component;

    // Compare mask
    if (!this.checkBatchWithMask(preRenderer, curRenderer)) {
      return false;
    }

    // Compare renderer property
    const textureProperty = SpriteBatcher._textureProperty;
    if (preRenderer.shaderData.getTexture(textureProperty) !== curRenderer.shaderData.getTexture(textureProperty)) {
      return false;
    }

    // Compare material
    return preElement.material === curElement.material;
  }

  checkBatchWithMask(left: SpriteRenderer, right: SpriteRenderer): boolean {
    const leftMaskInteraction = left.maskInteraction;

    if (leftMaskInteraction !== right.maskInteraction) {
      return false;
    }
    if (leftMaskInteraction === SpriteMaskInteraction.None) {
      return true;
    }
    return left.maskLayer === right.maskLayer;
  }

  updateVertices(element: SpriteElement, vertices: Float32Array, vertexIndex: number): number {
    const { positions, uv, color } = element;
    const verticesNum = positions.length;
    for (let i = 0; i < verticesNum; i++) {
      const curPos = positions[i];
      const curUV = uv[i];

      vertices[vertexIndex++] = curPos.x;
      vertices[vertexIndex++] = curPos.y;
      vertices[vertexIndex++] = curPos.z;
      vertices[vertexIndex++] = curUV.x;
      vertices[vertexIndex++] = curUV.y;
      vertices[vertexIndex++] = color.r;
      vertices[vertexIndex++] = color.g;
      vertices[vertexIndex++] = color.b;
      vertices[vertexIndex++] = color.a;
    }

    return vertexIndex;
  }

  drawBatches(engine: Engine): void {
    const mesh = this._meshes[this._flushId];
    const subMeshes = mesh.subMeshes;
    const batchedQueue = this._batchedQueue;
    const maskManager = engine.spriteMaskManager;

    for (let i = 0, len = subMeshes.length; i < len; i++) {
      const subMesh = subMeshes[i];
      const spriteElement = <SpriteElement>batchedQueue[i];

      if (!subMesh || !spriteElement) {
        return;
      }

      const renderer = <SpriteRenderer>spriteElement.component;
      const camera = spriteElement.camera;
      maskManager.preRender(camera, renderer);

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

      maskManager.postRender(renderer);
    }
  }
}
