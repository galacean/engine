import { SpriteMask, SpriteMaskInteraction, SpriteRenderer } from "../2d";
import { ShaderTagKey } from "../shader";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class BatchUtils {
  protected static _disableBatchTag: ShaderTagKey = ShaderTagKey.getByName("spriteDisableBatching");

  static canBatchSprite(preSubElement: SubRenderElement, subElement: SubRenderElement): boolean {
    if (subElement.subShader.passes[0].getTagValue(BatchUtils._disableBatchTag) === true) {
      return false;
    }
    if (preSubElement.subChunk.chunk !== subElement.subChunk.chunk) {
      return false;
    }

    const preRenderer = <SpriteRenderer>preSubElement.component;
    const renderer = <SpriteRenderer>subElement.component;
    const maskInteractionA = preRenderer.maskInteraction;

    // Compare mask, texture and material
    return (
      maskInteractionA === renderer.maskInteraction &&
      (maskInteractionA === SpriteMaskInteraction.None || preRenderer.maskLayer === renderer.maskLayer) &&
      preSubElement.texture === subElement.texture &&
      preSubElement.material === subElement.material
    );
  }

  static canBatchSpriteMask(preSubElement: SubRenderElement, subElement: SubRenderElement): boolean {
    if (preSubElement.subChunk.chunk !== subElement.subChunk.chunk) {
      return false;
    }

    const alphaCutoffProperty = SpriteMask._alphaCutoffProperty;

    // Compare renderer property
    return (
      preSubElement.texture === subElement.texture &&
      (<SpriteMask>preSubElement.component).shaderData.getFloat(alphaCutoffProperty) ===
        (<SpriteMask>subElement.component).shaderData.getFloat(alphaCutoffProperty)
    );
  }

  static batchFor2D(preSubElement: SubRenderElement | null, subElement: SubRenderElement): void {
    const subChunk = subElement.subChunk;
    const { chunk, indices: subChunkIndices } = subChunk;

    const length = subChunkIndices.length;
    let startIndex = chunk.updateIndexLength;
    if (preSubElement) {
      preSubElement.subChunk.subMesh.count += length;
    } else {
      // Reset subMesh
      const subMesh = subChunk.subMesh;
      subMesh.start = startIndex;
      subMesh.count = length;
    }

    const { start, size } = subChunk.vertexArea;
    const vertexOffset = start / 9;
    const indices = chunk.indices;
    for (let i = 0; i < length; ++i) {
      indices[startIndex++] = vertexOffset + subChunkIndices[i];
    }
    chunk.updateIndexLength += length;
    chunk.updateVertexStart = Math.min(chunk.updateVertexStart, start);
    chunk.updateVertexEnd = Math.max(chunk.updateVertexEnd, start + size);
  }
}
