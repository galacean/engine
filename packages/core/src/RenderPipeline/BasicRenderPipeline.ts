import { Vector2, Vector4 } from "@galacean/engine-math";
import { SpriteMask } from "../2d";
import { Background } from "../Background";
import { Camera } from "../Camera";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { Logger } from "../base/Logger";
import { BackgroundMode } from "../enums/BackgroundMode";
import { BackgroundTextureFillMode } from "../enums/BackgroundTextureFillMode";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { DepthTextureMode } from "../enums/DepthTextureMode";
import { Shader } from "../shader/Shader";
import { ShaderPass } from "../shader/ShaderPass";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { RenderState } from "../shader/state/RenderState";
import { CascadedShadowCasterPass } from "../shadow/CascadedShadowCasterPass";
import { ShadowType } from "../shadow/enum/ShadowType";
import { RenderTarget, Texture2D, TextureCubeFace, TextureFormat, TextureWrapMode } from "../texture";
import { CullingResults } from "./CullingResults";
import { DepthOnlyPass } from "./DepthOnlyPass";
import { OpaqueTexturePass } from "./OpaqueTexturePass";
import { PipelineUtils } from "./PipelineUtils";
import { RenderContext } from "./RenderContext";
import { RenderData } from "./RenderData";
import { PipelineStage } from "./enums/PipelineStage";

/**
 * Basic render pipeline.
 */
export class BasicRenderPipeline {
  /** @internal */
  _cullingResults: CullingResults;

  /** @internal */
  _allSpriteMasks: DisorderedArray<SpriteMask> = new DisorderedArray();

  private _camera: Camera;
  private _lastCanvasSize = new Vector2();

  private _internalColorTarget: RenderTarget = null;
  private _cascadedShadowCasterPass: CascadedShadowCasterPass;
  private _depthOnlyPass: DepthOnlyPass;
  private _opaqueTexturePass: OpaqueTexturePass;

  /**
   * Create a basic render pipeline.
   * @param camera - Camera
   */
  constructor(camera: Camera) {
    this._camera = camera;
    const { engine } = camera;
    this._cullingResults = new CullingResults(engine);
    this._cascadedShadowCasterPass = new CascadedShadowCasterPass(camera);
    this._depthOnlyPass = new DepthOnlyPass(engine);
    this._opaqueTexturePass = new OpaqueTexturePass(engine);
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {
    this._cullingResults.destroy();
    this._allSpriteMasks = null;
    this._camera = null;
  }

  /**
   * Perform scene rendering.
   * @param context - Render context
   * @param cubeFace - Render surface of cube texture
   * @param mipLevel - Set mip level the data want to write
   * @param ignoreClear - Ignore clear flag
   */
  render(context: RenderContext, cubeFace?: TextureCubeFace, mipLevel?: number, ignoreClear?: CameraClearFlags) {
    const camera = this._camera;
    const { scene, engine } = camera;
    const cullingResults = this._cullingResults;
    const sunlight = scene._lightManager._sunlight;
    const depthOnlyPass = this._depthOnlyPass;
    const depthPassEnabled = camera.depthTextureMode === DepthTextureMode.PrePass && depthOnlyPass._supportDepthTexture;
    camera.engine._spriteMaskManager.clear();

    if (scene.castShadows && sunlight && sunlight.shadowType !== ShadowType.None) {
      this._cascadedShadowCasterPass.onRender(context);
    }

    cullingResults.reset();
    this._allSpriteMasks.length = 0;

    context.applyVirtualCamera(camera._virtualCamera, depthPassEnabled);
    this._prepareRender(context);

    cullingResults.sort();

    if (depthPassEnabled) {
      depthOnlyPass.onConfig(camera);
      depthOnlyPass.onRender(context, cullingResults);
    } else {
      camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, engine._whiteTexture2D);
    }

    // Check if need to create internal color texture
    const independentCanvasEnabled = camera.independentCanvasEnabled;
    if (independentCanvasEnabled && Vector4.equals(camera.viewport, PipelineUtils.defaultViewport)) {
      Logger.warn(
        "Camera use independent canvas and viewport cover the whole screen, it is recommended to disable antialias, depth and stencil to save memory when create engine."
      );
    }

    if (independentCanvasEnabled) {
      const viewport = camera.pixelViewport;
      const internalColorTarget = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._internalColorTarget,
        viewport.width,
        viewport.height,
        TextureFormat.R8G8B8A8,
        TextureFormat.Depth24Stencil8,
        false,
        false,
        camera.msaaSamples
      );
      const colorTexture = internalColorTarget.getColorTexture(0);
      colorTexture.wrapModeU = colorTexture.wrapModeV = TextureWrapMode.Clamp;
      this._internalColorTarget = internalColorTarget;
    } else {
      const internalColorTarget = this._internalColorTarget;
      if (internalColorTarget) {
        internalColorTarget.destroy();
        this._internalColorTarget = null;
      }
    }

    this._drawRenderPass(context, camera, cubeFace, mipLevel, ignoreClear);
  }

  private _drawRenderPass(
    context: RenderContext,
    camera: Camera,
    cubeFace?: TextureCubeFace,
    mipLevel?: number,
    ignoreClear?: CameraClearFlags
  ) {
    const cullingResults = this._cullingResults;
    const { opaqueQueue, alphaTestQueue, transparentQueue } = cullingResults;

    const { engine, scene } = camera;
    const { background } = scene;

    const internalColorTarget = this._internalColorTarget;
    const rhi = engine._hardwareRenderer;
    const colorTarget = camera.renderTarget ?? internalColorTarget;
    const colorViewport = internalColorTarget ? PipelineUtils.defaultViewport : camera.viewport;
    const needFlipProjection = (camera.renderTarget && cubeFace == undefined) || internalColorTarget !== null;

    if (context.flipProjection !== needFlipProjection) {
      context.applyVirtualCamera(camera._virtualCamera, needFlipProjection);
      this._updateMVPShaderData(context);
      // @todo: It is more appropriate to prevent duplication based on `virtualCamera` at `RenderQueue#render`.
      engine._renderCount++;
    }

    rhi.activeRenderTarget(colorTarget, colorViewport, mipLevel, cubeFace);
    const clearFlags = camera.clearFlags & ~(ignoreClear ?? CameraClearFlags.None);
    const color = background.solidColor;
    if (clearFlags !== CameraClearFlags.None) {
      rhi.clearRenderTarget(camera.engine, clearFlags, color);
    }

    opaqueQueue.render(camera, PipelineStage.Forward);
    alphaTestQueue.render(camera, PipelineStage.Forward);
    if (clearFlags & CameraClearFlags.Color) {
      if (background.mode === BackgroundMode.Sky) {
        background.sky._render(context);
      } else if (background.mode === BackgroundMode.Texture && background.texture) {
        this._drawBackgroundTexture(engine, background);
      }
    }

    // Copy opaque texture
    if (camera.opaqueTextureEnabled) {
      // Should blit to resolve the MSAA
      colorTarget._blitRenderTarget();

      const opaqueTexturePass = this._opaqueTexturePass;
      opaqueTexturePass.onConfig(camera, colorTarget.getColorTexture(0));
      opaqueTexturePass.onRender(context, cullingResults);

      // Should revert to original render target
      rhi.activeRenderTarget(colorTarget, colorViewport, mipLevel, cubeFace);
    }

    transparentQueue.render(camera, PipelineStage.Forward);

    colorTarget?._blitRenderTarget();
    colorTarget?.generateMipmaps();

    if (internalColorTarget) {
      PipelineUtils.blitTexture(engine, <Texture2D>internalColorTarget.getColorTexture(0), null, 0, camera.viewport);
    }
  }

  /**
   * Push render data to render queue.
   * @param context - Render context
   * @param data - Render data
   */
  pushRenderData(context: RenderContext, data: RenderData): void {
    const { material } = data;
    const { renderStates } = material;
    const materialSubShader = material.shader.subShaders[0];
    const replacementShader = context.replacementShader;

    if (replacementShader) {
      const replacementSubShaders = replacementShader.subShaders;
      const { replacementTag } = context;
      if (replacementTag) {
        for (let i = 0, n = replacementSubShaders.length; i < n; i++) {
          const subShader = replacementSubShaders[i];
          if (subShader.getTagValue(replacementTag) === materialSubShader.getTagValue(replacementTag)) {
            this.pushRenderDataWithShader(context, data, subShader.passes, renderStates);
            break;
          }
        }
      } else {
        this.pushRenderDataWithShader(context, data, replacementSubShaders[0].passes, renderStates);
      }
    } else {
      this.pushRenderDataWithShader(context, data, materialSubShader.passes, renderStates);
    }
  }

  private pushRenderDataWithShader(
    context: RenderContext,
    element: RenderData,
    shaderPasses: ReadonlyArray<ShaderPass>,
    renderStates: ReadonlyArray<RenderState>
  ) {
    const { opaqueQueue, alphaTestQueue, transparentQueue } = this._cullingResults;
    const renderElementPool = context.camera.engine._renderElementPool;

    let renderQueueAddedFlags = RenderQueueAddedFlag.None;
    for (let i = 0, n = shaderPasses.length; i < n; i++) {
      const renderQueueType = (shaderPasses[i]._renderState ?? renderStates[i]).renderQueueType;
      if (renderQueueAddedFlags & (<RenderQueueAddedFlag>(1 << renderQueueType))) {
        continue;
      }

      const renderElement = renderElementPool.getFromPool();
      renderElement.set(element, shaderPasses);
      switch (renderQueueType) {
        case RenderQueueType.Opaque:
          opaqueQueue.pushRenderElement(renderElement);
          renderQueueAddedFlags |= RenderQueueAddedFlag.Opaque;
          break;
        case RenderQueueType.AlphaTest:
          alphaTestQueue.pushRenderElement(renderElement);
          renderQueueAddedFlags |= RenderQueueAddedFlag.AlphaTest;
          break;
        case RenderQueueType.Transparent:
          transparentQueue.pushRenderElement(renderElement);
          renderQueueAddedFlags |= RenderQueueAddedFlag.Transparent;
          break;
      }
    }
  }

  private _drawBackgroundTexture(engine: Engine, background: Background) {
    const rhi = engine._hardwareRenderer;
    const { canvas } = engine;
    const { _material: material, _mesh: mesh } = background;

    if (
      (this._lastCanvasSize.x !== canvas.width || this._lastCanvasSize.y !== canvas.height) &&
      background._textureFillMode !== BackgroundTextureFillMode.Fill
    ) {
      this._lastCanvasSize.set(canvas.width, canvas.height);
      background._resizeBackgroundTexture();
    }

    const pass = material.shader.subShaders[0].passes[0];
    const program = pass._getShaderProgram(engine, Shader._compileMacros);
    program.bind();
    program.uploadAll(program.materialUniformBlock, material.shaderData);
    program.uploadUnGroupTextures();

    (pass._renderState || material.renderState)._apply(engine, false, pass._renderStateDataMap, material.shaderData);
    rhi.drawPrimitive(mesh._primitive, mesh.subMesh, program);
  }

  private _prepareRender(context: RenderContext): void {
    const camera = context.camera;
    const engine = camera.engine;
    const renderers = camera.scene._componentsManager._renderers;

    const elements = renderers._elements;
    for (let i = renderers.length - 1; i >= 0; --i) {
      const renderer = elements[i];

      // Filter by camera culling mask
      if (!(camera.cullingMask & renderer._entity.layer)) {
        continue;
      }

      // Filter by camera frustum
      if (camera.enableFrustumCulling) {
        if (!camera._frustum.intersectsBox(renderer.bounds)) {
          continue;
        }
      }
      renderer._renderFrameCount = engine.time.frameCount;
      renderer._prepareRender(context);
    }
  }

  private _updateMVPShaderData(context: RenderContext) {
    const camera = context.camera;
    const renderers = camera.scene._componentsManager._renderers;

    const elements = renderers._elements;
    for (let i = renderers.length - 1; i >= 0; --i) {
      const renderer = elements[i];
      renderer._updateShaderData(context, true);
    }
  }
}

enum RenderQueueAddedFlag {
  None = 0x0,
  Opaque = 0x1,
  AlphaTest = 0x2,
  Transparent = 0x4
}
