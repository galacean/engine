import { SpriteMask, SpriteMaskInteraction, SpriteRenderer } from "../2d";
import { RenderData2D } from "./RenderData2D";
import { RenderElement } from "./RenderElement";

/**
 * @internal
 */
export class BatchUtils {
  static canBatchSprite(elementA: RenderElement, elementB: RenderElement): boolean {
    const renderDataA = <RenderData2D>elementA.data;
    const renderDataB = <RenderData2D>elementB.data;
    if (renderDataA.chunk.data !== renderDataB.chunk.data) {
      return false;
    }

    const rendererA = <SpriteRenderer>renderDataA.component;
    const rendererB = <SpriteRenderer>renderDataB.component;

    // Compare mask
    const maskInteractionA = rendererA.maskInteraction;
    if (
      maskInteractionA !== rendererB.maskInteraction ||
      (maskInteractionA !== SpriteMaskInteraction.None && rendererA.maskLayer !== rendererB.maskLayer)
    ) {
      return false;
    }

    // Compare texture and material
    return renderDataA.texture === renderDataB.texture && renderDataA.material === renderDataB.material;
  }

  static canBatchSpriteMask(elementA: RenderElement, elementB: RenderElement): boolean {
    const renderDataA = <RenderData2D>elementA.data;
    const renderDataB = <RenderData2D>elementB.data;
    if (renderDataA.chunk.data !== renderDataB.chunk.data) {
      return false;
    }

    // Compare renderer property
    const shaderDataA = (<SpriteMask>renderDataA.component).shaderData;
    const shaderDataB = (<SpriteMask>renderDataB.component).shaderData;
    const textureProperty = SpriteMask._textureProperty;
    const alphaCutoffProperty = SpriteMask._alphaCutoffProperty;

    return (
      shaderDataA.getTexture(textureProperty) === shaderDataB.getTexture(textureProperty) &&
      shaderDataA.getTexture(alphaCutoffProperty) === shaderDataB.getTexture(alphaCutoffProperty)
    );
  }

  static batchRenderElementFor2D(elementA: RenderElement, elementB?: RenderElement): void {
    const renderDataA = <RenderData2D>elementA.data;
    const chunk = elementB ? (<RenderData2D>elementB.data).chunk : renderDataA.chunk;
    const { data, indices: tempIndices, vertexArea } = chunk;
    const start = vertexArea.start;
    const indices = data.indices;
    const vertexStartIndex = start / 9;
    const len = tempIndices.length;
    let startIndex = data.indiceLen;
    if (elementB) {
      const subMesh = renderDataA.chunk.subMesh;
      subMesh.count += len;
    } else {
      const subMesh = chunk.subMesh;
      subMesh.start = startIndex;
      subMesh.count = len;
    }
    for (let i = 0; i < len; ++i) {
      indices[startIndex++] = vertexStartIndex + tempIndices[i];
    }
    data.indiceLen += len;
    data.vertexLen = Math.max(data.vertexLen, start + vertexArea.size);
  }
}
