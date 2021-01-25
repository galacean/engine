import {
  Camera,
  Canvas,
  ClearMode,
  Engine,
  GLCapabilityType,
  HardwareRenderer,
  Logger,
  Material,
  Primitive,
  RenderTarget,
  SubPrimitive,
  TextureCubeFace
} from "@oasis-engine/core";
import { IPlatformPrimitive } from "@oasis-engine/design";
import { Vector4 } from "@oasis-engine/math";
import { GLCapability } from "./GLCapability";
import { GLExtensions } from "./GLExtensions";
import { GLPrimitive } from "./GLPrimitive";
import { GLRenderStates } from "./GLRenderStates";
import { GLSpriteBatcher } from "./GLSpriteBatcher";
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
export class WebGLRenderer implements HardwareRenderer {
  _currentBind: any;

  private _options: WebGLRendererOptions;
  private _gl: (WebGLRenderingContext & WebGLExtension) | WebGL2RenderingContext;
  private _renderStates;
  private _extensions;
  private _spriteBatcher;
  private _capability: GLCapability;
  private _isWebGL2: boolean;

  private _activedTextureID: number;
  private _activeTextures: WebGLTexture[] = new Array(32);

  get isWebGL2() {
    return this._isWebGL2;
  }

  constructor(options: WebGLRendererOptions = {}) {
    this._options = options;
  }

  init(canvas: Canvas) {
    const option = this._options;
    const webCanvas = (canvas as WebCanvas)._webCanvas;
    const webGLMode = option.webGLMode || WebGLMode.Auto;
    let gl: (WebGLRenderingContext & WebGLExtension) | WebGL2RenderingContext;

    if (webGLMode == WebGLMode.Auto || webGLMode == WebGLMode.WebGL2) {
      gl = webCanvas.getContext("webgl2", option);
      if (!gl && webCanvas instanceof HTMLCanvasElement) {
        gl = <WebGL2RenderingContext>webCanvas.getContext("experimental-webgl2", option);
      }
      this._isWebGL2 = true;
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

  createPlatformPrimitive(primitive: Primitive): IPlatformPrimitive {
    return new GLPrimitive(this, primitive);
  }

  get gl() {
    return this._gl;
  }

  get renderStates(): GLRenderStates {
    return this._renderStates;
  }

  get capability(): GLCapability {
    return this._capability;
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

  public get canIUseMoreJoints() {
    return this.capability.canIUseMoreJoints;
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

  clearRenderTarget(clearMode, clearParam: Vector4) {
    const gl = this._gl;

    switch (clearMode) {
      case ClearMode.SOLID_COLOR: // solid color
        gl.clearColor(clearParam.x, clearParam.y, clearParam.z, clearParam.w);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        break;
      case ClearMode.DEPTH_ONLY: // depth only
        gl.clear(gl.DEPTH_BUFFER_BIT);
        break;
      case ClearMode.COLOR_ONLY:
        gl.clearColor(clearParam.x, clearParam.y, clearParam.z, clearParam.w);
        gl.clear(gl.COLOR_BUFFER_BIT);
        break;
      case ClearMode.STENCIL_ONLY:
        gl.clear(gl.STENCIL_BUFFER_BIT);
        break;
      case ClearMode.ALL_CLEAR:
        gl.clearColor(clearParam.x, clearParam.y, clearParam.z, clearParam.w);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        break;

      case ClearMode.DONT_CLEAR: // dont clear
        break;
    }
  }

  drawPrimitive(primitive: Primitive, subPrimitive: SubPrimitive, shaderProgram: any) {
    // todo: VAO not support morph animation
    if (primitive) {
      //@ts-ignore
      primitive._draw(shaderProgram, subPrimitive);
    } else {
      Logger.error("draw primitive failed.");
    }
  }

  drawSprite(material, positionQuad, uvRect, tintColor, texture, renderMode, camera: Camera) {
    if (!this._spriteBatcher) {
      this._spriteBatcher = new GLSpriteBatcher(this);
    }

    this._spriteBatcher.drawSprite(material, positionQuad, uvRect, tintColor, texture, renderMode, camera);
  }

  flushSprite(engine: Engine, material: Material) {
    if (this._spriteBatcher) {
      this._spriteBatcher.flush(engine, material);
    }
  }

  activeRenderTarget(renderTarget: RenderTarget, camera: Camera) {
    const gl = this._gl;
    if (renderTarget) {
      renderTarget._activeRenderTarget();
      const { width, height } = renderTarget;
      gl.viewport(0.0, 0.0, width, height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const viewport = camera.viewport;
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      this.viewport(viewport.x * width, viewport.y * height, viewport.z * width, viewport.w * height);
    }
  }

  blitRenderTarget(renderTarget: RenderTarget) {
    if (renderTarget) {
      if (renderTarget._MSAAFrameBuffer) {
        renderTarget._blitRenderTarget();
        return;
      }
    }
  }

  setRenderTargetFace(renderTarget: RenderTarget, cubeFace: TextureCubeFace) {
    if (renderTarget) {
      renderTarget._setRenderTargetFace(cubeFace);
    }
  }

  destroy() {}

  activeTexture(textureID: number): void {
    if (this._activedTextureID !== textureID) {
      this._gl.activeTexture(textureID);
      this._activedTextureID = textureID;
    }
  }

  bindTexture(target: number, texture: WebGLTexture): void {
    const gl = this._gl;
    if (this._activeTextures[this._activedTextureID - gl.TEXTURE0] !== texture) {
      gl.bindTexture(target, texture);
      this._activeTextures[this._activedTextureID - gl.TEXTURE0] = texture;
    }
  }
}
