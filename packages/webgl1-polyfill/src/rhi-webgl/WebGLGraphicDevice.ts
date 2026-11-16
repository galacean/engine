import { GLCapabilityType, Logger, type RenderTarget, type Texture, type Texture2DArray } from "@galacean/engine-core";
import {
  GLCapability,
  GLExtensions,
  GLRenderStates,
  type WebGLGraphicDevice as HostDevice
} from "@galacean/engine-rhi-webgl";
import { Mixin, Overwrite, callOriginal } from "@/override";

@Mixin("WebGLGraphicDevice")
export class WebGLGraphicDevice {
  declare _activeTextureID: number;
  declare _renderStates: GLRenderStates;
  declare _extensions: GLExtensions;
  declare _capability: GLCapability;
  declare _renderer: string;
  declare readonly gl: WebGLRenderingContext;
  declare canIUse: HostDevice["canIUse"];
  @Overwrite
  _initGLState(gl: WebGLRenderingContext & Pick<WebGL2RenderingContext, "getBufferSubData">) {
    this._activeTextureID = gl.TEXTURE0;
    this._renderStates = new GLRenderStates(gl);
    this._extensions = new GLExtensions(this as any);
    this._capability = new GLCapability(this as any);

    // Unsupported entry points fail at their actual invocation, never during ordinary initialization.
    gl.getBufferSubData = () => {
      throw new Error("Buffer is write-only on WebGL1.0 platforms.");
    };
    gl.activeTexture(gl.TEXTURE0);
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (info) this._renderer = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
  }
  @Overwrite
  createPlatformRenderTarget(target: RenderTarget) {
    if (target.colorTextures.length > 1 && !this.canIUse(GLCapabilityType.drawBuffers)) {
      for (const texture of target.colorTextures) texture._addReferCount(-1);
      target.depthTexture?._addReferCount(-1);
      unregisterResource(target);
      throw new Error("MRT is not supported");
    }
    return callOriginal(this, target);
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

// The Core constructor registers the resource before asking the device to allocate it.
function unregisterResource(resource: Texture | RenderTarget): void {
  const manager = resource.engine.resourceManager;
  manager._deleteGraphicResource(resource);
  manager._deleteReferResource(resource);
}
