import { Engine, ShaderMacro } from "@galacean/engine-core";
import { Mixin, Overwrite, Shadow } from "@/override";
import type { WebGL1GraphicDevice } from "../rhi-webgl/GLCapability";
import { WebGL1Extension } from "../rhi-webgl/WebGL1Extension";

@Mixin(Engine)
export class EngineMixin {
  @Shadow declare _hardwareRenderer: WebGL1GraphicDevice;
  @Shadow declare _macroCollection: Engine["_macroCollection"];
  declare _createDefaultDepthTexture: Engine["_createDefaultDepthTexture"];

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
