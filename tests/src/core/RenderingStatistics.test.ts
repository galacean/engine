import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  RenderTarget,
  Texture2D,
  TextureCube,
  TextureFormat
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { beforeAll, describe, expect, it } from "vitest";

describe("RenderingStatistics", () => {
  const canvas = document.createElement("canvas");

  let engine: WebGLEngine;
  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas });
  });

  describe("textureMemory", () => {
    it("Texture2D creation increases textureMemory", () => {
      const before = engine.renderingStatistics.textureMemory;
      const texture = new Texture2D(engine, 256, 256, TextureFormat.R8G8B8A8, false, false);
      const after = engine.renderingStatistics.textureMemory;

      // 256 * 256 * 4 = 262144
      expect(after - before).to.equal(256 * 256 * 4);

      texture.destroy();
    });

    it("Texture2D with mipmaps accounts for all levels", () => {
      const before = engine.renderingStatistics.textureMemory;
      const texture = new Texture2D(engine, 256, 256, TextureFormat.R8G8B8A8, true, false);
      const after = engine.renderingStatistics.textureMemory;

      // With mipmaps: 256x256 + 128x128 + 64x64 + ... + 1x1, all * 4 bytes
      expect(after - before).to.be.greaterThan(256 * 256 * 4);

      texture.destroy();
    });

    it("TextureCube accounts for 6 faces", () => {
      const before = engine.renderingStatistics.textureMemory;
      const texture = new TextureCube(engine, 64, TextureFormat.R8G8B8A8, false);
      const after = engine.renderingStatistics.textureMemory;

      // 64 * 64 * 4 * 6 faces = 98304
      expect(after - before).to.equal(64 * 64 * 4 * 6);

      texture.destroy();
    });

    it("Texture destroy decreases textureMemory", () => {
      const before = engine.renderingStatistics.textureMemory;
      const texture = new Texture2D(engine, 128, 128, TextureFormat.R8G8B8A8, false, false);
      texture.destroy();
      const after = engine.renderingStatistics.textureMemory;

      expect(after).to.equal(before);
    });
  });

  describe("bufferMemory", () => {
    it("Buffer creation increases bufferMemory", () => {
      const before = engine.renderingStatistics.bufferMemory;
      const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 1024, BufferUsage.Static);
      const after = engine.renderingStatistics.bufferMemory;

      expect(after - before).to.equal(1024);

      buffer.destroy();
    });

    it("Buffer destroy decreases bufferMemory", () => {
      const before = engine.renderingStatistics.bufferMemory;
      const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 2048, BufferUsage.Static);
      buffer.destroy();
      const after = engine.renderingStatistics.bufferMemory;

      expect(after).to.equal(before);
    });
  });

  describe("totalMemory", () => {
    it("totalMemory equals textureMemory + bufferMemory", () => {
      const texture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8, false, false);
      const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 512, BufferUsage.Static);

      expect(engine.renderingStatistics.totalMemory).to.equal(
        engine.renderingStatistics.textureMemory + engine.renderingStatistics.bufferMemory
      );

      texture.destroy();
      buffer.destroy();
    });
  });

  describe("RenderTarget renderbuffer", () => {
    it("RenderTarget with depth format tracks renderbuffer memory", () => {
      const colorTexture = new Texture2D(engine, 256, 256, TextureFormat.R8G8B8A8, false, false);
      const afterTexture = engine.renderingStatistics.textureMemory;

      const renderTarget = new RenderTarget(engine, 256, 256, colorTexture, TextureFormat.Depth24Stencil8);
      const afterRT = engine.renderingStatistics.textureMemory;

      // Depth renderbuffer: 256 * 256 * 4
      expect(afterRT - afterTexture).to.equal(256 * 256 * 4);

      renderTarget.destroy();
      colorTexture.destroy();
    });

    it("RenderTarget destroy decreases renderbuffer memory", () => {
      const colorTexture = new Texture2D(engine, 128, 128, TextureFormat.R8G8B8A8, false, false);
      const before = engine.renderingStatistics.textureMemory;

      const renderTarget = new RenderTarget(engine, 128, 128, colorTexture, TextureFormat.Depth24Stencil8);
      renderTarget.destroy();

      const after = engine.renderingStatistics.textureMemory;
      expect(after).to.equal(before);

      colorTexture.destroy();
    });

    it("RenderTarget with depth texture in non-MSAA mode does not add depth renderbuffer memory", () => {
      const colorTexture = new Texture2D(engine, 128, 128, TextureFormat.R8G8B8A8, false, false);
      const depthTexture = new Texture2D(engine, 128, 128, TextureFormat.Depth24Stencil8, false, false);
      const before = engine.renderingStatistics.textureMemory;

      const renderTarget = new RenderTarget(engine, 128, 128, colorTexture, depthTexture, 1);
      const after = engine.renderingStatistics.textureMemory;
      expect(after).to.equal(before);

      renderTarget.destroy();
      colorTexture.destroy();
      depthTexture.destroy();
    });
  });

  describe("device loss", () => {
    it("counters reset on device lost and recover on rebuild", async () => {
      const texture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8, false, false);
      const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 512, BufferUsage.Static);

      const totalBefore = engine.renderingStatistics.totalMemory;
      expect(totalBefore).to.be.greaterThan(0);

      await new Promise<void>((resolve) => {
        engine.once("devicelost", () => {
          expect(engine.renderingStatistics.textureMemory).to.equal(0);
          expect(engine.renderingStatistics.bufferMemory).to.equal(0);
          expect(engine.renderingStatistics.totalMemory).to.equal(0);

          engine.once("devicerestored", () => {
            expect(engine.renderingStatistics.totalMemory).to.equal(totalBefore);
            resolve();
          });
          // @ts-ignore
          engine._onDeviceRestored();
        });
        // @ts-ignore
        engine._onDeviceLost();
      });

      const beforeDestroy = engine.renderingStatistics.totalMemory;
      texture.destroy();
      buffer.destroy();
      expect(engine.renderingStatistics.totalMemory).to.equal(beforeDestroy - totalBefore);
    });

    it("failed restore keeps device-lost state and avoids negative counters on destroy", () => {
      const texture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8, false, false);
      const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 512, BufferUsage.Static);

      // @ts-ignore
      const resourceManager = engine.resourceManager;
      const originalRestoreGraphicResources = resourceManager._restoreGraphicResources;
      // @ts-ignore
      resourceManager._restoreGraphicResources = () => {
        throw new Error("mock restore failure");
      };

      try {
        // @ts-ignore
        engine._onDeviceLost();
        expect(engine.renderingStatistics.totalMemory).to.equal(0);
        // @ts-ignore
        expect(engine._isDeviceLost).to.equal(true);

        expect(() => {
          // @ts-ignore
          engine._onDeviceRestored();
        }).toThrow("mock restore failure");
        // @ts-ignore
        expect(engine._isDeviceLost).to.equal(true);
      } finally {
        // @ts-ignore
        resourceManager._restoreGraphicResources = originalRestoreGraphicResources;
      }

      texture.destroy();
      buffer.destroy();
      expect(engine.renderingStatistics.totalMemory).to.equal(0);
    });

    it("resources created and destroyed during device lost should not affect counters", async () => {
      const baseTexture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8, false, false);
      const baseBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 512, BufferUsage.Static);
      const totalBefore = engine.renderingStatistics.totalMemory;

      await new Promise<void>((resolve) => {
        engine.once("devicelost", () => {
          expect(engine.renderingStatistics.totalMemory).to.equal(0);

          const transientTexture = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8, false, false);
          const transientBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 256, BufferUsage.Static);
          expect(engine.renderingStatistics.totalMemory).to.equal(0);

          transientTexture.destroy();
          transientBuffer.destroy();
          expect(engine.renderingStatistics.totalMemory).to.equal(0);

          engine.once("devicerestored", () => {
            expect(engine.renderingStatistics.totalMemory).to.equal(totalBefore);
            resolve();
          });
          // @ts-ignore
          engine._onDeviceRestored();
        });
        // @ts-ignore
        engine._onDeviceLost();
      });

      baseTexture.destroy();
      baseBuffer.destroy();
    });

    it("resources created during device lost should be counted once after restore", async () => {
      await new Promise<void>((resolve) => {
        engine.once("devicelost", () => {
          expect(engine.renderingStatistics.totalMemory).to.equal(0);

          const texture = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8, false, false);
          const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 256, BufferUsage.Static);
          expect(engine.renderingStatistics.totalMemory).to.equal(0);

          const expectedAfterRestore = 32 * 32 * 4 + 256;
          engine.once("devicerestored", () => {
            expect(engine.renderingStatistics.totalMemory).to.equal(expectedAfterRestore);
            texture.destroy();
            buffer.destroy();
            expect(engine.renderingStatistics.totalMemory).to.equal(0);
            resolve();
          });
          // @ts-ignore
          engine._onDeviceRestored();
        });
        // @ts-ignore
        engine._onDeviceLost();
      });
    });
  });
});
