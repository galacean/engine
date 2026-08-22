import { DataObject } from "../../base/DataObject";
import { ignoreClone } from "../../clone/CloneDecorators";
import { ParticleRenderer } from "../ParticleRenderer";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import type { SubEmittersModule } from "./SubEmittersModule";

/**
 * One slot in `SubEmittersModule.subEmitters`. Configures which sub-emitter
 * fires, on which parent event, with what inheritance, probability, and count.
 */
export class SubEmitter extends DataObject {
  /** Bitmask of properties inherited from the parent particle. */
  inheritProperties: ParticleSubEmitterInheritProperty = ParticleSubEmitterInheritProperty.None;

  /** Probability (0..1) the sub-emitter fires for any given event. */
  emitProbability: number = 1;

  /** Number of sub particles emitted per parent event. */
  emitCount: number = 1;

  /** @internal */
  _module: SubEmittersModule = null;

  private _emitter: ParticleRenderer = null;
  private _type: ParticleSubEmitterType = ParticleSubEmitterType.Birth;

  /**
   * Target particle renderer the sub particles emit into.
   */
  get emitter(): ParticleRenderer {
    return this._emitter;
  }

  set emitter(value: ParticleRenderer) {
    if (value === this._emitter) return;
    this._module?._validateEmitter(value);
    this._emitter = value;
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
    this._module?._generator._setTransformFeedback();
  }
}
