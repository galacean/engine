import { createWebGL1Canvas } from "../../../packages/webgl1-polyfill/tests/helpers/canvas";
import { GLCapabilityType, SystemInfo, Texture2D, TextureFormat } from "@galacean/engine-core";
import { GLTexture, WebGLEngine } from "@galacean/engine";
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

it("supports RGBA16F color attachments on WebGL2 with only EXT_color_buffer_half_float", async () => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2")!;
  const getExtension = gl.getExtension.bind(gl);
  const extension = vi.spyOn(gl, "getExtension").mockImplementation((name) => {
    if (name === GLCapabilityType.colorBufferFloat) return null;
    if (name === GLCapabilityType.colorBufferHalfFloat) return { RGBA16F_EXT: gl.RGBA16F };
    return getExtension(name);
  });
  let engine: WebGLEngine | undefined;
  try {
    engine = await WebGLEngine.create({ canvas });
    const rhi = engine._hardwareRenderer;
    expect(rhi.canIUse(GLCapabilityType.colorBufferHalfFloat)).toBe(true);
    expect(rhi.canIUse(GLCapabilityType.colorBufferFloat)).toBe(false);
    expect(rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16)).toBe(true);
    expect(rhi.supportsRenderTargetColorFormat(TextureFormat.R11G11B10_UFloat)).toBe(false);
  } finally {
    extension.mockRestore();
    engine?.destroy();
  }
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

it("reuses the format checked by the RHI for allocation and keeps color spaces separate", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const format = TextureFormat.R8G8B8;
    const device = engine._hardwareRenderer;
    const gl = device.gl;
    expect(SystemInfo.supportsTextureFormat(engine, format)).toBe(true);
    const linearFormat = GLTexture._findFormatDetail(format, false, gl, device);
    const linear = new Texture2D(engine, 4, 4, format, false, false)._platformTexture as GLTexture;
    const srgb = new Texture2D(engine, 4, 4, format, false, true)._platformTexture as GLTexture;

    expect(linear._formatDetail).toBe(linearFormat);
    expect(srgb._formatDetail).not.toBe(linearFormat);
    expect(linear._formatDetail.internalFormat).toBe(gl.RGB8);
    expect(srgb._formatDetail.internalFormat).toBe(gl.SRGB8);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

describe.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true]
])("anisotropic fallback=%s disabled=%s", (fallback, disabled) => {
  it("uses extension constants without adding properties to the context", async () => {
    const canvas = fallback ? createWebGL1Canvas() : document.createElement("canvas");
    const gl = (fallback ? canvas.getContext("webgl") : canvas.getContext("webgl2"))!;
    const getExtension = gl.getExtension.bind(gl);
    const extension = getExtension(GLCapabilityType.textureFilterAnisotropic);
    if (!disabled) expect(extension).not.toBeNull();
    const lookup = vi
      .spyOn(gl, "getExtension")
      .mockImplementation((name) =>
        disabled && name === GLCapabilityType.textureFilterAnisotropic ? null : getExtension(name)
      );
    const originalConstant = Object.getOwnPropertyDescriptor(gl, "TEXTURE_MAX_ANISOTROPY_EXT");
    let engine: WebGLEngine | undefined;
    try {
      engine = await WebGLEngine.create({ canvas });
      const texture = new Texture2D(engine, 4, 4);
      const parameter = vi.spyOn(gl, "texParameterf");
      try {
        texture.anisoLevel = 1024;
        if (disabled) {
          expect(parameter).not.toHaveBeenCalled();
        } else {
          expect(parameter).toHaveBeenCalledWith(
            gl.TEXTURE_2D,
            extension.TEXTURE_MAX_ANISOTROPY_EXT,
            gl.getParameter(extension.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
          );
        }
        expect(Object.getOwnPropertyDescriptor(gl, "TEXTURE_MAX_ANISOTROPY_EXT")).toEqual(originalConstant);
        expect(gl.getError()).toBe(gl.NO_ERROR);
      } finally {
        parameter.mockRestore();
      }
    } finally {
      engine?.destroy();
      lookup.mockRestore();
    }
  });
});
