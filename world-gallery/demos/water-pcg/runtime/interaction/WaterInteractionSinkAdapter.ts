import type { Vector3 } from "@galacean/engine-math";
import {
  WaterInteractionEventKind,
  type WaterInteractionEventInput,
  type WaterInteractionEventQueue
} from "./WaterInteractionEventQueue";
import type { WaterSurfaceInteractionSink } from "./WaterSurfaceInteractionSink";

export interface WaterInteractionSinkAdapterOptions {
  readonly queue: WaterInteractionEventQueue;
  readonly emitterId: number;
  readonly deformationSink?: WaterSurfaceInteractionSink;
  readonly minimumTrailDistance: number;
  readonly minimumTrailSpeed: number;
}

/** Bridges existing buoyancy contacts into deformation plus bounded local-effect events. */
export class WaterInteractionSinkAdapter implements WaterSurfaceInteractionSink {
  timeSeconds = 0;

  private readonly _event: Mutable<WaterInteractionEventInput> = {
    emitterId: 0,
    kind: WaterInteractionEventKind.Entry,
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    radius: 0,
    strength: 0,
    time: 0,
    priority: 0
  };

  constructor(private readonly _options: WaterInteractionSinkAdapterOptions) {
    if (
      !Number.isInteger(_options.emitterId) ||
      _options.emitterId < 0 ||
      !Number.isFinite(_options.minimumTrailDistance) ||
      _options.minimumTrailDistance < 0 ||
      !Number.isFinite(_options.minimumTrailSpeed) ||
      _options.minimumTrailSpeed < 0
    ) {
      throw new Error("Water interaction sink adapter options are invalid.");
    }
    this._event.emitterId = _options.emitterId;
  }

  registerInteraction(
    worldPosition: Vector3,
    surfaceNormal: Vector3,
    relativeVelocity: Vector3,
    radius: number,
    submergedRatio: number,
    enteredWater: boolean
  ): boolean {
    const deformationAccepted =
      this._options.deformationSink?.registerInteraction(
        worldPosition,
        surfaceNormal,
        relativeVelocity,
        radius,
        submergedRatio,
        enteredWater
      ) ?? false;
    if (
      !Number.isFinite(this.timeSeconds) ||
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !Number.isFinite(submergedRatio) ||
      submergedRatio <= 0
    ) {
      return deformationAccepted;
    }

    const event = this._event;
    const horizontalSpeed = Math.hypot(relativeVelocity.x, relativeVelocity.z);
    const normalSpeed =
      relativeVelocity.x * surfaceNormal.x +
      relativeVelocity.y * surfaceNormal.y +
      relativeVelocity.z * surfaceNormal.z;
    event.kind = enteredWater ? WaterInteractionEventKind.Entry : WaterInteractionEventKind.MotionTrail;
    event.worldX = worldPosition.x;
    event.worldY = worldPosition.y;
    event.worldZ = worldPosition.z;
    event.velocityX = relativeVelocity.x;
    event.velocityY = relativeVelocity.y;
    event.velocityZ = relativeVelocity.z;
    event.radius = radius;
    event.strength = Math.max(Math.abs(normalSpeed), horizontalSpeed) * Math.min(1, submergedRatio);
    event.time = this.timeSeconds;
    event.priority = event.strength;

    const eventAccepted = enteredWater
      ? this._options.queue.enqueue(event)
      : this._options.queue.enqueueMotionTrail(
          event,
          this._options.minimumTrailDistance,
          this._options.minimumTrailSpeed
        );
    return deformationAccepted || eventAccepted;
  }
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
