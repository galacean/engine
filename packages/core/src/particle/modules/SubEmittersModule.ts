import { Color, MathUtil, Rand, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneDecorators";
import type { ICloneHook } from "../../clone/ICloneHook";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import type { ParticleGenerator } from "../ParticleGenerator";
import type { ParticleRenderer } from "../ParticleRenderer";
import { BirthSubEmitterPlan } from "./BirthSubEmitterPlan";
import { BirthSubEmitterState } from "./BirthSubEmitterState";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { SubEmitter } from "./SubEmitter";

/**
 * Fires sub-emitters on parent particle lifecycle events (Birth / Death).
 * @remarks Requires WebGL2; the module stays inactive on WebGL1.
 */
export class SubEmittersModule extends ParticleGeneratorModule implements ICloneHook<SubEmittersModule> {
  private static _cycleVisited = new Set<ParticleGenerator>();
  private static _cycleStack: ParticleGenerator[] = [];

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

  private _subEmitters: SubEmitter[] = [];

  @ignoreClone
  private _probabilityRand = new Rand(0, ParticleRandomSubSeeds.SubEmitter);

  @ignoreClone
  private _birthStatePool: BirthSubEmitterState[] = [];
  @ignoreClone
  private _birthPlanPool: BirthSubEmitterPlan[] = [];
  @ignoreClone
  private _birthPlanScratch: BirthSubEmitterPlan | null = null;
  @ignoreClone
  private _birthStatesByParticle: Array<Array<BirthSubEmitterState | undefined> | undefined> = [];
  @ignoreClone
  private _particleSequence = 0;

  /**
   * The configured sub-emitters.
   */
  get subEmitters(): readonly SubEmitter[] {
    return this._subEmitters;
  }

  /**
   * Add a sub-emitter slot.
   * @param emitter - Target particle renderer
   * @param type - Trigger event (`Birth` / `Death`)
   * @param inheritProperties - Bitmask of properties inherited from the parent particle
   * @param emitProbability - Per-parent-particle probability [0, 1]
   * @param emitCount - Number of sub particles emitted when the parent dies
   * @returns The created sub-emitter slot.
   */
  addSubEmitter(
    emitter: ParticleRenderer,
    type: ParticleSubEmitterType,
    inheritProperties: ParticleSubEmitterInheritProperty = ParticleSubEmitterInheritProperty.None,
    emitProbability: number = 1,
    emitCount: number = 1
  ): SubEmitter {
    if (!emitter) {
      throw new Error("Sub-emitter target cannot be null");
    }
    this._validateEmitter(emitter);
    const sub = new SubEmitter();
    sub.emitter = emitter;
    sub.type = type;
    sub.inheritProperties = inheritProperties;
    sub.emitProbability = emitProbability;
    sub.emitCount = emitCount;
    sub._module = this;
    this._subEmitters.push(sub);
    sub._resetRandomSeed(this._generator.randomSeed);
    this._notifyTopologyChanged();
    this._generator._setTransformFeedback();
    return sub;
  }

  /**
   * Remove the sub-emitter at the given index.
   * @param index - Index of the sub-emitter to remove
   */
  removeSubEmitterByIndex(index: number): void {
    const removed = this._subEmitters.splice(index, 1)[0];
    if (!removed) return;

    removed._module = null;
    const statesByParticle = this._birthStatesByParticle;
    for (let i = 0, n = statesByParticle.length; i < n; i++) {
      statesByParticle[i]?.splice(index, 1)[0]?.release();
    }
    this._notifyTopologyChanged();
    this._generator._setTransformFeedback();
  }

  override get enabled(): boolean {
    return this._enabled && this._generator._renderer.engine._hardwareRenderer.isWebGL2;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      if (value) this._validateEmitterScenes();
      this._enabled = value;
      this._notifyTopologyChanged();
      this._generator._setTransformFeedback();
    }
  }

  /**
   * @internal
   */
  _dispatchDeath(
    worldPosition: Vector3,
    parentColor: Color,
    parentSize: Vector3,
    parentRotation: Vector3,
    parentWorldVelocity: Vector3,
    eventEngineTime: number
  ): void {
    const subEmitters = this._subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      const sub = subEmitters[i];
      if (sub.type !== ParticleSubEmitterType.Death) continue;

      const emitter = sub.emitter;
      if (!emitter || emitter.destroyed) continue;

      const count = sub.emitCount;
      if (count <= 0) continue;

      if (sub.emitProbability < 1.0 && this._probabilityRand.random() >= sub.emitProbability) {
        continue;
      }

      this._generator._enqueueDeathSubEmitterCommand(
        sub,
        emitter.generator,
        count,
        worldPosition,
        parentColor,
        parentSize,
        parentRotation,
        parentWorldVelocity,
        eventEngineTime
      );
    }
  }

  /**
   * @internal
   */
  _prepareBirthPlansForParticle(
    ringIndex: number,
    bornTime: number,
    lifetime: number,
    frameLastPlayTime: number,
    framePlayTime: number,
    frameLastEngineTime: number,
    frameEngineTime: number,
    plans: BirthSubEmitterPlan[]
  ): void {
    const birthStates = (this._birthStatesByParticle[ringIndex] ??= []);
    const frameStartParentAge = MathUtil.clamp(frameLastPlayTime - bornTime, 0, lifetime);
    const currentParentAge = MathUtil.clamp(framePlayTime - bornTime, 0, lifetime);
    const subEmitters = this._subEmitters;
    const planPool = this._birthPlanPool;
    let parentParticleSequence: number | undefined;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      const subEmitter = subEmitters[i];
      let state = birthStates[i];
      const targetRenderer = subEmitter.emitter;
      if (subEmitter.type !== ParticleSubEmitterType.Birth || !targetRenderer || targetRenderer.destroyed) {
        if (state) {
          state.release();
          birthStates[i] = undefined;
        }
        continue;
      }
      const targetGenerator = targetRenderer.generator;

      if (!state) {
        parentParticleSequence ??= this._particleSequence++;
        const statePool = this._birthStatePool;
        state = statePool.pop() ?? new BirthSubEmitterState(statePool);
        state.retain();
        birthStates[i] = state;
        this._resetBirthSubEmitterState(
          state,
          subEmitter,
          targetGenerator,
          parentParticleSequence,
          frameStartParentAge
        );
      }
      if (!state.shouldEmit) continue;

      let windowStartParentAge = state.lastProcessedParentAge;
      if (!(currentParentAge - windowStartParentAge > MathUtil.zeroTolerance)) {
        continue;
      }
      const skippedFrames = frameStartParentAge - windowStartParentAge > MathUtil.zeroTolerance;
      if (skippedFrames) {
        windowStartParentAge = frameStartParentAge;
      }
      state.lastProcessedParentAge = currentParentAge;

      const main = targetGenerator.main;
      const duration = main.duration;
      let lastEmissionTime = Math.max(windowStartParentAge - state.startDelay, 0);
      let emissionTime = Math.max(currentParentAge - state.startDelay, 0);
      if (!main.isLoop) {
        lastEmissionTime = Math.min(lastEmissionTime, duration);
        emissionTime = Math.min(emissionTime, duration);
      }
      if (!(emissionTime > lastEmissionTime)) continue;

      const emission = targetGenerator.emission;
      const emissionState = state.emissionState;
      if (skippedFrames) {
        emissionState.resyncTimeCursors(lastEmissionTime);
        state.resetDistanceOnNextFeedback = true;
      }
      if (!emission.enabled) {
        emissionState.resyncTimeCursors(emissionTime);
        state.resetDistanceOnNextFeedback = true;
        continue;
      }

      // Time and Burst can be scheduled immediately; distance is completed after trajectory feedback
      const plan = (this._birthPlanScratch ??= planPool.pop() ?? new BirthSubEmitterPlan(planPool));
      const distanceRate = emission._prepareBirthRequests(lastEmissionTime, emissionTime, emissionState, plan);
      const needsDistanceFeedback = distanceRate > 0;
      if (!needsDistanceFeedback && plan.requestCount === 0) {
        state.resetDistanceOnNextFeedback = true;
        continue;
      }

      this._birthPlanScratch = null;
      plan.reset(
        state,
        subEmitter,
        targetGenerator,
        ringIndex,
        lastEmissionTime,
        emissionTime,
        bornTime,
        lifetime,
        frameLastPlayTime,
        framePlayTime,
        frameLastEngineTime,
        frameEngineTime
      );
      plan.distanceRate = distanceRate;
      plan.resetDistanceState = needsDistanceFeedback && state.resetDistanceOnNextFeedback;
      plans.push(plan);
      state.resetDistanceOnNextFeedback = !needsDistanceFeedback;
    }
  }

  /**
   * @internal
   */
  _retireParticle(ringIndex: number): void {
    const birthStates = this._birthStatesByParticle[ringIndex];
    if (!birthStates) return;

    for (let i = 0, n = birthStates.length; i < n; i++) {
      birthStates[i]?.release();
    }
    birthStates.length = 0;
  }

  /**
   * @internal
   */
  _retireAllBirthStates(): void {
    for (let i = 0, n = this._birthStatesByParticle.length; i < n; i++) {
      this._retireParticle(i);
    }
  }

  /**
   * @internal
   */
  _remapBirthStates(
    newParticleCount: number,
    mappings: ReadonlyArray<{ source: number; target: number; count: number }>
  ): void {
    const oldStatesByParticle = this._birthStatesByParticle;
    const newStatesByParticle = new Array<Array<BirthSubEmitterState | undefined> | undefined>(newParticleCount);
    for (let i = 0, n = mappings.length; i < n; i++) {
      const mapping = mappings[i];
      for (let j = 0; j < mapping.count; j++) {
        const sourceIndex = mapping.source + j;
        const birthStates = oldStatesByParticle[sourceIndex];
        if (birthStates) {
          newStatesByParticle[mapping.target + j] = birthStates;
          oldStatesByParticle[sourceIndex] = undefined;
        }
      }
    }
    for (let i = 0, n = oldStatesByParticle.length; i < n; i++) {
      const birthStates = oldStatesByParticle[i];
      if (!birthStates) continue;
      for (let j = 0, m = birthStates.length; j < m; j++) {
        birthStates[j]?.release();
      }
    }
    this._birthStatesByParticle = newStatesByParticle;
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._probabilityRand.reset(seed, ParticleRandomSubSeeds.SubEmitter);
    this._particleSequence = 0;
    const subEmitters = this._subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      subEmitters[i]._resetRandomSeed(seed);
    }
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

  /**
   * @inheritdoc
   */
  _onClone(target: SubEmittersModule): void {
    const subEmitters = target._subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      subEmitters[i]._module = target;
    }
    target._resetRandomSeed(this._generator.randomSeed);
  }

  /**
   * @internal
   */
  _validateEmitter(emitter: ParticleRenderer): void {
    if (!emitter) return;
    if (emitter.destroyed) {
      throw new Error("Sub-emitter target has been destroyed");
    }
    this._validateEmitterScene(emitter);
    if (SubEmittersModule._wouldCreateCycle(emitter, this._generator)) {
      throw new Error("Sub-emitter would create a cycle");
    }
  }

  /**
   * @internal
   */
  _onSlotChanged(slot: SubEmitter): void {
    const slotIndex = this._subEmitters.indexOf(slot);
    const statesByParticle = this._birthStatesByParticle;
    for (let i = 0, n = statesByParticle.length; i < n; i++) {
      const slotStates = statesByParticle[i];
      if (slotStates) {
        slotStates[slotIndex]?.release();
        slotStates[slotIndex] = undefined;
      }
    }
    this._notifyTopologyChanged();
  }

  private _resetBirthSubEmitterState(
    state: BirthSubEmitterState,
    subEmitter: SubEmitter,
    targetGenerator: ParticleGenerator,
    parentParticleSequence: number,
    initialParentAge: number
  ): void {
    const shouldEmit = subEmitter.emitProbability >= 1 || this._probabilityRand.random() < subEmitter.emitProbability;
    // TODO: Use stable per-parent-particle random sampling:
    // 1. Store a persistent random seed in each Birth particle runtime state instead of using parentParticleSequence
    // 2. Derive Start Delay and emission probability through a stateless seed-to-value helper
    const seed = this._generator.randomSeed + parentParticleSequence;
    const main = targetGenerator.main;
    const startDelay = Math.max(0, main.startDelay.evaluate(undefined, main._startDelayRand.random()));
    const initialEmissionTime = Math.max(initialParentAge - startDelay, 0);
    state.reset(
      seed,
      startDelay,
      initialParentAge,
      main.isLoop ? initialEmissionTime : Math.min(initialEmissionTime, main.duration),
      shouldEmit
    );
  }

  private _notifyTopologyChanged(): void {
    const scene = this._generator._renderer.entity.scene;
    scene?._componentsManager._particleSystemManager._markTopologyDirty();
  }

  private _validateEmitterScenes(): void {
    const subEmitters = this._subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      this._validateEmitterScene(subEmitters[i].emitter);
    }
  }

  private _validateEmitterScene(emitter: ParticleRenderer): void {
    if (!emitter || emitter.destroyed) return;
    const sourceScene = this._generator._renderer.entity.scene;
    const targetScene = emitter.entity.scene;
    if (sourceScene && targetScene && sourceScene !== targetScene) {
      throw new Error("Sub-emitter target must belong to the same scene as its parent particle system");
    }
  }
}
