import { registerWaterContentRestorer } from "../resources/WaterContentRestorer";
import { Engine, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine-core";
import type { RiverLocalMapAtlasData } from "../../compiler/river/types";

export function createRiverLocalMapTexture(engine: Engine, atlas: RiverLocalMapAtlasData): Texture2D {
  // Borrow the private _webCanvas field because the engine has no public API for the GL context.
  // This only preflights atlas dimensions for a readable error; skip the check if the limit is unavailable.
  // Intentionally do not hardcode 4096: long-river atlases often exceed that height.
  // TODO: replace this probe when the engine exposes a public hardware capability API.
  const canvas = (engine.canvas as { _webCanvas?: HTMLCanvasElement } | undefined)?._webCanvas;
  const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
  const maximum = gl?.getParameter(gl.MAX_TEXTURE_SIZE) as number | undefined;
  if (maximum !== undefined && (atlas.width > maximum || atlas.height > maximum)) {
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
