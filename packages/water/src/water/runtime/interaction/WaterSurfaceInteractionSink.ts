import type { Vector3 } from "@galacean/engine-math";

/** Internal, allocation-free write contract for bodies that contact a water surface. */
export interface WaterSurfaceInteractionSink {
  /**
   * Queues one world-space contact for a later water-simulation step.
   *
   * The caller reports every submerged fixed step, including stationary contact.
   * Implementations may derive both one-shot impact impulses and persistent
   * pressure footprints from the copied values.
   *
   * Implementations must copy all required scalar values and must not retain vector references.
   */
  registerInteraction(
    worldPosition: Vector3,
    surfaceNormal: Vector3,
    relativeVelocity: Vector3,
    radius: number,
    submergedRatio: number,
    enteredWater: boolean
  ): boolean;
}
