import { Mixin, Overwrite } from "@/override";

@Mixin("ShaderProgram")
export class ShaderProgram {
  @Overwrite
  _recordUniformBlocks() {}
}
