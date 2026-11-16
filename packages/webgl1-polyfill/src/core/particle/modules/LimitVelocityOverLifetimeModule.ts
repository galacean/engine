import { Mixin, Overwrite, callOriginal } from "@/override";

@Mixin("LimitVelocityOverLifetimeModule")
export class LimitVelocityOverLifetimeModule {
  @Overwrite
  set enabled(value: boolean) {
    if (!value) callOriginal(this, value);
  }
}
