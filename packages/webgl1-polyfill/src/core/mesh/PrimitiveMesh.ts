import { type Engine, GLCapabilityType } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin("PrimitiveMesh")
export class PrimitiveMesh {
  @Overwrite
  static _validateIndexFormat(engine: Engine, vertexCount: number): void {
    if (vertexCount > 65535 && !engine._hardwareRenderer.canIUse(GLCapabilityType.elementIndexUint))
      throw new Error("The vertex count is over limit.");
  }
}
