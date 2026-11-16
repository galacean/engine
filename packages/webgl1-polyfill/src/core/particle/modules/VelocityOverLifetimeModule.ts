import { Mixin, Overwrite } from "@/override";

@Mixin("VelocityOverLifetimeModule")
export class VelocityOverLifetimeModule {
  @Overwrite
  _isOrbitalActive(): boolean {
    return false;
  }

  @Overwrite
  _isRadialActive(): boolean {
    return false;
  }
}
