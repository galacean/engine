import { type Engine, GLCapabilityType } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";
import { WebGL1Extension } from "../../rhi-webgl/WebGL1Extension";

@Mixin("PrimitiveMesh")
export class PrimitiveMesh {
  @Overwrite
  static _validateIndexFormat(engine: Engine, vertexCount: number): void {
    if (vertexCount > 65535 && !engine._hardwareRenderer.requireExtension(WebGL1Extension.elementIndexUint))
      throw new Error("The vertex count is over limit.");
  }
}
