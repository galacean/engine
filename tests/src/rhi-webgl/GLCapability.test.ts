import { createWebGL1Canvas } from "../../../packages/webgl1-polyfill/tests/helpers/canvas";
import { GLCapabilityType, SystemInfo, Texture2D, TextureFormat } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { describe, expect, it, vi } from "vitest";

describe.each([
  { label: "WebGL2", fallback: false },
  { label: "WebGL1 fallback", fallback: true }
])("ASTC capabilities on $label", ({ fallback }) => {
  it.each([
    { name: "no extension", extension: null, astc: false, hdr: false },
    { name: "legacy extension without profiles", extension: {}, astc: true, hdr: false },
    { name: "LDR profile", extension: { getSupportedProfiles: () => ["ldr"] }, astc: true, hdr: false },
    { name: "HDR profile", extension: { getSupportedProfiles: () => ["ldr", "hdr"] }, astc: true, hdr: true },
    {
      name: "WebKit HDR profile",
      extension: { getSupportedProfiles: () => ["hdr"] },
      astc: true,
      hdr: true,
      alias: true
    }
  ])("initializes with $name", async ({ extension, astc, hdr, alias }) => {
    const canvas = fallback ? createWebGL1Canvas() : document.createElement("canvas");
    const gl = (fallback ? canvas.getContext("webgl") : canvas.getContext("webgl2"))!;
    const getExtension = gl.getExtension.bind(gl);
    const spy = vi.spyOn(gl, "getExtension").mockImplementation((name) => {
      if (name === GLCapabilityType.astc) return alias ? null : extension;
      if (name === GLCapabilityType.astc_webkit) return alias ? extension : null;
      return getExtension(name);
    });
    let engine: WebGLEngine;
    try {
      engine = await WebGLEngine.create({ canvas });
      // @ts-ignore
      const rhi = engine._hardwareRenderer;
      expect(rhi.canIUse(GLCapabilityType.astc)).toBe(astc);
      expect(rhi.canIUse(GLCapabilityType.astc_hdr)).toBe(hdr);
      expect(rhi.canIUse(GLCapabilityType.astc_webkit)).toBe(!!alias);
      expect(rhi.canIUse(GLCapabilityType.WEBGL_lose_context)).toBe(
        !!rhi.requireExtension(GLCapabilityType.WEBGL_lose_context)
      );
    } finally {
      spy.mockRestore();
      engine?.destroy();
      getExtension("WEBGL_lose_context")?.loseContext();
    }
  });
});

it("rejects ETC2_RGBA5 before allocating storage when neither ETC extension is available", async () => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2")!;
  const getExtension = gl.getExtension.bind(gl);
  const parameters = vi.spyOn(gl, "getParameter");
  const extension = vi
    .spyOn(gl, "getExtension")
    .mockImplementation((name) =>
      name === GLCapabilityType.etc || name === GLCapabilityType.etc_webkit ? null : getExtension(name)
    );
  let engine: WebGLEngine | undefined;
  try {
    engine = await WebGLEngine.create({ canvas });
    expect(parameters).not.toHaveBeenCalledWith(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
    const storage = vi.spyOn(gl, "texStorage2D");
    expect(SystemInfo.supportsTextureFormat(engine, TextureFormat.R8G8B8A8)).toBe(true);
    expect(SystemInfo.supportsTextureFormat(engine, TextureFormat.Stencil)).toBe(false);
    expect(SystemInfo.supportsTextureFormat(engine, -1 as TextureFormat)).toBe(false);
    expect(SystemInfo.supportsTextureFormat(engine, TextureFormat.ETC2_RGBA5)).toBe(false);
    expect(SystemInfo.supportsTextureFormat(engine, TextureFormat.ETC2_RGBA5, true)).toBe(false);
    expect(() => new Texture2D(engine!, 4, 4, TextureFormat.ETC2_RGBA5, false, false)).toThrow("ETC2_RGBA5");
    expect(storage).not.toHaveBeenCalled();
    expect(gl.getError()).toBe(gl.NO_ERROR);
    storage.mockRestore();
  } finally {
    parameters.mockRestore();
    extension.mockRestore();
    engine?.destroy();
  }
});
