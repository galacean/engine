import { SpriteMask, SpriteMaskInteraction, SpriteRenderer } from "../2d";
import { ShaderTagKey } from "../shader";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class BatchUtils {
  protected static _disableBatchTag: ShaderTagKey = ShaderTagKey.getByName("spriteDisableBatching");

  static canBatchSprite(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    if (elementB.shaderPasses[0].getTagValue(BatchUtils._disableBatchTag) === true) {
      return false;
    }
    if (elementA.subChunk.chunk !== elementB.subChunk.chunk) {
      return false;
    }

    const rendererA = <SpriteRenderer>elementA.component;
    const rendererB = <SpriteRenderer>elementB.component;
    const maskInteractionA = rendererA.maskInteraction;
    const rendererAAny = rendererA as any;
    const rendererBAny = rendererB as any;
    const rectMaskEnabledA = rendererAAny._rectMaskEnabled;
    if (rectMaskEnabledA !== rendererBAny._rectMaskEnabled) {
      return false;
    }
    if (rectMaskEnabledA) {
      const rectMaskRectA = rendererAAny._rectMaskRect;
      const rectMaskRectB = rendererBAny._rectMaskRect;
      const rectMaskSoftnessA = rendererAAny._rectMaskSoftness;
      const rectMaskSoftnessB = rendererBAny._rectMaskSoftness;
      if (
        !rectMaskRectA ||
        !rectMaskRectB ||
        !rectMaskSoftnessA ||
        !rectMaskSoftnessB ||
        rectMaskRectA.x !== rectMaskRectB.x ||
        rectMaskRectA.y !== rectMaskRectB.y ||
        rectMaskRectA.z !== rectMaskRectB.z ||
        rectMaskRectA.w !== rectMaskRectB.w ||
        rectMaskSoftnessA.x !== rectMaskSoftnessB.x ||
        rectMaskSoftnessA.y !== rectMaskSoftnessB.y ||
        rectMaskSoftnessA.z !== rectMaskSoftnessB.z ||
        rectMaskSoftnessA.w !== rectMaskSoftnessB.w ||
        rendererAAny._rectMaskHardClip !== rendererBAny._rectMaskHardClip
      ) {
        return false;
      }
    }

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
      elementA.texture === elementB.texture &&
      (<SpriteMask>elementA.component).shaderData.getFloat(alphaCutoffProperty) ===
        (<SpriteMask>elementB.component).shaderData.getFloat(alphaCutoffProperty)
    );
  }

  static batchFor2D(elementA: SubRenderElement, elementB?: SubRenderElement): void {
    const subChunk = elementB ? elementB.subChunk : elementA.subChunk;
    const { chunk, indices: subChunkIndices } = subChunk;

    const length = subChunkIndices.length;
    let startIndex = chunk.updateIndexLength;
    if (elementB) {
      elementA.subChunk.subMesh.count += length;
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
