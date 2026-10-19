import type { ISpineGeometry } from "@galacean/engine-design";
import {
  ArrayLike,
  ClippingAttachment,
  Color,
  MeshAttachment,
  RegionAttachment,
  Skeleton,
  SkeletonClipping,
  TextureAtlasRegion
} from "./spine-core";
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
    let uvs: ArrayLike<number>;

    const drawOrder = skeleton.drawOrder;
    for (let slotIndex = 0, n = drawOrder.length; slotIndex < n; ++slotIndex) {
      const slot = drawOrder[slotIndex];
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
          // spine 3.8's RegionAttachment.computeWorldVertices takes the Bone, not the Slot (4.2 takes Slot).
          regionAttachment.computeWorldVertices(slot.bone, tempVerts, 0, clippedVertexSize);
          triangles = SpineGenerator.QUAD_TRIANGLES;
          uvs = regionAttachment.uvs;
          // `region` is statically typed as the base TextureRegion (no `texture` field); it's
          // always a TextureAtlasRegion in practice, since AtlasAttachmentLoader is the only
          // source of regions. Its `.texture` is in turn always a SpineTexture, since
          // createTextureAtlas is the only place that constructs one.
          texture = (regionAttachment.region as TextureAtlasRegion).texture as unknown as SpineTexture;
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
          texture = (meshAttachment.region as TextureAtlasRegion).texture as unknown as SpineTexture;
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
          // spine 3.8's SkeletonClipping.clipTriangles takes an extra (unused) verticesLength param
          // right after `vertices` that 4.2 dropped.
          _clipper.clipTriangles(
            tempVerts,
            numFloats,
            triangles,
            triangles.length,
            uvs,
            finalColor,
            darkColor,
            tintBlack
          );
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
          slotIndex
        );
      }

      _clipper.clipEndWithSlot(slot);
    } // slot traverse end

    _clipper.clipEnd();
  }
}
