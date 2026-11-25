import { Vector2 } from "@galacean/engine-math";
import { Background } from "../Background";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { BackgroundMode } from "../enums/BackgroundMode";
import { BackgroundTextureFillMode } from "../enums/BackgroundTextureFillMode";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { DepthTextureMode } from "../enums/DepthTextureMode";
import { ReplacementFailureStrategy } from "../enums/ReplacementFailureStrategy";
import { ScalableAmbientObscurancePass } from "../lighting/ambientOcclusion/ScalableAmbientObscurancePass";
import { FinalPass } from "../postProcess";
import { RenderPassDescriptor, RenderPassLoadAction, RenderPassStoreAction } from "../renderingHardwareInterface";
import { Shader } from "../shader/Shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { SubShader } from "../shader/SubShader";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
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
import { PipelineStage } from "./enums/PipelineStage";
/**
 * Basic render pipeline.
 */
export class BasicRenderPipeline {
  /** @internal */
  _cullingResults: CullingResults;

  private _camera: Camera;
  private _lastCanvasSize = new Vector2();

  private _internalColorTarget: RenderTarget | null = null;
  private _cascadedShadowCasterPass: CascadedShadowCasterPass;
  private _depthOnlyPass: DepthOnlyPass;
  private _saoPass: ScalableAmbientObscurancePass;
  private _opaqueTexturePass: OpaqueTexturePass;
  private _finalPass: FinalPass;
  private _copyBackgroundTexture: Texture2D | null;
  private _shouldCopyBackgroundColor = false;
  private _passDescriptor = new RenderPassDescriptor();

  /**
   * Create a basic render pipeline.
   * @param camera - Camera
   */
  constructor(camera: Camera) {
    this._camera = camera;
    const { engine } = camera;
    const shaders = Engine._builtinShaders;
    this._cullingResults = new CullingResults();
    this._cascadedShadowCasterPass = new CascadedShadowCasterPass(camera);
    this._depthOnlyPass = new DepthOnlyPass(engine);
    this._saoPass = new ScalableAmbientObscurancePass(engine, shaders.scalableAmbientOcclusion);
    this._opaqueTexturePass = new OpaqueTexturePass(engine);
    this._finalPass = new FinalPass(engine, shaders.finalSRGB, shaders.finalAntiAliasing);
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {
    this._cullingResults.destroy();

    const pool = this._camera.engine._renderTargetPool;

    if (this._internalColorTarget) {
      pool.freeRenderTarget(this._internalColorTarget);
      this._internalColorTarget = null;
    }

    if (this._copyBackgroundTexture) {
      pool.freeTexture(this._copyBackgroundTexture);
      this._copyBackgroundTexture = null;
    }

    this._camera = null!;
  }

  /**
   * Perform scene rendering.
   * @param context - Render context
   * @param cubeFace - Render surface of cube texture
   * @param mipLevel - Set mip level the data want to write
   * @param ignoreClear - Ignore clear flag
   */
  render(context: RenderContext, cubeFace?: TextureCubeFace, mipLevel?: number, ignoreClear?: CameraClearFlags) {
    this._cullingResults.setRenderUpdateFlagTrue(ContextRendererUpdateFlag.All);

    const camera = this._camera;
    const { engine, renderTarget } = camera;
    const scene = camera.scene!;
    const independentCanvasEnabled = camera._isIndependentCanvasEnabled();
    const rhi = engine._hardwareRenderer;
    const cullingResults = this._cullingResults;
    const sunlight = scene._lightManager._sunlight;
    const depthOnlyPass = this._depthOnlyPass;
    const ambientOcclusionEnabled = scene.ambientOcclusion._isValid();

    // Ambient occlusion enable will force enable depth prepass
    const depthPassEnabled = camera.depthTextureMode === DepthTextureMode.PrePass || ambientOcclusionEnabled;
    const finalClearFlags = camera.clearFlags & ~(ignoreClear ?? CameraClearFlags.None);
    const msaaSamples = Math.min(
      renderTarget ? renderTarget.antiAliasing : camera.msaaSamples,
      rhi.capability.maxAntiAliasing
    );

    // Copy the background when MSAA prevents a direct blit or sRGB needs conversion to linear.
    const isSRGBBackground = !renderTarget || renderTarget.getColorTexture(0)!.isSRGBColorSpace;
    this._shouldCopyBackgroundColor =
      independentCanvasEnabled &&
      !(finalClearFlags & CameraClearFlags.Color) &&
      (msaaSamples !== 1 || isSRGBBackground);

    if (scene.castShadows && sunlight && sunlight.shadowType !== ShadowType.None) {
      this._cascadedShadowCasterPass.onRender(context);
    }

    cullingResults.reset();

    // Depth use camera's view and projection matrix
    this._cullingResults.setRenderUpdateFlagTrue(ContextRendererUpdateFlag.viewProjectionMatrix);
    context.applyVirtualCamera(camera._virtualCamera, depthPassEnabled);
    this._prepareRender(context);

    const batcherManager = engine._batcherManager;
    cullingResults.sortBatch(batcherManager);
    batcherManager.uploadBuffer();

    if (depthPassEnabled) {
      depthOnlyPass.onConfig(camera);
      depthOnlyPass.onRender(context, cullingResults);
    } else {
      depthOnlyPass.release();
      camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, engine._basicResources.whiteTexture2D);
    }

    const pool = engine._renderTargetPool;

    // Check if need to create internal color texture or grab texture
    if (independentCanvasEnabled) {
      let depthFormat: TextureFormat | null;
      if (camera.renderTarget) {
        depthFormat = camera.renderTarget._depthFormat;
      } else if (rhi._options.depth && rhi._options.stencil) {
        depthFormat = TextureFormat.Depth24Stencil8;
      } else if (rhi._options.depth) {
        depthFormat = TextureFormat.Depth24;
      } else if (rhi._options.stencil) {
        depthFormat = TextureFormat.Stencil;
      } else {
        depthFormat = null;
      }
      const viewport = camera.pixelViewport;
      this._internalColorTarget = pool.allocateRenderTarget(
        viewport.width,
        viewport.height,
        camera._getInternalColorTextureFormat(),
        depthFormat,
        false,
        false,
        !camera._isInternalFormatHDR(),
        msaaSamples,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );

      if (this._shouldCopyBackgroundColor) {
        const colorTexture = camera.renderTarget?.getColorTexture(0);
        this._copyBackgroundTexture = pool.allocateTexture(
          viewport.width,
          viewport.height,
          colorTexture?.format ?? TextureFormat.R8G8B8A8_UNorm,
          false,
          colorTexture?.isSRGBColorSpace ?? false,
          TextureWrapMode.Clamp,
          TextureFilterMode.Bilinear
        );
      }
    }

    // Scalable ambient obscurance pass
    // Before opaque pass so materials can sample ambient occlusion in BRDF
    const saoPass = this._saoPass;
    if (ambientOcclusionEnabled) {
      saoPass.onConfig(camera, this._depthOnlyPass.renderTarget!);
      saoPass.onRender(context);
    } else {
      this._saoPass.release();
    }

    this._drawRenderPass(context, camera, finalClearFlags, cubeFace, mipLevel);

    // Return the per-frame leases so the next camera with matching shape can reuse them
    if (this._internalColorTarget) {
      pool.freeRenderTarget(this._internalColorTarget);
      this._internalColorTarget = null;
    }
    if (this._copyBackgroundTexture) {
      pool.freeTexture(this._copyBackgroundTexture);
      this._copyBackgroundTexture = null;
    }
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

    const { engine, renderTarget: cameraRenderTarget } = camera;
    const scene = camera.scene!;
    const { background } = scene;

    const rhi = engine._hardwareRenderer;
    const internalColorTarget = this._internalColorTarget;
    const colorTarget = internalColorTarget || camera.renderTarget;
    const colorViewport = internalColorTarget ? PipelineUtils.defaultViewport : camera.viewport;
    const needFlipProjection = !!(internalColorTarget || (camera.renderTarget && cubeFace == undefined));
    const keepColorFlag = !!internalColorTarget && (~finalClearFlags & CameraClearFlags.Color) !== 0;
    const hasInternalMSAA = !!internalColorTarget && internalColorTarget.antiAliasing > 1;
    const canDiscardInternalDepthStencil =
      !!internalColorTarget && !internalColorTarget.depthTexture && internalColorTarget._depthFormat !== null;
    const finalColorStoreAction = hasInternalMSAA ? RenderPassStoreAction.Resolve : RenderPassStoreAction.Store;
    const finalDepthStoreAction = canDiscardInternalDepthStencil
      ? RenderPassStoreAction.Discard
      : RenderPassStoreAction.Store;
    const finalStencilStoreAction = canDiscardInternalDepthStencil
      ? RenderPassStoreAction.Discard
      : RenderPassStoreAction.Store;
    const opaqueColorStoreAction = camera.opaqueTextureEnabled
      ? colorTarget && colorTarget.antiAliasing > 1
        ? RenderPassStoreAction.StoreAndResolve
        : RenderPassStoreAction.Store
      : finalColorStoreAction;
    const opaqueDepthStoreAction = camera.opaqueTextureEnabled ? RenderPassStoreAction.Store : finalDepthStoreAction;
    const opaqueStencilStoreAction = camera.opaqueTextureEnabled
      ? RenderPassStoreAction.Store
      : finalStencilStoreAction;

    if (context.flipProjection !== needFlipProjection) {
      // Just add projection matrix update type is enough
      cullingResults.setRenderUpdateFlagTrue(ContextRendererUpdateFlag.ProjectionMatrix);
      context.applyVirtualCamera(camera._virtualCamera, needFlipProjection);
    }

    // Copy/blit existing background into internalColorTarget outside the main RenderPass
    if (keepColorFlag) {
      if (this._shouldCopyBackgroundColor) {
        // Copy RT's color buffer to grab texture
        rhi.copyRenderTargetToSubTexture(camera.renderTarget, this._copyBackgroundTexture!, camera.viewport);
        // Then blit grab texture to internal RT's color buffer
        const copyPassDescriptor = this._passDescriptor.reset(internalColorTarget);
        copyPassDescriptor.colorLoadAction = RenderPassLoadAction.DontCare;
        context.beginRenderPass(copyPassDescriptor);
        Blitter.draw(
          engine,
          this._copyBackgroundTexture!,
          0,
          camera.renderTarget ? null : engine._basicResources.blitScreenMaterial
        );
        context.endRenderPass();
      } else {
        // Only blit color buffer from back buffer
        const ignoreFlags = CameraClearFlags.DepthStencil;
        rhi.blitInternalRTByBlitFrameBuffer(camera.renderTarget, internalColorTarget, ignoreFlags, camera.viewport);
      }
      context.flipProjection = needFlipProjection;
    }

    const passDescriptor = this._passDescriptor.reset(
      colorTarget,
      colorViewport,
      needFlipProjection,
      mipLevel ?? 0,
      cubeFace
    );
    if (finalClearFlags & CameraClearFlags.Color) {
      const { solidColor } = background;
      const { a } = solidColor;
      passDescriptor.colorLoadAction = RenderPassLoadAction.Clear;
      passDescriptor.clearColor.set(solidColor.r * a, solidColor.g * a, solidColor.b * a, a);
    }
    // Force clear internal color target depth and stencil buffer, because it already missed due to post process, HDR, sRGB convert, etc.
    if (internalColorTarget || (finalClearFlags & CameraClearFlags.Depth) !== 0) {
      passDescriptor.depthLoadAction = RenderPassLoadAction.Clear;
    }
    if (internalColorTarget || (finalClearFlags & CameraClearFlags.Stencil) !== 0) {
      passDescriptor.stencilLoadAction = RenderPassLoadAction.Clear;
    }
    passDescriptor.colorStoreAction = opaqueColorStoreAction;
    passDescriptor.depthStoreAction = opaqueDepthStoreAction;
    passDescriptor.stencilStoreAction = opaqueStencilStoreAction;

    context.beginRenderPass(passDescriptor);

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
      // End opaque pass (resolves MSAA while preserving samples + depth/stencil for transparent pass)
      context.endRenderPass();

      const opaqueTexturePass = this._opaqueTexturePass;
      opaqueTexturePass.onConfig(camera, colorTarget!.getColorTexture(0)!);
      opaqueTexturePass.onRender(context);

      // Resume on original render target for transparent pass
      context.flipProjection = needFlipProjection;
      passDescriptor.reset(colorTarget, colorViewport, needFlipProjection, mipLevel ?? 0, cubeFace);
      passDescriptor.colorStoreAction = finalColorStoreAction;
      passDescriptor.depthStoreAction = finalDepthStoreAction;
      passDescriptor.stencilStoreAction = finalStencilStoreAction;
      context.beginRenderPass(passDescriptor);
    } else {
      camera.shaderData.setTexture(Camera._cameraOpaqueTextureProperty, null);
    }

    transparentQueue.render(context, PipelineStage.Forward);
    // Revert stencil buffer generated by mask
    maskManager.clearMask(context, PipelineStage.Forward);

    // End main pass (applies declared MSAA resolve and transient depth/stencil discard)
    context.endRenderPass();

    // Output render target of each stage
    let outputTarget: RenderTarget | null = null;

    // Post process
    const needFinalPass = camera._needFinalPass();
    const { postProcessManager } = scene;
    if (camera.enablePostProcess && postProcessManager._isValid()) {
      outputTarget = needFinalPass ? postProcessManager._getOutputRenderTarget(camera) : camera.renderTarget;
      postProcessManager._render(camera, internalColorTarget!, outputTarget);
    } else {
      // Maybe internalColorTarget or camera.renderTarget or null
      outputTarget = colorTarget;
      postProcessManager._releaseSwapRenderTarget();
      postProcessManager._releaseOutputRenderTarget();
    }

    // Final pass
    const finalPass = this._finalPass;
    if (needFinalPass) {
      finalPass.onConfig(camera, outputTarget!);
      finalPass.onRender(context);
      outputTarget = cameraRenderTarget;
    } else {
      finalPass.release();
    }

    // If output target is not camera's render target(only enable HDR or opaqueTexture), we should blit it to camera's render target
    if (outputTarget !== cameraRenderTarget) {
      const viewport = camera.viewport;
      const isFullViewport = viewport.x === 0 && viewport.y === 0 && viewport.z === 1 && viewport.w === 1;
      passDescriptor.reset(cameraRenderTarget, viewport);
      passDescriptor.colorLoadAction =
        cameraRenderTarget && cameraRenderTarget.colorTextureCount === 1 && isFullViewport
          ? RenderPassLoadAction.DontCare
          : RenderPassLoadAction.Load;
      context.beginRenderPass(passDescriptor);
      Blitter.draw(engine, <Texture2D>outputTarget!.getColorTexture(0));
      context.endRenderPass();
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
    const { material } = renderElement;
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
            this._pushRenderElementByType(renderElement, subShader);
            replacementSuccess = true;
          }
        }

        if (
          !replacementSuccess &&
          context.replacementFailureStrategy === ReplacementFailureStrategy.KeepOriginalShader
        ) {
          this._pushRenderElementByType(renderElement, materialSubShader);
        }
      } else {
        this._pushRenderElementByType(renderElement, replacementSubShaders[0]);
      }
    } else {
      this._pushRenderElementByType(renderElement, materialSubShader);
    }
  }

  private _pushRenderElementByType(renderElement: RenderElement, subShader: SubShader): void {
    const shaderPasses = subShader.passes;
    const cullingResults = this._cullingResults;
    renderElement.subShader = subShader;
    let pushedQueueFlags = RenderQueueFlags.None;
    for (let i = 0, n = shaderPasses.length; i < n; i++) {
      const shaderPass = shaderPasses[i];
      const renderState = shaderPass._renderState;
      const renderQueueType = renderState._getRenderQueueByShaderData(
        shaderPass._renderStateDataMap,
        renderElement.material.shaderData
      );

      const flag = 1 << renderQueueType;
      if (pushedQueueFlags & flag) {
        continue;
      }

      // First queue keeps the original element; subsequent queues each get an isolated
      // clone so per-queue batch state (`_isBatched`, `instancedRenderers`) doesn't
      // leak across queues for multi-pass materials (e.g. Opaque + Transparent)
      let elementForQueue: RenderElement;
      if (pushedQueueFlags === RenderQueueFlags.None) {
        elementForQueue = renderElement;
      } else {
        elementForQueue = renderElement.component.engine._renderElementPool.get();
        elementForQueue._cloneFrom(renderElement);
      }

      switch (renderQueueType) {
        case RenderQueueType.Opaque:
          cullingResults.opaqueQueue.pushRenderElement(elementForQueue);
          break;
        case RenderQueueType.AlphaTest:
          cullingResults.alphaTestQueue.pushRenderElement(elementForQueue);
          break;
        case RenderQueueType.Transparent:
          cullingResults.transparentQueue.pushRenderElement(elementForQueue);
          break;
      }
      pushedQueueFlags |= flag;
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
    program.uploadMultiGroupUniforms(undefined, camera.shaderData, undefined, material.shaderData, undefined);
    program.uploadUnGroupTextures();

    const renderState = pass._renderState;
    renderState._applyStates(engine, false, pass._renderStateDataMap, material.shaderData);
    rhi.drawPrimitive(mesh._primitive, mesh.subMesh, program);
  }

  private _prepareRender(context: RenderContext): void {
    const camera = context.camera;
    const { engine, enableFrustumCulling, cullingMask, _frustum: frustum } = camera;
    const { _renderers: renderers, _canvases: canvases } = camera.scene!._componentsManager;

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
      const canvasElements = canvas._batchedRenderElements;
      for (let j = 0, m = canvasElements.length; j < m; j++) {
        this.pushRenderElement(context, canvasElements[j]);
      }
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
