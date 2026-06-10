import { ParticleRenderer } from "../ParticleRenderer";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";

/**
 * One slot in `SubEmittersModule.subEmitters`. Configures which sub-emitter
 * fires, on which parent event, with what inheritance, probability, and count.
 */
export class SubEmitter {
  /** Target particle renderer the sub particles emit into. Remapped on clone. */
  emitter: ParticleRenderer = null;

  /** Which parent-particle event drives this slot. */
  type: ParticleSubEmitterType = ParticleSubEmitterType.Birth;

  /** Bitmask of properties inherited from the parent particle. */
  inheritProperties: ParticleSubEmitterInheritProperty = ParticleSubEmitterInheritProperty.None;

  /** Probability (0..1) the sub-emitter fires for any given event. */
  emitProbability: number = 1;

  /** Number of sub particles emitted per parent event. */
  emitCount: number = 1;
}
