import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { BaseShape } from "./shape/BaseShape";
import { ConeShape } from "./shape/ConeShape";

/**
 * Shape module of `ParticleGenerator`.
 */
export class ShapeModule extends ParticleGeneratorModule {
  /** The shape of the emitter. */
  shape: BaseShape;

  constructor(generator: ParticleGenerator) {
    super(generator);
    this.shape = new ConeShape(generator);
  }

  override cloneTo(destRotationOverLifetime: ParticleGeneratorModule) {}
}
