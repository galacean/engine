import { Matrix, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { RenderQueue } from "../RenderPipeline";
import { ContextRendererUpdateFlag } from "../RenderPipeline/RenderContext";
import { Scene } from "../Scene";
import { VirtualCamera } from "../VirtualCamera";
import { EngineObject } from "../base";
import { RenderQueueType, ShaderData, ShaderDataGroup } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { DisorderedArray } from "../utils/DisorderedArray";
import { IUICanvas } from "./IUICanvas";

export class UIUtils {
  private static _renderQueue: RenderQueue;
  private static _virtualCamera: VirtualCamera;
  private static _viewport: Vector4;
  private static _overlayCamera: OverlayCamera;

  static renderOverlay(engine: Engine, scene: Scene, uiCanvases: DisorderedArray<IUICanvas>): void {
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
    rhi.activeRenderTarget(null, viewport, renderContext.flipProjection, 0);
    for (let i = 0, n = uiCanvases.length; i < n; i++) {
      const uiCanvas = uiCanvases.get(i);
      if (uiCanvas) {
        const { position } = uiCanvas.entity.transform;
        (viewE[12] = -position.x), (viewE[13] = -position.y);
        Matrix.multiply(virtualCamera.projectionMatrix, virtualCamera.viewMatrix, virtualCamera.viewProjectionMatrix);
        renderContext.applyVirtualCamera(virtualCamera, false);
        renderContext.rendererUpdateFlag |= ContextRendererUpdateFlag.ProjectionMatrix;
        uiCanvas._prepareRender(renderContext);
        uiRenderQueue.pushRenderElement(uiCanvas._renderElement);
        uiRenderQueue.batch(batcherManager);
        batcherManager.uploadBuffer();
        uiRenderQueue.render(renderContext, "Forward");
        uiRenderQueue.clear();
        engine._renderCount++;
      }
    }
    renderContext.camera = null;
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
