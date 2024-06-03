import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { SpriteRenderer } from "../2d/sprite/SpriteRenderer";
import { Camera } from "../Camera";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";
import { Shader } from "../shader/Shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Basic2DBatcher } from "./Basic2DBatcher";
import { RenderElement } from "./RenderElement";
import { SpriteRenderData } from "./SpriteRenderData";

/**
 * @internal
 */
export class SpriteBatcher extends Basic2DBatcher {
  private static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_SpriteTexture");

  createVertexElements(vertexElements: VertexElement[]): number {
    vertexElements[0] = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
    vertexElements[1] = new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0);
    vertexElements[2] = new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0);
    return 36;
  }

  canBatch(preElement: RenderElement, curElement: RenderElement): boolean {
    if (
      !this._engine._canSpriteBatch ||
      curElement.shaderPasses[0].getTagValue(Basic2DBatcher._disableBatchTag) === true
    ) {
      return false;
    }

    const preSpriteData = <SpriteRenderData>preElement.data;
    const curSpriteData = <SpriteRenderData>curElement.data;
    const preRenderer = <SpriteRenderer>preSpriteData.component;
    const curRenderer = <SpriteRenderer>curSpriteData.component;

    // Compare mask
    if (!this.checkBatchWithMask(preRenderer, curRenderer)) {
      return false;
    }

    // Compare texture
    if (preSpriteData.texture !== curSpriteData.texture) {
      return false;
    }

    // Compare material
    return preSpriteData.material === curSpriteData.material;
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

  updateVertices(element: SpriteRenderData, vertices: Float32Array, vertexIndex: number): number {
    const { positions, uvs, color, vertexCount } = element.verticesData;
    for (let i = 0; i < vertexCount; i++) {
      const curPos = positions[i];
      const curUV = uvs[i];
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

  drawBatches(camera: Camera): void {
    const { _engine: engine, _batchedQueue: batchedQueue } = this;
    const mesh = this._meshes[this._flushId];
    const { subMeshes, _primitive: primitive } = mesh;
    const maskManager = engine._spriteMaskManager;
    const sceneData = camera.scene.shaderData;
    const cameraData = camera.shaderData;

    for (let i = 0, len = subMeshes.length; i < len; i++) {
      const subMesh = subMeshes[i];
      const spriteElement = batchedQueue[i];
      const spriteData = <SpriteRenderData>spriteElement.data;

      if (!subMesh || !spriteElement) {
        return;
      }

      const renderer = <SpriteRenderer>spriteData.component;
      const material = spriteData.material;
      maskManager.preRender(camera, renderer);

      const compileMacros = Shader._compileMacros;
      // union render global macro and material self macro.
      ShaderMacroCollection.unionCollection(
        renderer._globalShaderMacro,
        material.shaderData._macroCollection,
        compileMacros
      );

      const pass = spriteElement.shaderPasses[0];
      const program = pass._getShaderProgram(engine, compileMacros);
      if (!program.isValid) {
        return;
      }

      renderer.shaderData.setTexture(SpriteBatcher._textureProperty, spriteData.texture);

      program.bind();
      program.groupingOtherUniformBlock();
      program.uploadAll(program.sceneUniformBlock, sceneData);
      program.uploadAll(program.cameraUniformBlock, cameraData);
      program.uploadAll(program.rendererUniformBlock, renderer.shaderData);
      program.uploadAll(program.materialUniformBlock, material.shaderData);

      (pass._renderState || material.renderState)._applyStates(engine, false, pass._renderStateDataMap, material.shaderData);
      engine._hardwareRenderer.drawPrimitive(primitive, subMesh, program);

      maskManager.postRender(renderer);
    }
  }
}
