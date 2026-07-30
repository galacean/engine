import { Vector3 } from "@galacean/engine-math";
import { Buffer } from "../graphic/Buffer";
import { BufferReadback } from "../graphic/BufferReadback";
import { ParticleBufferUtils } from "./ParticleBufferUtils";
import type { ParticleGenerator } from "./ParticleGenerator";
import type { ParticleTransformFeedbackSimulator } from "./ParticleTransformFeedbackSimulator";
import type { ParticleSubEmitterCommand } from "./modules/SubEmittersModule";

class ParticleTrajectoryReadbackSlot {
  request: BufferReadback | null = null;
  firstElement = 0;
  elementCount = 0;
  particleCount = 0;
  floatStride = 0;
  readonly commands: ParticleSubEmitterCommand[] = [];
}

/**
 * Owns asynchronous particle trajectory readback resources and command delivery.
 * @internal
 */
export class ParticleTrajectoryReadback {
  private readonly _position = new Vector3();
  private readonly _velocity = new Vector3();
  private _data: Float32Array | null = null;
  private _pendingSlot: ParticleTrajectoryReadbackSlot | null = null;
  private _queue: ParticleTrajectoryReadbackSlot[] = [];
  private _spareSlot: ParticleTrajectoryReadbackSlot | null = null;

  constructor(private readonly _owner: ParticleGenerator) {}

  getCommands(firstElement: number, particleCount: number): ParticleSubEmitterCommand[] {
    let slot = this._pendingSlot;
    if (!slot) {
      slot = this._pendingSlot = this._spareSlot ?? new ParticleTrajectoryReadbackSlot();
      this._spareSlot = null;
      slot.firstElement = firstElement;
      slot.particleCount = particleCount;
    }
    return slot.commands;
  }

  submit(simulator: ParticleTransformFeedbackSimulator): void {
    const slot = this._pendingSlot;
    if (!slot) {
      return;
    }

    const commands = slot.commands;
    if (commands.length === 0) {
      this._pendingSlot = null;
      this._recycleSlot(slot);
      return;
    }

    const particleCount = slot.particleCount;
    const rangeOrigin = slot.firstElement;
    let firstOffset = particleCount;
    let endOffset = 0;
    for (let i = 0, n = commands.length; i < n; i++) {
      const offset = ParticleTrajectoryReadback._getRingDistance(rangeOrigin, commands[i].ringIndex, particleCount);
      firstOffset = Math.min(firstOffset, offset);
      endOffset = Math.max(endOffset, offset + 1);
    }
    slot.firstElement = (rangeOrigin + firstOffset) % particleCount;
    slot.elementCount = endOffset - firstOffset;
    slot.floatStride = simulator.vertexStride / 4;

    const byteLength = slot.elementCount * simulator.vertexStride;
    let request = slot.request;
    if (!request || request.byteLength < byteLength) {
      request?.destroy();
      slot.request = null;
      request = slot.request = new BufferReadback(this._owner._renderer.engine, byteLength);
    }

    this._copyRange(simulator.readBinding.buffer, request, slot, simulator.vertexStride);
    request.submit();
    this._queue.push(slot);
    this._pendingSlot = null;
  }

  process(): void {
    const queue = this._queue;
    while (queue.length > 0) {
      const slot = queue[0];
      const request = slot.request!;
      if (!request.isReady()) {
        return;
      }

      this._consume(slot);
      queue.shift();
      this._recycleSlot(slot);
    }
  }

  cancel(): void {
    const pendingSlot = this._pendingSlot;
    if (pendingSlot) {
      this._pendingSlot = null;
      this._releaseAndRecycleSlot(pendingSlot);
    }
    const queue = this._queue;
    for (let i = 0, n = queue.length; i < n; i++) {
      this._releaseAndRecycleSlot(queue[i]);
    }
    queue.length = 0;
  }

  destroy(): void {
    this.cancel();
    const spareSlot = this._spareSlot;
    if (spareSlot) {
      spareSlot.request?.destroy();
      spareSlot.request = null;
      this._spareSlot = null;
    }
    this._data = null;
  }

  private _consume(slot: ParticleTrajectoryReadbackSlot): void {
    const request = slot.request!;
    const totalFloatCount = slot.elementCount * slot.floatStride;
    let data = this._data;
    if (!data || data.length < totalFloatCount) {
      data = this._data = new Float32Array(totalFloatCount);
    }
    request.getData(data, 0, 0, totalFloatCount);

    const position = this._position;
    const velocity = this._velocity;
    const commands = slot.commands;
    const manager = this._owner._renderer._particleSystemManager;
    let lastRingIndex = -1;
    for (let i = 0, n = commands.length; i < n; i++) {
      const command = commands[i];
      if (command.target._renderer.destroyed) {
        command.release();
        continue;
      }

      const ringIndex = command.ringIndex;
      if (ringIndex !== lastRingIndex) {
        const feedbackOffset =
          ParticleTrajectoryReadback._getRingDistance(slot.firstElement, ringIndex, slot.particleCount) *
          slot.floatStride;
        const positionOffset = feedbackOffset + ParticleBufferUtils.feedbackWorldPositionOffset;
        const velocityOffset = feedbackOffset + ParticleBufferUtils.feedbackTrajectoryVelocityOffset;
        position.set(data[positionOffset], data[positionOffset + 1], data[positionOffset + 2]);
        velocity.set(data[velocityOffset], data[velocityOffset + 1], data[velocityOffset + 2]);
        lastRingIndex = ringIndex;
      }

      command.resolveTrajectory(position, velocity);
      const target = command.target;
      if (manager && target._renderer._particleSystemManager === manager) {
        target._incomingSubEmitterCommands.push(command);
      } else {
        command.cancel();
      }
    }
    commands.length = 0;
  }

  private _copyRange(
    source: Buffer,
    destination: BufferReadback,
    slot: ParticleTrajectoryReadbackSlot,
    stride: number
  ): void {
    const firstSegmentCount = Math.min(slot.elementCount, slot.particleCount - slot.firstElement);
    destination.copyFromBuffer(source, slot.firstElement * stride, 0, firstSegmentCount * stride);
    const secondSegmentCount = slot.elementCount - firstSegmentCount;
    if (secondSegmentCount > 0) {
      destination.copyFromBuffer(source, 0, firstSegmentCount * stride, secondSegmentCount * stride);
    }
  }

  private _releaseAndRecycleSlot(slot: ParticleTrajectoryReadbackSlot): void {
    const commands = slot.commands;
    for (let i = 0, n = commands.length; i < n; i++) {
      commands[i].release();
    }
    commands.length = 0;
    this._recycleSlot(slot);
  }

  private _recycleSlot(slot: ParticleTrajectoryReadbackSlot): void {
    slot.request?.reset();
    const spareSlot = this._spareSlot;
    if (spareSlot) {
      spareSlot.request?.destroy();
      spareSlot.request = null;
    }
    this._spareSlot = slot;
  }

  private static _getRingDistance(firstElement: number, endElement: number, particleCount: number): number {
    return endElement >= firstElement ? endElement - firstElement : particleCount - firstElement + endElement;
  }
}
