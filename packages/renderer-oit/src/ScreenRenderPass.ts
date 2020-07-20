import { ClearMode } from "@alipay/o3-base";
import { RenderPass } from "@alipay/o3-renderer-basic";
import { RenderColorTexture } from "@alipay/o3-material";
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

    this.replaceMaterial.prepareDrawing(camera, {}, primitive);
    rhi.drawPrimitive(primitive, this.replaceMaterial);
  }
}
