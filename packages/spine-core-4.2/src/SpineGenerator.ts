import type { ISpineGeometry } from "@galacean/engine-design";
import {
  ArrayLike,
  ClippingAttachment,
  Color,
  MeshAttachment,
  NumberArrayLike,
  RegionAttachment,
  Skeleton,
  SkeletonClipping
} from "@esotericsoftware/spine-core";
import type { Texture2D } from "@galacean/engine";
import { SpineTexture } from "./SpineTexture";

/**
 * @internal
 */
export class SpineGenerator {
  static tempDark = new Color();
  static tempColor = new Color();
  static tempVerts = new Array(8);
  static QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];

  private _clipper: SkeletonClipping = new SkeletonClipping();

  buildGeometry(skeleton: Skeleton, target: ISpineGeometry<Texture2D>) {
    const { premultipliedAlpha, tintBlack } = target;
    const { _clipper } = this;
    const { tempVerts } = SpineGenerator;

    let triangles: Array<number>;
    let uvs: NumberArrayLike;

    const drawOrder = skeleton.drawOrder;
    for (let drawOrderIndex = 0, n = drawOrder.length; drawOrderIndex < n; ++drawOrderIndex) {
      const slot = drawOrder[drawOrderIndex];
      if (!slot.bone.active) {
        _clipper.clipEndWithSlot(slot);
        continue;
      }

      const attachment = slot.getAttachment();
      if (!attachment) {
        _clipper.clipEndWithSlot(slot);
        continue;
      }

      const isClipping = _clipper.isClipping();
      let numFloats = 0;
      let attachmentColor: Color = null;
      let texture: SpineTexture;

      // Native clipping produces xy, light RGBA, UV, and optional dark RGBA.
      const vertexSize = tintBlack ? 12 : 8;
      const clippedVertexSize = isClipping ? 2 : vertexSize;

      switch (attachment.constructor) {
        case RegionAttachment:
          const regionAttachment = <RegionAttachment>attachment;
          attachmentColor = regionAttachment.color;
          numFloats = clippedVertexSize << 2;
          regionAttachment.computeWorldVertices(slot, tempVerts, 0, clippedVertexSize);
          triangles = SpineGenerator.QUAD_TRIANGLES;
          uvs = regionAttachment.uvs;
          texture = regionAttachment.region.texture;
          break;
        case MeshAttachment:
          const meshAttachment = <MeshAttachment>attachment;
          attachmentColor = meshAttachment.color;
          numFloats = (meshAttachment.worldVerticesLength >> 1) * clippedVertexSize;
          if (numFloats > tempVerts.length) {
            tempVerts.length = numFloats;
          }
          meshAttachment.computeWorldVertices(
            slot,
            0,
            meshAttachment.worldVerticesLength,
            tempVerts,
            0,
            clippedVertexSize
          );
          triangles = meshAttachment.triangles;
          uvs = meshAttachment.uvs;
          texture = meshAttachment.region.texture;
          break;
        case ClippingAttachment:
          const clip = <ClippingAttachment>attachment;
          _clipper.clipStart(slot, clip);
          continue;
        default:
          _clipper.clipEndWithSlot(slot);
          continue;
      }

      if (texture != null) {
        let finalVertices: ArrayLike<number>;
        let finalVerticesLength: number;
        let finalIndices: ArrayLike<number>;
        let finalIndicesLength: number;

        const skeleton = slot.bone.skeleton;
        const skeletonColor = skeleton.color;
        const slotColor = slot.color;
        const finalColor = SpineGenerator.tempColor;
        const finalAlpha = skeletonColor.a * slotColor.a * attachmentColor.a;

        finalColor.r = skeletonColor.r * slotColor.r * attachmentColor.r;
        finalColor.g = skeletonColor.g * slotColor.g * attachmentColor.g;
        finalColor.b = skeletonColor.b * slotColor.b * attachmentColor.b;
        finalColor.a = finalAlpha;

        if (premultipliedAlpha) {
          finalColor.r *= finalAlpha;
          finalColor.g *= finalAlpha;
          finalColor.b *= finalAlpha;
        }

        const darkColor = SpineGenerator.tempDark;
        const slotDarkColor = slot.darkColor;
        if (!slotDarkColor) {
          darkColor.set(0, 0, 0, 1);
        } else {
          if (premultipliedAlpha) {
            darkColor.r = slotDarkColor.r * finalAlpha;
            darkColor.g = slotDarkColor.g * finalAlpha;
            darkColor.b = slotDarkColor.b * finalAlpha;
          } else {
            darkColor.setFromColor(slotDarkColor);
          }
        }

        if (isClipping) {
          _clipper.clipTriangles(tempVerts, triangles, triangles.length, uvs, finalColor, darkColor, tintBlack);
          finalVertices = _clipper.clippedVertices;
          finalVerticesLength = finalVertices.length;
          finalIndices = _clipper.clippedTriangles;
          finalIndicesLength = finalIndices.length;
        } else {
          const { r, g, b, a } = finalColor;
          for (let v = 2, u = 0, n = numFloats; v < n; v += vertexSize, u += 2) {
            tempVerts[v] = r;
            tempVerts[v + 1] = g;
            tempVerts[v + 2] = b;
            tempVerts[v + 3] = a;
            tempVerts[v + 4] = uvs[u];
            tempVerts[v + 5] = uvs[u + 1];
            if (tintBlack) {
              tempVerts[v + 6] = darkColor.r;
              tempVerts[v + 7] = darkColor.g;
              tempVerts[v + 8] = darkColor.b;
              tempVerts[v + 9] = darkColor.a;
            }
          }
          finalVertices = tempVerts;
          finalVerticesLength = numFloats;
          finalIndices = triangles;
          finalIndicesLength = triangles.length;
        }

        target.append(
          finalVertices,
          finalVerticesLength / vertexSize,
          finalIndices,
          finalIndicesLength,
          texture.getImage(),
          slot.data.blendMode,
          drawOrderIndex,
          slot.data.index
        );
      }

      _clipper.clipEndWithSlot(slot);
    } // slot traverse end

    _clipper.clipEnd();
  }
}
