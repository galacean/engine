import { Color, Vector3 } from "@galacean/engine-math";
import type { ParticleGenerator } from "../ParticleGenerator";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import type { SubEmitter } from "./SubEmitter";

/**
 * Stores one deferred Death emission event.
 * @internal
 */
export class DeathSubEmitterCommand {
  readonly type = ParticleSubEmitterType.Death;
  readonly worldPosition = new Vector3();
  readonly parentWorldVelocity = new Vector3();

  subEmitter: SubEmitter;
  target: ParticleGenerator;
  count = 0;
  inheritProperties = ParticleSubEmitterInheritProperty.None;
  parentColor: Color | null = null;
  parentSize: Vector3 | null = null;
  parentRotation: Vector3 | null = null;
  eventEngineTime = 0;

  constructor(private readonly _pool: DeathSubEmitterCommand[]) {}

  reset(
    subEmitter: SubEmitter,
    target: ParticleGenerator,
    count: number,
    worldPosition: Vector3,
    parentColor: Color,
    parentSize: Vector3,
    parentRotation: Vector3,
    parentWorldVelocity: Vector3,
    eventEngineTime: number
  ): this {
    const inheritProperties = (this.inheritProperties = subEmitter.inheritProperties);
    this.subEmitter = subEmitter;
    this.target = target;
    this.count = count;
    this.worldPosition.copyFrom(worldPosition);
    this.parentWorldVelocity.copyFrom(parentWorldVelocity);
    if ((inheritProperties & ParticleSubEmitterInheritProperty.Color) !== 0) {
      (this.parentColor ||= new Color()).copyFrom(parentColor);
    }
    if ((inheritProperties & ParticleSubEmitterInheritProperty.Size) !== 0) {
      (this.parentSize ||= new Vector3()).copyFrom(parentSize);
    }
    if ((inheritProperties & ParticleSubEmitterInheritProperty.Rotation) !== 0) {
      (this.parentRotation ||= new Vector3()).copyFrom(parentRotation);
    }
    this.eventEngineTime = eventEngineTime;
    return this;
  }

  release(): void {
    this.subEmitter = null;
    this.target = null;
    this._pool.push(this);
  }
}
