import { SpriteMask, SpriteMaskInteraction, SpriteRenderer } from "../2d";
import { ShaderTagKey } from "../shader";
import { RenderElement } from "./RenderElement";

/**
 * @internal
 */
export class VertexMergeBatcher {
  protected static _disableBatchTag: ShaderTagKey = ShaderTagKey.getByName("spriteDisableBatching");

  static canBatchSprite(preElement: RenderElement, curElement: RenderElement): boolean {
    const preRenderer = <SpriteRenderer>preElement.component;
    const renderer = <SpriteRenderer>curElement.component;
    const maskInteraction = preRenderer.maskInteraction;

    // Order: cheap reference checks → mask state → tag lookup (rare opt-out)
    return (
      preElement.subChunk.chunk === curElement.subChunk.chunk &&
      preElement.texture === curElement.texture &&
      preElement.material === curElement.material &&
      maskInteraction === renderer.maskInteraction &&
      (maskInteraction === SpriteMaskInteraction.None || preRenderer.maskLayer === renderer.maskLayer) &&
      curElement.subShader.passes[0].getTagValue(VertexMergeBatcher._disableBatchTag) !== true
    );
  }

  static canBatchSpriteMask(preElement: RenderElement, curElement: RenderElement): boolean {
    if (preElement.subChunk.chunk !== curElement.subChunk.chunk) {
      return false;
    }

    const alphaCutoffProperty = SpriteMask._alphaCutoffProperty;

    // Compare renderer property
    return (
      preElement.texture === curElement.texture &&
      (<SpriteMask>preElement.component).shaderData.getFloat(alphaCutoffProperty) ===
        (<SpriteMask>curElement.component).shaderData.getFloat(alphaCutoffProperty)
    );
  }

  static batch(preElement: RenderElement | null, curElement: RenderElement): void {
    const subChunk = curElement.subChunk;
    const { chunk, indices: subChunkIndices } = subChunk;

    const length = subChunkIndices.length;
    let startIndex = chunk.updateIndexLength;
    if (preElement) {
      preElement.subChunk.subMesh.count += length;
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
