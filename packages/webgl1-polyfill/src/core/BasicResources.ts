import { BasicResources } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(BasicResources)
export class BasicResourcesMixin {
  @Overwrite
  _createDefaultArrayTextures() {
    return [undefined, undefined];
  }
}
