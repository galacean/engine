import { ShaderProgram } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(ShaderProgram)
export class ShaderProgramMixin {
  @Overwrite
  _recordUniformBlocks() {}
}
