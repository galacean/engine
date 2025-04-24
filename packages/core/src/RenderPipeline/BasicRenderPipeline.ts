import { Vector2 } from "@galacean/engine-math";
import { Background } from "../Background";
import { Camera } from "../Camera";
import { Logger } from "../base/Logger";
import { BackgroundMode } from "../enums/BackgroundMode";
import { BackgroundTextureFillMode } from "../enums/BackgroundTextureFillMode";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { DepthTextureMode } from "../enums/DepthTextureMode";
import { ReplacementFailureStrategy } from "../enums/ReplacementFailureStrategy";
import { FinalPass } from "../postProcess";
import { Shader } from "../shader/Shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderPass } from "../shader/ShaderPass";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { RenderState } from "../shader/state/RenderState";
import { CascadedShadowCasterPass } from "../shadow/CascadedShadowCasterPass";
import { ShadowType } from "../shadow/enum/ShadowType";
import {
  RenderTarget,
  Texture2D,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "../texture";
import { Blitter } from "./Blitter";
import { CullingResults } from "./CullingResults";
import { DepthOnlyPass } from "./DepthOnlyPass";
import { OpaqueTexturePass } from "./OpaqueTexturePass";
import { PipelineUtils } from "./PipelineUtils";
import { ContextRendererUpdateFlag, RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
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
  private _finalPass: FinalPass;
  private _copyBackgroundTexture: Texture2D;
  private _canUseBlitFrameBuffer = false;
  private _shouldCopyBackgroundColor = false;

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
    this._finalPass = new FinalPass(engine);
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
    context.rendererUpdateFlag = ContextRendererUpdateFlag.All;

    const camera = this._camera;
    const { scene, engine, renderTarget, independentCanvasEnabled } = camera;
    const rhi = engine._hardwareRenderer;
    const cullingResults = this._cullingResults;
    const sunlight = scene._lightManager._sunlight;
    const depthOnlyPass = this._depthOnlyPass;
    const depthPassEnabled = camera.depthTextureMode === DepthTextureMode.PrePass && depthOnlyPass._supportDepthTexture;
    const finalClearFlags = camera.clearFlags & ~(ignoreClear ?? CameraClearFlags.None);
    const msaaSamples = renderTarget ? renderTarget.antiAliasing : camera.msaaSamples;

    // 1. Only support blitFramebuffer in webgl2 context
    // 2. Can't blit normal FBO to MSAA FBO
    // 3. Can't blit screen MSAA FBO to normal FBO in mac safari platform and mobile, but mac chrome and firfox is OK
    this._canUseBlitFrameBuffer = rhi.isWebGL2 && msaaSamples === 1 && (!!renderTarget || !rhi.context.antialias);

    // Because internal render target is linear color space, so we should convert srgb background color to linear color space
    const isSRGBBackground = !renderTarget || renderTarget.getColorTexture(0).isSRGBColorSpace;
    this._shouldCopyBackgroundColor =
      independentCanvasEnabled &&
      !(finalClearFlags & CameraClearFlags.Color) &&
      (!this._canUseBlitFrameBuffer || isSRGBBackground);

    if (scene.castShadows && sunlight && sunlight.shadowType !== ShadowType.None) {
      this._cascadedShadowCasterPass.onRender(context);
      context.rendererUpdateFlag = ContextRendererUpdateFlag.None;
    }

    const batcherManager = engine._batcherManager;
    cullingResults.reset();

    // Depth use camera's view and projection matrix
    context.rendererUpdateFlag |= ContextRendererUpdateFlag.viewProjectionMatrix;
    context.applyVirtualCamera(camera._virtualCamera, depthPassEnabled);
    this._prepareRender(context);

    cullingResults.sortBatch(batcherManager);
    batcherManager.uploadBuffer();

    if (depthPassEnabled) {
      depthOnlyPass.onConfig(camera);
      depthOnlyPass.onRender(context, cullingResults);
      context.rendererUpdateFlag = ContextRendererUpdateFlag.None;
    } else {
      camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, engine._basicResources.whiteTexture2D);
    }

    // Check if need to create internal color texture or grab texture
    if (independentCanvasEnabled) {
      let depthFormat: TextureFormat;
      if (camera.renderTarget) {
        depthFormat = camera.renderTarget._depthFormat;
      } else if (rhi.context.depth && rhi.context.stencil) {
        depthFormat = TextureFormat.Depth24Stencil8;
      } else if (rhi.context.depth) {
        depthFormat = TextureFormat.Depth24;
      } else if (rhi.context.stencil) {
        depthFormat = TextureFormat.Stencil;
      } else {
        depthFormat = null;
      }
      const viewport = camera.pixelViewport;
      const internalColorTarget = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._internalColorTarget,
        viewport.width,
        viewport.height,
        camera._getInternalColorTextureFormat(),
        depthFormat,
        false,
        false,
        !camera.enableHDR,
        msaaSamples,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );

      if (this._shouldCopyBackgroundColor) {
        const colorTexture = camera.renderTarget?.getColorTexture(0);
        const copyBackgroundTexture = PipelineUtils.recreateTextureIfNeeded(
          engine,
          this._copyBackgroundTexture,
          viewport.width,
          viewport.height,
          colorTexture?.format ?? TextureFormat.R8G8B8A8,
          false,
          colorTexture?.isSRGBColorSpace ?? false,
          TextureWrapMode.Clamp,
          TextureFilterMode.Bilinear
        );
        this._copyBackgroundTexture = copyBackgroundTexture;
      }

      this._internalColorTarget = internalColorTarget;
    } else {
      const internalColorTarget = this._internalColorTarget;
      const copyBackgroundTexture = this._copyBackgroundTexture;
      if (internalColorTarget) {
        internalColorTarget.getColorTexture(0)?.destroy(true);
        internalColorTarget.destroy(true);
        this._internalColorTarget = null;
      }
      if (copyBackgroundTexture) {
        copyBackgroundTexture.destroy(true);
        this._copyBackgroundTexture = null;
      }
    }

    this._drawRenderPass(context, camera, finalClearFlags, cubeFace, mipLevel);
  }

  private _drawRenderPass(
    context: RenderContext,
    camera: Camera,
    finalClearFlags: CameraClearFlags,
    cubeFace?: TextureCubeFace,
    mipLevel?: number
  ) {
    const cullingResults = this._cullingResults;
    const { opaqueQueue, alphaTestQueue, transparentQueue } = cullingResults;

    const { engine, scene, renderTarget: cameraRenderTarget } = camera;
    const { background } = scene;

    const rhi = engine._hardwareRenderer;
    const internalColorTarget = this._internalColorTarget;
    const colorTarget = internalColorTarget || camera.renderTarget;
    const colorViewport = internalColorTarget ? PipelineUtils.defaultViewport : camera.viewport;
    const needFlipProjection = !!internalColorTarget || (camera.renderTarget && cubeFace == undefined);

    if (context.flipProjection !== needFlipProjection) {
      // Just add projection matrix update type is enough
      context.rendererUpdateFlag |= ContextRendererUpdateFlag.ProjectionMatrix;
      context.applyVirtualCamera(camera._virtualCamera, needFlipProjection);
    }

    context.setRenderTarget(colorTarget, colorViewport, mipLevel, cubeFace);

    // If color target is null, hardware will not convert linear color space to sRGB
    const color = colorTarget ? background._linearSolidColor : background.solidColor;
    finalClearFlags !== CameraClearFlags.None && rhi.clearRenderTarget(engine, finalClearFlags, color);

    if (internalColorTarget && finalClearFlags !== CameraClearFlags.All) {
      // Can use `blitFramebuffer` API to copy color/depth/stencil buffer from back buffer to internal RT
      if (this._canUseBlitFrameBuffer) {
        const blitIgnoreFlags =
          finalClearFlags | (this._shouldCopyBackgroundColor ? CameraClearFlags.Color : CameraClearFlags.None);
        rhi.blitInternalRTByBlitFrameBuffer(camera.renderTarget, internalColorTarget, blitIgnoreFlags, camera.viewport);
      } else {
        if (!(finalClearFlags & CameraClearFlags.DepthStencil)) {
          Logger.warn(
            "We clear all depth/stencil state cause of the internalRT can't copy depth/stencil buffer from back buffer when use copy plan"
          );
        }
        // We must clear depth/stencil buffer manually if current context don't support `blitFramebuffer` API
        rhi.clearRenderTarget(engine, CameraClearFlags.DepthStencil);
      }

      if (this._shouldCopyBackgroundColor) {
        // Copy RT's color buffer to grab texture
        rhi.copyRenderTargetToSubTexture(camera.renderTarget, this._copyBackgroundTexture, camera.viewport);
        // Then blit grab texture to internal RT's color buffer
        Blitter.blitTexture(
          engine,
          this._copyBackgroundTexture,
          internalColorTarget,
          0,
          undefined,
          camera.renderTarget ? undefined : engine._basicResources.blitScreenMaterial
        );
      }

      context.setRenderTarget(colorTarget, colorViewport, mipLevel, cubeFace);
    }

    const maskManager = scene._maskManager;
    if (finalClearFlags & CameraClearFlags.Stencil) {
      maskManager.hasStencilWritten = false;
    }

    opaqueQueue.render(context, PipelineStage.Forward);
    alphaTestQueue.render(context, PipelineStage.Forward);
    if (finalClearFlags & CameraClearFlags.Color) {
      if (background.mode === BackgroundMode.Sky) {
        background.sky._render(context);
      } else if (background.mode === BackgroundMode.Texture && background.texture) {
        this._drawBackgroundTexture(camera, background);
      }
    }

    // Copy opaque texture
    if (camera.opaqueTextureEnabled) {
      // Should blit to resolve the MSAA
      colorTarget._blitRenderTarget();

      const opaqueTexturePass = this._opaqueTexturePass;
      opaqueTexturePass.onConfig(camera, colorTarget.getColorTexture(0));
      opaqueTexturePass.onRender(context);

      // Should revert to original render target
      context.setRenderTarget(colorTarget, colorViewport, mipLevel, cubeFace);
    } else {
      camera.shaderData.setTexture(Camera._cameraOpaqueTextureProperty, null);
    }

    transparentQueue.render(context, PipelineStage.Forward);
    // Revert stencil buffer generated by mask
    maskManager.clearMask(context, PipelineStage.Forward);

    // Output render target of each stage
    let outputTarget = <RenderTarget>null;

    // Post process
    const needFinalPass = camera._needFinalPass();
    const { postProcessManager } = scene;
    if (camera.enablePostProcess && postProcessManager._isValid()) {
      outputTarget = needFinalPass ? postProcessManager._getOutputRenderTarget(camera) : camera.renderTarget;
      postProcessManager._render(camera, internalColorTarget, outputTarget);
    } else {
      // Maybe internalColorTarget or camera.renderTarget or null
      outputTarget = colorTarget;
      if (internalColorTarget) {
        internalColorTarget._blitRenderTarget();
      }
      postProcessManager._releaseSwapRenderTarget();
      postProcessManager._releaseOutputRenderTarget();
    }

    // Final pass
    const finalPass = this._finalPass;
    if (needFinalPass) {
      finalPass.onConfig(camera, outputTarget);
      finalPass.onRender(context);
      outputTarget = cameraRenderTarget;
    } else {
      finalPass.release();
    }

    // If output target is not camera's render target(only enable HDR or opaqueTexture), we should blit it to camera's render target
    if (outputTarget !== cameraRenderTarget) {
      Blitter.blitTexture(engine, <Texture2D>outputTarget.getColorTexture(0), cameraRenderTarget, 0, camera.viewport);
    }

    cameraRenderTarget?._blitRenderTarget();
    cameraRenderTarget?.generateMipmaps();
  }

  /**
   * Push render data to render queue.
   * @param context - Render context
   * @param renderElement - Render element
   */
  pushRenderElement(context: RenderContext, renderElement: RenderElement): void {
    renderElement.renderQueueFlags = RenderQueueFlags.None;
    const subRenderElements = renderElement.subRenderElements;
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
          let replacementSuccess = false;
          for (let j = 0, m = replacementSubShaders.length; j < m; j++) {
            const subShader = replacementSubShaders[j];
            if (subShader.getTagValue(replacementTag) === materialSubShader.getTagValue(replacementTag)) {
              this.pushRenderElementByType(renderElement, subRenderElement, subShader.passes, renderStates);
              replacementSuccess = true;
            }
          }

          if (
            !replacementSuccess &&
            context.replacementFailureStrategy === ReplacementFailureStrategy.KeepOriginalShader
          ) {
            this.pushRenderElementByType(renderElement, subRenderElement, materialSubShader.passes, renderStates);
          }
        } else {
          this.pushRenderElementByType(renderElement, subRenderElement, replacementSubShaders[0].passes, renderStates);
        }
      } else {
        this.pushRenderElementByType(renderElement, subRenderElement, materialSubShader.passes, renderStates);
      }
    }
  }

  private pushRenderElementByType(
    renderElement: RenderElement,
    subRenderElement: SubRenderElement,
    shaderPasses: ReadonlyArray<ShaderPass>,
    renderStates: ReadonlyArray<RenderState>
  ): void {
    const cullingResults = this._cullingResults;
    for (let i = 0, n = shaderPasses.length; i < n; i++) {
      // Get render queue type
      let renderQueueType: RenderQueueType;
      const shaderPass = shaderPasses[i];
      const renderState = shaderPass._renderState;
      if (renderState) {
        renderQueueType = renderState._getRenderQueueByShaderData(
          shaderPass._renderStateDataMap,
          subRenderElement.material.shaderData
        );
      } else {
        renderQueueType = renderStates[i].renderQueueType;
      }

      const flag = 1 << renderQueueType;

      subRenderElement.shaderPasses = shaderPasses;
      subRenderElement.renderQueueFlags |= flag;

      if (renderElement.renderQueueFlags & flag) {
        continue;
      }

      switch (renderQueueType) {
        case RenderQueueType.Opaque:
          cullingResults.opaqueQueue.pushRenderElement(renderElement);
          break;
        case RenderQueueType.AlphaTest:
          cullingResults.alphaTestQueue.pushRenderElement(renderElement);
          break;
        case RenderQueueType.Transparent:
          cullingResults.transparentQueue.pushRenderElement(renderElement);
          break;
      }
      renderElement.renderQueueFlags |= flag;
    }
  }

  private _drawBackgroundTexture(camera: Camera, background: Background) {
    const engine = camera.engine;
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
    const compileMacros = Shader._compileMacros;
    ShaderMacroCollection.unionCollection(compileMacros, engine._macroCollection, compileMacros);
    const program = pass._getShaderProgram(engine, compileMacros);
    program.bind();
    program.uploadAll(program.materialUniformBlock, material.shaderData);
    program.uploadAll(program.cameraUniformBlock, camera.shaderData);
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
    const { engine, enableFrustumCulling, cullingMask, _frustum: frustum } = camera;
    const { _renderers: renderers, _canvases: canvases } = camera.scene._componentsManager;

    const rendererElements = renderers._elements;
    for (let i = renderers.length - 1; i >= 0; --i) {
      const renderer = rendererElements[i];
      // Filter by camera culling mask
      if (!(cullingMask & renderer._entity.layer)) {
        continue;
      }

      // Filter by camera frustum
      if (enableFrustumCulling) {
        if (!frustum.intersectsBox(renderer.bounds)) {
          continue;
        }
      }
      renderer._prepareRender(context);
      renderer._renderFrameCount = engine.time.frameCount;
    }

    const canvasesElements = canvases._elements;
    for (let i = canvases.length - 1; i >= 0; i--) {
      const canvas = canvasesElements[i];
      // Filter by camera culling mask
      if (!(cullingMask & canvas.entity.layer)) {
        continue;
      }
      if (!canvas._canRender(camera)) {
        continue;
      }
      canvas._prepareRender(context);
      this.pushRenderElement(context, canvas._renderElement);
    }
  }
}

export enum RenderQueueFlags {
  None = 0x0,
  Opaque = 0x1,
  AlphaTest = 0x2,
  Transparent = 0x4,
  All = 0x7
}
