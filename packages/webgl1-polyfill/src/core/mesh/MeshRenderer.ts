import { MeshRenderer } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(MeshRenderer)
export class MeshRendererMixin {
  @Overwrite
  _canBatch() {
    return false;
  }
}
