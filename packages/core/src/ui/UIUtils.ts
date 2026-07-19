import { Color, Matrix, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { Blitter } from "../RenderPipeline/Blitter";
import { RenderQueue } from "../RenderPipeline";
import { ContextRendererUpdateFlag } from "../RenderPipeline/RenderContext";
import { Scene } from "../Scene";
import { VirtualCamera } from "../VirtualCamera";
import { EngineObject } from "../base";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Material } from "../material";
import { RenderQueueType, Shader, ShaderData, ShaderDataGroup, ShaderMacro } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { RenderTarget } from "../texture/RenderTarget";
import { Texture2D } from "../texture/Texture2D";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { DisorderedArray } from "../utils/DisorderedArray";
import { IUICanvas } from "./IUICanvas";

export class UIUtils {
  private static _shouldSRGBCorrect = ShaderMacro.getByName("ENGINE_SHOULD_SRGB_CORRECT");

  private static _renderQueue: RenderQueue;
  private static _virtualCamera: VirtualCamera;
  private static _viewport: Vector4;
  private static _overlayCamera: OverlayCamera;
  private static _overlayRT: RenderTarget;
  private static _overlayBlitMaterial: Material;
  private static _clearColor = new Color(0, 0, 0, 0);
  /** Flip V so that Y-up RT content maps correctly onto the default framebuffer. */
  private static _flipYScaleOffset = new Vector4(1, -1, 0, 1);

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

    const { width, height } = canvas;
    const { elements: projectE } = virtualCamera.projectionMatrix;
    const { elements: viewE } = virtualCamera.viewMatrix;
    (projectE[0] = 2 / width), (projectE[5] = 2 / height), (projectE[10] = 0);

    // Render to an intermediate RT with Depth24Stencil8 so that stencil-based UI Mask works.
    // The default canvas framebuffer is created without a stencil buffer
    // (see WebGLGraphicDevice._webGLOptions.stencil = false).
    const overlayRT = UIUtils._getOverlayRT(engine, width, height);
    renderContext.setRenderTarget(overlayRT, viewport, 0);
    rhi.clearRenderTarget(engine, CameraClearFlags.All, UIUtils._clearColor);

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
        batcherManager.uploadBuffer();
        uiRenderQueue.render(renderContext, "Forward");
        uiRenderQueue.clear();
        engine._renderCount++;
      }
    }

    // Blit overlay RT to default framebuffer with premultiplied alpha blending.
    // Blitter.blitTexture picks the non-flipping `blitMesh` when destination is null,
    // but the RT contents are written in standard Y-up NDC, so we flip V here via
    // sourceScaleOffset to match the default framebuffer orientation.
    Blitter.blitTexture(
      engine,
      overlayRT.getColorTexture(0) as Texture2D,
      null,
      0,
      viewport,
      UIUtils._getOverlayBlitMaterial(engine),
      0,
      UIUtils._flipYScaleOffset
    );

    renderContext.camera = null;
    engine._macroCollection.disable(UIUtils._shouldSRGBCorrect);
  }

  private static _getOverlayRT(engine: Engine, width: number, height: number): RenderTarget {
    let rt = UIUtils._overlayRT;
    if (!rt || rt.width !== width || rt.height !== height) {
      if (rt) {
        rt.getColorTexture(0).destroy();
        rt.destroy();
      }
      const colorTexture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, false);
      colorTexture.isGCIgnored = true;
      rt = new RenderTarget(engine, width, height, colorTexture, TextureFormat.Depth24Stencil8);
      rt.isGCIgnored = true;
      UIUtils._overlayRT = rt;
    }
    return rt;
  }

  private static _getOverlayBlitMaterial(engine: Engine): Material {
    let material = UIUtils._overlayBlitMaterial;
    if (!material) {
      material = new Material(engine, Shader.find("2D/UIOverlayBlit"));
      material.isGCIgnored = true;
      UIUtils._overlayBlitMaterial = material;
    }
    return material;
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
