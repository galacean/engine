import { expect, it } from "vitest";
import { TextureFormat, WebGLEngine } from "@galacean/engine";
import { BUILTIN_WATER_PROJECT_URL, loadBuiltinWaterTexture } from "../src/water/native/WaterBuiltinAssets";

it("loads every native Water KTX2 with its original dimensions, color space and complete mip chain", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  try {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const compressed = [
      "WEBGL_compressed_texture_astc",
      "EXT_texture_compression_bptc",
      "WEBGL_compressed_texture_etc",
      "WEBGL_compressed_texture_s3tc"
    ].some((extension) => Boolean(gl?.getExtension(extension)));
    const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
    const files = manifest.files.filter((file: { virtualPath: string }) =>
      file.virtualPath.startsWith("Water/Textures/")
    );
    expect(files).toHaveLength(16);
    for (const file of files) {
      expect(file.type).toBe("KTX2");
      expect(file.path).toMatch(/\.ktx2$/);
      const bytes = await (await fetch(new URL(file.path, BUILTIN_WATER_PROJECT_URL))).arrayBuffer();
      const header = new DataView(bytes);
      const texture = await loadBuiltinWaterTexture(engine, file.virtualPath);
      try {
        expect(texture.width).toBe(header.getUint32(20, true));
        expect(texture.height).toBe(header.getUint32(24, true));
        expect(texture.mipmapCount).toBe(header.getUint32(40, true));
        expect(texture.mipmapCount).toBe(Math.floor(Math.log2(Math.max(texture.width, texture.height))) + 1);
        expect(texture.isSRGBColorSpace).toBe(file.params.isSRGBColorSpace);
        expect(texture.wrapModeU).toBe(file.params.wrapModeU);
        expect(texture.filterMode).toBe(file.params.filterMode);
        if (compressed) expect(texture.format, file.virtualPath).toBeGreaterThanOrEqual(TextureFormat.BC1);
      } finally {
        texture._addReferCount(-1);
        texture.destroy();
      }
    }
  } finally {
    engine.destroy();
  }
}, 60000);
