import { Mixin, Overwrite } from "@/override";

@Mixin("SubEmittersModule")
export class SubEmittersModule {
  @Overwrite
  get enabled() {
    return false;
  }
}
