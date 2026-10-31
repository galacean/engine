import { GLCapabilityType } from "@galacean/engine-core";
import { WebGLEngine, WebGLMode } from "@galacean/engine-rhi-webgl";
import { describe, expect, it, vi } from "vitest";

describe("ASTC capabilities", () => {
  it.each([
    { name: "no extension", extension: null, astc: false, hdr: false },
    { name: "legacy extension without profiles", extension: {}, astc: true, hdr: false },
    { name: "LDR profile", extension: { getSupportedProfiles: () => ["ldr"] }, astc: true, hdr: false },
    { name: "HDR profile", extension: { getSupportedProfiles: () => ["ldr", "hdr"] }, astc: true, hdr: true }
  ])("initializes with $name", async ({ extension, astc, hdr }) => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    const getExtension = gl.getExtension.bind(gl);
    const spy = vi.spyOn(gl, "getExtension").mockImplementation((name) => {
      if (name === GLCapabilityType.astc) return extension;
      if (name === GLCapabilityType.astc_webkit) return null;
      return getExtension(name);
    });
    let engine: WebGLEngine;
    try {
      engine = await WebGLEngine.create({ canvas, graphicDeviceOptions: { webGLMode: WebGLMode.WebGL1 } });
      // @ts-ignore
      const rhi = engine._hardwareRenderer;
      expect(rhi.canIUse(GLCapabilityType.astc)).toBe(astc);
      expect(rhi.canIUse(GLCapabilityType.astc_hdr)).toBe(hdr);
    } finally {
      spy.mockRestore();
      engine?.destroy();
      getExtension("WEBGL_lose_context")?.loseContext();
    }
  });
});
