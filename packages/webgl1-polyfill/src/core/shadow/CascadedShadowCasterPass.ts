import {
  CameraClearFlags,
  CascadedShadowCasterPass as CoreCascadedShadowCasterPass,
  type CascadedShadowCasterPass as HostShadowPass,
  type Engine,
  PipelineUtils,
  type RenderTarget,
  type Texture,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { Mixin, Overwrite, Shadow } from "@/override";
import { WebGL1Extension } from "../../rhi-webgl/WebGL1Extension";

@Mixin("CascadedShadowCasterPass")
export class CascadedShadowCasterPass {
  @Shadow declare _depthTexture: Texture | null;
  @Shadow declare _renderTarget: RenderTarget | null;
  @Shadow declare _shadowMapFormat: TextureFormat;
  @Shadow declare _shadowMapSize: { z: number; w: number };
  declare engine: Engine;

  @Overwrite
  _getShadowFormat() {
    return this.engine._hardwareRenderer.requireExtension(WebGL1Extension.depthTexture)
      ? TextureFormat.Depth16
      : TextureFormat.R8G8B8A8;
  }
  @Overwrite
  _prepareShadowMap(context: Parameters<HostShadowPass["onRender"]>[0]) {
    const shadow = CoreCascadedShadowCasterPass;
    const depth = this.engine._hardwareRenderer.requireExtension(WebGL1Extension.depthTexture);
    const { z: width, w: height } = this._shadowMapSize;
    const target = PipelineUtils.recreateRenderTargetIfNeeded(
      this.engine,
      this._renderTarget,
      width,
      height,
      depth ? null : this._shadowMapFormat,
      depth ? this._shadowMapFormat : null,
      depth,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Bilinear
    );
    this._renderTarget = target;
    this._depthTexture = depth ? target.depthTexture : target.getColorTexture(0);
    context.setRenderTarget(target, shadow["_viewport"], 0);
    this.engine._hardwareRenderer.clearRenderTarget(
      this.engine,
      depth ? CameraClearFlags.Depth : CameraClearFlags.All,
      depth ? null : shadow["_clearColor"]
    );
  }
}
