import { bridgeGround } from "../spatial/hydrology/RiverCrossings";
import { inRing } from "./WorldPlanningGeometry";
import { planningWhiteboxes } from "./PlanningWhiteboxes";
import { PLANNING_REFERENCE } from "../planning-data/PlanningReference";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { V2Box } from "../spatial/V2Model.ts";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
import { DEFAULT_LANDFORM_METRICS } from "../landforms/LandformMetrics";
/** Whitebox movement defaults, independent of landform generation reference speed. Jump/step values are test hypotheses. */
export const WALK_METRICS = {
  height: DEFAULT_LANDFORM_METRICS.playerHeightM,
  eye: DEFAULT_LANDFORM_METRICS.eyeHeightM,
  radius: PLANNING_REFERENCE.actor.radiusM,
  walk: 4,
  run: DEFAULT_LANDFORM_METRICS.runSpeedMps,
  gravity: 9.81,
  jumpHeight: 1.2,
  step: 0.3
};
/** Shared limits for the walking UI and simulation, in metres per second. */
export const WALK_SPEED_LIMITS = { min: 1, max: 200 };
/** Fixed-step kinematic cylinder against terrain and oriented whiteboxes, shared by zoo and world. */
export class PlanningWalk {
  position = { x: 0, y: 0, z: 0 };
  velocityY = 0;
  grounded = true;
  elapsed = 0;
  distance = 0;
  speed = 0;
  blocked = 0;
  jumps = 0;
  apex = 0;
  lastJumpDistance = 0;
  lastJumpHeight = 0;
  private readonly bridgeBoxes = new Set<string>();
  readonly metrics = { ...WALK_METRICS };
  readonly ground: (p: PlanPoint) => number;
  readonly boxes: V2Box[];
  private jumpStart: { x: number; y: number; z: number } | null = null;
  constructor(
    readonly plan: IslandPlan,
    ground = createPlanningGroundSampler(plan)
  ) {
    this.ground = bridgeGround(plan, ground);
    const parts = planningWhiteboxes(plan, ground);
    this.boxes = parts.flatMap((part) => part.boxes);
    for (const part of parts) if (part.layer === "bridge") for (const box of part.boxes) this.bridgeBoxes.add(box.id);
    this.reset(plan.spawn);
  }
  /** Set locomotion speed in metres per simulated second; Shift remains a relative boost. */
  setSpeed(metresPerSecond: number): void {
    if (
      !Number.isFinite(metresPerSecond) ||
      metresPerSecond < WALK_SPEED_LIMITS.min ||
      metresPerSecond > WALK_SPEED_LIMITS.max
    )
      throw new Error(`行走速度须在${WALK_SPEED_LIMITS.min}–${WALK_SPEED_LIMITS.max}米/秒`);
    this.metrics.walk = metresPerSecond;
    this.metrics.run = metresPerSecond * (WALK_METRICS.run / WALK_METRICS.walk);
  }
  /** Place feet on the highest supporting surface at a chosen spawn. */
  reset(p: PlanPoint): void {
    this.position = { ...p, y: this.ground(p) };
    for (const b of this.boxes)
      if (b.collision && !this.bridgeBoxes.has(b.id) && this.overlap(p, b))
        this.position.y = Math.max(this.position.y, (b.elevation ?? this.ground(b.center)) + b.sizeY);
    this.velocityY = 0;
    this.grounded = true;
    this.jumpStart = null;
  }
  /** Start on terrain, never silently move a selected point onto a roof. */
  resetOnGround(p: PlanPoint): boolean {
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.z) ||
      p.x < this.metrics.radius ||
      p.z < this.metrics.radius ||
      p.x > this.plan.parameters.width - this.metrics.radius ||
      p.z > this.plan.parameters.depth - this.metrics.radius ||
      ![this.plan.land, ...this.plan.islands].some((r) => inRing(p, r))
    )
      return false;
    const y = this.ground(p);
    if (
      this.boxes.some(
        (b) =>
          b.collision &&
          !this.bridgeBoxes.has(b.id) &&
          this.overlap(p, b) &&
          (b.elevation ?? this.ground(b.center)) < y + this.metrics.height &&
          (b.elevation ?? this.ground(b.center)) + b.sizeY > y + 0.01
      )
    )
      return false;
    this.position = { ...p, y };
    this.velocityY = 0;
    this.grounded = true;
    this.jumpStart = null;
    return true;
  }
  private overlap(p: PlanPoint, b: V2Box): boolean {
    const c = Math.cos(b.yaw),
      s = Math.sin(b.yaw),
      dx = p.x - b.center.x,
      dz = p.z - b.center.z,
      x = c * dx + s * dz,
      z = -s * dx + c * dz;
    return (
      Math.hypot(Math.max(0, Math.abs(x) - b.sizeX / 2), Math.max(0, Math.abs(z) - b.sizeZ / 2)) <
      this.metrics.radius - 1e-6
    );
  }
  /** Advance one bounded frame; callers supply camera-relative unit movement and jump edge. */
  advance(dt: number, dx: number, dz: number, run: boolean, jump: boolean): void {
    dt = Math.min(0.1, Math.max(0, dt));
    if (jump && this.grounded) {
      this.velocityY = Math.sqrt(2 * this.metrics.gravity * this.metrics.jumpHeight);
      this.grounded = false;
      this.jumps++;
      this.jumpStart = { ...this.position };
      this.apex = this.position.y;
    }
    const norm = Math.hypot(dx, dz);
    if (norm > 1) {
      dx /= norm;
      dz /= norm;
    }
    const speed = run ? this.metrics.run : this.metrics.walk,
      steps = Math.max(
        1,
        Math.ceil(dt * 120),
        Math.ceil((dt * speed * Math.min(1, norm)) / (this.metrics.radius * 0.5))
      ),
      h = dt / steps;
    let traveled = 0;
    for (let i = 0; i < steps; i++) {
      const wasGrounded = this.grounded,
        old = { ...this.position };
      this.velocityY -= this.metrics.gravity * h;
      let nextY = old.y + this.velocityY * h;
      const canMove = (x: number, z: number) => {
        const p = { x, z },
          floor = this.ground(p);
        if (
          x < this.metrics.radius ||
          z < this.metrics.radius ||
          x > this.plan.parameters.width - this.metrics.radius ||
          z > this.plan.parameters.depth - this.metrics.radius
        )
          return false;
        if (floor > old.y + (this.grounded ? this.metrics.step : 0) + 0.03) return false;
        for (const b of this.boxes) {
          if (!b.collision || this.bridgeBoxes.has(b.id) || !this.overlap(p, b)) continue;
          const bottom = b.elevation ?? this.ground(b.center),
            top = bottom + b.sizeY;
          if (
            top <= old.y + (this.grounded ? this.metrics.step : 0) + 0.01 ||
            bottom >= Math.max(old.y, nextY) + this.metrics.height
          )
            continue;
          return false;
        }
        return true;
      };
      let x = old.x + dx * speed * h,
        z = old.z + dz * speed * h;
      if (!canMove(x, z)) {
        this.blocked++;
        if (canMove(x, old.z)) z = old.z;
        else if (canMove(old.x, z)) x = old.x;
        else {
          x = old.x;
          z = old.z;
        }
      }
      let floor = this.ground({ x, z });
      for (const b of this.boxes) {
        if (!b.collision || this.bridgeBoxes.has(b.id) || !this.overlap({ x, z }, b)) continue;
        const bottom = b.elevation ?? this.ground(b.center),
          top = bottom + b.sizeY;
        if (top <= old.y + (this.grounded ? this.metrics.step : 0) + 0.01) floor = Math.max(floor, top);
        if (
          this.velocityY > 0 &&
          old.y + this.metrics.height <= bottom + 0.01 &&
          nextY + this.metrics.height >= bottom
        ) {
          nextY = bottom - this.metrics.height;
          this.velocityY = 0;
        }
      }
      // A grounded controller follows a continuous descending surface within its step allowance.
      // Jumps and drops exceeding that allowance remain ballistic under the same gravity.
      if (wasGrounded && this.velocityY <= 0 && old.y - floor <= this.metrics.step && nextY > floor) nextY = floor;
      this.grounded = nextY <= floor;
      if (this.grounded) {
        nextY = floor;
        this.velocityY = 0;
        if (this.jumpStart) {
          this.lastJumpHeight = this.apex - this.jumpStart.y;
          this.lastJumpDistance = Math.hypot(x - this.jumpStart.x, z - this.jumpStart.z);
          this.jumpStart = null;
        }
      }
      this.position = { x, y: nextY, z };
      this.apex = Math.max(this.apex, nextY);
      traveled += Math.hypot(x - old.x, z - old.z);
    }
    this.distance += traveled;
    this.elapsed += dt;
    this.speed = dt ? traveled / dt : 0;
  }
  /** Export measured outcomes separately from configured inputs. */
  report() {
    return {
      metrics: { ...this.metrics },
      position: { ...this.position },
      elapsedSeconds: this.elapsed,
      distanceM: this.distance,
      speedMps: this.speed,
      blockedSubsteps: this.blocked,
      jumps: this.jumps,
      lastJumpHeightM: this.lastJumpHeight,
      lastJumpDistanceM: this.lastJumpDistance,
      grounded: this.grounded
    };
  }
}
