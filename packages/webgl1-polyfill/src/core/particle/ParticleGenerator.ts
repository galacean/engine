import { Mixin, Overwrite } from "@/override";

@Mixin("ParticleGenerator")
export class ParticleGenerator {
  @Overwrite
  _setTransformFeedback() {}
}
