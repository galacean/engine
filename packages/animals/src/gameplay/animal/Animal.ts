import { BehaviorTree, type BehaviorAction, type BehaviorNode, type BehaviorStatus } from "../behavior/BehaviorTree";
import type { AnimalSystem } from "./AnimalSystem";

/** Semantic motions, independent of meshes, bones and animation clip names. */
export type AnimalAction = "rest" | "walk" | "run" | "takeOff" | "fly" | "land";

/** Movement capability and autonomous behavior authored in metres and seconds. */
export interface AnimalDefinition {
  readonly id: string;
  readonly ground: { readonly walkSpeed: number; readonly runSpeed: number; readonly turnRate: number };
  readonly flight?: { readonly speed: number; readonly height: number; readonly turnRate: number };
  readonly acceleration: number;
  readonly strideLength: number;
  readonly behavior: BehaviorNode;
}

/** Reused live motion output. Presentation reads it without allocating per-frame snapshots. */
export interface AnimalMotion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly bank: number;
  readonly speed: number;
  readonly phase: number;
  readonly action: AnimalAction;
  readonly actionTime: number;
  readonly grounded: boolean;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetZ: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface Task {
  action: AnimalAction;
  duration: number;
  cancelDeadline?: () => void;
  status: BehaviorStatus;
  wake: () => void;
}

/** A flat, circular host-owned roaming area; no terrain or Seed dependency. */
export interface AnimalRoamingArea {
  readonly radius: number;
}

/**
 * One independently seeded animal. Its behavior tree chooses tasks; motion advances tasks,
 * and only task completion queues a tree wake through AnimalSystem. Renderers never own movement or behavior state.
 */
export class Animal {
  private readonly _tree: BehaviorTree<Animal>;
  private readonly _motion: Mutable<AnimalMotion>;
  private readonly _counts: Record<AnimalAction, number> = { rest: 0, walk: 0, run: 0, takeOff: 0, fly: 0, land: 0 };
  private _random: number;
  private _task: Task | null = null;
  private _disposed = false;
  private _cycles = 0;
  private _actionStartedAt = 0;

  /**
   * Internal construction; use AnimalSystem.createAnimal to register and schedule the animal.
   * @param definition Capability and behavior configuration; treated as immutable.
   * @param seed Nonzero deterministic random seed, independent from other animals.
   * @param area Flat circular roaming area centred on the origin, in metres.
   * @param position Initial ground position [x, z], within the roaming area.
   */
  constructor(
    readonly definition: AnimalDefinition,
    seed: number,
    private readonly area: AnimalRoamingArea,
    position: readonly [number, number],
    private readonly system: AnimalSystem
  ) {
    if (
      !Number.isFinite(area.radius) ||
      area.radius <= 0 ||
      position.some((value) => !Number.isFinite(value)) ||
      Math.hypot(...position) > area.radius
    ) {
      throw new RangeError("Animal must start inside a positive roaming radius");
    }
    this._random = seed | 0 || 1;
    this._motion = {
      x: position[0],
      y: 0,
      z: position[1],
      yaw: this._sample() * Math.PI * 2,
      pitch: 0,
      bank: 0,
      speed: 0,
      phase: this._sample() * Math.PI * 2,
      action: "rest",
      actionTime: 0,
      grounded: true,
      targetX: position[0],
      targetY: 0,
      targetZ: position[1]
    };
    const actions: Record<
      string,
      (animal: Animal, params: Record<string, unknown>, wake: () => void) => BehaviorAction
    > = {};
    for (const action of ["rest", "walk", "run", "takeOff", "fly", "land"] as const) {
      actions[action] = (animal, _, wake) => animal._createAction(action, wake);
    }
    this._tree = new BehaviorTree<Animal>(definition.behavior, {
      context: this,
      actions,
      conditions: {},
      random: () => this._sample(),
      scheduleWake: () => this.system.requestWake(this)
    });
  }

  /** Borrowed live motion; consumers must not mutate it or retain it as a historical snapshot. */
  get motion(): AnimalMotion {
    if (!this._disposed) this._motion.actionTime = this.system.time - this._actionStartedAt;
    return this._motion;
  }

  /** Number of actual task activations, useful for observing independent tree execution. */
  get actionCounts(): Readonly<Record<AnimalAction, number>> {
    return this._counts;
  }

  /** Completed root selections; the next update starts a fresh autonomous selection. */
  get completedCycles(): number {
    return this._cycles;
  }

  /** @internal Called once from the system's budgeted decision queue. */
  evaluateBehavior(): void {
    if (this._disposed) return;
    if (this._tree.status !== "running") this._tree.halt();
    if (this._tree.tick() !== "running") {
      this._cycles++;
      this.system.requestWake(this);
    }
  }

  /** @internal Only the system's active motion set invokes integration. */
  advanceMotion(seconds: number): void {
    if (!this._disposed) this._step(seconds);
  }

  /** Cancel active tasks. Borrowed definitions and host resources remain owned by the host. */
  dispose(): void {
    if (this._disposed) return;
    this._motion.actionTime = this.system.time - this._actionStartedAt;
    this._disposed = true;
    this._tree.halt();
    this.system.remove(this);
    this._task = null;
  }

  private _createAction(action: AnimalAction, wake: () => void): BehaviorAction {
    const task: Task = { action, duration: 0, status: "running", wake };
    return {
      start: () => {
        const airborne = !this._motion.grounded;
        if (
          (["takeOff", "fly", "land"].includes(action) && !this.definition.flight) ||
          ((action === "walk" || action === "run" || action === "rest" || action === "takeOff") && airborne) ||
          ((action === "fly" || action === "land") && !airborne)
        ) {
          task.status = "failure";
          return task.status;
        }
        this._task = task;
        this._motion.action = action;
        this._actionStartedAt = this.system.time;
        this._motion.actionTime = 0;
        this._counts[action]++;
        task.duration = action === "rest" ? 1.5 + this._sample() * 3.5 : 6 + this._sample() * 5;
        if (action === "walk" || action === "run") this._chooseTarget(0, 2, action === "run" ? 9 : 5);
        if (action === "takeOff") {
          this._chooseForwardTarget(4);
          this._motion.targetY = this.definition.flight!.height;
        }
        if (action === "fly") this._chooseTarget(this.definition.flight!.height, 5, 11);
        if (action === "land") {
          this._chooseForwardTarget(5);
          this._motion.targetY = 0;
        }
        if (action === "rest" || action === "fly") {
          task.cancelDeadline = this.system.schedule(task.duration, () => {
            if (this._task === task) this._finish(task);
          });
        }
        this.system.setMoving(this, action !== "rest");
        return task.status;
      },
      update: () => task.status,
      cancel: () => {
        task.cancelDeadline?.();
        if (this._task === task) {
          this._task = null;
          this.system.setMoving(this, false);
        }
      }
    };
  }

  private _step(dt: number): void {
    const task = this._task;
    if (!task) return;
    const m = this._motion;
    const dx = m.targetX - m.x,
      dz = m.targetZ - m.z;
    const distance = Math.hypot(dx, dz);
    const air = task.action === "takeOff" || task.action === "fly" || task.action === "land";
    const flight = this.definition.flight;
    const turnRate = air ? flight!.turnRate : this.definition.ground.turnRate;
    const delta = Math.atan2(Math.sin(Math.atan2(dx, dz) - m.yaw), Math.cos(Math.atan2(dx, dz) - m.yaw));
    const yawStep = Math.max(-turnRate * dt, Math.min(turnRate * dt, delta));
    m.yaw += yawStep;
    const topSpeed = air
      ? flight!.speed
      : task.action === "run"
        ? this.definition.ground.runSpeed
        : this.definition.ground.walkSpeed;
    const landing = task.action === "land";
    const braking = task.action === "fly" ? 1 : Math.min(1, distance / (air ? 2.4 : 1.5));
    const alignment = Math.max(0.12, Math.cos(delta));
    m.speed = approach(m.speed, topSpeed * braking * alignment, this.definition.acceleration * dt);
    const travel = Math.min(distance, m.speed * dt);
    m.x += Math.sin(m.yaw) * travel;
    m.z += Math.cos(m.yaw) * travel;
    // The arena is the movement support boundary, independent of decorative geometry.
    const radius = Math.hypot(m.x, m.z);
    if (radius > this.area.radius) {
      m.x *= this.area.radius / radius;
      m.z *= this.area.radius / radius;
    }
    m.phase += (travel / this.definition.strideLength) * Math.PI * 2;
    if (air) {
      const targetHeight = landing ? Math.min(flight!.height, distance * 0.65) : m.targetY;
      const previousY = m.y;
      m.y = approach(m.y, targetHeight, (landing ? 1.5 : 2.1) * dt);
      m.grounded = false;
      const verticalSpeed = (m.y - previousY) / dt;
      m.pitch = approach(m.pitch, -Math.atan2(verticalSpeed, Math.max(0.8, m.speed)) * 0.55, dt * 2);
      m.bank = approach(m.bank, (-yawStep / dt) * 0.24, dt * 1.8);
    }
    const arrived = Math.hypot(m.targetX - m.x, m.targetZ - m.z) < 0.16;
    if (task.action === "fly") {
      if (distance < 1.6) this._chooseTarget(flight!.height + this._sample() * 1.5, 5, 11);
    } else if (task.action === "takeOff") {
      if (arrived && Math.abs(m.y - m.targetY) < 0.08) this._finish(task);
    } else if (landing) {
      if (arrived && m.y < 0.005) {
        m.y = 0;
        m.grounded = true;
        m.pitch = m.bank = m.speed = 0;
        this._finish(task);
      }
    } else if (arrived) {
      m.speed = 0;
      this._finish(task);
    }
  }

  private _finish(task: Task): void {
    task.status = "success";
    task.cancelDeadline?.();
    task.cancelDeadline = undefined;
    this.system.setMoving(this, false);
    this._task = null;
    task.wake();
  }

  private _chooseForwardTarget(distance: number): void {
    const m = this._motion;
    m.targetX = m.x + Math.sin(m.yaw) * distance;
    m.targetZ = m.z + Math.cos(m.yaw) * distance;
    const radius = Math.hypot(m.targetX, m.targetZ);
    if (radius > this.area.radius * 0.9) {
      m.targetX *= (this.area.radius * 0.9) / radius;
      m.targetZ *= (this.area.radius * 0.9) / radius;
    }
  }

  private _chooseTarget(height: number, minimum: number, maximum: number): void {
    const m = this._motion;
    const angle = this._sample() * Math.PI * 2;
    const distance = minimum + this._sample() * (maximum - minimum);
    m.targetX = m.x + Math.sin(angle) * distance;
    m.targetZ = m.z + Math.cos(angle) * distance;
    const radius = Math.hypot(m.targetX, m.targetZ);
    if (radius > this.area.radius * 0.9) {
      m.targetX *= (this.area.radius * 0.9) / radius;
      m.targetZ *= (this.area.radius * 0.9) / radius;
    }
    m.targetY = height;
  }

  private _sample(): number {
    this._random ^= this._random << 13;
    this._random ^= this._random >>> 17;
    this._random ^= this._random << 5;
    return (this._random >>> 0) / 0x100000000;
  }
}

function approach(value: number, target: number, amount: number): number {
  return value + Math.max(-amount, Math.min(amount, target - value));
}
