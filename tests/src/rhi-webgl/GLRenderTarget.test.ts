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

  describe("checkFrameBufferStatus static method", () => {
    it("should not throw error for complete framebuffer", () => {
      // Mock a complete framebuffer
      vi.spyOn(gl, 'checkFramebufferStatus').mockReturnValue(gl.FRAMEBUFFER_COMPLETE);
      
      expect(() => {
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).not.toThrow();
    });

    it("should throw error for incomplete attachment", () => {
      vi.spyOn(gl, 'checkFramebufferStatus').mockReturnValue(gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT);
      
      expect(() => {
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).toThrow("The attachment types are mismatched");
    });

    it("should throw error for missing attachment", () => {
      vi.spyOn(gl, 'checkFramebufferStatus').mockReturnValue(gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT);
      
      expect(() => {
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).toThrow("There is no attachment");
    });

    it("should throw error for dimension mismatch", () => {
      vi.spyOn(gl, 'checkFramebufferStatus').mockReturnValue(gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS);
      
      expect(() => {
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).toThrow("Height and width of the attachment are not the same");
    });

    it("should throw error for unsupported format when context is not lost", () => {
      vi.spyOn(gl, 'checkFramebufferStatus').mockReturnValue(gl.FRAMEBUFFER_UNSUPPORTED);
      vi.spyOn(gl, 'isContextLost').mockReturnValue(false);
      
      expect(() => {
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).toThrow("The format of the attachment is not supported");
    });

    it("should not throw error for unsupported format when context is lost", () => {
      vi.spyOn(gl, 'checkFramebufferStatus').mockReturnValue(gl.FRAMEBUFFER_UNSUPPORTED);
      vi.spyOn(gl, 'isContextLost').mockReturnValue(true);
      
      expect(() => {
        GLRenderTarget._checkFrameBufferStatus(gl);
      }).not.toThrow();
    });

    it("should handle WebGL2 multisample error if available", () => {
      // Only test on WebGL2
      if ('FRAMEBUFFER_INCOMPLETE_MULTISAMPLE' in gl) {
        vi.spyOn(gl, 'checkFramebufferStatus').mockReturnValue(
          (gl as WebGL2RenderingContext).FRAMEBUFFER_INCOMPLETE_MULTISAMPLE
        );
        
        expect(() => {
          GLRenderTarget._checkFrameBufferStatus(gl);
        }).toThrow("The values of gl.RENDERBUFFER_SAMPLES are different");
      }
    });
  });

  describe("MSAA functionality integration", () => {
    it("should handle MSAA render targets without errors", () => {
      // Mock checkFrameBufferStatus to avoid WebGL validation issues
      const mockCheckFrameBuffer = vi.spyOn(GLRenderTarget, '_checkFrameBufferStatus')
        .mockImplementation(() => {});
      
      try {
        const colorTexture = new Texture2D(engine, 512, 512);
        
        // Test creating MSAA render target
        expect(() => {
          const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 4);
          renderTarget.destroy();
        }).not.toThrow();
        
      } finally {
        mockCheckFrameBuffer.mockRestore();
      }
    });

    it("should handle non-MSAA render targets correctly", () => {
      expect(() => {
        const colorTexture = new Texture2D(engine, 512, 512);
        const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 1);
        renderTarget.destroy();
      }).not.toThrow();
    });

    it("should support basic render target operations", () => {
      const mockCheckFrameBuffer = vi.spyOn(GLRenderTarget, '_checkFrameBufferStatus')
        .mockImplementation(() => {});
      
      try {
        const colorTexture = new Texture2D(engine, 512, 512);
        const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 4);
        
        // @ts-ignore - Access platform render target
        const glRenderTarget = renderTarget._platformRenderTarget as GLRenderTarget;
        
        // Test that we can call activeRenderTarget without errors
        expect(() => {
          glRenderTarget.activeRenderTarget(0);
        }).not.toThrow();
        
        // Test that we can call blitRenderTarget without errors
        expect(() => {
          glRenderTarget.blitRenderTarget();
        }).not.toThrow();
        
        renderTarget.destroy();
      } finally {
        mockCheckFrameBuffer.mockRestore();
      }
    });
  });



  describe("Error handling and validation", () => {
    it("should validate texture format support", () => {
      const colorTexture = new Texture2D(engine, 512, 512);
      
      // Test unsupported texture format should throw error (expected behavior)
      expect(() => {
        new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.R32G32B32A32, 1);
      }).toThrow("this TextureFormat is not supported");
    });

    it("should validate color texture size consistency", () => {
      // Mock checkFrameBufferStatus to focus on size validation
      const mockCheckFrameBuffer = vi.spyOn(GLRenderTarget, '_checkFrameBufferStatus')
        .mockImplementation(() => {});
      
      try {
        const colorTexture1 = new Texture2D(engine, 512, 512);
        const colorTexture2 = new Texture2D(engine, 256, 256); // Different size
        
        expect(() => {
          new RenderTarget(engine, 512, 512, [colorTexture1, colorTexture2], TextureFormat.Depth16, 1);
        }).toThrow("ColorTexture's size must as same as RenderTarget");
      } finally {
        mockCheckFrameBuffer.mockRestore();
      }
    });

    it("should handle MSAA level auto-downgrade", () => {
      // Mock maxAntiAliasing capability
      // @ts-ignore
      const originalMaxAA = engine._hardwareRenderer.capability.maxAntiAliasing;
      // @ts-ignore
      engine._hardwareRenderer.capability._maxAntiAliasing = 2;
      
      const mockCheckFrameBuffer = vi.spyOn(GLRenderTarget, '_checkFrameBufferStatus')
        .mockImplementation(() => {});
      
      try {
        const colorTexture = new Texture2D(engine, 512, 512);
        const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 8);
        
        // Should be downgraded to max supported level
        expect(renderTarget.antiAliasing).toBe(2);
        
        renderTarget.destroy();
      } finally {
        // Restore original maxAntiAliasing
        // @ts-ignore
        engine._hardwareRenderer.capability._maxAntiAliasing = originalMaxAA;
        mockCheckFrameBuffer.mockRestore();
      }
    });
  });

  describe("Basic render target lifecycle", () => {
    it("should create and destroy render targets without errors", () => {
      expect(() => {
        const colorTexture = new Texture2D(engine, 512, 512);
        const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 1);
        renderTarget.destroy();
      }).not.toThrow();
    });

    it("should handle render target operations without errors", () => {
      const colorTexture = new Texture2D(engine, 512, 512);
      const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 1);
      
      // @ts-ignore
      const glRenderTarget = renderTarget._platformRenderTarget as GLRenderTarget;
      
      // Test that basic operations don't throw errors
      expect(() => {
        glRenderTarget.activeRenderTarget(0);
        glRenderTarget.blitRenderTarget();
      }).not.toThrow();
      
      renderTarget.destroy();
    });
  });
}); 