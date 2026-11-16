import {
  DepthOnlyPass,
  type Camera,
  type Engine,
  PipelineUtils,
  type RenderTarget,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { Mixin, Overwrite, Shadow } from "@/override";

@Mixin(DepthOnlyPass)
export class DepthOnlyPassMixin {
  @Shadow declare renderTarget: RenderTarget | null;
  declare engine: Engine;

  @Overwrite
  onConfig(camera: Camera) {
    const { width, height } = camera.pixelViewport;
    this.renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this.engine,
      this.renderTarget,
      width,
      height,
      null,
      TextureFormat.Depth24Stencil8,
      true,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Point
    );
  }
}
