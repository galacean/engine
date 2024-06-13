import { SpriteMask, SpriteMaskInteraction, SpriteRenderer } from "../2d";
import { SubRenderData2D } from "./SubRenderData2D";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class BatchUtils {
  static canBatchSprite(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    const subRenderDataA = <SubRenderData2D>elementA.subData;
    const subRenderDataB = <SubRenderData2D>elementB.subData;
    if (subRenderDataA.chunk.data !== subRenderDataB.chunk.data) {
      return false;
    }

    const rendererA = <SpriteRenderer>subRenderDataA.component;
    const rendererB = <SpriteRenderer>subRenderDataB.component;

    // Compare mask
    const maskInteractionA = rendererA.maskInteraction;
    if (
      maskInteractionA !== rendererB.maskInteraction ||
      (maskInteractionA !== SpriteMaskInteraction.None && rendererA.maskLayer !== rendererB.maskLayer)
    ) {
      return false;
    }

    // Compare texture and material
    return subRenderDataA.texture === subRenderDataB.texture && subRenderDataA.material === subRenderDataB.material;
  }

  static canBatchSpriteMask(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    const subRenderDataA = <SubRenderData2D>elementA.subData;
    const subRenderDataB = <SubRenderData2D>elementB.subData;
    if (subRenderDataA.chunk.data !== subRenderDataB.chunk.data) {
      return false;
    }

    // Compare renderer property
    const shaderDataA = (<SpriteMask>subRenderDataA.component).shaderData;
    const shaderDataB = (<SpriteMask>subRenderDataB.component).shaderData;
    const textureProperty = SpriteMask._textureProperty;
    const alphaCutoffProperty = SpriteMask._alphaCutoffProperty;

    return (
      shaderDataA.getTexture(textureProperty) === shaderDataB.getTexture(textureProperty) &&
      shaderDataA.getTexture(alphaCutoffProperty) === shaderDataB.getTexture(alphaCutoffProperty)
    );
  }

  static batchRenderElementFor2D(elementA: SubRenderElement, elementB?: SubRenderElement): void {
    const subRenderDataA = <SubRenderData2D>elementA.subData;
    const chunk = elementB ? (<SubRenderData2D>elementB.subData).chunk : subRenderDataA.chunk;
    const { data, indices: tempIndices, vertexArea } = chunk;
    const start = vertexArea.start;
    const indices = data.indices;
    const vertexStartIndex = start / 9;
    const len = tempIndices.length;
    let startIndex = data.indexLen;
    if (elementB) {
      const subMesh = subRenderDataA.chunk.subMesh;
      subMesh.count += len;
    } else {
      const subMesh = chunk.subMesh;
      subMesh.start = startIndex;
      subMesh.count = len;
    }
    for (let i = 0; i < len; ++i) {
      indices[startIndex++] = vertexStartIndex + tempIndices[i];
    }
    data.indexLen += len;
    data.vertexLen = Math.max(data.vertexLen, start + vertexArea.size);
  }
}
