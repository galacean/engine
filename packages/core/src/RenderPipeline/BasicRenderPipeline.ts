import { Vector2 } from "@galacean/engine-math";
import { Background } from "../Background";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
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
import { RenderContext, RendererUpdateType } from "./RenderContext";
import { RenderData } from "./RenderData";
import { SubRenderElement } from "./SubRenderElement";
import { PipelineStage } from "./enums/PipelineStage";

/**
 * Basic render pipeline.
 */
export class BasicRenderPipeline {
  /** @internal */
  _cullingResults: CullingResults;

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
    this._cullingResults = new CullingResults();
    this._cascadedShadowCasterPass = new CascadedShadowCasterPass(camera);
    this._depthOnlyPass = new DepthOnlyPass(engine);
    this._opaqueTexturePass = new OpaqueTexturePass(engine);
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {
    this._cullingResults.destroy();
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
    context.rendererUpdateType = RendererUpdateType.All;

    const camera = this._camera;
    const { scene, engine } = camera;
    const cullingResults = this._cullingResults;
    const sunlight = scene._lightManager._sunlight;
    const depthOnlyPass = this._depthOnlyPass;
    const depthPassEnabled = camera.depthTextureMode === DepthTextureMode.PrePass && depthOnlyPass._supportDepthTexture;

    if (scene.castShadows && sunlight && sunlight.shadowType !== ShadowType.None) {
      this._cascadedShadowCasterPass.onRender(context);
      context.rendererUpdateType = RendererUpdateType.None;
    }

    const batcherManager = engine._batcherManager;
    const maskManager = engine._maskManager;
    cullingResults.reset();
    maskManager.clear();

    // Depth use camera's view and projection matrix
    context.rendererUpdateType |= RendererUpdateType.viewProjectionMatrix;
    context.applyVirtualCamera(camera._virtualCamera, depthPassEnabled);
    this._prepareRender(context);

    cullingResults.sortBatch(batcherManager);
    batcherManager.uploadBuffer();

    if (depthPassEnabled) {
      depthOnlyPass.onConfig(camera);
      depthOnlyPass.onRender(context, cullingResults);
      context.rendererUpdateType = RendererUpdateType.None;
    } else {
      camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, engine._whiteTexture2D);
    }

    // Check if need to create internal color texture
    const independentCanvasEnabled = camera.independentCanvasEnabled;
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
        internalColorTarget.getColorTexture(0)?.destroy(true);
        internalColorTarget.destroy(true);
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
      // Just add projection matrix update type is enough
      context.rendererUpdateType |= RendererUpdateType.ProjectionMatrix;
      context.applyVirtualCamera(camera._virtualCamera, needFlipProjection);
    }

    rhi.activeRenderTarget(colorTarget, colorViewport, context.flipProjection, mipLevel, cubeFace);
    const clearFlags = camera.clearFlags & ~(ignoreClear ?? CameraClearFlags.None);
    const color = background.solidColor;
    if (clearFlags !== CameraClearFlags.None) {
      rhi.clearRenderTarget(camera.engine, clearFlags, color);
    }

    opaqueQueue.render(context, PipelineStage.Forward);
    alphaTestQueue.render(context, PipelineStage.Forward);
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
      rhi.activeRenderTarget(colorTarget, colorViewport, context.flipProjection, mipLevel, cubeFace);
    } else {
      camera.shaderData.setTexture(Camera._cameraOpaqueTextureProperty, null);
    }

    transparentQueue.render(context, PipelineStage.Forward);

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
    let renderQueueAddedFlags = RenderQueueAddedFlag.None;
    const subRenderElements = data.subRenderElements;
    for (let i = 0, n = subRenderElements.length; i < n; ++i) {
      const subRenderElement = subRenderElements[i];
      const { material } = subRenderElement;
      const { renderStates } = material;
      const materialSubShader = material.shader.subShaders[0];
      const replacementShader = context.replacementShader;

      if (replacementShader) {
        const replacementSubShaders = replacementShader.subShaders;
        const { replacementTag } = context;
        if (replacementTag) {
          for (let j = 0, m = replacementSubShaders.length; j < m; j++) {
            const subShader = replacementSubShaders[j];
            if (subShader.getTagValue(replacementTag) === materialSubShader.getTagValue(replacementTag)) {
              renderQueueAddedFlags = this.pushRenderDataWithShader(
                context,
                data,
                subRenderElement,
                subShader.passes,
                renderStates,
                renderQueueAddedFlags
              );
              break;
            }
          }
        } else {
          renderQueueAddedFlags = this.pushRenderDataWithShader(
            context,
            data,
            subRenderElement,
            replacementSubShaders[0].passes,
            renderStates,
            renderQueueAddedFlags
          );
        }
      } else {
        renderQueueAddedFlags = this.pushRenderDataWithShader(
          context,
          data,
          subRenderElement,
          materialSubShader.passes,
          renderStates,
          renderQueueAddedFlags
        );
      }
    }
  }

  private pushRenderDataWithShader(
    context: RenderContext,
    renderData: RenderData,
    subRenderElement: SubRenderElement,
    shaderPasses: ReadonlyArray<ShaderPass>,
    renderStates: ReadonlyArray<RenderState>,
    renderQueueAddedFlags: RenderQueueAddedFlag
  ): RenderQueueAddedFlag {
    const cullingResults = this._cullingResults;
    const engine = context.camera.engine;
    const renderElementPool = engine._renderElementPool;
    for (let i = 0, n = shaderPasses.length; i < n; i++) {
      // Get render queue type
      let renderQueueType: RenderQueueType;
      const shaderPass = shaderPasses[i];
      const renderState = shaderPass._renderState;
      if (renderState) {
        renderState._applyRenderQueueByShaderData(shaderPass._renderStateDataMap, subRenderElement.material.shaderData);
        renderQueueType = renderState.renderQueueType;
      } else {
        renderQueueType = renderStates[i].renderQueueType;
      }

      subRenderElement.setShaderPasses(shaderPasses);

      if (renderQueueAddedFlags & (<RenderQueueAddedFlag>(1 << renderQueueType))) {
        continue;
      }

      const renderElement = renderElementPool.get();
      renderElement.set(renderData);
      switch (renderQueueType) {
        case RenderQueueType.Opaque:
          cullingResults.opaqueQueue.pushRenderElement(renderElement);
          renderQueueAddedFlags |= RenderQueueAddedFlag.Opaque;
          break;
        case RenderQueueType.AlphaTest:
          cullingResults.alphaTestQueue.pushRenderElement(renderElement);
          renderQueueAddedFlags |= RenderQueueAddedFlag.AlphaTest;
          break;
        case RenderQueueType.Transparent:
          cullingResults.transparentQueue.pushRenderElement(renderElement);
          renderQueueAddedFlags |= RenderQueueAddedFlag.Transparent;
          break;
      }
    }

    return renderQueueAddedFlags;
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

    (pass._renderState || material.renderState)._applyStates(
      engine,
      false,
      pass._renderStateDataMap,
      material.shaderData
    );
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
      renderer._prepareRender(context);
      renderer._renderFrameCount = engine.time.frameCount;
    }
  }
}

enum RenderQueueAddedFlag {
  None = 0x0,
  Opaque = 0x1,
  AlphaTest = 0x2,
  Transparent = 0x4
}
