import { ClearMode } from "@alipay/o3-base";
import { RenderPass } from "@alipay/o3-renderer-basic";
import { Texture2D } from "@alipay/o3-material";
import { ScreenQuadGeometry } from "@alipay/o3-geometry-shape";
import { WeightedAverageMaterial } from "./WeightedAverageMaterial";

/**
 * screen renderPass
 * */
export class ScreenRenderPass extends RenderPass {
  private screenQuadGeometry = new ScreenQuadGeometry();

  constructor(textures: Texture2D[]) {
    super("screen renderPass", 1, null);
    this.replaceMaterial = new WeightedAverageMaterial("WeightedAverageMaterial", textures);
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
