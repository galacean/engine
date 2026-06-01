import { ignoreClone } from "../../clone/CloneManager";
import { ParticleRenderer } from "../ParticleRenderer";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";

/**
 * One sub-emitter slot. Holds the target `ParticleRenderer`, the trigger event
 * (`Birth` or `Death`), the inherited property bitmask, and a per-event
 * emit probability + count.
 *
 * Position handling is implicit: when a parent particle event fires, the
 * target sub-emitter emits at the parent particle's event position.
 */
export class SubEmitter {
  /** Target particle renderer the sub particles are emitted into. */
  @ignoreClone
  emitter: ParticleRenderer = null;

  /** Trigger type: which parent-particle event drives this slot. */
  type: ParticleSubEmitterType = ParticleSubEmitterType.Birth;

  /** Bitmask of properties inherited from the parent particle. */
  inheritProperties: ParticleSubEmitterInheritProperty = ParticleSubEmitterInheritProperty.None;

  /** Probability (0..1) the sub-emitter fires for any given event. */
  emitProbability: number = 1;

  /**
   * Number of sub particles emitted per parent event when the probability roll passes.
   *
   * Decoupled from the target renderer's own `EmissionModule` so the sub renderer
   * can safely have its own `playOnEnabled` / loops / bursts without those firing
   * a second time when the parent event triggers this slot.
   */
  emitCount: number = 1;
}
