import {
  Camera,
  Canvas,
  ColorWriteMask,
  Engine,
  GLCapabilityType,
  IHardwareRenderer,
  IPlatformRenderColorTexture,
  IPlatformRenderDepthTexture,
  IPlatformRenderTarget,
  IPlatformTexture2D,
  IPlatformTextureCubeMap,
  Logger,
  Mesh,
  RenderColorTexture,
  RenderDepthTexture,
  RenderTarget,
  SubMesh,
  Texture2D,
  TextureCubeMap
} from "@oasis-engine/core";
import { CameraClearFlags } from "@oasis-engine/core";
import { IPlatformPrimitive } from "@oasis-engine/design";
import { Color } from "@oasis-engine/math";
import { GLCapability } from "./GLCapability";
import { GLExtensions } from "./GLExtensions";
import { GLPrimitive } from "./GLPrimitive";
import { GLRenderColorTexture } from "./GLRenderColorTexture";
import { GLRenderDepthTexture } from "./GLRenderDepthTexture";
import { GLRenderStates } from "./GLRenderStates";
import { GLRenderTarget } from "./GLRenderTarget";
import { GLTexture } from "./GLTexture";
import { GLTexture2D } from "./GLTexture2D";
import { GLTextureCubeMap } from "./GLTextureCubeMap";
import { WebGLExtension } from "./type";
import { WebCanvas } from "./WebCanvas";

/**
 * WebGL mode.
 */
export enum WebGLMode {
  /** Auto, use WebGL2.0 if support, or will fallback to WebGL1.0. */
  Auto = 0,
  /** WebGL2.0. */
  WebGL2 = 1,
  /** WebGL1.0, */
  WebGL1 = 2
}

/**
 * WebGL renderer options.
 */
export interface WebGLRendererOptions extends WebGLContextAttributes {
  /** WebGL mode.*/
  webGLMode?: WebGLMode;
}

/**
 * WebGL renderer, including WebGL1.0 and WebGL2.0.
 */
export class WebGLRenderer implements IHardwareRenderer {
  _currentBind: any;

  private _options: WebGLRendererOptions;
  private _gl: (WebGLRenderingContext & WebGLExtension) | WebGL2RenderingContext;
  private _renderStates;
  private _extensions;
  private _capability: GLCapability;
  private _isWebGL2: boolean;

  private _activedTextureID: number = WebGLRenderingContext.TEXTURE0;
  private _activeTextures: GLTexture[] = new Array(32);

  get isWebGL2() {
    return this._isWebGL2;
  }

  /**
   * GL Context
   * @member {WebGLRenderingContext}
   */
  get gl() {
    return this._gl;
  }

  get renderStates(): GLRenderStates {
    return this._renderStates;
  }

  get capability(): GLCapability {
    return this._capability;
  }

  get canIUseMoreJoints() {
    return this.capability.canIUseMoreJoints;
  }

  constructor(options: WebGLRendererOptions = {}) {
    this._options = options;
  }

  init(canvas: Canvas) {
    const option = this._options;
    option.alpha === undefined && (option.alpha = false);
    option.stencil === undefined && (option.stencil = true);

    const webCanvas = (canvas as WebCanvas)._webCanvas;
    const webGLMode = option.webGLMode || WebGLMode.Auto;
    let gl: (WebGLRenderingContext & WebGLExtension) | WebGL2RenderingContext;

    if (webGLMode == WebGLMode.Auto || webGLMode == WebGLMode.WebGL2) {
      gl = webCanvas.getContext("webgl2", option);
      if (!gl && webCanvas instanceof HTMLCanvasElement) {
        gl = <WebGL2RenderingContext>webCanvas.getContext("experimental-webgl2", option);
      }
      this._isWebGL2 = true;

      // Prevent weird browsers to lie (such as safari!)
      if (gl && !(<WebGL2RenderingContext>gl).deleteQuery) {
        this._isWebGL2 = false;
      }
    }

    if (!gl) {
      if (webGLMode == WebGLMode.Auto || webGLMode == WebGLMode.WebGL1) {
        gl = <WebGLRenderingContext & WebGLExtension>webCanvas.getContext("webgl", option);
        if (!gl && webCanvas instanceof HTMLCanvasElement) {
          gl = <WebGLRenderingContext & WebGLExtension>webCanvas.getContext("experimental-webgl", option);
        }
        this._isWebGL2 = false;
      }
    }

    if (!gl) {
      throw new Error("Get GL Context FAILED.");
    }

    this._gl = gl;
    this._renderStates = new GLRenderStates(gl);
    this._extensions = new GLExtensions(this);
    this._capability = new GLCapability(this);

    this._options = null;
  }

  createPlatformPrimitive(primitive: Mesh): IPlatformPrimitive {
    return new GLPrimitive(this, primitive);
  }

  createPlatformTexture2D(texture2D: Texture2D): IPlatformTexture2D {
    return new GLTexture2D(this, texture2D);
  }

  createPlatformTextureCubeMap(textureCube: TextureCubeMap): IPlatformTextureCubeMap {
    return new GLTextureCubeMap(this, textureCube);
  }

  createPlatformRenderColorTexture(texture: RenderColorTexture): IPlatformRenderColorTexture {
    return new GLRenderColorTexture(this, texture);
  }

  createPlatformRenderDepthTexture(texture: RenderDepthTexture): IPlatformRenderDepthTexture {
    return new GLRenderDepthTexture(this, texture);
  }

  createPlatformRenderTarget(target: RenderTarget): IPlatformRenderTarget {
    return new GLRenderTarget(this, target);
  }

  requireExtension(ext) {
    return this._extensions.requireExtension(ext);
  }

  canIUse(capabilityType: GLCapabilityType) {
    return this.capability.canIUse(capabilityType);
  }

  canIUseCompressedTextureInternalFormat(type: number) {
    return this.capability.canIUseCompressedTextureInternalFormat(type);
  }

  viewport(x, y, width, height) {
    // gl.enable(gl.SCISSOR_TEST);
    // gl.scissor(x, transformY, width, height);
    const gl = this._gl;
    gl.viewport(x, gl.drawingBufferHeight - y - height, width, height);
  }

  colorMask(r, g, b, a) {
    this._gl.colorMask(r, g, b, a);
  }

  clearRenderTarget(
    engine: Engine,
    clearFlags: CameraClearFlags.Depth | CameraClearFlags.DepthColor,
    clearColor: Color
  ) {
    const gl = this._gl;
    const {
      blendState: { targetBlendState },
      depthState,
      stencilState
    } = engine._lastRenderState;

    let clearFlag = gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT;
    if (clearFlags === CameraClearFlags.DepthColor) {
      clearFlag = clearFlag | gl.COLOR_BUFFER_BIT;
      if (clearColor) {
        gl.clearColor(clearColor.r, clearColor.g, clearColor.b, clearColor.a);
      }
      if (targetBlendState.colorWriteMask !== ColorWriteMask.All) {
        gl.colorMask(true, true, true, true);
        targetBlendState.colorWriteMask = ColorWriteMask.All;
      }
    }

    if (depthState.writeEnabled !== true) {
      gl.depthMask(true);
      depthState.writeEnabled = true;
    }

    if (stencilState.writeMask !== 0xff) {
      gl.stencilMask(0xff);
      stencilState.writeMask = 0xff;
    }

    gl.clear(clearFlag);
  }

  drawPrimitive(primitive: Mesh, subPrimitive: SubMesh, shaderProgram: any) {
    // todo: VAO not support morph animation
    if (primitive) {
      //@ts-ignore
      primitive._draw(shaderProgram, subPrimitive);
    } else {
      Logger.error("draw primitive failed.");
    }
  }

  activeRenderTarget(renderTarget: RenderTarget, camera: Camera, mipLevel: number) {
    const gl = this._gl;
    if (renderTarget) {
      /** @ts-ignore */
      (renderTarget._platformRenderTarget as GLRenderTarget)?._activeRenderTarget();
      const { width, height } = renderTarget;

      gl.viewport(0.0, 0.0, width >> mipLevel, height >> mipLevel);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const viewport = camera.viewport;
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      this.viewport(viewport.x * width, viewport.y * height, viewport.z * width, viewport.w * height);
    }
  }

  destroy() {}

  activeTexture(textureID: number): void {
    if (this._activedTextureID !== textureID) {
      this._gl.activeTexture(textureID);
      this._activedTextureID = textureID;
    }
  }

  bindTexture(texture: GLTexture): void {
    const index = this._activedTextureID - this._gl.TEXTURE0;
    if (this._activeTextures[index] !== texture) {
      this._gl.bindTexture(texture._target, texture._glTexture);
      this._activeTextures[index] = texture;
    }
  }
}
