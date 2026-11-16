import { BlendShapeManager } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(BlendShapeManager)
export class BlendShapeManagerMixin {
  /** @internal */
  @Overwrite
  _useTextureMode(): boolean {
    return false;
  }
}
