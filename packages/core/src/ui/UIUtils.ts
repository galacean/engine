import { Matrix, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { RenderQueue } from "../RenderPipeline";
import { ContextRendererUpdateFlag } from "../RenderPipeline/RenderContext";
import { VirtualCamera } from "../VirtualCamera";
import { RenderQueueType } from "../shader";
import { DisorderedArray } from "../utils/DisorderedArray";
import { IUICanvas } from "./IUICanvas";

export class UIUtils {
  private static _renderQueue: RenderQueue;
  private static _virtualCamera: VirtualCamera;
  private static _viewport: Vector4;

  static render(engine: Engine, uiCanvases: DisorderedArray<IUICanvas>): void {
    const uiRenderQueue = (this._renderQueue ||= new RenderQueue(RenderQueueType.Transparent));
    const virtualCamera = (this._virtualCamera ||= new VirtualCamera());
    const viewport = (this._viewport ||= new Vector4(0, 0, 1, 1));
    const { canvas, _hardwareRenderer: rhi, _renderContext: renderContext, _batcherManager: batcherManager } = engine;
    const { elements: projectE } = virtualCamera.projectionMatrix;
    const { elements: viewE } = virtualCamera.viewMatrix;
    (projectE[0] = 2 / canvas.width), (projectE[5] = 2 / canvas.height), (projectE[10] = 0);
    rhi.activeRenderTarget(null, viewport, renderContext.flipProjection, 0);
    for (let i = 0, n = uiCanvases.length; i < n; i++) {
      const uiCanvas = uiCanvases.get(i);
      if (uiCanvas) {
        const transform = uiCanvas.entity.transform;
        (viewE[12] = -transform.position.x), (viewE[13] = -transform.position.y);
        Matrix.multiply(virtualCamera.projectionMatrix, virtualCamera.viewMatrix, virtualCamera.viewProjectionMatrix);
        renderContext.applyVirtualCamera(virtualCamera, false);
        renderContext.rendererUpdateFlag |= ContextRendererUpdateFlag.ProjectionMatrix;
        uiRenderQueue.clear();
        uiCanvas._prepareRender(renderContext);
        uiRenderQueue.pushRenderElement(uiCanvas._renderElement);
        uiRenderQueue.batch(batcherManager);
        batcherManager.uploadBuffer();
        uiRenderQueue.render(renderContext, "Forward");
        engine._renderCount++;
      }
    }
  }
}
