import { ParticleGenerator } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(ParticleGenerator)
export class ParticleGeneratorMixin {
  @Overwrite
  _setTransformFeedback() {}
}
