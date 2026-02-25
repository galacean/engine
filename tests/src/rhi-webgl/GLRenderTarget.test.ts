import { RenderTarget, Texture2D, TextureFormat } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { GLRenderTarget } from "@galacean/engine-rhi-webgl/src/GLRenderTarget";
import { describe, beforeAll, beforeEach, expect, it, vi, afterEach } from "vitest";

describe("GLRenderTarget", () => {
  let engine: WebGLEngine;
  let gl: WebGLRenderingContext | WebGL2RenderingContext;

  beforeAll(async () => {
    const canvas = document.createElement("canvas");
    engine = await WebGLEngine.create({ canvas });
    // @ts-ignore
    gl = engine._hardwareRenderer.gl;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("_checkFrameBufferStatus", () => {
    it("should not throw for complete framebuffer", () => {
      vi.spyOn(gl, "checkFramebufferStatus").mockReturnValue(gl.FRAMEBUFFER_COMPLETE);

      expect(() => {
        // @ts-ignore
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).not.toThrow();
    });

    it("should throw for incomplete attachment", () => {
      vi.spyOn(gl, "checkFramebufferStatus").mockReturnValue(gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT);

      expect(() => {
        // @ts-ignore
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).toThrow("The attachment types are mismatched");
    });

    it("should throw for missing attachment", () => {
      vi.spyOn(gl, "checkFramebufferStatus").mockReturnValue(gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT);

      expect(() => {
        // @ts-ignore
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).toThrow("There is no attachment");
    });

    it("should throw for dimension mismatch", () => {
      vi.spyOn(gl, "checkFramebufferStatus").mockReturnValue(gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS);

      expect(() => {
        // @ts-ignore
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).toThrow("Height and width of the attachment are not the same");
    });

    it("should throw for unsupported format when context is not lost", () => {
      vi.spyOn(gl, "checkFramebufferStatus").mockReturnValue(gl.FRAMEBUFFER_UNSUPPORTED);
      vi.spyOn(gl, "isContextLost").mockReturnValue(false);

      expect(() => {
        // @ts-ignore
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).toThrow("The format of the attachment is not supported");
    });

    it("should not throw for unsupported format when context is lost", () => {
      vi.spyOn(gl, "checkFramebufferStatus").mockReturnValue(gl.FRAMEBUFFER_UNSUPPORTED);
      vi.spyOn(gl, "isContextLost").mockReturnValue(true);

      expect(() => {
        // @ts-ignore
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).not.toThrow();
    });

    it("should handle WebGL2 multisample error if available", () => {
      if ("FRAMEBUFFER_INCOMPLETE_MULTISAMPLE" in gl) {
        vi.spyOn(gl, "checkFramebufferStatus").mockReturnValue(
          (gl as WebGL2RenderingContext).FRAMEBUFFER_INCOMPLETE_MULTISAMPLE
        );

        expect(() => {
          // @ts-ignore
          GLRenderTarget._checkFrameBufferStatus(gl);
        }).toThrow("The values of gl.RENDERBUFFER_SAMPLES are different");
      }
    });
  });

  describe("MSAA render targets", () => {
    it("should create and destroy MSAA render target without errors", () => {
      // Mock _checkFrameBufferStatus to avoid WebGL validation in test environment
      // @ts-ignore
      const mockCheck = vi.spyOn(GLRenderTarget, "_checkFrameBufferStatus").mockImplementation(() => {});

      try {
        const colorTexture = new Texture2D(engine, 512, 512);
        const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 4);
        renderTarget.destroy();
      } finally {
        mockCheck.mockRestore();
      }
    });

    it("should create and destroy non-MSAA render target without errors", () => {
      const colorTexture = new Texture2D(engine, 512, 512);
      const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 1);
      renderTarget.destroy();
    });

    it("should support activeRenderTarget and blitRenderTarget", () => {
      // @ts-ignore
      const mockCheck = vi.spyOn(GLRenderTarget, "_checkFrameBufferStatus").mockImplementation(() => {});

      try {
        const colorTexture = new Texture2D(engine, 512, 512);
        const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 4);

        // @ts-ignore
        const glRenderTarget = renderTarget._platformRenderTarget as GLRenderTarget;

        expect(() => {
          glRenderTarget.activeRenderTarget(0);
        }).not.toThrow();

        expect(() => {
          glRenderTarget.blitRenderTarget();
        }).not.toThrow();

        renderTarget.destroy();
      } finally {
        mockCheck.mockRestore();
      }
    });
  });

  describe("validation", () => {
    it("should reject unsupported texture format", () => {
      const colorTexture = new Texture2D(engine, 512, 512);

      expect(() => {
        new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.R32G32B32A32, 1);
      }).toThrow("this TextureFormat is not supported");
    });

    it("should reject mismatched color texture sizes", () => {
      // @ts-ignore
      const mockCheck = vi.spyOn(GLRenderTarget, "_checkFrameBufferStatus").mockImplementation(() => {});

      try {
        const colorTexture1 = new Texture2D(engine, 512, 512);
        const colorTexture2 = new Texture2D(engine, 256, 256);

        expect(() => {
          new RenderTarget(engine, 512, 512, [colorTexture1, colorTexture2], TextureFormat.Depth16, 1);
        }).toThrow("ColorTexture's size must as same as RenderTarget");
      } finally {
        mockCheck.mockRestore();
      }
    });

    it("should auto-downgrade MSAA level to max supported", () => {
      // @ts-ignore
      const originalMaxAA = engine._hardwareRenderer.capability.maxAntiAliasing;
      // @ts-ignore
      engine._hardwareRenderer.capability._maxAntiAliasing = 2;

      // @ts-ignore
      const mockCheck = vi.spyOn(GLRenderTarget, "_checkFrameBufferStatus").mockImplementation(() => {});

      try {
        const colorTexture = new Texture2D(engine, 512, 512);
        const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 8);

        expect(renderTarget.antiAliasing).toBe(2);

        renderTarget.destroy();
      } finally {
        // @ts-ignore
        engine._hardwareRenderer.capability._maxAntiAliasing = originalMaxAA;
        mockCheck.mockRestore();
      }
    });
  });
});
