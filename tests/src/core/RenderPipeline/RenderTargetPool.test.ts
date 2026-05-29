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

  describe("frame-age eviction via tick()", () => {
    it("does not evict entries within maxFreeAgeFrames", () => {
      pool.maxFreeAgeFrames = 5;
      const a = alloc(pool, 256, 256);
      pool.freeRenderTarget(a);
      const baseFrame = engine.time.frameCount;
      pool.tick(baseFrame + 3);
      const b = alloc(pool, 256, 256);
      expect(b).to.equal(a);
    });

    it("destroys entries idle longer than maxFreeAgeFrames", () => {
      pool.maxFreeAgeFrames = 5;
      const a = alloc(pool, 256, 256);
      const baseFrame = engine.time.frameCount;
      pool.freeRenderTarget(a);
      pool.tick(baseFrame + 100);
      // Entry was destroyed; next allocate produces a fresh RT
      const b = alloc(pool, 256, 256);
      expect(b).to.not.equal(a);
      expect(a.destroyed).to.equal(true);
    });

    it("evicts exactly at the maxFreeAgeFrames boundary (inclusive)", () => {
      pool.maxFreeAgeFrames = 5;
      const a = alloc(pool, 256, 256);
      const baseFrame = engine.time.frameCount;
      pool.freeRenderTarget(a);
      // One frame short of the cap: survives.
      pool.tick(baseFrame + 4);
      expect(a.destroyed).to.equal(false);
      // Exactly at the cap: destroyed.
      pool.tick(baseFrame + 5);
      expect(a.destroyed).to.equal(true);
    });
  });

  describe("evictBySize for canvas resize", () => {
    it("destroys free-list entries matching the given size", () => {
      const a = alloc(pool, 800, 600);
      const b = alloc(pool, 1024, 768);
      pool.freeRenderTarget(a);
      pool.freeRenderTarget(b);

      pool.evictBySize(800, 600);
      expect(a.destroyed).to.equal(true);
      expect(b.destroyed).to.equal(false);

      // Re-allocating at the other size still returns the survivor
      const reused = alloc(pool, 1024, 768);
      expect(reused).to.equal(b);
    });

    it("ignores entries whose dimensions do not match", () => {
      const a = alloc(pool, 800, 600);
      pool.freeRenderTarget(a);
      pool.evictBySize(1024, 768);
      expect(a.destroyed).to.equal(false);
      const b = alloc(pool, 800, 600);
      expect(b).to.equal(a);
    });
  });

  describe("texture free-list", () => {
    it("reuses a freed texture within maxFreeAgeFrames, evicts past it", () => {
      pool.maxFreeAgeFrames = 5;
      const a = allocTex(pool, 128, 128);
      const baseFrame = engine.time.frameCount;
      pool.freeTexture(a);

      pool.tick(baseFrame + 3);
      const b = allocTex(pool, 128, 128);
      expect(b).to.equal(a);

      pool.freeTexture(b);
      pool.tick(baseFrame + 100);
      expect(a.destroyed).to.equal(true);
      const c = allocTex(pool, 128, 128);
      expect(c).to.not.equal(a);
    });

    it("evictBySize destroys only matching free textures", () => {
      const a = allocTex(pool, 800, 600);
      const b = allocTex(pool, 1024, 768);
      pool.freeTexture(a);
      pool.freeTexture(b);

      pool.evictBySize(800, 600);
      expect(a.destroyed).to.equal(true);
      expect(b.destroyed).to.equal(false);

      const reused = allocTex(pool, 1024, 768);
      expect(reused).to.equal(b);
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
