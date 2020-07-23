import { ClearMode } from "@alipay/o3-base";
import { RenderPass } from "@alipay/o3-renderer-basic";
import { RenderTarget, RenderDepthTexture } from "@alipay/o3-material";
import { DepthMaterial } from "./DepthMaterial";

/**
 * opaque renderPass
 * 1. 渲染 opaque 到屏幕
 * 2. 渲染 opaque 到深度纹理
 * */
export class OpaqueRenderPass extends RenderPass {
  constructor(width: number, height: number) {
    super("opaque renderPass", -2, null);
    this.renderTarget = new RenderTarget(width, height, null, new RenderDepthTexture(width, height));
    this.replaceMaterial = new DepthMaterial("DepthMaterial");
    this.renderOverride = true;
  }

  /**
   *  保持 defaultRenderPass 的状态，渲染 opaque 到屏幕
   * */
  preRender(camera, opaqueQueue, transparentQueue) {
    const defaultRenderPass = camera.sceneRenderer.defaultRenderPass;
    const rhi = camera.renderHardware;

    this.clearParam = defaultRenderPass.clearParam;
    this.mask = defaultRenderPass.mask;

    // render to screen
    rhi.activeRenderTarget(null, camera);
    rhi.clearRenderTarget(ClearMode.SOLID_COLOR, this.clearParam);
    opaqueQueue.render(camera, null, this.mask);
  }

  /**
   * 渲染 opaque 到深度纹理
   * */
  render(camera, opaqueQueue, transparentQueue) {
    opaqueQueue.render(camera, this.replaceMaterial, this.mask);
  }
}
