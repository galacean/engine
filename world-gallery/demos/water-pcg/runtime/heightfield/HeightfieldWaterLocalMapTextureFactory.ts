/** Creates the packed RG flow / B depth / A shoreline-distance texture. */
import { Engine, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine-core";
import type { HeightfieldWaterLocalMapAtlas } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";

export function createHeightfieldWaterLocalMapTexture(engine: Engine, atlas: HeightfieldWaterLocalMapAtlas): Texture2D {
  const expectedByteLength = atlas.width * atlas.height * 4;
  if (atlas.pixels.length !== expectedByteLength) {
    throw new Error(`Heightfield water local map has ${atlas.pixels.length} bytes; expected ${expectedByteLength}.`);
  }
  const texture = new Texture2D(engine, atlas.width, atlas.height, undefined, false, false);
  texture.name = "HeightfieldWaterLocalMap";
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  texture.setPixelBuffer(atlas.pixels.toTypedArray());
  return texture;
}
