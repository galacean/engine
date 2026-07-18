import { ignoreClone } from "../../clone/CloneManager";
import { ParticleRenderer } from "../ParticleRenderer";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import type { SubEmittersModule } from "./SubEmittersModule";

/**
 * One slot in `SubEmittersModule.subEmitters`. Configures which sub-emitter
 * fires, on which parent event, with what inheritance, probability, and count.
 */
export class SubEmitter {
  /** Bitmask of properties inherited from the parent particle. */
  inheritProperties: ParticleSubEmitterInheritProperty = ParticleSubEmitterInheritProperty.None;

  /** Probability (0..1) that the sub-emitter runs for a parent particle. */
  emitProbability: number = 1;

  /** Number of sub particles emitted when this slot is triggered at Death. */
  emitCount: number = 1;

  /** @internal */
  @ignoreClone
  _module: SubEmittersModule = null;

  private _emitter: ParticleRenderer = null;
  private _type: ParticleSubEmitterType = ParticleSubEmitterType.Birth;

  /**
   * Target particle renderer the sub particles emit into.
   * Both particle renderers must belong to the same scene.
   */
  get emitter(): ParticleRenderer {
    return this._emitter;
  }

  set emitter(value: ParticleRenderer) {
    if (value === this._emitter) return;
    this._module?._validateEmitter(value);
    this._emitter = value;
    this._module?._onSlotChanged(this);
  }

  /**
   * Which parent-particle event drives this slot.
   */
  get type(): ParticleSubEmitterType {
    return this._type;
  }

  set type(value: ParticleSubEmitterType) {
    if (value === this._type) return;
    this._type = value;
    this._module?._onSlotChanged(this);
  }
}
