import type { GroundAnimalMotion } from "./GroundAnimalSteering";

type Traversable = (from: Readonly<GroundAnimalMotion>, to: Readonly<GroundAnimalMotion>) => boolean;

/**
 * One supported backward arc gives a blocked animal room to resume forward travel.
 * Recovery never changes orientation without translation or refreshes its own retry budget.
 */
export class GroundAnimalRecovery {
  private direction = 0;
  private startHeading = 0;
  private radius = 0;
  private anchorX = NaN;
  private anchorZ = NaN;
  private startX = NaN;
  private startZ = NaN;
  private completedOriginX = NaN;
  private completedOriginZ = NaN;
  private failedCount = 0;
  private readonly failures = Array.from({ length: 2 }, () => ({
    from: { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 },
    to: { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 }
  }));
  private readonly probe: GroundAnimalMotion = { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 };
  private readonly previous: GroundAnimalMotion = { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 };

  /** Whether subsequent movement proposals must finish the accepted retreat arc. */
  get recovering(): boolean {
    return this.direction !== 0;
  }

  /** Release recovery progress and retry budgets for a new goal or explicit relocation. */
  reset(): void {
    this.direction = this.failedCount = 0;
    this.anchorX = this.anchorZ = this.completedOriginX = this.completedOriginZ = NaN;
  }

  /**
   * Replace a blocked movement proposal with a bounded, supported retreat.
   * Call only while forward travel is blocked or recovery remains active.
   * @param current Actual committed motion; rejected or partial proposals do not consume progress.
   * @param proposed Reused output; a rejected recovery leaves it at the current pose.
   * @param speed Positive nominal gait speed in metres per second.
   * @param bodyLength World-space animal length in metres.
   * @param seconds Positive simulation step in seconds.
   * @param canTraverse Terrain and occupancy check for each swept segment.
   * @returns Whether a supported proposal was produced, including one stopped step upon completion.
   */
  advance(
    current: Readonly<GroundAnimalMotion>,
    proposed: GroundAnimalMotion,
    speed: number,
    bodyLength: number,
    seconds: number,
    canTraverse: Traversable
  ): boolean {
    const preferred = Math.sign(proposed.heading - current.heading) || 1;
    Object.assign(proposed, current);
    proposed.speed = proposed.angularSpeed = 0;
    if (!(speed > 0 && seconds > 0)) return false;
    if (!this.direction) {
      const progressDistance = Math.max(0.25, bodyLength * 0.5);
      // Returning to the same blocked edge after a complete retreat is not progress
      // toward this goal; let the owner finish or replace the unsuccessful move.
      if (
        Number.isFinite(this.completedOriginX) &&
        Math.hypot(current.x - this.completedOriginX, current.z - this.completedOriginZ) < progressDistance
      )
        return false;
      if (
        Number.isFinite(this.anchorX) &&
        Math.hypot(current.x - this.anchorX, current.z - this.anchorZ) < progressDistance
      ) {
        // Failed segments can become clear when another animal leaves. Recheck only
        // those witnesses; a completed retreat still requires new forward progress.
        let cleared = false;
        for (let i = 0; i < this.failedCount && !cleared; i++)
          cleared = canTraverse(this.failures[i].from, this.failures[i].to);
        if (!cleared) return false;
      }
      this.failedCount = 0;
      this.anchorX = current.x;
      this.anchorZ = current.z;
      this.radius = Math.max(0.1, bodyLength * 0.75);
      this.startHeading = current.heading;
      for (const direction of [preferred, -preferred]) {
        Object.assign(this.probe, current);
        let legal = true;
        for (let part = 0; part < 16; part++) {
          Object.assign(this.previous, this.probe);
          this.step(this.previous, this.probe, (direction * Math.PI) / 32);
          if (!canTraverse(this.previous, this.probe)) {
            this.rememberFailure(this.previous, this.probe);
            legal = false;
            break;
          }
        }
        if (legal) {
          this.direction = direction;
          break;
        }
      }
      if (!this.direction) return false;
      this.startX = current.x;
      this.startZ = current.z;
      this.failedCount = 0;
    }
    const remaining = Math.PI / 2 - (current.heading - this.startHeading) * this.direction;
    if (remaining <= 1e-7) {
      this.completedOriginX = this.startX;
      this.completedOriginZ = this.startZ;
      this.finish(current);
      return true;
    }
    const turn = Math.min(remaining, Math.min((speed * 0.45) / this.radius, 0.3) * seconds);
    this.step(current, proposed, this.direction * turn);
    proposed.speed = (this.radius * turn) / seconds;
    proposed.angularSpeed = (this.direction * turn) / seconds;
    if (canTraverse(current, proposed)) return true;
    this.rememberFailure(current, proposed);
    Object.assign(proposed, current);
    proposed.speed = proposed.angularSpeed = 0;
    this.finish(current);
    return false;
  }

  private finish(current: Readonly<GroundAnimalMotion>): void {
    this.direction = 0;
    this.anchorX = current.x;
    this.anchorZ = current.z;
  }

  private rememberFailure(from: Readonly<GroundAnimalMotion>, to: Readonly<GroundAnimalMotion>): void {
    const witness = this.failures[this.failedCount++];
    Object.assign(witness.from, from);
    Object.assign(witness.to, to);
  }

  private step(from: Readonly<GroundAnimalMotion>, to: GroundAnimalMotion, turn: number): void {
    const heading = from.heading + turn,
      signedRadius = this.radius * Math.sign(turn);
    to.x = from.x + signedRadius * (Math.cos(heading) - Math.cos(from.heading));
    to.z = from.z - signedRadius * (Math.sin(heading) - Math.sin(from.heading));
    to.heading = heading;
  }
}
