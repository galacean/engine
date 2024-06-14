import { SpriteMask, SpriteMaskInteraction, SpriteRenderer } from "../2d";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class BatchUtils {
  static canBatchSprite(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    if (elementA.subChunk.chunk !== elementB.subChunk.chunk) {
      return false;
    }

    const rendererA = <SpriteRenderer>elementA.component;
    const rendererB = <SpriteRenderer>elementB.component;
    const maskInteractionA = rendererA.maskInteraction;

    // Compare mask, texture and material
    return (
      maskInteractionA === rendererB.maskInteraction &&
      (maskInteractionA === SpriteMaskInteraction.None || rendererA.maskLayer === rendererB.maskLayer) &&
      elementA.texture === elementB.texture &&
      elementA.material === elementB.material
    );
  }

  static canBatchSpriteMask(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    if (elementA.subChunk.chunk !== elementB.subChunk.chunk) {
      return false;
    }

    const alphaCutoffProperty = SpriteMask._alphaCutoffProperty;

    // Compare renderer property
    return (
      elementA.stencilOperation === elementB.stencilOperation &&
      elementA.texture === elementB.texture &&
      (<SpriteMask>elementA.component).shaderData.getFloat(alphaCutoffProperty) ===
        (<SpriteMask>elementB.component).shaderData.getFloat(alphaCutoffProperty)
    );
  }

  static batchFor2D(elementA: SubRenderElement, elementB?: SubRenderElement): void {
    const subChunk = elementB ? elementB.subChunk : elementA.subChunk;
    const { chunk, indices: subChunkIndices, vertexArea } = subChunk;
    const indices = chunk.indices;
    const vertexStartIndex = vertexArea.start / 9;
    const len = subChunkIndices.length;
    let startIndex = chunk.updateIndexLength;
    if (elementB) {
      const subMesh = elementA.subChunk.subMesh;
      subMesh.count += len;
    } else {
      const subMesh = subChunk.subMesh;
      subMesh.start = startIndex;
      subMesh.count = len;
    }
    for (let i = 0; i < len; ++i) {
      indices[startIndex++] = vertexStartIndex + subChunkIndices[i];
    }
    chunk.updateIndexLength += len;
  }
}
