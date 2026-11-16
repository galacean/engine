import {
  Engine,
  EngineConfiguration,
  Scene,
  ShaderPass,
  ShaderMacro,
  ShaderFactory,
  BasicRenderPipeline,
  Camera,
  CameraClearFlags,
  MeshRenderer,
  BlendShapeManager,
  Texture,
  Texture2D,
  TextureUtils,
  TextureFormat,
  TextureFilterMode,
  TextureWrapMode,
  PrimitiveMesh,
  Logger,
  GLCapabilityType,
  ParticleGenerator,
  ParticleRenderer,
  VelocityOverLifetimeModule,
  SubEmittersModule,
  CascadedShadowCasterPass,
  ShaderProgram,
  BasicResources,
  FontAtlas,
  DepthOnlyPass,
  ShaderMacroProcessor,
  PipelineUtils
} from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { GLPrimitive } from "./GLPrimitive";
import { GLCapability } from "./GLCapability";
import { GLExtensions } from "./GLExtensions";
import { GLRenderStates } from "./GLRenderStates";
import { GLTexture } from "./GLTexture";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";
import type { WebGLGraphicDeviceOptions } from "./WebGLGraphicDevice";
import { WebCanvas } from "./WebCanvas";

/**
 * WebGL platform engine, supports WebGL 1.0 and WebGL 2.0.
 */
export class WebGLEngine extends Engine {
  /**
   * Create a WebGL engine.
   * @param configuration - WebGL engine configuration
   * @returns A promise that will resolve when the engine is created
   */
  static create(configuration: WebGLEngineConfiguration): Promise<WebGLEngine> {
    try {
      const canvas = configuration.canvas;
      const webCanvas = new WebCanvas(typeof canvas === "string" ? document.getElementById(canvas) : canvas);
      const device = new WebGLGraphicDevice(configuration.graphicDeviceOptions);
      const gl = device._getWebGL2Context(webCanvas);
      if (gl?.deleteQuery) {
        device._setContext(webCanvas._webCanvas, gl);
        return WebGLEngine._createWithContext(webCanvas, device, configuration);
      }
      return loadRendererFallback().then((polyfill) => {
        polyfill(device, webCanvas);
        return WebGLEngine._createWithContext(webCanvas, device, configuration);
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private static _createWithContext(
    canvas: WebCanvas,
    device: WebGLGraphicDevice,
    configuration: WebGLEngineConfiguration
  ): Promise<WebGLEngine> {
    let engine: WebGLEngine | undefined;
    try {
      const created = (engine = new WebGLEngine(canvas, device, configuration));
      canvas.setAutoResolution();
      return created
        ._initialize(configuration)
        .then(() => {
          created.sceneManager.addScene(new Scene(created, "DefaultScene"));
          return created;
        })
        .catch((error) => {
          created.destroy();
          throw error;
        });
    } catch (error) {
      if (engine) {
        engine.destroy();
      } else {
        device.destroy();
      }
      return Promise.reject(error);
    }
  }

  /**
   * The web canvas the engine renders to.
   */
  override get canvas(): WebCanvas {
    return this._canvas as WebCanvas;
  }
}

/**
 * Options for `WebGLEngine.create()`.
 */
export interface WebGLEngineConfiguration extends EngineConfiguration {
  /** Canvas element or canvas id. */
  canvas: HTMLCanvasElement | OffscreenCanvas | string;
  /** Graphic device options. */
  graphicDeviceOptions?: WebGLGraphicDeviceOptions;
}

// Update the CDN pin when the compatibility package integration changes.
const fallbackModuleURL = `https://cdn.jsdelivr.net/npm/@galacean/engine-webgl1-polyfill@2.0.0-alpha.57/dist/module.js`;
let pendingFallback: Promise<(device: WebGLGraphicDevice, canvas: WebCanvas) => void> | undefined;
let fallbackRetry = 0;

function loadRendererFallback() {
  if (!pendingFallback) {
    const url = fallbackRetry ? fallbackModuleURL + "?retry=" + fallbackRetry : fallbackModuleURL;
    pendingFallback = import(/* @vite-ignore */ url)
      .then((module) => {
        if (typeof module.bind !== "function") {
          throw new Error("Invalid renderer fallback module.");
        }
        return module.bind({
          ShaderPass,
          ShaderMacro,
          ShaderFactory,
          BasicRenderPipeline,
          Camera,
          CameraClearFlags,
          MeshRenderer,
          BlendShapeManager,
          Texture,
          Texture2D,
          TextureUtils,
          TextureFormat,
          TextureFilterMode,
          TextureWrapMode,
          PrimitiveMesh,
          Logger,
          GLCapabilityType,
          ParticleGenerator,
          ParticleRenderer,
          VelocityOverLifetimeModule,
          SubEmittersModule,
          GLPrimitive,
          GLCapability,
          GLExtensions,
          GLRenderStates,
          GLTexture,
          MathUtil,
          WebGLGraphicDevice,
          CascadedShadowCasterPass,
          ShaderProgram,
          BasicResources,
          FontAtlas,
          DepthOnlyPass,
          ShaderMacroProcessor,
          PipelineUtils
        });
      })
      .catch((cause: unknown) => {
        pendingFallback = undefined;
        fallbackRetry++;
        throw new Error("Could not load renderer fallback.", { cause });
      });
  }
  return pendingFallback;
}
