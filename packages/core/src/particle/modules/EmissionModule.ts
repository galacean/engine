import { MathUtil, Rand, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneDecorators";
import { ShaderMacro } from "../../shader";
import type { ShaderData } from "../../shader";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import type { BirthSubEmitterCommand } from "./BirthSubEmitterCommand";
import type { Burst } from "./Burst";
import { EmissionState } from "./EmissionState";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import type { BaseShape } from "./shape/BaseShape";

/**
 * The EmissionModule of a Particle Generator.
 */
export class EmissionModule extends ParticleGeneratorModule {
  /** @internal */
  static readonly _emissionShapeMacro = ShaderMacro.getByName("RENDERER_EMISSION_SHAPE");

  private static readonly _tempEmitPosition = new Vector3();

  /**  The rate of particle emission. */
  rateOverTime: ParticleCompositeCurve = new ParticleCompositeCurve(10);
  /**  The rate at which the emitter spawns new particles over distance. */
  rateOverDistance: ParticleCompositeCurve = new ParticleCompositeCurve(0);

  _shape: BaseShape;
  /** @internal */
  @ignoreClone
  _shapeRand = new Rand(0, ParticleRandomSubSeeds.Shape);

  @ignoreClone
  private _shapeMacro: ShaderMacro;
  @ignoreClone
  private readonly _emissionState = new EmissionState();
  @ignoreClone
  private _distanceAccumulator = 0;
  @ignoreClone
  private _lastEmitPosition: Vector3;
  @ignoreClone
  private _hasLastEmitPosition = false;

  private _bursts: Burst[] = [];

  /**
   * @inheritdoc
   */
  override get enabled(): boolean {
    return this._enabled;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      if (value) {
        this._resyncCursors(this._generator._playTime);
      }
      this._enabled = value;
    }
  }

  /**
   * The shape of the emitter.
   */
  get shape() {
    return this._shape;
  }

  set shape(value: BaseShape) {
    const lastShape = this._shape;
    if (value !== lastShape) {
      this._shape = value;

      const renderer = this._generator._renderer;
      lastShape?._unRegisterOnValueChanged(renderer._onGeneratorParamsChanged);
      value?._registerOnValueChanged(renderer._onGeneratorParamsChanged);

      renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * Gets the burst array.
   */
  get bursts(): ReadonlyArray<Burst> {
    return this._bursts;
  }

  /**
   * Add a single burst.
   * @param burst - The burst
   */
  addBurst(burst: Burst): void {
    const bursts = this._bursts;
    let burstIndex = bursts.length;
    while (--burstIndex >= 0 && burst.time < bursts[burstIndex].time);
    bursts.splice(burstIndex + 1, 0, burst);
  }

  /**
   * Remove a single burst from the array of bursts.
   * @param burst - The burst data
   */
  removeBurst(burst: Burst): void {
    const index = this._bursts.indexOf(burst);
    if (index !== -1) {
      this._bursts.splice(index, 1);
    }
  }

  /**
   * Remove a single burst from the array of bursts.
   * @param index - The burst data index
   */
  removeBurstByIndex(index: number): void {
    this._bursts.splice(index, 1);
  }

  /**
   * Clear burst data.
   */
  clearBurst(): void {
    this._bursts.length = 0;
  }

  /**
   * @internal
   */
  _emit(lastPlayTime: number, playTime: number): void {
    const state = this._emissionState;
    this._emitByRateOverTime(playTime, state);
    this._emitByRateOverDistance(lastPlayTime, playTime);
    this._emitByBurst(lastPlayTime, playTime, state);
  }

  /**
   * Collects Birth requests whose times are known on the CPU. Rate over Distance requires GPU-side particle allocation
   * and is not part of this path.
   * @internal
   */
  _prepareBirthTimedRequests(
    lastPlayTime: number,
    playTime: number,
    state: EmissionState,
    command: BirthSubEmitterCommand
  ): void {
    this._emitByRateOverTime(playTime, state, command);
    this._emitByBurst(lastPlayTime, playTime, state, command);
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    const shapeMacro = this._enabled && this._shape ? EmissionModule._emissionShapeMacro : null;
    this._shapeMacro = this._enableMacro(shaderData, this._shapeMacro, shapeMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._shapeRand.reset(seed, ParticleRandomSubSeeds.Shape);
    this._emissionState.resetRandomSeed(seed);
  }

  /**
   * @internal
   */
  _resyncCursors(playTime: number): void {
    this._emissionState.resyncTimeCursors(playTime);
    this._distanceAccumulator = 0;
    this._hasLastEmitPosition = false;
  }

  /**
   * @internal
   */
  _shiftTimeOrigin(maxOffset: number): number {
    const state = this._emissionState;
    const offset = Math.min(state.frameRateTime, maxOffset);
    state.frameRateTime -= offset;
    return offset;
  }

  /**
   * @internal
   */
  _destroy(): void {
    const shape = this._shape;
    if (shape) {
      shape._unRegisterOnValueChanged(this._generator._renderer._onGeneratorParamsChanged);
      shape._destroy();
    }
  }

  private _emitByRateOverDistance(lastPlayTime: number, playTime: number): void {
    const state = this._emissionState;
    const ratePerUnit = this._evaluateRate(this.rateOverDistance, playTime, state);
    if (!(ratePerUnit > 0)) {
      this._hasLastEmitPosition = false;
      this._distanceAccumulator = 0;
      return;
    }
    const generator = this._generator;
    const currentPosition = generator._renderer.entity.transform.worldPosition;
    if (!this._hasLastEmitPosition) {
      (this._lastEmitPosition ||= new Vector3()).copyFrom(currentPosition);
      this._hasLastEmitPosition = true;
      return;
    }

    const lastPos = this._lastEmitPosition;
    const { x: cx, y: cy, z: cz } = currentPosition;
    const dx = cx - lastPos.x;
    const dy = cy - lastPos.y;
    const dz = cz - lastPos.z;
    const moveLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this._distanceAccumulator += moveLength;

    const emitInterval = 1.0 / ratePerUnit;
    // `+ zeroTolerance` absorbs float divide error so an exact `N*interval` accumulator doesn't drop 1
    const count = Math.floor(this._distanceAccumulator / emitInterval + MathUtil.zeroTolerance);

    if (count > 0) {
      const distanceRemainder = Math.max(this._distanceAccumulator - count * emitInterval, 0);
      this._distanceAccumulator = distanceRemainder;
      // `subFrameAge ∈ [0, 1]`: 0 = newest at currentPosition/playTime, 1 = oldest
      // at lastPos/lastPlayTime. Monotonically clamped so a rate hike that
      // pays out more particles than this frame's segment can host stacks the
      // overflow at lastPos instead of extrapolating past it.
      const invMoveLength = moveLength > MathUtil.zeroTolerance ? 1.0 / moveLength : 0;
      const ageStep = emitInterval * invMoveLength;
      const dt = playTime - lastPlayTime;
      let subFrameAge = Math.min(distanceRemainder * invMoveLength, 1.0);
      const emitPos =
        generator.main.simulationSpace === ParticleSimulationSpace.World ? EmissionModule._tempEmitPosition : undefined;
      for (let i = 0; i < count; i++) {
        emitPos?.set(cx - dx * subFrameAge, cy - dy * subFrameAge, cz - dz * subFrameAge);
        if (!generator._emit(playTime - dt * subFrameAge, 1, emitPos)) {
          this._distanceAccumulator = 0;
          break;
        }
        subFrameAge = Math.min(subFrameAge + ageStep, 1.0);
      }
    }

    lastPos.copyFrom(currentPosition);
  }

  private _emitByRateOverTime(playTime: number, state: EmissionState, command?: BirthSubEmitterCommand): void {
    const { rateOverTime } = this;

    let cumulativeTime = playTime - state.frameRateTime;
    let ratePerSeconds = this._evaluateRate(rateOverTime, state.frameRateTime, state);
    while (ratePerSeconds > 0) {
      const emitInterval = 1.0 / ratePerSeconds;
      // Compare in the Float32 time domain used by particle simulation without accepting a wider epsilon window
      if (!(cumulativeTime > 0) || Math.fround(cumulativeTime) < Math.fround(emitInterval)) {
        return;
      }
      cumulativeTime = Math.max(0, cumulativeTime - emitInterval);
      state.frameRateTime = playTime - cumulativeTime;
      this._emitOrAddRequest(command, state.frameRateTime, 1);
      ratePerSeconds = this._evaluateRate(rateOverTime, state.frameRateTime, state);
    }
    state.frameRateTime = playTime;
  }

  private _evaluateRate(rate: ParticleCompositeCurve, cursorTime: number, state: EmissionState): number {
    switch (rate.mode) {
      case ParticleCurveMode.Constant:
        return rate.constant;
      case ParticleCurveMode.Curve: {
        const duration = this._generator.main.duration;
        return rate.evaluate((cursorTime % duration) / duration, undefined);
      }
      default: {
        // TwoConstants / TwoCurves: lerp between the two values with a per-sample random factor
        const duration = this._generator.main.duration;
        return rate.evaluate((cursorTime % duration) / duration, state.randomRate());
      }
    }
  }

  private _emitByBurst(
    lastPlayTime: number,
    playTime: number,
    state: EmissionState,
    command?: BirthSubEmitterCommand
  ): void {
    const main = this._generator.main;
    const duration = main.duration;
    if (!main.isLoop) {
      if (lastPlayTime < duration) {
        this._emitBySubBurst(lastPlayTime, Math.min(playTime, duration), 0, state, command);
      }
      return;
    }

    let segmentStart = lastPlayTime;
    let cycle = Math.floor(segmentStart / duration);
    while (segmentStart < playTime) {
      const nextCycleTime = (cycle + 1) * duration;
      const segmentEnd = Math.min(nextCycleTime, playTime);
      this._emitBySubBurst(segmentStart, segmentEnd, cycle * duration, state, command);
      if (segmentEnd < nextCycleTime) {
        break;
      }
      state.currentBurstIndex = 0;
      segmentStart = segmentEnd;
      cycle++;
    }
  }

  private _emitBySubBurst(
    lastPlayTime: number,
    playTime: number,
    cycleStart: number,
    state: EmissionState,
    command?: BirthSubEmitterCommand
  ): void {
    const { bursts } = this;
    // Compare absolute event and window times in the simulation's Float32 domain, including after loop boundaries
    const startTime = Math.fround(lastPlayTime);
    const endTime = Math.fround(playTime);

    let pendingIndex = -1;
    let index = state.currentBurstIndex;
    for (let n = bursts.length; index < n; index++) {
      const burst = bursts[index];
      const burstTime = cycleStart + burst.time;
      if (Math.fround(burstTime) >= endTime) {
        break;
      }

      const { cycles, repeatInterval } = burst;
      if (cycles === 1) {
        if (Math.fround(burstTime) >= startTime) {
          this._emitOrAddRequest(command, burstTime, burst.count.evaluate(undefined, state.randomBurst()));
        }
      } else {
        let cycle = Math.max(0, Math.ceil((startTime - burstTime) / repeatInterval));
        // Include events rounded onto the window start even when the Double quotient places them before it
        while (cycle > 0 && Math.fround(burstTime + (cycle - 1) * repeatInterval) >= startTime) {
          cycle--;
        }
        for (; cycle < cycles; cycle++) {
          const effectiveTime = burstTime + cycle * repeatInterval;
          const eventTime = Math.fround(effectiveTime);
          if (eventTime >= endTime) {
            break;
          }
          if (eventTime >= startTime) {
            this._emitOrAddRequest(command, effectiveTime, burst.count.evaluate(undefined, state.randomBurst()));
          }
        }

        // `state.currentBurstIndex` caches next frame's scan start, so only the earliest unfinished
        // burst can be the entry point — skipping past it would drop its remaining cycles
        if (pendingIndex < 0 && cycle < cycles) {
          pendingIndex = index;
        }
      }
    }
    state.currentBurstIndex = pendingIndex >= 0 ? pendingIndex : index;
  }

  private _emitOrAddRequest(command: BirthSubEmitterCommand | undefined, time: number, count: number): void {
    if (!(count > 0)) {
      return;
    }
    if (command) {
      command.addRequest(time, count);
    } else {
      this._generator._emit(time, count);
    }
  }
}
