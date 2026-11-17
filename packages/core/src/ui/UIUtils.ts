import { Matrix, Vector4 } from "@galacean/engine-math";
import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { RenderQueue } from "../RenderPipeline";
import { Blitter } from "../RenderPipeline/Blitter";
import { ContextRendererUpdateFlag } from "../RenderPipeline/RenderContext";
import { Scene } from "../Scene";
import { VirtualCamera } from "../VirtualCamera";
import { EngineObject } from "../base";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { RenderQueueType, ShaderData, ShaderDataGroup, ShaderMacro } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import { DisorderedArray } from "../utils/DisorderedArray";
import { IUICanvas } from "./IUICanvas";

export class UIUtils {
  private static _shouldSRGBCorrect = ShaderMacro.getByName("ENGINE_SHOULD_SRGB_CORRECT");

  private static _renderQueue: RenderQueue;
  private static _virtualCamera: VirtualCamera;
  private static _viewport: Vector4;
  private static _screenScaleOffset = new Vector4(1, -1, 0, 1);
  private static _overlayCamera: OverlayCamera;

  static renderOverlay(engine: Engine, scene: Scene, uiCanvases: DisorderedArray<IUICanvas>): void {
    engine._macroCollection.enable(UIUtils._shouldSRGBCorrect);
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
        // The screen framebuffer has no stencil attachment. Lease a target only for masked canvases.
        let maskTarget: RenderTarget | null = null;
        const pool = engine._renderTargetPool;
        if (
          curElements.some(
            ({ component }) => component._uiMasks?.length && component._maskInteraction !== SpriteMaskInteraction.None
          )
        ) {
          maskTarget = pool.allocateRenderTarget(
            canvas.width,
            canvas.height,
            TextureFormat.R8G8B8A8,
            TextureFormat.Depth24Stencil8,
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
          rhi.clearRenderTarget(engine, CameraClearFlags.DepthStencil);
          scene._maskManager.hasStencilWritten = false;
        }
        for (let j = 0, m = curElements.length; j < m; j++) {
          uiRenderQueue.pushRenderElement(curElements[j]);
        }
        uiRenderQueue.batch(batcherManager);
        batcherManager.uploadBuffer();
        uiRenderQueue.render(renderContext, "Forward");
        // Restore stencil before changing canvas projection or starting the next frame.
        scene._maskManager.clearMask(renderContext, "Forward");
        uiRenderQueue.clear();
        if (maskTarget) {
          // This target uses screen orientation and already contains encoded screen colors.
          const noSRGB = engine._macroCollection.isEnable(Engine._noSRGBSupportMacro);
          engine._macroCollection.disable(Engine._noSRGBSupportMacro);
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
          if (noSRGB) {
            engine._macroCollection.enable(Engine._noSRGBSupportMacro);
          }
          pool.freeRenderTarget(maskTarget);
        }
        engine._renderCount++;
      }
    }
    renderContext.camera = null!;
    engine._macroCollection.disable(UIUtils._shouldSRGBCorrect);
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
