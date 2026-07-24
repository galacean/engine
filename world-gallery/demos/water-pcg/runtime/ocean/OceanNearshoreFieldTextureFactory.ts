/** Creates the one static RGBA atlas consumed by the Ocean Rings shader. */
import {
  Engine,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode
} from "@galacean/engine-core";
import type { OceanNearshoreFieldResource } from "./OceanNearshoreFieldResource";

export function createOceanNearshoreFieldTexture(
  engine: Engine,
  resource: OceanNearshoreFieldResource
): Texture2D {
  const atlas = resource.atlas;
  const expectedByteLength = atlas.width * atlas.height * 4;
  if (atlas.pixels.length !== expectedByteLength) {
    throw new Error(
      `Ocean nearshore atlas has ${atlas.pixels.length} bytes; expected ${expectedByteLength}.`
    );
  }
  const texture = new Texture2D(
    engine,
    atlas.width,
    atlas.height,
    undefined,
    false,
    false
  );
  texture.name = "OceanNearshoreStaticField";
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  texture.setPixelBuffer(atlas.pixels.toTypedArray());
  return texture;
}
