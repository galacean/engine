import { registerWaterContentRestorer } from "../resources/WaterContentRestorer";
import { Engine, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine-core";
import type { RiverLocalMapAtlasData } from "../../compiler/river/types";

export function createRiverLocalMapTexture(engine: Engine, atlas: RiverLocalMapAtlasData): Texture2D {
  const maximum = engine._hardwareRenderer.capability.maxTextureSize;
  if (atlas.width > maximum || atlas.height > maximum) {
    throw new RangeError(
      `River local map requires ${atlas.width} x ${atlas.height} texels; GPU MAX_TEXTURE_SIZE allows ${maximum} per axis.`
    );
  }
  const texture = new Texture2D(engine, atlas.width, atlas.height, undefined, false, false);
  try {
    texture.name = "RiverLocalFlowAtlas";
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.setPixelBuffer(atlas.pixels.borrowTypedArray());
    registerWaterContentRestorer(engine, texture, () => texture.setPixelBuffer(atlas.pixels.borrowTypedArray()));
    return texture;
  } catch (error) {
    texture.destroy(true);
    throw error;
  }
}
