import { LimitVelocityOverLifetimeModule } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(LimitVelocityOverLifetimeModule)
export class LimitVelocityOverLifetimeModuleMixin {
  declare _setEnabled: (value: boolean) => void;

  @Overwrite
  set enabled(value: boolean) {
    if (!value) this._setEnabled(false);
  }
}
