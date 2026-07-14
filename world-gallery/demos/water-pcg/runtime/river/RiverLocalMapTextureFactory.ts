import { Engine, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine-core";
import type { RiverLocalMapAtlasData } from "../../compiler/river/types";

export function createRiverLocalMapTexture(engine: Engine, atlas: RiverLocalMapAtlasData): Texture2D {
  const texture = new Texture2D(engine, atlas.width, atlas.height, undefined, false, false);
  texture.name = "RiverLocalFlowAtlas";
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  texture.setPixelBuffer(atlas.pixels.toTypedArray());
  return texture;
}
