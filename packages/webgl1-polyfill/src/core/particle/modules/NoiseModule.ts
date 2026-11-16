import { Mixin, Overwrite } from "@/override";

@Mixin("NoiseModule")
export class NoiseModule {
  declare _setEnabled: (value: boolean) => void;

  @Overwrite
  set enabled(value: boolean) {
    if (!value) this._setEnabled(false);
  }
}
