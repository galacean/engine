import { Color, Quaternion, Vector3 } from "@galacean/engine-math";
import type { ParticleGenerator } from "../ParticleGenerator";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";

/**
 * Stores one deferred Death emission event.
 * @internal
 */
export class DeathSubEmitterCommand {
  readonly type = ParticleSubEmitterType.Death;
  readonly worldPosition = new Vector3();
  readonly parentWorldVelocity = new Vector3();
  readonly targetWorldPosition = new Vector3();
  readonly targetWorldRotation = new Quaternion();
  readonly targetPositionScale = new Vector3();

  target: ParticleGenerator;
  ringIndex = 0;
  count = 0;
  inheritProperties = ParticleSubEmitterInheritProperty.None;
  parentColor: Color | null = null;
  parentSize: Vector3 | null = null;
  parentRotation: Vector3 | null = null;
  eventEngineTime = 0;

  constructor(private readonly _pool: DeathSubEmitterCommand[]) {}

  reset(
    target: ParticleGenerator,
    ringIndex: number,
    count: number,
    inheritProperties: ParticleSubEmitterInheritProperty,
    eventEngineTime: number
  ): this {
    this.target = target;
    const targetTransform = target._renderer.entity.transform;
    this.targetWorldPosition.copyFrom(targetTransform.worldPosition);
    this.targetWorldRotation.copyFrom(targetTransform.worldRotationQuaternion);
    this.targetPositionScale.copyFrom(target.main._getPositionScale());
    this.ringIndex = ringIndex;
    this.count = count;
    this.inheritProperties = inheritProperties;
    this.eventEngineTime = eventEngineTime;
    return this;
  }

  snapshotParentValues(parentColor: Color, parentSize: Vector3, parentRotation: Vector3): void {
    const inheritProperties = this.inheritProperties;
    if ((inheritProperties & ParticleSubEmitterInheritProperty.Color) !== 0) {
      (this.parentColor ||= new Color()).copyFrom(parentColor);
    }
    if ((inheritProperties & ParticleSubEmitterInheritProperty.Size) !== 0) {
      (this.parentSize ||= new Vector3()).copyFrom(parentSize);
    }
    if ((inheritProperties & ParticleSubEmitterInheritProperty.Rotation) !== 0) {
      (this.parentRotation ||= new Vector3()).copyFrom(parentRotation);
    }
  }

  resolveTrajectory(worldPosition: Vector3, parentWorldVelocity: Vector3): void {
    this.worldPosition.copyFrom(worldPosition);
    this.parentWorldVelocity.copyFrom(parentWorldVelocity);
  }

  cancel(): void {
    this.release();
  }

  release(): void {
    this.target = null;
    this._pool.push(this);
  }
}
