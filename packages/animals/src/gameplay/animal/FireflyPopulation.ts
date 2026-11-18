import type { AnimalSystem, AnimalAgent } from "./AnimalSystem";

/** Authored ambient-animal settings; independent of the animated bird quota. */
export interface FireflySettings {
  enabled: boolean;
  maximumCount: number;
  radius: number;
  speed: number;
  intensity: number;
}

export const DEFAULT_FIREFLY_SETTINGS: Readonly<FireflySettings> = Object.freeze({
  enabled: true,
  maximumCount: 96,
  radius: 48,
  speed: 0.65,
  intensity: 1
});

export function validateFireflySettings(settings: FireflySettings): void {
  if (
    typeof settings.enabled !== "boolean" ||
    !Number.isSafeInteger(settings.maximumCount) ||
    settings.maximumCount < 0 ||
    settings.maximumCount > 256
  )
    throw new Error("Firefly count must be an integer between 0 and 256");
  for (const [key, min, max] of [
    ["radius", 8, 96],
    ["speed", 0, 3],
    ["intensity", 0, 5]
  ] as const) {
    const value = settings[key];
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error(`Firefly ${key} must be within ${min}–${max}`);
  }
}

export interface FireflyPoint {
  x: number;
  y: number;
  z: number;
}
export interface FireflyWorld {
  readonly width: number;
  readonly depth: number;
  /** Terrain or water surface, whichever is higher; undefined means not resident. */
  surfaceHeight(x: number, z: number): number | undefined;
  canMove(from: FireflyPoint, to: FireflyPoint): boolean;
}
interface Firefly {
  key: string;
  position: FireflyPoint;
  motion: FireflyPoint;
  anchorX: number;
  anchorZ: number;
  vx: number;
  vy: number;
  vz: number;
  tx: number;
  ty: number;
  tz: number;
  random: number;
  age: number;
  countdown: number;
  floor: number;
  valid: boolean;
}
const CELL_SIZE = 24;
const PER_CELL = 8;
const RESIDENCY_REFRESH_SECONDS = 0.5;

/**
 * A bounded ambient population scheduled as one batch by the existing animal clock.
 * Logical insects have stable world-cell identities, but no Entity, Animator or GLB dependency.
 * Dormant cells are reconstructed from seed; their flight trajectories are not persisted.
 */
export class FireflyPopulation implements AnimalAgent {
  readonly instances: Float32Array;
  /** Current world-space velocities, packed in the same order as instances. */
  readonly velocities: Float32Array;
  visibility = 0;
  count = 0;
  private readonly insects: Firefly[] = [];
  private readonly proposed: FireflyPoint = { x: 0, y: 0, z: 0 };
  private readonly observer = { x: 0, z: 0 };
  private cellX = NaN;
  private cellZ = NaN;
  private residencyCountdown = 0;
  private disposed = false;

  constructor(
    private readonly system: AnimalSystem,
    readonly seed: number,
    readonly settings: Readonly<FireflySettings>,
    private readonly world: FireflyWorld
  ) {
    validateFireflySettings(settings);
    this.instances = new Float32Array(settings.maximumCount * 4);
    this.velocities = new Float32Array(settings.maximumCount * 3);
    system.register(this);
  }

  /** Called before the shared clock. Pausing the astronomical clock does not pause animal simulation. */
  prepare(seconds: number, observer: Readonly<{ x: number; z: number }>, summerNight: number): void {
    if (this.disposed) return;
    const target =
      this.settings.enabled && this.settings.maximumCount > 0
        ? Math.min(1, Math.max(0, Number.isFinite(summerNight) ? summerNight : 0))
        : 0;
    const change = seconds * (target > this.visibility ? 0.2 : 0.3);
    this.visibility += Math.max(-change, Math.min(change, target - this.visibility));
    this.observer.x = observer.x;
    this.observer.z = observer.z;
    if (this.visibility > 0) {
      this.residencyCountdown -= seconds;
      const x = Math.floor(observer.x / CELL_SIZE),
        z = Math.floor(observer.z / CELL_SIZE);
      if (x !== this.cellX || z !== this.cellZ || this.residencyCountdown <= 0) {
        this.cellX = x;
        this.cellZ = z;
        this.refreshCells();
        this.residencyCountdown = RESIDENCY_REFRESH_SECONDS;
      }
    }
    this.system.setMoving(this, this.visibility > 0 && this.insects.length > 0);
  }

  /** Invalidate residency after a terrain/water publication, retaining valid world-space individuals. */
  refreshWorld(): void {
    this.cellX = this.cellZ = NaN;
  }

  evaluateBehavior(): void {
    /* Local wandering is integrated in the shared bounded motion step. */
  }

  advanceMotion(seconds: number): void {
    const next = this.proposed;
    const speed = this.settings.speed;
    const blend = 1 - Math.pow(0.05, seconds);
    for (const insect of this.insects) {
      insect.motion.x = insect.motion.y = insect.motion.z = 0;
      insect.age += seconds;
      insect.countdown -= seconds;
      const p = insect.position;
      if (insect.countdown <= 0) {
        insect.countdown = 0.05 + this.random(insect) * 0.15;
        const height = this.world.surfaceHeight(p.x, p.z);
        if (height === undefined || !Number.isFinite(height)) {
          insect.valid = false;
          insect.age = 0;
          continue;
        }
        insect.valid = true;
        insect.floor = height;
        const angle = this.random(insect) * Math.PI * 2;
        const vertical = this.random(insect) - 0.5;
        let x = Math.cos(angle) + insect.vx * 0.5;
        let z = Math.sin(angle) + insect.vz * 0.5;
        // A soft home range keeps world-cell residency bounded without moving insects with the camera.
        x += (insect.anchorX - p.x) * 0.12;
        z += (insect.anchorZ - p.z) * 0.12;
        const y = vertical + Math.max(-0.6, Math.min(0.6, (height + 1.8 - p.y) * 0.6));
        const inverse = 1 / Math.max(0.001, Math.hypot(x, y, z));
        insect.tx = x * inverse * speed;
        insect.ty = y * inverse * speed;
        insect.tz = z * inverse * speed;
      }
      if (!insect.valid) continue;
      insect.vx += (insect.tx - insect.vx) * blend;
      insect.vy += (insect.ty - insect.vy) * blend;
      insect.vz += (insect.tz - insect.vz) * blend;
      next.x = p.x + insect.vx * seconds;
      next.y = Math.max(insect.floor + 0.5, p.y + insect.vy * seconds);
      next.z = p.z + insect.vz * seconds;
      if (this.world.canMove(p, next)) {
        const inverseStep = seconds > 0 ? 1 / seconds : 0;
        insect.motion.x = (next.x - p.x) * inverseStep;
        insect.motion.y = (next.y - p.y) * inverseStep;
        insect.motion.z = (next.z - p.z) * inverseStep;
        p.x = next.x;
        p.y = next.y;
        p.z = next.z;
      } else {
        insect.vx *= -0.5;
        insect.vz *= -0.5;
        insect.tx = insect.vx;
        insect.tz = insect.vz;
        insect.countdown = 0;
      }
    }
  }

  /** Pack one shared GPU stream after simulation. Alpha is residency fade, not a periodic blink. */
  pack(): void {
    // Retain residency for dusk, but do no per-insect packing once fully faded.
    if (this.visibility <= 0) {
      this.count = 0;
      return;
    }
    let count = 0;
    const radius = this.settings.radius;
    for (const insect of this.insects) {
      if (!insect.valid) continue;
      const p = insect.position;
      const distance = Math.hypot(p.x - this.observer.x, p.z - this.observer.z);
      const weight = Math.min(1, Math.max(0, (radius - distance) / 8)) * Math.min(1, insect.age * 2);
      if (weight <= 0) continue;
      const offset = count++ * 4;
      this.instances[offset] = p.x;
      this.instances[offset + 1] = p.y;
      this.instances[offset + 2] = p.z;
      this.instances[offset + 3] = weight * this.visibility;
      const motionOffset = (count - 1) * 3;
      this.velocities[motionOffset] = insect.motion.x;
      this.velocities[motionOffset + 1] = insect.motion.y;
      this.velocities[motionOffset + 2] = insect.motion.z;
    }
    this.count = count;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.system.remove(this);
    this.insects.length = 0;
    this.count = 0;
  }

  private refreshCells(): void {
    const radius = this.settings.radius;
    for (let i = this.insects.length - 1; i >= 0; i--) {
      const insect = this.insects[i],
        p = insect.position;
      const height = this.world.surfaceHeight(p.x, p.z);
      if (
        // Reclaim only fully faded individuals, using the same world position
        // and radius as pack(). Invisible history must not exhaust the budget.
        Math.hypot(p.x - this.observer.x, p.z - this.observer.z) >= radius ||
        height === undefined ||
        !Number.isFinite(height) ||
        !this.world.canMove(p, p)
      )
        this.insects.splice(i, 1);
    }
    // No candidate allocations or sorting when every slot is still resident.
    if (this.insects.length >= this.settings.maximumCount) return;
    const occupied = new Set(this.insects.map((insect) => insect.key));
    const extent = Math.ceil(radius / CELL_SIZE);
    const cells: { x: number; z: number; distance: number }[] = [];
    for (let z = this.cellZ - extent; z <= this.cellZ + extent; z++) {
      for (let x = this.cellX - extent; x <= this.cellX + extent; x++) {
        const cx = (x + 0.5) * CELL_SIZE,
          cz = (z + 0.5) * CELL_SIZE;
        if (cx < 0 || cz < 0 || cx > this.world.width || cz > this.world.depth) continue;
        const distance = Math.hypot(cx - this.observer.x, cz - this.observer.z);
        if (distance <= radius + CELL_SIZE / 2) cells.push({ x, z, distance });
      }
    }
    cells.sort((a, b) => a.distance - b.distance || a.z - b.z || a.x - b.x);
    for (const cell of cells)
      for (let index = 0; index < PER_CELL; index++) {
        if (this.insects.length >= this.settings.maximumCount) return;
        const key = `${cell.x}:${cell.z}:${index}`;
        if (occupied.has(key)) continue;
        const insect: Firefly = {
          key,
          position: { x: 0, y: 0, z: 0 },
          motion: { x: 0, y: 0, z: 0 },
          anchorX: 0,
          anchorZ: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          tx: 0,
          ty: 0,
          tz: 0,
          random:
            this.seed ^ Math.imul(cell.x, 73856093) ^ Math.imul(cell.z, 19349663) ^ Math.imul(index + 1, 83492791),
          age: 0,
          countdown: 0,
          floor: 0,
          valid: true
        };
        const x = (cell.x + 0.1 + this.random(insect) * 0.8) * CELL_SIZE;
        const z = (cell.z + 0.1 + this.random(insect) * 0.8) * CELL_SIZE;
        // A cell can straddle the visibility boundary. Do not refill free slots
        // with births that are already outside it, especially for small budgets.
        if (Math.hypot(x - this.observer.x, z - this.observer.z) >= radius) continue;
        const height = this.world.surfaceHeight(x, z);
        if (height === undefined || !Number.isFinite(height)) continue;
        insect.position.x = insect.anchorX = x;
        insect.position.z = insect.anchorZ = z;
        insect.position.y = height + 1 + this.random(insect);
        insect.floor = height;
        if (this.world.canMove(insect.position, insect.position)) this.insects.push(insect);
      }
  }

  private random(insect: Firefly): number {
    insect.random = (insect.random + 0x6d2b79f5) | 0;
    let n = Math.imul(insect.random ^ (insect.random >>> 15), insect.random | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  }
}
