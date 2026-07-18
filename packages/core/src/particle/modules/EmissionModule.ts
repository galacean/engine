import { MathUtil, Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderData, ShaderMacro } from "../../shader";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { Burst } from "./Burst";
import { EmissionRuntimeState, EmissionSample } from "./EmissionRuntimeState";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { BaseShape } from "./shape/BaseShape";

/**
 * The EmissionModule of a Particle Generator.
 */
export class EmissionModule extends ParticleGeneratorModule {
  /** @internal */
  static readonly _emissionShapeMacro = ShaderMacro.getByName("RENDERER_EMISSION_SHAPE");

  private static _tempEmitPosition = new Vector3();

  /**  The rate of particle emission. */
  @deepClone
  rateOverTime: ParticleCompositeCurve = new ParticleCompositeCurve(10);
  /**  The rate at which the emitter spawns new particles over distance. */
  @deepClone
  rateOverDistance: ParticleCompositeCurve = new ParticleCompositeCurve(0);

  @deepClone
  _shape: BaseShape;
  /** @internal */
  @ignoreClone
  _shapeRand = new Rand(0, ParticleRandomSubSeeds.Shape);

  @ignoreClone
  private _shapeMacro: ShaderMacro;
  @ignoreClone
  readonly _runtimeState = new EmissionRuntimeState();

  @deepClone
  private _bursts: Burst[] = [];

  /** @internal */
  get _frameRateTime(): number {
    return this._runtimeState.frameRateTime;
  }

  /** @internal */
  set _frameRateTime(value: number) {
    this._runtimeState.frameRateTime = value;
  }

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
    const generator = this._generator;
    const samples = this._getEmissionSamples(
      lastPlayTime,
      playTime,
      this._runtimeState,
      generator._renderer.entity.transform.worldPosition
    );
    const isWorld = generator.main.simulationSpace === ParticleSimulationSpace.World;
    for (let i = 0, n = samples.length; i < n; i++) {
      const sample = samples[i];
      generator._emit(sample.time, sample.count, isWorld ? (sample.position ?? undefined) : undefined);
    }
  }

  /**
   * Evaluate this module with caller-owned runtime cursors.
   * @internal
   */
  _getEmissionSamples(
    lastPlayTime: number,
    playTime: number,
    state: EmissionRuntimeState,
    currentPosition?: Vector3,
    sortByTime: boolean = false,
    tolerateRateBoundary: boolean = false
  ): ReadonlyArray<EmissionSample> {
    state.beginSamples();
    if (!this.enabled || playTime <= lastPlayTime) {
      state._samples.length = 0;
      return state._samples;
    }
    this._emitByRateOverTime(playTime, state, tolerateRateBoundary);
    this._emitByRateOverDistance(lastPlayTime, playTime, state, currentPosition);
    this._emitByBurst(lastPlayTime, playTime, state);
    state._samples.length = state._sampleCount;
    if (sortByTime && state._sampleCount > 1) {
      state._samples.sort((left, right) => left.time - right.time);
    }
    return state._samples;
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
    this._runtimeState.reset(seed, this._generator._playTime);
  }

  /** @internal */
  _resyncCursors(playTime: number): void {
    this._runtimeState.resyncCursors(playTime);
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._shape?._unRegisterOnValueChanged(this._generator._renderer._onGeneratorParamsChanged);
  }

  private _emitByRateOverTime(playTime: number, state: EmissionRuntimeState, tolerateRateBoundary: boolean): void {
    const { rateOverTime } = this;

    let cumulativeTime = playTime - state.frameRateTime;
    let ratePerSeconds = this._evaluateRate(rateOverTime, state.frameRateTime, state);
    while (ratePerSeconds > 0) {
      const emitInterval = 1.0 / ratePerSeconds;
      if (tolerateRateBoundary) {
        if (cumulativeTime + MathUtil.zeroTolerance < emitInterval) return;
        cumulativeTime = Math.max(0, cumulativeTime - emitInterval);
      } else {
        if (cumulativeTime < emitInterval) return;
        cumulativeTime -= emitInterval;
      }
      state.frameRateTime += emitInterval;
      state.addSample(state.frameRateTime, 1);
      ratePerSeconds = this._evaluateRate(rateOverTime, state.frameRateTime, state);
    }
    state.frameRateTime = playTime;
  }

  private _emitByRateOverDistance(
    lastPlayTime: number,
    playTime: number,
    state: EmissionRuntimeState,
    currentPosition?: Vector3
  ): void {
    const { rateOverDistance } = this;
    // Distance rate is sampled once per frame at the current cycle position
    const ratePerUnit = this._evaluateRate(rateOverDistance, playTime, state);

    if (!(ratePerUnit > 0) || !currentPosition) {
      state.hasLastEmitPosition = false;
      state.distanceAccumulator = 0;
      return;
    }
    if (!state.hasLastEmitPosition) {
      state.setLastEmitPosition(currentPosition);
      return;
    }

    const lastPos = state.lastEmitPosition;
    const currentPos = currentPosition;
    const { x: cx, y: cy, z: cz } = currentPos;
    const dx = cx - lastPos.x;
    const dy = cy - lastPos.y;
    const dz = cz - lastPos.z;
    const moveLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    state.distanceAccumulator += moveLength;

    const emitInterval = 1.0 / ratePerUnit;
    // `+ zeroTolerance` absorbs float divide error so an exact `N*interval` accumulator doesn't drop 1
    const count = Math.floor(state.distanceAccumulator / emitInterval + MathUtil.zeroTolerance);

    if (count > 0) {
      state.distanceAccumulator -= count * emitInterval;
      // `subFrameAge ∈ [0, 1]`: 0 = newest at currentPos/playTime, 1 = oldest
      // at lastPos/lastPlayTime. Monotonically clamped so a rate hike that
      // pays out more particles than this frame's segment can host stacks the
      // overflow at lastPos instead of extrapolating past it.
      const invMoveLength = moveLength > MathUtil.zeroTolerance ? 1.0 / moveLength : 0;
      const ageStep = emitInterval * invMoveLength;
      const dt = playTime - lastPlayTime;
      let subFrameAge = Math.min(state.distanceAccumulator * invMoveLength, 1.0);
      const emitPos = EmissionModule._tempEmitPosition;
      for (let i = 0; i < count; i++) {
        emitPos.set(cx - dx * subFrameAge, cy - dy * subFrameAge, cz - dz * subFrameAge);
        state.addSample(playTime - dt * subFrameAge, 1, emitPos);
        subFrameAge = Math.min(subFrameAge + ageStep, 1.0);
      }
    }

    lastPos.copyFrom(currentPos);
  }

  private _evaluateRate(rate: ParticleCompositeCurve, cursorTime: number, state: EmissionRuntimeState): number {
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
        return rate.evaluate((cursorTime % duration) / duration, state.rateRand.random());
      }
    }
  }

  private _emitByBurst(lastPlayTime: number, playTime: number, state: EmissionRuntimeState): void {
    const main = this._generator.main;
    const duration = main.duration;
    if (!main.isLoop) {
      if (lastPlayTime < duration) {
        this._emitBySubBurst(lastPlayTime, Math.min(playTime, duration), duration, state);
      }
      return;
    }

    let segmentStart = lastPlayTime;
    let nextCycleTime = (Math.floor(segmentStart / duration) + 1) * duration;
    while (segmentStart < playTime) {
      const segmentEnd = Math.min(nextCycleTime, playTime);
      this._emitBySubBurst(segmentStart, segmentEnd, duration, state);
      if (segmentEnd < nextCycleTime) {
        break;
      }
      state.currentBurstIndex = 0;
      segmentStart = segmentEnd;
      nextCycleTime += duration;
    }
  }

  private _emitBySubBurst(lastPlayTime: number, playTime: number, duration: number, state: EmissionRuntimeState): void {
    const { bursts } = this;
    const rand = state.burstRand;
    const baseTime = Math.floor(lastPlayTime / duration) * duration;
    const startTime = lastPlayTime % duration;
    const endTime = startTime + (playTime - lastPlayTime);

    let pendingIndex = -1;
    let index = state.currentBurstIndex;
    for (let n = bursts.length; index < n; index++) {
      const burst = bursts[index];
      const burstTime = burst.time;
      if (burstTime >= endTime) break;

      const { cycles, repeatInterval } = burst;
      if (cycles === 1) {
        if (burstTime >= startTime) {
          state.addSample(baseTime + burstTime, burst.count.evaluate(undefined, rand.random()));
        }
      } else {
        const maxCycles = cycles === Infinity ? Math.ceil((duration - burstTime) / repeatInterval) : cycles;

        // Absorb float drift: (startTime - burstTime) / repeatInterval may land at cycle + 1e-15
        // when it should be exactly cycle, and ceil would then skip ahead to cycle + 1.
        const tolerance = MathUtil.zeroTolerance;
        const lastCycle = Math.ceil((endTime - burstTime) / repeatInterval - tolerance) - 1;
        const first = Math.max(0, Math.ceil((startTime - burstTime) / repeatInterval - tolerance));
        const last = Math.min(maxCycles - 1, lastCycle);
        for (let c = first; c <= last; c++) {
          const effectiveTime = burstTime + c * repeatInterval;
          if (effectiveTime >= duration) break;
          state.addSample(baseTime + effectiveTime, burst.count.evaluate(undefined, rand.random()));
        }

        // `_currentBurstIndex` caches next frame's scan start, so only the earliest unfinished
        // burst can be the entry point — skipping past it would drop its remaining cycles
        if (pendingIndex < 0 && lastCycle < maxCycles - 1) {
          pendingIndex = index;
        }
      }
    }
    state.currentBurstIndex = pendingIndex >= 0 ? pendingIndex : index;
  }
}
