import { Mixin, Overwrite } from "@/override";

@Mixin("BasicResources")
export class BasicResources {
  @Overwrite
  _createDefaultArrayTextures() {
    return [undefined, undefined];
  }
}
