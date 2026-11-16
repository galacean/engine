import { VelocityOverLifetimeModule } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(VelocityOverLifetimeModule)
export class VelocityOverLifetimeModuleMixin {
  @Overwrite
  _isOrbitalActive(): boolean {
    return false;
  }

  @Overwrite
  _isRadialActive(): boolean {
    return false;
  }
}
