import {
  Logger,
  RenderTarget,
  Texture2D,
  TextureDepthCompareFunction,
  TextureFormat,
  TextureWrapMode,
  WebGLEngine
} from "../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createWebGL1Canvas } from "../../helpers/canvas";
import { createEngine } from "../../helpers/createEngine";

it("downgrades NPOT storage and wrapping, and reads mip zero when requested", async () => {
  const canvas = createWebGL1Canvas();
  const engine = await WebGLEngine.create({ canvas });
  try {
    const gl = canvas.getContext("webgl")!;
    const texture = new Texture2D(engine, 3, 5, TextureFormat.R8G8B8A8, true, false);
    const data = new Uint8Array(3 * 5 * 4).fill(127);
    texture.setPixelBuffer(data);
    expect(texture.mipmapCount).toBe(1);
    texture.wrapModeU = TextureWrapMode.Mirror;
    expect(gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S)).toBe(gl.CLAMP_TO_EDGE);

    const pixels = new Uint8Array(4);
    const error = vi.spyOn(Logger, "error");
    texture.getPixelBuffer(0, 0, 1, 1, 1, pixels);
    expect([...pixels]).toEqual([127, 127, 127, 127]);
    expect(error).toHaveBeenCalledWith("mipLevel only take effect in WebGL2.0");
    error.mockRestore();
    const compareState = vi.spyOn(gl, "texParameteri");
    texture._setUseDepthCompareMode(true);
    expect(compareState).not.toHaveBeenCalled();
    compareState.mockClear();
    texture._platformTexture.depthCompareFunction = TextureDepthCompareFunction.Less;
    expect(compareState).not.toHaveBeenCalled();
    compareState.mockRestore();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

it("uses linear storage without EXT_sRGB and reports sRGB mipmap limitations", async () => {
  const { engine, gl } = await createEngine(["EXT_sRGB"]);
  try {
    const upload = vi.spyOn(gl, "texImage2D");
    const texture = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8, true, true);
    expect(upload).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const platform = texture._platformTexture.constructor as any;
    const device = engine._hardwareRenderer;
    expect(platform._supportRenderBufferColorFormat(TextureFormat.R11G11B10_UFloat, device)).toBe(false);
    expect(platform._supportRenderBufferDepthFormat(TextureFormat.Depth32, device)).toBe(false);
    expect(platform._supportRenderBufferDepthFormat(TextureFormat.Depth16, device)).toBe(true);
    const nativeGenerate = vi.spyOn(gl, "generateMipmap");
    texture.generateMipmaps();
    expect(nativeGenerate).not.toHaveBeenCalled();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

it("allocates a generic Depth renderbuffer as DEPTH_COMPONENT16", async () => {
  const { engine, gl } = await createEngine();
  try {
    const color = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8, false, false);
    const storage = vi.spyOn(gl, "renderbufferStorage");
    const target = new RenderTarget(engine, 4, 4, color, TextureFormat.Depth);
    expect(storage).toHaveBeenCalledWith(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 4, 4);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    target.destroy();
  } finally {
    engine.destroy();
  }
});
