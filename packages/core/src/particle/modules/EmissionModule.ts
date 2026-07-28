import { MathUtil, Rand, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneDecorators";
import { ShaderData, ShaderMacro } from "../../shader";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import type { BirthSubEmitterPlan } from "./BirthSubEmitterPlan";
import { Burst } from "./Burst";
import { EmissionState } from "./EmissionState";
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
    this._emitByRateOverDistance(
      lastPlayTime,
      playTime,
      state,
      this._generator._renderer.entity.transform.worldPosition,
      this._generator.main.simulationSpace === ParticleSimulationSpace.World,
      this._evaluateRate(this.rateOverDistance, playTime, state),
      Infinity
    );
    this._emitByBurst(lastPlayTime, playTime, state);
  }

  /**
   * @internal
   */
  _prepareBirthRequests(
    lastPlayTime: number,
    playTime: number,
    state: EmissionState,
    plan: BirthSubEmitterPlan
  ): number {
    plan.requestCount = 0;
    this._emitByRateOverTime(playTime, state, plan);
    const distanceRate = this._evaluateRate(this.rateOverDistance, playTime, state);
    this._emitByBurst(lastPlayTime, playTime, state, plan);
    return distanceRate;
  }

  /**
   * @internal
   */
  _collectBirthDistanceRequests(
    lastPlayTime: number,
    playTime: number,
    state: EmissionState,
    currentPosition: Vector3,
    distanceRate: number,
    requestLimit: number,
    plan: BirthSubEmitterPlan
  ): void {
    this._emitByRateOverDistance(
      lastPlayTime,
      playTime,
      state,
      currentPosition,
      true,
      distanceRate,
      requestLimit,
      plan
    );
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
    const state = this._emissionState;
    state.resyncTimeCursors(playTime);
    state.distanceAccumulator = 0;
    state.hasLastEmitPosition = false;
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

  private _emitByRateOverTime(playTime: number, state: EmissionState, plan?: BirthSubEmitterPlan): void {
    const { rateOverTime } = this;

    let cumulativeTime = playTime - state.frameRateTime;
    let ratePerSeconds = this._evaluateRate(rateOverTime, state.frameRateTime, state);
    while (ratePerSeconds > 0) {
      const emitInterval = 1.0 / ratePerSeconds;
      // Require elapsed time so rates above 1 / zeroTolerance still terminate after a tolerated boundary
      const boundaryTolerance = cumulativeTime > 0 ? MathUtil.zeroTolerance : 0;
      if (cumulativeTime + boundaryTolerance < emitInterval) {
        return;
      }
      cumulativeTime = Math.max(0, cumulativeTime - emitInterval);
      state.frameRateTime += emitInterval;
      this._emitOrAddRequest(plan, state.frameRateTime, 1, undefined, 0);
      ratePerSeconds = this._evaluateRate(rateOverTime, state.frameRateTime, state);
    }
    state.frameRateTime = playTime;
  }

  private _emitByRateOverDistance(
    lastPlayTime: number,
    playTime: number,
    state: EmissionState,
    currentPosition: Vector3,
    useWorldPosition: boolean,
    ratePerUnit: number,
    requestLimit: number,
    plan?: BirthSubEmitterPlan
  ): void {
    if (!(ratePerUnit > 0)) {
      state.hasLastEmitPosition = false;
      state.distanceAccumulator = 0;
      return;
    }
    if (!state.hasLastEmitPosition) {
      state.setLastEmitPosition(currentPosition);
      return;
    }

    const lastPos = state.lastEmitPosition;
    const { x: cx, y: cy, z: cz } = currentPosition;
    const dx = cx - lastPos.x;
    const dy = cy - lastPos.y;
    const dz = cz - lastPos.z;
    const moveLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    state.distanceAccumulator += moveLength;

    const emitInterval = 1.0 / ratePerUnit;
    // `+ zeroTolerance` absorbs float divide error so an exact `N*interval` accumulator doesn't drop 1
    const count = Math.floor(state.distanceAccumulator / emitInterval + MathUtil.zeroTolerance);

    if (count > 0) {
      const distanceRemainder = Math.max(state.distanceAccumulator - count * emitInterval, 0);
      const requestCount = Math.min(count, requestLimit);
      state.distanceAccumulator = requestCount < count ? 0 : distanceRemainder;
      // `subFrameAge ∈ [0, 1]`: 0 = newest at currentPosition/playTime, 1 = oldest
      // at lastPos/lastPlayTime. Monotonically clamped so a rate hike that
      // pays out more particles than this frame's segment can host stacks the
      // overflow at lastPos instead of extrapolating past it.
      const invMoveLength = moveLength > MathUtil.zeroTolerance ? 1.0 / moveLength : 0;
      const ageStep = emitInterval * invMoveLength;
      const dt = playTime - lastPlayTime;
      // Deferred requests are sorted by time, so capacity clipping keeps the oldest candidates
      const firstRequestIndex = plan && requestCount < count ? count - requestCount : 0;
      let subFrameAge = Math.min(distanceRemainder * invMoveLength + ageStep * firstRequestIndex, 1.0);
      const emitPos = useWorldPosition ? EmissionModule._tempEmitPosition : undefined;
      for (let i = 0; i < requestCount; i++) {
        emitPos?.set(cx - dx * subFrameAge, cy - dy * subFrameAge, cz - dz * subFrameAge);
        if (this._emitOrAddRequest(plan, playTime - dt * subFrameAge, 1, emitPos, 1) === 0) {
          state.distanceAccumulator = 0;
          break;
        }
        subFrameAge = Math.min(subFrameAge + ageStep, 1.0);
      }
    }

    lastPos.copyFrom(currentPosition);
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
        return rate.evaluate((cursorTime % duration) / duration, state.rateRand.random());
      }
    }
  }

  private _emitByBurst(lastPlayTime: number, playTime: number, state: EmissionState, plan?: BirthSubEmitterPlan): void {
    const main = this._generator.main;
    const duration = main.duration;
    if (!main.isLoop) {
      if (lastPlayTime < duration) {
        this._emitBySubBurst(lastPlayTime, Math.min(playTime, duration), duration, state, plan);
      }
      return;
    }

    let segmentStart = lastPlayTime;
    let nextCycleTime = (Math.floor(segmentStart / duration) + 1) * duration;
    while (segmentStart < playTime) {
      const segmentEnd = Math.min(nextCycleTime, playTime);
      this._emitBySubBurst(segmentStart, segmentEnd, duration, state, plan);
      if (segmentEnd < nextCycleTime) {
        break;
      }
      state.currentBurstIndex = 0;
      segmentStart = segmentEnd;
      nextCycleTime += duration;
    }
  }

  private _emitBySubBurst(
    lastPlayTime: number,
    playTime: number,
    duration: number,
    state: EmissionState,
    plan?: BirthSubEmitterPlan
  ): void {
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
          this._emitOrAddRequest(
            plan,
            baseTime + burstTime,
            burst.count.evaluate(undefined, rand.random()),
            undefined,
            2
          );
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
          if (effectiveTime >= duration) {
            break;
          }
          this._emitOrAddRequest(
            plan,
            baseTime + effectiveTime,
            burst.count.evaluate(undefined, rand.random()),
            undefined,
            2
          );
        }

        // `state.currentBurstIndex` caches next frame's scan start, so only the earliest unfinished
        // burst can be the entry point — skipping past it would drop its remaining cycles
        if (pendingIndex < 0 && lastCycle < maxCycles - 1) {
          pendingIndex = index;
        }
      }
    }
    state.currentBurstIndex = pendingIndex >= 0 ? pendingIndex : index;
  }

  private _emitOrAddRequest(
    plan: BirthSubEmitterPlan | undefined,
    time: number,
    count: number,
    position: Vector3 | undefined,
    order: number
  ): number {
    if (!plan) {
      return this._generator._emit(time, count, position);
    }
    if (!(count > 0)) {
      return 0;
    }
    plan.addRequest(time, count, position, order);
    return Math.ceil(count);
  }
}
