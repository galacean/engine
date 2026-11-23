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

    const holesA = preRenderer._uiMaskOutsideRects;
    const holesB = renderer._uiMaskOutsideRects;
    if (holesA !== holesB) {
      if (!holesA || !holesB || holesA.length !== holesB.length) return false;
      for (let i = 0; i < holesA.length; i++) {
        const a = holesA[i],
          b = holesB[i];
        if (a.x !== b.x || a.y !== b.y || a.z !== b.z || a.w !== b.w) return false;
      }
    }
    const rendererAAny = preRenderer as any;
    const rendererBAny = renderer as any;
    if (rendererAAny._rectMaskEnabled !== rendererBAny._rectMaskEnabled) return false;
    if (rendererAAny._rectMaskEnabled) {
      const a = rendererAAny._rectMaskRect;
      const b = rendererBAny._rectMaskRect;
      if (a.x !== b.x || a.y !== b.y || a.z !== b.z || a.w !== b.w) return false;
    }
    if (holesA?.length || rendererAAny._rectMaskEnabled) {
      const axA = preRenderer._uiMaskAxisX;
      const axB = renderer._uiMaskAxisX;
      if (axA !== axB) {
        if (!axA || !axB || axA.x !== axB.x || axA.y !== axB.y || axA.z !== axB.z || axA.w !== axB.w) return false;
      }
      const ayA = preRenderer._uiMaskAxisY;
      const ayB = renderer._uiMaskAxisY;
      if (ayA !== ayB) {
        if (!ayA || !ayB || ayA.x !== ayB.x || ayA.y !== ayB.y || ayA.z !== ayB.z || ayA.w !== ayB.w) return false;
      }
    }

    // Order: cheap reference checks → mask state → tag lookup (rare opt-out)
    return (
      preElement.subChunk!.chunk === curElement.subChunk!.chunk &&
      preElement.texture === curElement.texture &&
      preElement.material === curElement.material &&
      maskInteraction === renderer.maskInteraction &&
      (!holesA?.length || VertexMergeBatcher._areCoplanar(preRenderer, renderer)) &&
      (preMasks !== null ||
        maskInteraction === SpriteMaskInteraction.None ||
        preRenderer.maskLayer === renderer.maskLayer) &&
      curElement.subShader.passes[0].getTagValue(VertexMergeBatcher._disableBatchTag) !== true
    );
  }

  private static _areCoplanar(a: SpriteRenderer, b: SpriteRenderer): boolean {
    if (a === b) return true;
    const ae = a.entity.transform.worldMatrix.elements;
    const be = b.entity.transform.worldMatrix.elements;
    // Use transformed XY basis vectors, not forward directions: parent transforms can shear.
    const ax = ae[1] * ae[6] - ae[2] * ae[5];
    const ay = ae[2] * ae[4] - ae[0] * ae[6];
    const az = ae[0] * ae[5] - ae[1] * ae[4];
    const bx = be[1] * be[6] - be[2] * be[5];
    const by = be[2] * be[4] - be[0] * be[6];
    const bz = be[0] * be[5] - be[1] * be[4];
    // A shared stencil test is valid only when the screen sample maps to the same world point.
    // Exact comparison may split nearly coplanar graphics, but must never merge distinct planes.
    return (
      (ax !== 0 || ay !== 0 || az !== 0) &&
      (bx !== 0 || by !== 0 || bz !== 0) &&
      ay * bz === az * by &&
      az * bx === ax * bz &&
      ax * by === ay * bx &&
      ax * (be[12] - ae[12]) + ay * (be[13] - ae[13]) + az * (be[14] - ae[14]) === 0
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
