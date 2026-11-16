import {
  Logger,
  type Texture,
  type Texture2DArray,
  TextureFormat,
  TextureUtils,
  TextureWrapMode
} from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { GLCapability, GLExtensions, GLRenderStates } from "@galacean/engine-rhi-webgl";
import { Mixin, Overwrite } from "@/override";
import { adaptContext } from "./context";
import { initializeWebGL1Capabilities, type WebGL1GraphicDevice } from "./GLCapability";
import { WebGL1Extension } from "./WebGL1Extension";

@Mixin("WebGLGraphicDevice")
export class WebGLGraphicDevice {
  declare _activeTextureID: number;
  declare _renderStates: GLRenderStates;
  declare _extensions: GLExtensions;
  declare _capability: GLCapability;
  declare _renderer: string;
  declare readonly gl: WebGLRenderingContext;
  declare canIUse: WebGL1GraphicDevice["canIUse"];

  @Overwrite
  _resolveFramebufferMipLevel(mipLevel: number): number {
    if (mipLevel > 0) {
      Logger.error("mipLevel only take effect in WebGL2.0");
      return 0;
    }
    return mipLevel;
  }

  @Overwrite
  _resolveTextureMipmaps(mipmap: boolean, width: number, height: number): boolean {
    if (mipmap && !isPowerOfTwoTexture(width, height)) {
      Logger.warn(
        "Non-power-2 texture is not supported for mipmap in WebGL1, and has automatically downgraded to non-mipmap"
      );
      return false;
    }
    return mipmap;
  }

  @Overwrite
  _resolveTextureWrapMode(mode: TextureWrapMode, width: number, height: number): TextureWrapMode {
    if (mode !== TextureWrapMode.Clamp && !isPowerOfTwoTexture(width, height)) {
      Logger.warn(
        "non-power-2 texture is not supported for REPEAT or MIRRORED_REPEAT in WebGL1,and has automatically downgraded to CLAMP_TO_EDGE"
      );
      return TextureWrapMode.Clamp;
    }
    return mode;
  }

  @Overwrite
  _supportsSRGBColorSpace(format: TextureFormat): boolean {
    if (format === TextureFormat.R8G8B8 || format === TextureFormat.R8G8B8A8) {
      return this.canIUse(WebGL1Extension.sRGB);
    }
    return TextureUtils.supportSRGB(format);
  }

  @Overwrite
  _supportsGenerateMipmaps(width: number, height: number, format: TextureFormat, isSRGBColorSpace: boolean): boolean {
    return isPowerOfTwoTexture(width, height) && (!isSRGBColorSpace || !TextureUtils.supportSRGB(format));
  }

  @Overwrite
  _initGLState(gl: WebGLRenderingContext & Pick<WebGL2RenderingContext, "getBufferSubData">) {
    this._activeTextureID = gl.TEXTURE0;
    this._renderStates = new GLRenderStates(gl);
    this._extensions = new GLExtensions(this as any);
    this._capability = new GLCapability(this as any);
    initializeWebGL1Capabilities(this._capability);
    adaptContext(this._capability);

    // Unsupported entry points fail at their actual invocation, never during ordinary initialization.
    gl.getBufferSubData = () => {
      throw new Error("Buffer is write-only on WebGL1.0 platforms.");
    };
    gl.activeTexture(gl.TEXTURE0);
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (info) this._renderer = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
  }
  @Overwrite
  createPlatformTexture2DArray(texture: Texture2DArray) {
    unregisterResource(texture);
    throw new Error("Texture2D Array is not supported in WebGL1.0");
  }
  @Overwrite
  createPlatformTransformFeedback(): never {
    throw new Error("Transform Feedback is not supported on WebGL1.");
  }
  @Overwrite
  createPlatformTransformFeedbackPrimitive(): never {
    throw new Error("Transform Feedback primitives are not supported on WebGL1.");
  }
  @Overwrite
  enableRasterizerDiscard(): never {
    throw new Error("Rasterizer discard is not supported on WebGL1.");
  }
  @Overwrite
  disableRasterizerDiscard(): never {
    throw new Error("Rasterizer discard is not supported on WebGL1.");
  }
  @Overwrite
  blitInternalRTByBlitFrameBuffer() {
    return Logger.warn("WebGL1.0 not support blit frame buffer.");
  }
  @Overwrite
  _createXRLayer(session: XRSession, scaleFactor: number) {
    const attributes = this.gl.getContextAttributes()!;
    const layer = new XRWebGLLayer(session, this.gl, {
      antialias: session.renderState.layers === undefined ? attributes.antialias : true,
      alpha: true,
      depth: attributes.depth,
      stencil: attributes.stencil,
      framebufferScaleFactor: scaleFactor
    });
    session.updateRenderState({ baseLayer: layer });
    return layer;
  }
}

function isPowerOfTwoTexture(width: number, height: number): boolean {
  return MathUtil.isPowerOf2(width) && MathUtil.isPowerOf2(height);
}

// The Core constructor registers the resource before asking the device to allocate it.
function unregisterResource(resource: Texture): void {
  const manager = resource.engine.resourceManager;
  manager._deleteGraphicResource(resource);
  manager._deleteReferResource(resource);
}
