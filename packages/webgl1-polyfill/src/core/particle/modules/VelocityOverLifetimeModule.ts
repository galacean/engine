import { Mixin, Overwrite } from "@/override";

@Mixin("VelocityOverLifetimeModule")
export class VelocityOverLifetimeModule {
  @Overwrite
  _supportsTransformFeedback() {
    return false;
  }
}
