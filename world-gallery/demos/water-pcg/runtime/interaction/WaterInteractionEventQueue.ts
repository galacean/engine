export enum WaterInteractionEventKind {
  Entry = 0,
  MotionTrail = 1,
  Impact = 2,
  Rain = 3
}

export interface WaterInteractionEventInput {
  readonly emitterId: number;
  readonly kind: WaterInteractionEventKind;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly velocityZ: number;
  readonly radius: number;
  readonly strength: number;
  readonly time: number;
  readonly priority: number;
}

/** Caller-owned event populated by {@link WaterInteractionEventQueue.read}. */
export interface WaterInteractionEvent {
  emitterId: number;
  kind: WaterInteractionEventKind;
  worldX: number;
  worldY: number;
  worldZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  radius: number;
  strength: number;
  time: number;
  priority: number;
}

export interface WaterInteractionEventQueueMetrics {
  readonly acceptedCount: number;
  readonly droppedCount: number;
  readonly overflowCount: number;
  readonly replacedCount: number;
  readonly aggregatedCount: number;
  readonly stationaryRejectedCount: number;
  readonly emitterOverflowCount: number;
  readonly consumedCount: number;
  readonly peakCount: number;
  readonly entryAcceptedCount: number;
  readonly motionTrailAcceptedCount: number;
  readonly impactAcceptedCount: number;
  readonly rainAcceptedCount: number;
}

interface MutableWaterInteractionEventQueueMetrics {
  acceptedCount: number;
  droppedCount: number;
  overflowCount: number;
  replacedCount: number;
  aggregatedCount: number;
  stationaryRejectedCount: number;
  emitterOverflowCount: number;
  consumedCount: number;
  peakCount: number;
  entryAcceptedCount: number;
  motionTrailAcceptedCount: number;
  impactAcceptedCount: number;
  rainAcceptedCount: number;
}

export interface WaterInteractionEventConsumer {
  /** Consume synchronously; the queue remains valid only until this drain completes. */
  consumeInteractionEvent(queue: WaterInteractionEventQueue, index: number): void;
}

function validateCapacity(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
}

function isFiniteInput(input: WaterInteractionEventInput): boolean {
  return (
    Number.isInteger(input.emitterId) &&
    input.emitterId >= 0 &&
    input.emitterId <= 0x7fffffff &&
    Number.isInteger(input.kind) &&
    input.kind >= WaterInteractionEventKind.Entry &&
    input.kind <= WaterInteractionEventKind.Rain &&
    Number.isFinite(input.worldX) &&
    Number.isFinite(input.worldY) &&
    Number.isFinite(input.worldZ) &&
    Number.isFinite(input.velocityX) &&
    Number.isFinite(input.velocityY) &&
    Number.isFinite(input.velocityZ) &&
    Number.isFinite(input.radius) &&
    input.radius > 0 &&
    Number.isFinite(input.strength) &&
    input.strength >= 0 &&
    Number.isFinite(input.time) &&
    Number.isFinite(input.priority)
  );
}

export function createWaterInteractionEvent(): WaterInteractionEvent {
  return {
    emitterId: -1,
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
}

/** Bounded structure-of-arrays queue with deterministic priority overflow and per-emitter trail aggregation. */
export class WaterInteractionEventQueue {
  readonly capacity: number;
  readonly emitterCapacity: number;
  readonly metrics: WaterInteractionEventQueueMetrics;

  private readonly _mutableMetrics: MutableWaterInteractionEventQueueMetrics = {
    acceptedCount: 0,
    droppedCount: 0,
    overflowCount: 0,
    replacedCount: 0,
    aggregatedCount: 0,
    stationaryRejectedCount: 0,
    emitterOverflowCount: 0,
    consumedCount: 0,
    peakCount: 0,
    entryAcceptedCount: 0,
    motionTrailAcceptedCount: 0,
    impactAcceptedCount: 0,
    rainAcceptedCount: 0
  };
  private readonly _emitterIds: Int32Array;
  private readonly _kinds: Uint8Array;
  private readonly _worldX: Float32Array;
  private readonly _worldY: Float32Array;
  private readonly _worldZ: Float32Array;
  private readonly _velocityX: Float32Array;
  private readonly _velocityY: Float32Array;
  private readonly _velocityZ: Float32Array;
  private readonly _radius: Float32Array;
  private readonly _strength: Float32Array;
  private readonly _time: Float64Array;
  private readonly _priority: Float32Array;
  private readonly _trailEmitterIds: Int32Array;
  private readonly _trailWorldX: Float32Array;
  private readonly _trailWorldZ: Float32Array;
  private readonly _trailLastSeenTime: Float64Array;
  private _count = 0;

  constructor(capacity: number, emitterCapacity = capacity) {
    validateCapacity("Water interaction event capacity", capacity);
    validateCapacity("Water interaction emitter capacity", emitterCapacity);
    this.capacity = capacity;
    this.emitterCapacity = emitterCapacity;
    this.metrics = this._mutableMetrics;
    this._emitterIds = new Int32Array(capacity);
    this._kinds = new Uint8Array(capacity);
    this._worldX = new Float32Array(capacity);
    this._worldY = new Float32Array(capacity);
    this._worldZ = new Float32Array(capacity);
    this._velocityX = new Float32Array(capacity);
    this._velocityY = new Float32Array(capacity);
    this._velocityZ = new Float32Array(capacity);
    this._radius = new Float32Array(capacity);
    this._strength = new Float32Array(capacity);
    this._time = new Float64Array(capacity);
    this._priority = new Float32Array(capacity);
    this._trailEmitterIds = new Int32Array(emitterCapacity);
    this._trailWorldX = new Float32Array(emitterCapacity);
    this._trailWorldZ = new Float32Array(emitterCapacity);
    this._trailLastSeenTime = new Float64Array(emitterCapacity);
    this._trailEmitterIds.fill(-1);
  }

  get count(): number {
    return this._count;
  }

  enqueue(input: WaterInteractionEventInput): boolean {
    if (!isFiniteInput(input)) return false;
    const slot = this._reserveSlot(input.priority);
    if (slot < 0) return false;
    this._write(slot, input);
    const metrics = this._mutableMetrics;
    metrics.acceptedCount++;
    metrics.peakCount = Math.max(metrics.peakCount, this._count);
    switch (input.kind) {
      case WaterInteractionEventKind.Entry:
        metrics.entryAcceptedCount++;
        break;
      case WaterInteractionEventKind.MotionTrail:
        metrics.motionTrailAcceptedCount++;
        break;
      case WaterInteractionEventKind.Impact:
        metrics.impactAcceptedCount++;
        break;
      case WaterInteractionEventKind.Rain:
        metrics.rainAcceptedCount++;
        break;
    }
    return true;
  }

  enqueueMotionTrail(
    input: WaterInteractionEventInput,
    minimumDistance: number,
    minimumHorizontalSpeed: number
  ): boolean {
    if (
      input.kind !== WaterInteractionEventKind.MotionTrail ||
      !isFiniteInput(input) ||
      !Number.isFinite(minimumDistance) ||
      minimumDistance < 0 ||
      !Number.isFinite(minimumHorizontalSpeed) ||
      minimumHorizontalSpeed < 0
    ) {
      return false;
    }

    const firstMovingSample = this._findEmitterSlot(input.emitterId) < 0;
    const emitterSlot = this._resolveEmitterSlot(input.emitterId, input.worldX, input.worldZ, input.time);
    const horizontalSpeed = Math.hypot(input.velocityX, input.velocityZ);
    if (horizontalSpeed < minimumHorizontalSpeed) {
      this._trailWorldX[emitterSlot] = input.worldX;
      this._trailWorldZ[emitterSlot] = input.worldZ;
      this._mutableMetrics.stationaryRejectedCount++;
      return false;
    }

    const distance = Math.hypot(
      input.worldX - this._trailWorldX[emitterSlot],
      input.worldZ - this._trailWorldZ[emitterSlot]
    );
    if (!firstMovingSample && distance < minimumDistance) {
      this._mutableMetrics.aggregatedCount++;
      return false;
    }

    const accepted = this.enqueue(input);
    if (accepted) {
      this._trailWorldX[emitterSlot] = input.worldX;
      this._trailWorldZ[emitterSlot] = input.worldZ;
    }
    return accepted;
  }

  read(index: number, outEvent: WaterInteractionEvent): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this._count) return false;
    outEvent.emitterId = this._emitterIds[index];
    outEvent.kind = this._kinds[index] as WaterInteractionEventKind;
    outEvent.worldX = this._worldX[index];
    outEvent.worldY = this._worldY[index];
    outEvent.worldZ = this._worldZ[index];
    outEvent.velocityX = this._velocityX[index];
    outEvent.velocityY = this._velocityY[index];
    outEvent.velocityZ = this._velocityZ[index];
    outEvent.radius = this._radius[index];
    outEvent.strength = this._strength[index];
    outEvent.time = this._time[index];
    outEvent.priority = this._priority[index];
    return true;
  }

  drain(consumer: WaterInteractionEventConsumer): void {
    const count = this._count;
    for (let index = 0; index < count; index++) consumer.consumeInteractionEvent(this, index);
    this._count = 0;
    this._mutableMetrics.consumedCount += count;
  }

  clearEvents(): void {
    this._count = 0;
  }

  deactivateEmitter(emitterId: number): boolean {
    const index = this._findEmitterSlot(emitterId);
    if (index < 0) return false;
    this._trailEmitterIds[index] = -1;
    this._trailWorldX[index] = 0;
    this._trailWorldZ[index] = 0;
    this._trailLastSeenTime[index] = 0;
    return true;
  }

  reset(): void {
    this._count = 0;
    this._trailEmitterIds.fill(-1);
    this._trailWorldX.fill(0);
    this._trailWorldZ.fill(0);
    this._trailLastSeenTime.fill(0);
    for (const key of Object.keys(this._mutableMetrics) as Array<keyof MutableWaterInteractionEventQueueMetrics>) {
      this._mutableMetrics[key] = 0;
    }
  }

  private _reserveSlot(priority: number): number {
    if (this._count < this.capacity) return this._count++;
    const metrics = this._mutableMetrics;
    metrics.overflowCount++;
    let weakestIndex = 0;
    let weakestPriority = this._priority[0];
    for (let index = 1; index < this.capacity; index++) {
      const candidatePriority = this._priority[index];
      if (candidatePriority < weakestPriority) {
        weakestIndex = index;
        weakestPriority = candidatePriority;
      }
    }
    metrics.droppedCount++;
    if (priority <= weakestPriority) return -1;
    metrics.replacedCount++;
    return weakestIndex;
  }

  private _write(slot: number, input: WaterInteractionEventInput): void {
    this._emitterIds[slot] = input.emitterId;
    this._kinds[slot] = input.kind;
    this._worldX[slot] = input.worldX;
    this._worldY[slot] = input.worldY;
    this._worldZ[slot] = input.worldZ;
    this._velocityX[slot] = input.velocityX;
    this._velocityY[slot] = input.velocityY;
    this._velocityZ[slot] = input.velocityZ;
    this._radius[slot] = input.radius;
    this._strength[slot] = input.strength;
    this._time[slot] = input.time;
    this._priority[slot] = input.priority;
  }

  private _findEmitterSlot(emitterId: number): number {
    for (let index = 0; index < this.emitterCapacity; index++) {
      if (this._trailEmitterIds[index] === emitterId) return index;
    }
    return -1;
  }

  private _resolveEmitterSlot(emitterId: number, worldX: number, worldZ: number, time: number): number {
    const existing = this._findEmitterSlot(emitterId);
    if (existing >= 0) {
      this._trailLastSeenTime[existing] = time;
      return existing;
    }

    let slot = this._trailEmitterIds.indexOf(-1);
    if (slot < 0) {
      slot = 0;
      let oldestTime = this._trailLastSeenTime[0];
      for (let index = 1; index < this.emitterCapacity; index++) {
        if (this._trailLastSeenTime[index] < oldestTime) {
          slot = index;
          oldestTime = this._trailLastSeenTime[index];
        }
      }
      this._mutableMetrics.emitterOverflowCount++;
    }
    this._trailEmitterIds[slot] = emitterId;
    this._trailWorldX[slot] = worldX;
    this._trailWorldZ[slot] = worldZ;
    this._trailLastSeenTime[slot] = time;
    return slot;
  }
}
