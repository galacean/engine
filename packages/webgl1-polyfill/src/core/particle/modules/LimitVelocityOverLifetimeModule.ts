import { Mixin, Overwrite } from "@/override";

@Mixin("LimitVelocityOverLifetimeModule")
export class LimitVelocityOverLifetimeModule {
  declare _setEnabled: (value: boolean) => void;

  @Overwrite
  set enabled(value: boolean) {
    if (!value) this._setEnabled(false);
  }
}
