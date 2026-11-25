import { DepthState } from "../shader/state/DepthState";
import { Matrix, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { RenderQueue } from "./RenderQueue";
import { PipelineStage } from "./enums/PipelineStage";
import { Blitter } from "./Blitter";
import { ContextRendererUpdateFlag } from "./RenderContext";
import { Scene } from "../Scene";
import { VirtualCamera } from "../VirtualCamera";
import { EngineObject } from "../base";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { RenderQueueType, ShaderData, ShaderDataGroup, ShaderMacro } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import { DisorderedArray } from "../utils/DisorderedArray";
import { IUICanvas } from "../ui/IUICanvas";

export class OverlayPass {
  private static _shouldSRGBCorrect = ShaderMacro.getByName("ENGINE_SHOULD_SRGB_CORRECT");

  private static _renderQueue: RenderQueue;
  private static _virtualCamera: VirtualCamera;
  private static _viewport: Vector4;
  private static _screenScaleOffset = new Vector4(1, -1, 0, 1);
  private static readonly _depthState = Object.assign(new DepthState(), { enabled: false, writeEnabled: false });
  private static _overlayCamera: OverlayCamera;

  static render(engine: Engine, scene: Scene, uiCanvases: DisorderedArray<IUICanvas>): void {
    engine._macroCollection.enable(OverlayPass._shouldSRGBCorrect);
    const { canvas, _hardwareRenderer: rhi, _renderContext: renderContext, _batcherManager: batcherManager } = engine;
    const uiRenderQueue = (this._renderQueue ||= new RenderQueue(RenderQueueType.Transparent));
    const virtualCamera = (this._virtualCamera ||= new VirtualCamera());
    const viewport = (this._viewport ||= new Vector4(0, 0, 1, 1));
    // @ts-ignore
    const camera = (this._overlayCamera ||= new OverlayCamera());
    camera.engine = engine;
    camera.scene = scene;
    renderContext.camera = camera as unknown as Camera;
    const { elements: projectE } = virtualCamera.projectionMatrix;
    const { elements: viewE } = virtualCamera.viewMatrix;
    (projectE[0] = 2 / canvas.width), (projectE[5] = 2 / canvas.height), (projectE[10] = 0);
    renderContext.flipProjection = false;
    renderContext.setRenderTarget(null, viewport, 0);
    renderContext.depthStateOverride = this._depthState;
    let maskTarget: RenderTarget | null = null;
    const pool = engine._renderTargetPool;
    try {
      for (let i = 0, n = uiCanvases.length; i < n; i++) {
        const uiCanvas = uiCanvases.get(i);
        if (uiCanvas) {
          const { position } = uiCanvas.entity.transform;
          (viewE[12] = -position.x), (viewE[13] = -position.y);
          Matrix.multiply(virtualCamera.projectionMatrix, virtualCamera.viewMatrix, virtualCamera.viewProjectionMatrix);
          renderContext.applyVirtualCamera(virtualCamera, false);
          uiRenderQueue.rendererUpdateFlag |= ContextRendererUpdateFlag.ProjectionMatrix;
          uiCanvas._prepareRender(renderContext);
          const curElements = uiCanvas._batchedRenderElements;
          for (let j = 0, m = curElements.length; j < m; j++) {
            uiRenderQueue.pushRenderElement(curElements[j]);
          }
          uiRenderQueue.batch(batcherManager);
          // Keep the current output until the first draw that needs stencil, then composite once.
          if (!maskTarget && uiRenderQueue.needsUIStencil(PipelineStage.Forward)) {
            maskTarget = pool.allocateRenderTarget(
              rhi.getMainFrameBufferWidth(),
              rhi.getMainFrameBufferHeight(),
              rhi.getMainFrameBufferColorFormat(),
              TextureFormat.Stencil,
              false,
              false,
              false,
              1,
              TextureWrapMode.Clamp,
              TextureFilterMode.Bilinear
            );
            // Preserve screen-space color values and blending, without decoding the background to linear.
            rhi.copyRenderTargetToSubTexture(null, <Texture2D>maskTarget.getColorTexture(0), viewport);
            renderContext.setRenderTarget(maskTarget, viewport, 0);
            engine._macroCollection.enable(Engine._outputSRGBCorrectMacro);
            rhi.clearRenderTarget(engine, CameraClearFlags.Stencil);
            scene._maskManager.hasStencilWritten = false;
          }
          batcherManager.uploadBuffer();
          uiRenderQueue.render(renderContext, PipelineStage.Forward);
          // Restore stencil before changing canvas projection or starting the next frame.
          scene._maskManager.clearMask(renderContext, PipelineStage.Forward);
          uiRenderQueue.clear();
          engine._renderCount++;
        }
      }
      if (maskTarget) {
        // This target uses screen orientation and already contains encoded screen colors.
        Blitter.blitTexture(
          engine,
          <Texture2D>maskTarget.getColorTexture(0),
          null,
          0,
          viewport,
          null,
          0,
          this._screenScaleOffset
        );
      }
    } finally {
      if (maskTarget) pool.freeRenderTarget(maskTarget);
      uiRenderQueue.clear();
      renderContext.depthStateOverride = null;
      renderContext.camera = null!;
      engine._macroCollection.disable(OverlayPass._shouldSRGBCorrect);
    }
  }
}

class OverlayCamera {
  // @ts-ignore
  instanceId: number = ++EngineObject._instanceIdCounter;
  engine: Engine;
  scene: Scene;
  shaderData: ShaderData = new ShaderData(ShaderDataGroup.Camera);
  enableFrustumCulling = true;
  cullingMask: Layer = Layer.Everything;
  _globalShaderMacro: ShaderMacroCollection = new ShaderMacroCollection();
}
