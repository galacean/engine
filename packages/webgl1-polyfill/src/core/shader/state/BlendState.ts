import { BlendOperation, type Engine, GLCapabilityType } from "@galacean/engine-core";
import { Mixin, Overwrite, callOriginal } from "@/override";

@Mixin("BlendState")
export class BlendState {
  @Overwrite
  static _getGLBlendOperation(rhi: Engine["_hardwareRenderer"], operation: BlendOperation) {
    if (
      (operation === BlendOperation.Min || operation === BlendOperation.Max) &&
      !rhi.canIUse(GLCapabilityType.blendMinMax)
    ) {
      throw new Error(`BlendOperation.${BlendOperation[operation]} is not supported in this context`);
    }
    return callOriginal(this, rhi, operation);
  }
}
