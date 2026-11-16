import { Mixin, Overwrite } from "@/override";

@Mixin("BlendShapeManager")
export class BlendShapeManager {
  /** @internal */
  @Overwrite
  _useTextureMode(): boolean {
    return false;
  }
}
