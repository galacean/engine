import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { PipelinePass } from "../shadow/PipelinePass";
import { Texture2D, TextureFormat } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";
import { CullingResults } from "./CullingResults";
import { RenderContext } from "./RenderContext";

/**
 * Depth only pass.
 */
export class DepthOnlyPass extends PipelinePass {
  private static _pipelineStageValue: string = "DepthOnly";

  private _renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
  }

  override onConfig(camera: Camera): void {
    const engine = this._engine;
    const rhi = engine._hardwareRenderer;

    // @todo: remove hack
    let width: number, height: number;
    const cameraRenderTarget = camera.renderTarget;
    if (camera.renderTarget) {
      width = cameraRenderTarget.width;
      height = cameraRenderTarget.height;
    } else {
      width = rhi._gl.drawingBufferWidth;
      height = rhi._gl.drawingBufferHeight;
    }

    const depthTexture = new Texture2D(engine, width, height, TextureFormat.Depth16, false);
    this._renderTarget = new RenderTarget(engine, width, height, null, depthTexture);
  }

  override onRender(context: RenderContext, cullingResults: CullingResults): void {
    this.onConfig(context.camera);

    const camera = context.camera;
    const { engine, scene } = camera;
    const renderTarget = this._renderTarget;
    const { background } = scene;
    const rhi = engine._hardwareRenderer;
    rhi.activeRenderTarget(renderTarget, camera.viewport, 0);
    renderTarget?._setRenderTargetInfo(undefined, 0);
    cullingResults.opaqueQueue.render(context, camera, Layer.Everything);
    cullingResults.alphaTestQueue.render(context, camera, Layer.Everything);
    cullingResults.transparentQueue.render(context, camera, Layer.Everything);

    const clearFlags = camera.clearFlags;
    const color = background.solidColor;
    if (clearFlags !== CameraClearFlags.None) {
      rhi.clearRenderTarget(camera.engine, clearFlags, color);
    }
  }
}
