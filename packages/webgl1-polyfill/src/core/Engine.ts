import { type Engine as HostEngine, ShaderMacro } from "@galacean/engine-core";
import { Mixin, Overwrite, Shadow } from "@/override";
import type { WebGL1GraphicDevice } from "../rhi-webgl/GLCapability";
import { WebGL1Extension } from "../rhi-webgl/WebGL1Extension";

@Mixin("Engine")
export class Engine {
  @Shadow declare _hardwareRenderer: WebGL1GraphicDevice;
  @Shadow declare _macroCollection: HostEngine["_macroCollection"];
  declare _createDefaultDepthTexture: HostEngine["_createDefaultDepthTexture"];

  @Overwrite
  _initializeDefaultTextures(): void {
    if (!this._hardwareRenderer.canIUse(WebGL1Extension.sRGB)) {
      this._macroCollection.enable(ShaderMacro.getByName("ENGINE_NO_SRGB"));
    }
    if (this._hardwareRenderer.canIUse(WebGL1Extension.depthTexture)) {
      this._createDefaultDepthTexture();
    } else {
      this._macroCollection.enable(ShaderMacro.getByName("ENGINE_NO_DEPTH_TEXTURE"));
    }
  }
}
