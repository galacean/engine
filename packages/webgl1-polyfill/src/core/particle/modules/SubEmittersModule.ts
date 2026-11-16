import { SubEmittersModule } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(SubEmittersModule)
export class SubEmittersModuleMixin {
  @Overwrite
  get enabled() {
    return false;
  }
}
