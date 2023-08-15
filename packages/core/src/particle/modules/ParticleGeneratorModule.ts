
import { ParticleGenerator } from "../ParticleGenerator";

/**
 * Particle generator module.
 */
export abstract class ParticleGeneratorModule {
  /** Specifies whether the module is enabled or not. */
  enabled: boolean = false;

  protected _generator: ParticleGenerator;

  constructor(generator: ParticleGenerator) {
    this._generator = generator;
  }

  abstract cloneTo(destRotationOverLifetime: ParticleGeneratorModule);
}
