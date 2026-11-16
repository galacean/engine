import { NoiseModule } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(NoiseModule)
export class NoiseModuleMixin {
  declare _setEnabled: (value: boolean) => void;

  @Overwrite
  set enabled(value: boolean) {
    if (!value) this._setEnabled(false);
  }
}
