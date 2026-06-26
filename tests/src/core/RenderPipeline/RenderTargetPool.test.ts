import { TextureFilterMode, TextureFormat, TextureWrapMode } from "@galacean/engine-core";
// Import `WebGLEngine` from the `@galacean/engine` umbrella (not `@galacean/engine-rhi-webgl`): the
// coverage build resolves packages to their built bundles, and mixing the rhi sub-package with
// `@galacean/engine-core` pulls two separate copies of core, breaking engine bootstrap.
import { WebGLEngine } from "@galacean/engine";
// `RenderTargetPool` is `@internal` and not re-exported from the core barrel; take the type via a
// type-only import (erased at runtime) and the runtime constructor from the engine's pool instance.
import type { RenderTargetPool } from "../../../../packages/core/src/RenderPipeline/RenderTargetPool";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let RenderTargetPoolClass: { new (engine: WebGLEngine): RenderTargetPool };

/**
 * Helper: allocate an RT through the pool with sane defaults; varies only the bits that affect matching.
 */
function alloc(
  pool: RenderTargetPool,
  width: number,
  height: number,
  opts: { colorFormat?: TextureFormat; depthFormat?: TextureFormat | null; aa?: number } = {}
) {
  return pool.allocateRenderTarget(
    width,
    height,
    opts.colorFormat ?? TextureFormat.R8G8B8A8,
    opts.depthFormat === undefined ? TextureFormat.Depth24Stencil8 : opts.depthFormat,
    false,
    false,
    false,
    opts.aa ?? 1,
    TextureWrapMode.Clamp,
    TextureFilterMode.Bilinear
  );
}

/**
 * Helper: allocate a standalone Texture2D through the pool with sane defaults.
 */
function allocTex(pool: RenderTargetPool, width: number, height: number) {
  return pool.allocateTexture(
    width,
    height,
    TextureFormat.R8G8B8A8,
    false,
    false,
    TextureWrapMode.Clamp,
    TextureFilterMode.Bilinear
  );
}

describe("RenderTargetPool", () => {
  const canvas = document.createElement("canvas");
  let engine: WebGLEngine;
  let pool: RenderTargetPool;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas });
    // @ts-ignore - `_renderTargetPool` is `@internal`; its constructor is the class under test.
    RenderTargetPoolClass = engine._renderTargetPool.constructor;
  });

  afterAll(() => {
    engine.destroy();
  });

  beforeEach(() => {
    // Each test gets a fresh pool so leaked entries from earlier tests don't bleed across.
    pool = new RenderTargetPoolClass(engine);
  });

  describe("matching reuse", () => {
    it("returns the same RT instance when the next allocate matches a freed entry's shape", () => {
      const a = alloc(pool, 512, 512);
      pool.freeRenderTarget(a);
      const b = alloc(pool, 512, 512);
      expect(b).to.equal(a);
    });

    it("allocates a fresh RT when shape does not match any freed entry", () => {
      const a = alloc(pool, 512, 512);
      pool.freeRenderTarget(a);
      const b = alloc(pool, 256, 256);
      expect(b).to.not.equal(a);
    });

    it("simulates multi-camera frame-internal reuse: A free → B alloc returns A's RT", () => {
      // Camera A renders at full canvas, then releases
      const a = alloc(pool, 1024, 768);
      pool.freeRenderTarget(a);
      // Camera B renders next at the same shape and finds A's RT in the pool
      const b = alloc(pool, 1024, 768);
      expect(b).to.equal(a);
      pool.freeRenderTarget(b);
      // Pool is back to one entry after both cameras returned the same RT
      // (we can't directly observe size, but the next match-alloc must return it too)
      const c = alloc(pool, 1024, 768);
      expect(c).to.equal(a);
    });
  });

  describe("texture free-list", () => {
    it("reuses a freed texture of matching shape, allocates fresh on mismatch", () => {
      const a = allocTex(pool, 128, 128);
      pool.freeTexture(a);
      const b = allocTex(pool, 128, 128);
      expect(b).to.equal(a);

      pool.freeTexture(b);
      const c = allocTex(pool, 64, 64);
      expect(c).to.not.equal(a);
    });
  });

  describe("gc()", () => {
    it("destroys all free-list entries (render targets and textures)", () => {
      const a = alloc(pool, 256, 256);
      const b = alloc(pool, 512, 512);
      const t = allocTex(pool, 128, 128);
      pool.freeRenderTarget(a);
      pool.freeRenderTarget(b);
      pool.freeTexture(t);

      pool.gc();
      expect(a.destroyed).to.equal(true);
      expect(b.destroyed).to.equal(true);
      expect(t.destroyed).to.equal(true);
    });
  });
});
