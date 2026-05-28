import { MathUtil, Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { Burst } from "./Burst";
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
  /** @internal */
  _frameRateTime: number = 0;

  @ignoreClone
  private _distanceAccumulator = 0;
  @ignoreClone
  private _lastEmitPosition = new Vector3();
  @ignoreClone
  private _hasLastEmitPosition = false;

  @deepClone
  private _bursts: Burst[] = [];

  private _currentBurstIndex = 0;

  @ignoreClone
  private _burstRand: Rand = new Rand(0, ParticleRandomSubSeeds.Burst);

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
      if (value && this._shape) {
        this._generator._renderer.shaderData.enableMacro(EmissionModule._emissionShapeMacro);
      } else {
        this._generator._renderer.shaderData.disableMacro(EmissionModule._emissionShapeMacro);
      }
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

      if (value) {
        value._registerOnValueChanged(renderer._onGeneratorParamsChanged);
        this.enabled && renderer.shaderData.enableMacro(EmissionModule._emissionShapeMacro);
      } else {
        renderer.shaderData.disableMacro(EmissionModule._emissionShapeMacro);
      }

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
    this._emitByRateOverTime(playTime);
    this._emitByRateOverDistance(lastPlayTime, playTime);
    this._emitByBurst(lastPlayTime, playTime);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._burstRand.reset(seed, ParticleRandomSubSeeds.Burst);
    this._shapeRand.reset(seed, ParticleRandomSubSeeds.Shape);
  }

  /** @internal */
  _resyncCursors(playTime: number): void {
    this._frameRateTime = playTime;
    this._currentBurstIndex = 0;
    this._hasLastEmitPosition = false;
    this._distanceAccumulator = 0;
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._shape?._unRegisterOnValueChanged(this._generator._renderer._onGeneratorParamsChanged);
  }

  private _emitByRateOverTime(playTime: number): void {
    const ratePerSeconds = this.rateOverTime.evaluate(undefined, undefined);
    if (ratePerSeconds <= 0) {
      this._frameRateTime = playTime;
      return;
    }
    const generator = this._generator;
    const emitInterval = 1.0 / ratePerSeconds;

    let cumulativeTime = playTime - this._frameRateTime;
    while (cumulativeTime >= emitInterval) {
      cumulativeTime -= emitInterval;
      this._frameRateTime += emitInterval;
      generator._emit(this._frameRateTime, 1);
    }
  }

  private _emitByRateOverDistance(lastPlayTime: number, playTime: number): void {
    const ratePerUnit = this.rateOverDistance.evaluate(undefined, undefined);
    const generator = this._generator;

    if (ratePerUnit <= 0) {
      this._hasLastEmitPosition = false;
      this._distanceAccumulator = 0;
      return;
    }
    if (!this._hasLastEmitPosition) {
      this._lastEmitPosition.copyFrom(generator._renderer.entity.transform.worldPosition);
      this._hasLastEmitPosition = true;
      return;
    }

    const lastPos = this._lastEmitPosition;
    const currentPos = generator._renderer.entity.transform.worldPosition;
    const { x: cx, y: cy, z: cz } = currentPos;
    const dx = cx - lastPos.x;
    const dy = cy - lastPos.y;
    const dz = cz - lastPos.z;
    const moveLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this._distanceAccumulator += moveLength;

    const emitInterval = 1.0 / ratePerUnit;
    // `+ zeroTolerance` absorbs float divide error so an exact `N*interval` accumulator doesn't drop 1
    const count = Math.floor(this._distanceAccumulator / emitInterval + MathUtil.zeroTolerance);

    if (count > 0) {
      this._distanceAccumulator -= count * emitInterval;
      // `subFrameAge ∈ [0, 1]`: 0 = newest at currentPos/playTime, 1 = oldest
      // at lastPos/lastPlayTime. Monotonically clamped so a rate hike that
      // pays out more particles than this frame's segment can host stacks the
      // overflow at lastPos instead of extrapolating past it.
      const isWorld = generator.main.simulationSpace === ParticleSimulationSpace.World;
      const invMoveLength = moveLength > MathUtil.zeroTolerance ? 1.0 / moveLength : 0;
      const ageStep = emitInterval * invMoveLength;
      const dt = playTime - lastPlayTime;
      let subFrameAge = Math.min(this._distanceAccumulator * invMoveLength, 1.0);
      const emitPos = EmissionModule._tempEmitPosition;
      for (let i = 0; i < count; i++) {
        if (isWorld) {
          emitPos.set(cx - dx * subFrameAge, cy - dy * subFrameAge, cz - dz * subFrameAge);
        }
        if (generator._emit(playTime - dt * subFrameAge, 1, isWorld ? emitPos : undefined) === 0) {
          // Buffer full: settle the frame's distance budget instead of carrying it over
          this._distanceAccumulator = 0;
          break;
        }
        subFrameAge = Math.min(subFrameAge + ageStep, 1.0);
      }
    }

    lastPos.copyFrom(currentPos);
  }

  private _emitByBurst(lastPlayTime: number, playTime: number): void {
    const main = this._generator.main;
    const duration = main.duration;
    const cycleCount = Math.floor((playTime - lastPlayTime) / duration);

    // Across one cycle
    if (main.isLoop && (cycleCount > 0 || playTime % duration < lastPlayTime % duration)) {
      let middleTime = Math.ceil(lastPlayTime / duration) * duration;
      this._emitBySubBurst(lastPlayTime, middleTime, duration);
      this._currentBurstIndex = 0;

      for (let i = 0; i < cycleCount; i++) {
        const lastMiddleTime = middleTime;
        middleTime += duration;
        this._emitBySubBurst(lastMiddleTime, middleTime, duration);
        this._currentBurstIndex = 0;
      }

      this._emitBySubBurst(middleTime, playTime, duration);
    } else {
      if (lastPlayTime < duration) {
        this._emitBySubBurst(lastPlayTime, Math.min(playTime, duration), duration);
      }
    }
  }

  private _emitBySubBurst(lastPlayTime: number, playTime: number, duration: number): void {
    const { _generator: generator, _burstRand: rand, bursts } = this;
    const baseTime = Math.floor(lastPlayTime / duration) * duration;
    const startTime = lastPlayTime % duration;
    const endTime = startTime + (playTime - lastPlayTime);

    let pendingIndex = -1;
    let index = this._currentBurstIndex;
    for (let n = bursts.length; index < n; index++) {
      const burst = bursts[index];
      const burstTime = burst.time;
      if (burstTime >= endTime) break;

      const { cycles, repeatInterval } = burst;
      if (cycles === 1) {
        if (burstTime >= startTime) {
          generator._emit(baseTime + burstTime, burst.count.evaluate(undefined, rand.random()));
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
          generator._emit(baseTime + effectiveTime, burst.count.evaluate(undefined, rand.random()));
        }

        // `_currentBurstIndex` caches next frame's scan start, so only the earliest unfinished
        // burst can be the entry point — skipping past it would drop its remaining cycles
        if (pendingIndex < 0 && lastCycle < maxCycles - 1) {
          pendingIndex = index;
        }
      }
    }
    this._currentBurstIndex = pendingIndex >= 0 ? pendingIndex : index;
  }
}
