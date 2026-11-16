import { Mixin, Overwrite } from "@/override";

@Mixin("MeshRenderer")
export class MeshRenderer {
  @Overwrite
  _canBatch() {
    return false;
  }
}
