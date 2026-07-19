import { Texture2D, WebGLEngine } from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { SpineResource } from "../../../packages/spine/src/loader/SpineResource";
import { SpineTexture } from "../../../packages/spine-core-4.2/src/SpineTexture";

describe("SpineResource._associationTextureInSkeletonData", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("associates the attachment's Texture2D and protects it from GC while the resource is alive", () => {
    const texture2D = new Texture2D(engine, 4, 4);
    const attachment = { region: { texture: new SpineTexture(texture2D) } };
    const skeletonData = {
      skins: [{ getAttachment: () => attachment }],
      slots: [{ index: 0, name: "slot0" }]
    };
    // Stands in for the SpineResource instance: only the fields `_associationTextureInSkeletonData`
    // reads/writes (`_texturesInSpineAtlas`) and the super-resource GC check reads (`refCount`).
    const fakeResource = { _texturesInSpineAtlas: [] as Texture2D[], refCount: 1 };

    // @ts-ignore
    SpineResource.prototype._associationTextureInSkeletonData.call(fakeResource, skeletonData);

    expect(fakeResource._texturesInSpineAtlas).to.deep.equal([texture2D]);
    // Regression guard: region.texture is already the SpineTexture, so reading `.texture` off it again
    // (instead of `.getImage()`) resolved to `undefined` on the 4.2 backend, and the association above
    // silently never happened - leaving the texture unprotected from a GC pass while still in use.
    expect(texture2D.destroy(false, true)).to.equal(false);
  });
});
