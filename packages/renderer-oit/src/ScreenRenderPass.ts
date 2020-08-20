import { ClearMode, RenderContext } from "@alipay/o3-core";
import { RenderPass } from "@alipay/o3-core";
import { RenderColorTexture } from "@alipay/o3-core";
import { ScreenQuadGeometry } from "@alipay/o3-geometry-shape";
import { ScreenMaterial } from "./ScreenMaterial";

/**
 * screen renderPass
 * */
export class ScreenRenderPass extends RenderPass {
  private screenQuadGeometry = new ScreenQuadGeometry();

  constructor(textures: RenderColorTexture[]) {
    super("screen renderPass", 1, null);
    this.replaceMaterial = new ScreenMaterial("ScreenMaterial", textures);
    this.renderOverride = true;
    this.clearMode = ClearMode.DONT_CLEAR;
  }

  render(camera) {
    const rhi = camera.renderHardware;
    const primitive = this.screenQuadGeometry.primitive;

    const context = RenderContext._getRenderContext(camera);
    this.replaceMaterial.prepareDrawing(context, {}, primitive);
    rhi.drawPrimitive(primitive, this.replaceMaterial);
  }
}
