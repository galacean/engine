import { Vector3 } from "@galacean/engine-math";
import { Buffer } from "../graphic/Buffer";
import { BufferReadback } from "../graphic/BufferReadback";
import type { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { ParticleBufferUtils } from "./ParticleBufferUtils";
import type { ParticleGenerator } from "./ParticleGenerator";
import type { ParticleSubEmitterCommand } from "./modules/SubEmittersModule";

class ParticleTrajectoryReadbackBatch {
  readback: BufferReadback | null = null;
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
  private _inFlightBatches: ParticleTrajectoryReadbackBatch[] = [];
  private _spareBatch: ParticleTrajectoryReadbackBatch | null = null;

  constructor(private readonly _owner: ParticleGenerator) {}

  getPendingCommands(ringOrigin: number, ringCapacity: number): ParticleSubEmitterCommand[] {
    let batch = this._pendingBatch;
    if (!batch) {
      batch = this._pendingBatch = this._spareBatch ?? new ParticleTrajectoryReadbackBatch();
      this._spareBatch = null;
      batch.ringOrigin = ringOrigin;
      batch.ringCapacity = ringCapacity;
    }
    return batch.commands;
  }

  submitPending(source: VertexBufferBinding): void {
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
    const rangeOrigin = batch.ringOrigin;
    let readbackStartOffset = ringCapacity;
    let readbackEndOffset = 0;
    for (let i = 0, n = commands.length; i < n; i++) {
      const offset = ParticleTrajectoryReadback._getRingDistance(rangeOrigin, commands[i].ringIndex, ringCapacity);
      readbackStartOffset = Math.min(readbackStartOffset, offset);
      readbackEndOffset = Math.max(readbackEndOffset, offset + 1);
    }
    batch.ringOrigin = (rangeOrigin + readbackStartOffset) % ringCapacity;
    batch.readbackElementCount = readbackEndOffset - readbackStartOffset;

    const stride = source.stride;
    const byteLength = batch.readbackElementCount * stride;
    let readback = batch.readback;
    if (!readback || readback.byteLength < byteLength) {
      readback?.destroy();
      batch.readback = null;
      readback = batch.readback = new BufferReadback(this._owner._renderer.engine, byteLength);
    }

    this._copyRingRange(source.buffer, readback, batch, stride);
    readback.submit();
    this._inFlightBatches.push(batch);
    this._pendingBatch = null;
  }

  processReady(): void {
    const inFlightBatches = this._inFlightBatches;
    while (inFlightBatches.length > 0) {
      const batch = inFlightBatches[0];
      const readback = batch.readback!;
      if (!readback.isReady()) {
        return;
      }

      this._consume(batch);
      inFlightBatches.shift();
      this._recycleBatch(batch);
    }
  }

  cancel(): void {
    const pendingBatch = this._pendingBatch;
    if (pendingBatch) {
      this._pendingBatch = null;
      this._releaseAndRecycleBatch(pendingBatch);
    }
    const inFlightBatches = this._inFlightBatches;
    for (let i = 0, n = inFlightBatches.length; i < n; i++) {
      this._releaseAndRecycleBatch(inFlightBatches[i]);
    }
    inFlightBatches.length = 0;
  }

  destroy(): void {
    this.cancel();
    const spareBatch = this._spareBatch;
    if (spareBatch) {
      spareBatch.readback?.destroy();
      spareBatch.readback = null;
      this._spareBatch = null;
    }
    this._data = null;
  }

  private _consume(batch: ParticleTrajectoryReadbackBatch): void {
    const readback = batch.readback!;
    const floatStride = ParticleBufferUtils.feedbackTrajectoryStateVertexStride / Float32Array.BYTES_PER_ELEMENT;
    const totalFloatCount = batch.readbackElementCount * floatStride;
    let data = this._data;
    if (!data || data.length < totalFloatCount) {
      data = this._data = new Float32Array(totalFloatCount);
    }
    readback.getData(data, 0, 0, totalFloatCount);

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

  private _copyRingRange(
    source: Buffer,
    readback: BufferReadback,
    batch: ParticleTrajectoryReadbackBatch,
    stride: number
  ): void {
    const tailElementCount = Math.min(batch.readbackElementCount, batch.ringCapacity - batch.ringOrigin);
    readback.copyFromBuffer(source, batch.ringOrigin * stride, 0, tailElementCount * stride);
    const headElementCount = batch.readbackElementCount - tailElementCount;
    if (headElementCount > 0) {
      readback.copyFromBuffer(source, 0, tailElementCount * stride, headElementCount * stride);
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
    batch.readback?.reset();
    const spareBatch = this._spareBatch;
    if (spareBatch) {
      spareBatch.readback?.destroy();
      spareBatch.readback = null;
    }
    this._spareBatch = batch;
  }

  private static _getRingDistance(ringOrigin: number, ringIndex: number, ringCapacity: number): number {
    return ringIndex >= ringOrigin ? ringIndex - ringOrigin : ringCapacity - ringOrigin + ringIndex;
  }
}
