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
    const preMasks = preRenderer._uiMasks;
    const masks = renderer._uiMasks;
    if (preMasks !== masks) {
      if (!preMasks || !masks || preMasks.length !== masks.length) return false;
      for (let i = 0; i < masks.length; i++) {
        if (preMasks[i] !== masks[i]) return false;
      }
    }

    const rendererAAny = preRenderer as any;
    const rendererBAny = renderer as any;
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

    // Order: cheap reference checks → mask state → tag lookup (rare opt-out)
    return (
      preElement.subChunk!.chunk === curElement.subChunk!.chunk &&
      preElement.texture === curElement.texture &&
      preElement.material === curElement.material &&
      maskInteraction === renderer.maskInteraction &&
      (preMasks !== null ||
        maskInteraction === SpriteMaskInteraction.None ||
        preRenderer.maskLayer === renderer.maskLayer) &&
      curElement.subShader.passes[0].getTagValue(VertexMergeBatcher._disableBatchTag) !== true
    );
  }

  static canBatchSpriteMask(preElement: RenderElement, curElement: RenderElement): boolean {
    if (preElement.subChunk!.chunk !== curElement.subChunk!.chunk) {
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
    const subChunk = curElement.subChunk!;
    const { chunk, indices: localIndices } = subChunk;

    const length = localIndices.length;
    if (preElement) {
      preElement.subChunk!.subMesh.count += length;
    } else {
      // First write this frame — init subMesh range
      subChunk.subMesh.start = chunk.updateIndexLength;
      subChunk.subMesh.count = length;
    }

    let startIndex = chunk.updateIndexLength;
    const { start, size } = subChunk.vertexArea;
    // PrimitiveChunk vertex layout: pos(3) + uv(2) + color(4) = 9 floats per vertex
    const vertexOffset = start / 9;
    const indices = chunk.indices;
    for (let i = 0; i < length; ++i) {
      indices[startIndex++] = vertexOffset + localIndices[i];
    }
    chunk.updateIndexLength += length;
    chunk.updateVertexStart = Math.min(chunk.updateVertexStart, start);
    chunk.updateVertexEnd = Math.max(chunk.updateVertexEnd, start + size);
  }
}
