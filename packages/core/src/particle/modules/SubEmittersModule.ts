import { Color, MathUtil, Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleRenderer } from "../ParticleRenderer";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { EmissionRuntimeState } from "./EmissionRuntimeState";
import { SubEmitter } from "./SubEmitter";

class BirthSubEmitterRuntimeState {
  readonly emission = new EmissionRuntimeState();
  readonly previousWorldPosition = new Vector3();
  previousParentAge = 0;
  startDelay = 0;
  shouldEmit = true;
  target: ParticleGenerator = null;
}

/** @internal */
export type BirthSubEmitterSampleHandler = (
  subEmitter: SubEmitter,
  count: number,
  worldPosition: Vector3,
  parentWorldVelocity: Vector3,
  parentNormalizedAge: number,
  emissionNormalizedTime: number,
  frameTime: number
) => void;

/**
 * Fires sub-emitters on parent particle lifecycle events (Birth / Death).
 * @remarks Requires WebGL2; the module stays inactive on WebGL1.
 */
export class SubEmittersModule extends ParticleGeneratorModule {
  private static _cycleVisited = new Set<ParticleGenerator>();
  private static _cycleStack: ParticleGenerator[] = [];
  private static _tempStartPosition = new Vector3();
  private static _tempEndPosition = new Vector3();
  private static _tempSamplePosition = new Vector3();
  private static _tempWorldVelocity = new Vector3();

  private static _wouldCreateCycle(target: ParticleRenderer, root: ParticleGenerator): boolean {
    const visited = SubEmittersModule._cycleVisited;
    const stack = SubEmittersModule._cycleStack;
    visited.clear();
    stack.length = 0;
    stack.push(target.generator);

    let found = false;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === root) {
        found = true;
        break;
      }
      if (visited.has(cur)) continue;
      visited.add(cur);
      const slots = cur.subEmitters.subEmitters;
      for (let i = 0, n = slots.length; i < n; i++) {
        const child = slots[i].emitter?.generator;
        if (child && !visited.has(child)) stack.push(child);
      }
    }

    visited.clear();
    stack.length = 0;
    return found;
  }

  @deepClone
  private _subEmitters: SubEmitter[] = [];

  /**
   * The configured sub-emitters.
   */
  get subEmitters(): readonly SubEmitter[] {
    return this._subEmitters;
  }

  @ignoreClone
  private _probabilityRand = new Rand(0, ParticleRandomSubSeeds.SubEmitter);

  @ignoreClone
  private _particleRuntimeStates: Array<Array<BirthSubEmitterRuntimeState | null>> = [];
  @ignoreClone
  private _particleSequence = 0;

  /** @internal */
  constructor(generator: ParticleGenerator) {
    super(generator);
    this._particleRuntimeStates.length = generator._currentParticleCount;
  }

  /**
   * Add a sub-emitter slot.
   * @param emitter - Target particle renderer
   * @param type - Trigger event (`Birth` / `Death`)
   * @param inheritProperties - Bitmask of properties inherited from the parent particle
   * @param emitProbability - Per-parent-particle probability [0, 1]
   * @param emitCount - Number of sub particles emitted when the parent dies
   */
  addSubEmitter(
    emitter: ParticleRenderer,
    type: ParticleSubEmitterType,
    inheritProperties: ParticleSubEmitterInheritProperty = ParticleSubEmitterInheritProperty.None,
    emitProbability: number = 1,
    emitCount: number = 1
  ): void {
    this._validateEmitter(emitter);
    const sub = new SubEmitter();
    sub.emitter = emitter;
    sub.type = type;
    sub.inheritProperties = inheritProperties;
    sub.emitProbability = emitProbability;
    sub.emitCount = emitCount;
    sub._module = this;
    this._subEmitters.push(sub);
    const runtimeStates = this._particleRuntimeStates;
    for (let i = 0, n = runtimeStates.length; i < n; i++) {
      runtimeStates[i]?.push(null);
    }
    this._markTopologyDirty();
    this._generator._setTransformFeedback();
  }

  /**
   * Remove the sub-emitter at the given index.
   * @param index - Index of the sub-emitter to remove
   */
  removeSubEmitterByIndex(index: number): void {
    this._subEmitters.splice(index, 1);
    const runtimeStates = this._particleRuntimeStates;
    for (let i = 0, n = runtimeStates.length; i < n; i++) {
      runtimeStates[i]?.splice(index, 1);
    }
    this._markTopologyDirty();
    this._generator._setTransformFeedback();
  }

  override get enabled(): boolean {
    return this._enabled && this._generator._renderer.engine._hardwareRenderer.isWebGL2;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      if (value) this._validateEmitters();
      this._enabled = value;
      this._markTopologyDirty();
      this._generator._setTransformFeedback();
    }
  }

  /**
   * @internal
   */
  _dispatchEvent(
    type: ParticleSubEmitterType,
    worldPosition: Vector3,
    parentColor: Color,
    parentSize: Vector3,
    parentRotation: Vector3,
    worldDirection?: Vector3,
    frameTime: number = 1
  ): void {
    const subEmitters = this.subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      const sub = subEmitters[i];
      if (sub.type !== type || type === ParticleSubEmitterType.Birth) continue;

      const target = sub.emitter;
      if (target === null || target.destroyed) continue;

      const count = sub.emitCount;
      if (count <= 0) continue;

      if (sub.emitProbability < 1.0 && this._probabilityRand.random() >= sub.emitProbability) {
        continue;
      }

      const inherit = sub.inheritProperties;
      const colorOverride = (inherit & ParticleSubEmitterInheritProperty.Color) !== 0 ? parentColor : null;
      const sizeOverride = (inherit & ParticleSubEmitterInheritProperty.Size) !== 0 ? parentSize : null;
      const rotationOverride = (inherit & ParticleSubEmitterInheritProperty.Rotation) !== 0 ? parentRotation : null;
      const directionOverride = (inherit & ParticleSubEmitterInheritProperty.Velocity) !== 0 ? worldDirection : null;

      this._generator._enqueueSubEmitterEmission(
        target.generator,
        count,
        worldPosition,
        colorOverride,
        sizeOverride,
        rotationOverride,
        directionOverride,
        null,
        null,
        frameTime
      );
    }
  }

  /** @internal */
  _onParticleBirth(ringIndex: number, worldPosition: Vector3): void {
    const slots = this._subEmitters;
    let states = this._particleRuntimeStates[ringIndex];
    if (!states) {
      states = this._particleRuntimeStates[ringIndex] = new Array(slots.length).fill(null);
    } else {
      states.length = slots.length;
      states.fill(null);
    }

    const particleSequence = this._particleSequence++;
    for (let i = 0, n = slots.length; i < n; i++) {
      const sub = slots[i];
      if (sub.type !== ParticleSubEmitterType.Birth) continue;
      const target = sub.emitter?.generator;
      if (!target || sub.emitter.destroyed) continue;

      const state = (states[i] = new BirthSubEmitterRuntimeState());
      state.target = target;
      state.previousWorldPosition.copyFrom(worldPosition);
      state.shouldEmit = sub.emitProbability >= 1 || this._probabilityRand.random() < sub.emitProbability;

      const seed = this._systemRuntimeSeed(target, ringIndex, i, particleSequence);
      state.emission.reset(seed, 0);
      const delayRand = new Rand(seed, ParticleRandomSubSeeds.StartDelay);
      state.startDelay = Math.max(0, target.main.startDelay.evaluate(undefined, delayRand.random()));
      if (state.startDelay <= MathUtil.zeroTolerance) {
        state.emission.setLastEmitPosition(worldPosition);
      }
    }
  }

  /** @internal */
  _processBirthParticle(
    ringIndex: number,
    bornTime: number,
    lifetime: number,
    currentParentAge: number,
    currentWorldPosition: Vector3,
    frameLastPlayTime: number,
    framePlayTime: number,
    handler: BirthSubEmitterSampleHandler
  ): void {
    const states = this._particleRuntimeStates[ringIndex];
    if (!states) return;

    const slots = this._subEmitters;
    for (let i = 0, n = slots.length; i < n; i++) {
      const sub = slots[i];
      let state = states[i];
      const target = sub.emitter?.generator;
      if (sub.type !== ParticleSubEmitterType.Birth || !target || sub.emitter.destroyed) {
        states[i] = null;
        continue;
      }

      if (!state || state.target !== target) {
        state = states[i] = new BirthSubEmitterRuntimeState();
        state.target = target;
        state.previousParentAge = currentParentAge;
        state.previousWorldPosition.copyFrom(currentWorldPosition);
        const seed = this._systemRuntimeSeed(target, ringIndex, i, this._particleSequence++);
        state.emission.reset(seed, 0);
        const delayRand = new Rand(seed, ParticleRandomSubSeeds.StartDelay);
        state.startDelay = Math.max(0, target.main.startDelay.evaluate(undefined, delayRand.random()));
        state.shouldEmit = sub.emitProbability >= 1 || this._probabilityRand.random() < sub.emitProbability;
        continue;
      }

      const previousParentAge = state.previousParentAge;
      const sampleDelta = currentParentAge - previousParentAge;
      if (!(sampleDelta > MathUtil.zeroTolerance)) {
        state.previousParentAge = currentParentAge;
        state.previousWorldPosition.copyFrom(currentWorldPosition);
        continue;
      }

      const previousPosition = state.previousWorldPosition;
      const velocity = SubEmittersModule._tempWorldVelocity;
      velocity.set(
        (currentWorldPosition.x - previousPosition.x) / sampleDelta,
        (currentWorldPosition.y - previousPosition.y) / sampleDelta,
        (currentWorldPosition.z - previousPosition.z) / sampleDelta
      );

      if (state.shouldEmit && target.emission.enabled) {
        const duration = target.main.duration;
        let lastEmissionTime = Math.max(previousParentAge - state.startDelay, 0);
        let emissionTime = Math.max(currentParentAge - state.startDelay, 0);
        if (!target.main.isLoop) {
          lastEmissionTime = Math.min(lastEmissionTime, duration);
          emissionTime = Math.min(emissionTime, duration);
        }

        if (emissionTime > lastEmissionTime) {
          const startParentAge = lastEmissionTime + state.startDelay;
          const endParentAge = emissionTime + state.startDelay;
          const startT = Math.min(Math.max((startParentAge - previousParentAge) / sampleDelta, 0), 1);
          const endT = Math.min(Math.max((endParentAge - previousParentAge) / sampleDelta, 0), 1);
          const startPosition = SubEmittersModule._tempStartPosition;
          const endPosition = SubEmittersModule._tempEndPosition;
          Vector3.lerp(previousPosition, currentWorldPosition, startT, startPosition);
          Vector3.lerp(previousPosition, currentWorldPosition, endT, endPosition);

          if (!state.emission.hasLastEmitPosition) {
            state.emission.setLastEmitPosition(startPosition);
          }
          const samples = target.emission._getEmissionSamples(
            lastEmissionTime,
            emissionTime,
            state.emission,
            endPosition,
            true,
            true
          );
          const frameDelta = framePlayTime - frameLastPlayTime;
          const samplePosition = SubEmittersModule._tempSamplePosition;
          for (let sampleIndex = 0, sampleCount = samples.length; sampleIndex < sampleCount; sampleIndex++) {
            const sample = samples[sampleIndex];
            const parentAge = sample.time + state.startDelay;
            const positionT = Math.min(Math.max((parentAge - previousParentAge) / sampleDelta, 0), 1);
            Vector3.lerp(previousPosition, currentWorldPosition, positionT, samplePosition);
            const absoluteSampleTime = bornTime + parentAge;
            const frameTime =
              frameDelta > MathUtil.zeroTolerance
                ? Math.min(Math.max((absoluteSampleTime - frameLastPlayTime) / frameDelta, 0), 1)
                : 1;
            const parentNormalizedAge = lifetime > 0 ? Math.min(Math.max(parentAge / lifetime, 0), 1) : 1;
            const emissionNormalizedTime = duration > 0 ? (sample.time % duration) / duration : 0;
            handler(
              sub,
              sample.count,
              samplePosition,
              velocity,
              parentNormalizedAge,
              emissionNormalizedTime,
              frameTime
            );
          }
        }
      }

      state.previousParentAge = currentParentAge;
      state.previousWorldPosition.copyFrom(currentWorldPosition);
    }
  }

  /** @internal */
  _retireParticle(ringIndex: number): void {
    this._particleRuntimeStates[ringIndex] = null;
  }

  /** @internal */
  _clearParticleRuntimeStates(): void {
    this._particleRuntimeStates.fill(null);
  }

  /** @internal */
  _remapParticleRuntimeStates(
    newParticleCount: number,
    mappings: ReadonlyArray<{ source: number; target: number; count: number }>
  ): void {
    const oldStates = this._particleRuntimeStates;
    const newStates = new Array<Array<BirthSubEmitterRuntimeState | null>>(newParticleCount);
    for (let i = 0, n = mappings.length; i < n; i++) {
      const mapping = mappings[i];
      for (let j = 0; j < mapping.count; j++) {
        newStates[mapping.target + j] = oldStates[mapping.source + j];
      }
    }
    this._particleRuntimeStates = newStates;
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._probabilityRand.reset(seed, ParticleRandomSubSeeds.SubEmitter);
    this._particleSequence = 0;
  }

  /**
   * @internal
   */
  _hasSubEmitterOfType(type: ParticleSubEmitterType): boolean {
    if (!this.enabled) return false;
    const subEmitters = this.subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      if (subEmitters[i].type === type) return true;
    }
    return false;
  }

  /** @internal */
  /**
   * @internal
   */
  _cloneTo(target: SubEmittersModule): void {
    // _module is @ignoreClone, so re-link each cloned slot back to its new module
    const subEmitters = target._subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      subEmitters[i]._module = target;
    }
    target._particleRuntimeStates = new Array(target._generator._currentParticleCount);
    target._markTopologyDirty();
  }

  /**
   * @internal
   */
  _validateEmitter(emitter: ParticleRenderer): void {
    this._validateEmitterScene(emitter);
    if (emitter && SubEmittersModule._wouldCreateCycle(emitter, this._generator)) {
      throw new Error("Sub-emitter would create a cycle");
    }
  }

  /** @internal */
  _validateEmitters(): void {
    const subEmitters = this._subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      this._validateEmitterScene(subEmitters[i].emitter);
    }
  }

  /** @internal */
  _onSlotChanged(slot: SubEmitter): void {
    const slotIndex = this._subEmitters.indexOf(slot);
    if (slotIndex >= 0) {
      const runtimeStates = this._particleRuntimeStates;
      for (let i = 0, n = runtimeStates.length; i < n; i++) {
        const states = runtimeStates[i];
        states && (states[slotIndex] = null);
      }
    }
    this._markTopologyDirty();
    this._generator._setTransformFeedback();
  }

  private _markTopologyDirty(): void {
    const scene = this._generator._renderer.entity.scene;
    scene?._componentsManager._particleSystemManager._markTopologyDirty();
  }

  private _validateEmitterScene(emitter: ParticleRenderer): void {
    if (!emitter || emitter.destroyed) return;
    const sourceScene = this._generator._renderer.entity.scene;
    const targetScene = emitter.entity.scene;
    if (sourceScene && targetScene && sourceScene !== targetScene) {
      throw new Error("Sub-emitter target must belong to the same scene as its parent particle system");
    }
  }

  private _systemRuntimeSeed(
    target: ParticleGenerator,
    ringIndex: number,
    subEmitterIndex: number,
    particleSequence: number
  ): number {
    let seed = this._generator.randomSeed ^ target.randomSeed ^ ParticleRandomSubSeeds.SubEmitter;
    seed ^= Math.imul(ringIndex + 1, 0x9e3779b1);
    seed ^= Math.imul(subEmitterIndex + 1, 0x85ebca6b);
    seed ^= Math.imul(particleSequence + 1, 0xc2b2ae35);
    return seed >>> 0;
  }
}
