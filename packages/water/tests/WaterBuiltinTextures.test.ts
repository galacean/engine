import { expect, it, vi } from "vitest";
import { Texture2D, TextureFormat, WebGLEngine } from "@galacean/engine";
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
    expect(files).toHaveLength(8);
    for (const file of files) {
      expect(file.type).toBe("KTX2");
      expect(file.path).toMatch(/\.ktx2$/);
      const bytes = await (await fetch(new URL(file.path, BUILTIN_WATER_PROJECT_URL))).arrayBuffer();
      const header = new DataView(bytes);
      const texture = await loadBuiltinWaterTexture(engine, file.virtualPath);
      try {
        expect(Math.max(texture.width, texture.height)).toBeLessThanOrEqual(512);
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

it("evicts pendingDestroy textures without reusing them, gates blob revocation on destroyed, and forwards isGC", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
  const superResource = new Texture2D(engine, 1, 1);
  try {
    const path = "Water/Textures/ocean-smoothWaves.ktx2";
    const first = await loadBuiltinWaterTexture(engine, path);
    const second = await loadBuiltinWaterTexture(engine, path);
    expect(second).toBe(first);
    expect(first.refCount).toBe(2);
    // Drop both borrows so refCount === 0, then associate an unreferenced superResource:
    // ReferResource.destroy(false, false) must fail while destroy(false, true) succeeds via isGC.
    first._addReferCount(-2);
    first._associationSuperResource(superResource);
    const frameEngine = engine as unknown as { _frameInProcess: boolean };
    frameEngine._frameInProcess = true;
    try {
      expect(first.destroy(false, false)).toBe(false);
      expect(first.pendingDestroy).toBe(false);
      expect(first.destroyed).toBe(false);

      expect(first.destroy(false, true)).toBe(true);
      expect(first.pendingDestroy).toBe(true);
      expect(first.destroyed).toBe(false);
      // Blob URL must NOT be revoked before actual destruction completes.
      expect(revokeSpy).not.toHaveBeenCalled();
    } finally {
      frameEngine._frameInProcess = false;
    }

    // Must NOT reuse the pendingDestroy texture from cache; loads a fresh live texture instead.
    const fresh = await loadBuiltinWaterTexture(engine, path);
    try {
      expect(fresh).not.toBe(first);
      expect(fresh.pendingDestroy).toBe(false);
      expect(fresh.destroyed).toBe(false);
      // Advancing the engine frame flushes pendingDestroy -> destroyed and revokes first's blob URL.
      engine.update();
      expect(first.destroyed).toBe(true);
      expect(revokeSpy).toHaveBeenCalledTimes(1);
    } finally {
      fresh._addReferCount(-1);
      fresh.destroy(true);
    }
  } finally {
    superResource.destroy(true);
    revokeSpy.mockRestore();
    engine.destroy();
  }
}, 60000);
