import { Mixin, Overwrite, callOriginal } from "@/override";

@Mixin("NoiseModule")
export class NoiseModule {
  @Overwrite
  set enabled(value: boolean) {
    if (!value) callOriginal(this, value);
  }
}
