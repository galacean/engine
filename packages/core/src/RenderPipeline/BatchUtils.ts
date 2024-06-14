import { SpriteMask, SpriteMaskInteraction, SpriteRenderer } from "../2d";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class BatchUtils {
  static canBatchSprite(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    if (elementA.subChunk.primitiveChunk !== elementB.subChunk.primitiveChunk) {
      return false;
    }

    const rendererA = <SpriteRenderer>elementA.component;
    const rendererB = <SpriteRenderer>elementB.component;

    // Compare mask
    const maskInteractionA = rendererA.maskInteraction;
    if (
      maskInteractionA !== rendererB.maskInteraction ||
      (maskInteractionA !== SpriteMaskInteraction.None && rendererA.maskLayer !== rendererB.maskLayer)
    ) {
      return false;
    }

    // Compare texture and material
    return elementA.texture === elementB.texture && elementA.material === elementB.material;
  }

  static canBatchSpriteMask(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    if (elementA.subChunk.primitiveChunk !== elementB.subChunk.primitiveChunk) {
      return false;
    }

    // Compare renderer property
    const shaderDataA = (<SpriteMask>elementA.component).shaderData;
    const shaderDataB = (<SpriteMask>elementB.component).shaderData;
    const textureProperty = SpriteMask._textureProperty;
    const alphaCutoffProperty = SpriteMask._alphaCutoffProperty;

    return (
      shaderDataA.getTexture(textureProperty) === shaderDataB.getTexture(textureProperty) &&
      shaderDataA.getTexture(alphaCutoffProperty) === shaderDataB.getTexture(alphaCutoffProperty)
    );
  }

  static batchRenderElementFor2D(elementA: SubRenderElement, elementB?: SubRenderElement): void {
    const chunk = elementB ? elementB.subChunk : elementA.subChunk;
    const { primitiveChunk: data, indices: tempIndices, vertexArea } = chunk;
    const start = vertexArea.start;
    const indices = data.indices;
    const vertexStartIndex = start / 9;
    const len = tempIndices.length;
    let startIndex = data.updateIndexLength;
    if (elementB) {
      const subMesh = elementA.subChunk.subMesh;
      subMesh.count += len;
    } else {
      const subMesh = chunk.subMesh;
      subMesh.start = startIndex;
      subMesh.count = len;
    }
    for (let i = 0; i < len; ++i) {
      indices[startIndex++] = vertexStartIndex + tempIndices[i];
    }
    data.updateIndexLength += len;
  }
}
