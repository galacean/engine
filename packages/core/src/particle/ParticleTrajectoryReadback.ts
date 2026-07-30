import { Vector3 } from "@galacean/engine-math";
import { Buffer } from "../graphic/Buffer";
import { BufferReadback } from "../graphic/BufferReadback";
import { ParticleBufferUtils } from "./ParticleBufferUtils";
import type { ParticleGenerator } from "./ParticleGenerator";
import type { ParticleTransformFeedbackSimulator } from "./ParticleTransformFeedbackSimulator";
import type { ParticleSubEmitterCommand } from "./modules/SubEmittersModule";

class ParticleTrajectoryReadbackBatch {
  request: BufferReadback | null = null;
  ringOrigin = 0;
  readbackElementCount = 0;
  ringCapacity = 0;
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
  private _pendingBatch: ParticleTrajectoryReadbackBatch | null = null;
  private _queue: ParticleTrajectoryReadbackBatch[] = [];
  private _spareBatch: ParticleTrajectoryReadbackBatch | null = null;

  constructor(private readonly _owner: ParticleGenerator) {}

  getCommands(ringOrigin: number, ringCapacity: number): ParticleSubEmitterCommand[] {
    let batch = this._pendingBatch;
    if (!batch) {
      batch = this._pendingBatch = this._spareBatch ?? new ParticleTrajectoryReadbackBatch();
      this._spareBatch = null;
      batch.ringOrigin = ringOrigin;
      batch.ringCapacity = ringCapacity;
    }
    return batch.commands;
  }

  submit(simulator: ParticleTransformFeedbackSimulator): void {
    const batch = this._pendingBatch;
    if (!batch) {
      return;
    }

    const commands = batch.commands;
    if (commands.length === 0) {
      this._pendingBatch = null;
      this._recycleBatch(batch);
      return;
    }

    const ringCapacity = batch.ringCapacity;
    const ringOrigin = batch.ringOrigin;
    let firstOffset = ringCapacity;
    let endOffset = 0;
    for (let i = 0, n = commands.length; i < n; i++) {
      const offset = ParticleTrajectoryReadback._getRingDistance(ringOrigin, commands[i].ringIndex, ringCapacity);
      firstOffset = Math.min(firstOffset, offset);
      endOffset = Math.max(endOffset, offset + 1);
    }
    batch.ringOrigin = (ringOrigin + firstOffset) % ringCapacity;
    batch.readbackElementCount = endOffset - firstOffset;

    const byteLength = batch.readbackElementCount * simulator.vertexStride;
    let request = batch.request;
    if (!request || request.byteLength < byteLength) {
      request?.destroy();
      batch.request = null;
      request = batch.request = new BufferReadback(this._owner._renderer.engine, byteLength);
    }

    this._copyRange(simulator.readBinding.buffer, request, batch, simulator.vertexStride);
    request.submit();
    this._queue.push(batch);
    this._pendingBatch = null;
  }

  process(): void {
    const queue = this._queue;
    while (queue.length > 0) {
      const batch = queue[0];
      const request = batch.request!;
      if (!request.isReady()) {
        return;
      }

      this._consume(batch);
      queue.shift();
      this._recycleBatch(batch);
    }
  }

  cancel(): void {
    const pendingBatch = this._pendingBatch;
    if (pendingBatch) {
      this._pendingBatch = null;
      this._releaseAndRecycleBatch(pendingBatch);
    }
    const queue = this._queue;
    for (let i = 0, n = queue.length; i < n; i++) {
      this._releaseAndRecycleBatch(queue[i]);
    }
    queue.length = 0;
  }

  destroy(): void {
    this.cancel();
    const spareBatch = this._spareBatch;
    if (spareBatch) {
      spareBatch.request?.destroy();
      spareBatch.request = null;
      this._spareBatch = null;
    }
    this._data = null;
  }

  private _consume(batch: ParticleTrajectoryReadbackBatch): void {
    const request = batch.request!;
    const floatStride = ParticleBufferUtils.feedbackTrajectoryStateVertexStride / Float32Array.BYTES_PER_ELEMENT;
    const totalFloatCount = batch.readbackElementCount * floatStride;
    let data = this._data;
    if (!data || data.length < totalFloatCount) {
      data = this._data = new Float32Array(totalFloatCount);
    }
    request.getData(data, 0, 0, totalFloatCount);

    const position = this._position;
    const velocity = this._velocity;
    const commands = batch.commands;
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
          ParticleTrajectoryReadback._getRingDistance(batch.ringOrigin, ringIndex, batch.ringCapacity) * floatStride;
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
    batch: ParticleTrajectoryReadbackBatch,
    stride: number
  ): void {
    const firstSegmentCount = Math.min(batch.readbackElementCount, batch.ringCapacity - batch.ringOrigin);
    destination.copyFromBuffer(source, batch.ringOrigin * stride, 0, firstSegmentCount * stride);
    const secondSegmentCount = batch.readbackElementCount - firstSegmentCount;
    if (secondSegmentCount > 0) {
      destination.copyFromBuffer(source, 0, firstSegmentCount * stride, secondSegmentCount * stride);
    }
  }

  private _releaseAndRecycleBatch(batch: ParticleTrajectoryReadbackBatch): void {
    const commands = batch.commands;
    for (let i = 0, n = commands.length; i < n; i++) {
      commands[i].release();
    }
    commands.length = 0;
    this._recycleBatch(batch);
  }

  private _recycleBatch(batch: ParticleTrajectoryReadbackBatch): void {
    batch.request?.reset();
    const spareBatch = this._spareBatch;
    if (spareBatch) {
      spareBatch.request?.destroy();
      spareBatch.request = null;
    }
    this._spareBatch = batch;
  }

  private static _getRingDistance(ringOrigin: number, ringIndex: number, ringCapacity: number): number {
    return ringIndex >= ringOrigin ? ringIndex - ringOrigin : ringCapacity - ringOrigin + ringIndex;
  }
}
