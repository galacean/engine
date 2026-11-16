import {
  type Engine as HostEngine,
  GLCapabilityType,
  ShaderMacro,
  type ShaderMacroCollection
} from "@galacean/engine-core";
import { Mixin, Overwrite, Shadow, callOriginal } from "@/override";

@Mixin("Engine")
export class Engine {
  @Shadow declare _hardwareRenderer: HostEngine["_hardwareRenderer"];
  @Shadow declare _macroCollection: ShaderMacroCollection;

  @Overwrite
  _initializeDefaultTextures() {
    const rhi = this._hardwareRenderer;
    if (rhi.canIUse(GLCapabilityType.depthTexture)) callOriginal(this);
    else this._macroCollection.enable(ShaderMacro.getByName("ENGINE_NO_DEPTH_TEXTURE"));
    if (!rhi.canIUse(GLCapabilityType.sRGB)) this._macroCollection.enable(ShaderMacro.getByName("ENGINE_NO_SRGB"));
  }
}
