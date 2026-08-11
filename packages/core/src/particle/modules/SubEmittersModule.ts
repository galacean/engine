import { MathUtil, Rand } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneDecorators";
import type { ICloneHook } from "../../clone/ICloneHook";
import type { ElementRangeMapping } from "../../graphic/ElementRangeMapping";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import type { ParticleGenerator } from "../ParticleGenerator";
import type { ParticleRenderer } from "../ParticleRenderer";
import { BirthSubEmitterCommand } from "./BirthSubEmitterCommand";
import { BirthSubEmitterState } from "./BirthSubEmitterState";
import { DeathSubEmitterCommand } from "./DeathSubEmitterCommand";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { SubEmitter } from "./SubEmitter";

/**
 * @internal
 */
export type ParticleSubEmitterCommand = BirthSubEmitterCommand | DeathSubEmitterCommand;

/**
 * Fires sub-emitters on parent particle lifecycle events (Birth / Death).
 * @remarks Requires WebGL2; the module stays inactive on WebGL1. Birth slots evaluate the target's Rate over Time
 * and Burst emission. Rate over Distance is not supported because parent trajectories remain GPU-resident.
 */
export class SubEmittersModule extends ParticleGeneratorModule implements ICloneHook<SubEmittersModule> {
  private static readonly _cycleVisited = new Set<ParticleGenerator>();
  private static readonly _cycleStack: ParticleGenerator[] = [];

  private _subEmitters: SubEmitter[] = [];

  @ignoreClone
  private readonly _probabilityRand = new Rand(0, ParticleRandomSubSeeds.SubEmitter);
  @ignoreClone
  private readonly _startDelayRand = new Rand(0, ParticleRandomSubSeeds.StartDelay);

  @ignoreClone
  private readonly _birthStatePool: BirthSubEmitterState[] = [];
  @ignoreClone
  private readonly _birthCommandPool: BirthSubEmitterCommand[] = [];
  @ignoreClone
  private readonly _deathCommandPool: DeathSubEmitterCommand[] = [];
  @ignoreClone
  private _birthCommandScratch: BirthSubEmitterCommand | null = null;
  @ignoreClone
  private _birthStatesByParticle: Array<Array<BirthSubEmitterState | null | undefined> | undefined> = [];
  @ignoreClone
  private _particleSequence = 0;

  override get enabled(): boolean {
    return this._enabled && this._generator._renderer.engine._hardwareRenderer.isWebGL2;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      if (value) {
        this._validateEmitterScenes();
      }
      this._enabled = value;
      this._notifyTopologyChanged();
    }
  }

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
   * @param deathEmitCount - Number of sub particles emitted when the parent dies
   * @returns The created sub-emitter slot.
   */
  addSubEmitter(
    emitter: ParticleRenderer,
    type: ParticleSubEmitterType,
    inheritProperties: ParticleSubEmitterInheritProperty = ParticleSubEmitterInheritProperty.None,
    emitProbability: number = 1,
    deathEmitCount: number = 1
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
    sub.deathEmitCount = deathEmitCount;
    sub._module = this;
    this._subEmitters.push(sub);
    this._notifyTopologyChanged();
    return sub;
  }

  /**
   * Remove the sub-emitter at the given index.
   * @param index - Index of the sub-emitter to remove
   */
  removeSubEmitterByIndex(index: number): void {
    const removed = this._subEmitters.splice(index, 1)[0];
    if (!removed) {
      return;
    }

    removed._module = null;
    const statesByParticle = this._birthStatesByParticle;
    for (let i = 0, n = statesByParticle.length; i < n; i++) {
      this._recycleBirthState(statesByParticle[i]?.splice(index, 1)[0]);
    }
    this._notifyTopologyChanged();
  }

  /**
   * @internal
   */
  _prepareDeathCommands(ringIndex: number, frameTime: number, trajectoryDuration: number): void {
    const subEmitters = this._subEmitters;
    const commandPool = this._deathCommandPool;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      const sub = subEmitters[i];
      if (sub.type !== ParticleSubEmitterType.Death) {
        continue;
      }

      const emitter = sub.emitter;
      if (!emitter || !this._isTargetInSourceUpdateGraph(emitter)) {
        continue;
      }

      const count = sub.deathEmitCount;
      if (count <= 0) {
        continue;
      }

      if (sub.emitProbability < 1.0 && this._probabilityRand.random() >= sub.emitProbability) {
        continue;
      }

      const command = commandPool.pop() ?? new DeathSubEmitterCommand(this._generator, commandPool);
      command.reset(ringIndex, count, sub.inheritProperties, frameTime, trajectoryDuration);
      emitter.generator._incomingSubEmitterCommands.push(command);
    }
  }

  /**
   * @internal
   */
  _prepareBirthCommandsForParticle(
    ringIndex: number,
    bornTime: number,
    lifetime: number,
    frameLastPlayTime: number,
    framePlayTime: number,
    frameSimulationStart: number
  ): void {
    let birthStates = this._birthStatesByParticle[ringIndex];
    const frameStartParentAge = MathUtil.clamp(frameLastPlayTime - bornTime, 0, lifetime);
    const currentParentAge = MathUtil.clamp(framePlayTime - bornTime, 0, lifetime);
    const hasParentAgeAdvanced = currentParentAge - frameStartParentAge > MathUtil.zeroTolerance;
    const subEmitters = this._subEmitters;
    const commandPool = this._birthCommandPool;
    let parentParticleSequence: number | undefined;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      const subEmitter = subEmitters[i];
      let state = birthStates?.[i];
      const targetRenderer = subEmitter.type === ParticleSubEmitterType.Birth ? subEmitter.emitter : null;
      if (!targetRenderer || !this._isTargetInSourceUpdateGraph(targetRenderer)) {
        if (state !== undefined) {
          this._recycleBirthState(state);
          birthStates![i] = undefined;
        }
        continue;
      }

      if (state === null) {
        continue;
      }
      const targetGenerator = targetRenderer.generator;
      if (state === undefined) {
        birthStates ??= this._birthStatesByParticle[ringIndex] = [];
        parentParticleSequence ??= this._particleSequence++;
        if (subEmitter.emitProbability < 1 && this._probabilityRand.random() >= subEmitter.emitProbability) {
          birthStates[i] = null;
          continue;
        }
        state = this._birthStatePool.pop() ?? new BirthSubEmitterState();
        birthStates[i] = state;
        this._resetBirthSubEmitterState(state, targetGenerator, parentParticleSequence, frameStartParentAge);
      }

      if (!hasParentAgeAdvanced) {
        continue;
      }

      const main = targetGenerator.main;
      const duration = main.duration;
      let lastEmissionTime = Math.max(frameStartParentAge - state.startDelay, 0);
      let emissionTime = Math.max(currentParentAge - state.startDelay, 0);
      if (!main.isLoop) {
        lastEmissionTime = Math.min(lastEmissionTime, duration);
        emissionTime = Math.min(emissionTime, duration);
      }
      if (!(emissionTime > lastEmissionTime)) {
        continue;
      }

      const emission = targetGenerator.emission;
      if (!emission.enabled) {
        state.resyncTimeCursors(emissionTime);
        continue;
      }

      const command = (this._birthCommandScratch ??=
        commandPool.pop() ?? new BirthSubEmitterCommand(this._generator, commandPool));
      emission._prepareBirthTimedRequests(lastEmissionTime, emissionTime, state, command);
      if (command.requestCount === 0) {
        continue;
      }

      this._birthCommandScratch = null;
      command.reset(
        state.startDelay,
        subEmitter.inheritProperties,
        ringIndex,
        bornTime,
        lifetime,
        frameLastPlayTime,
        framePlayTime,
        frameSimulationStart
      );
      command.sortRequests();
      targetGenerator._incomingSubEmitterCommands.push(command);
    }
  }

  /**
   * @internal
   */
  _retireParticle(ringIndex: number): void {
    const birthStates = this._birthStatesByParticle[ringIndex];
    if (!birthStates) {
      return;
    }

    for (let i = 0, n = birthStates.length; i < n; i++) {
      this._recycleBirthState(birthStates[i]);
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
  _remapBirthStates(newParticleCount: number, mappings: ReadonlyArray<ElementRangeMapping>): void {
    const oldStatesByParticle = this._birthStatesByParticle;
    if (oldStatesByParticle.length === 0) {
      return;
    }

    const newStatesByParticle = new Array<Array<BirthSubEmitterState | null | undefined> | undefined>(newParticleCount);
    for (let i = 0, n = mappings.length; i < n; i++) {
      const mapping = mappings[i];
      for (let j = 0; j < mapping.count; j++) {
        const sourceIndex = mapping.sourceStart + j;
        const birthStates = oldStatesByParticle[sourceIndex];
        if (birthStates) {
          newStatesByParticle[mapping.targetStart + j] = birthStates;
          oldStatesByParticle[sourceIndex] = undefined;
        }
      }
    }
    this._retireAllBirthStates();
    this._birthStatesByParticle = newStatesByParticle;
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
  _hasSubEmitterOfType(type: ParticleSubEmitterType, scheduledOnly: boolean): boolean {
    if (!this.enabled) {
      return false;
    }
    const subEmitters = this.subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      const subEmitter = subEmitters[i];
      const emitter = subEmitter.emitter;
      if (
        subEmitter.type === type &&
        emitter &&
        !emitter.destroyed &&
        (!scheduledOnly || this._isTargetInSourceUpdateGraph(emitter))
      ) {
        return true;
      }
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
  }

  /**
   * @internal
   */
  _validateEmitter(emitter: ParticleRenderer): void {
    if (!emitter) {
      return;
    }
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
        this._recycleBirthState(slotStates[slotIndex]);
        slotStates[slotIndex] = undefined;
      }
    }
    this._notifyTopologyChanged();
  }

  private _resetBirthSubEmitterState(
    state: BirthSubEmitterState,
    targetGenerator: ParticleGenerator,
    parentParticleSequence: number,
    initialParentAge: number
  ): void {
    const seed = this._generator.randomSeed + targetGenerator.randomSeed + parentParticleSequence;
    const main = targetGenerator.main;
    const startDelayRand = this._startDelayRand;
    startDelayRand.reset(seed, ParticleRandomSubSeeds.StartDelay);
    const startDelay = Math.max(0, main.startDelay.evaluate(undefined, startDelayRand.random()));
    const initialEmissionTime = Math.max(initialParentAge - startDelay, 0);
    state.reset(seed, startDelay, main.isLoop ? initialEmissionTime : Math.min(initialEmissionTime, main.duration));
  }

  private _recycleBirthState(state: BirthSubEmitterState | null | undefined): void {
    if (state) {
      this._birthStatePool.push(state);
    }
  }

  private _notifyTopologyChanged(): void {
    const scene = this._generator._renderer.entity.scene;
    scene?._componentsManager._particleSystemManager._markTopologyDirty();
    this._generator._setTransformFeedback();
  }

  private _isTargetInSourceUpdateGraph(emitter: ParticleRenderer): boolean {
    const manager = this._generator._renderer._particleSystemManager;
    return manager !== null && emitter._particleSystemManager === manager;
  }

  private _validateEmitterScenes(): void {
    const subEmitters = this._subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      this._validateEmitterScene(subEmitters[i].emitter);
    }
  }

  private _validateEmitterScene(emitter: ParticleRenderer): void {
    if (!emitter || emitter.destroyed) {
      return;
    }
    const sourceScene = this._generator._renderer.entity.scene;
    const targetScene = emitter.entity.scene;
    if (sourceScene && targetScene && sourceScene !== targetScene) {
      throw new Error("Sub-emitter target must belong to the same scene as its parent particle system");
    }
  }

  private static _wouldCreateCycle(target: ParticleRenderer, root: ParticleGenerator): boolean {
    const visited = SubEmittersModule._cycleVisited;
    const stack = SubEmittersModule._cycleStack;
    visited.clear();
    stack.length = 0;
    stack.push(target.generator);

    let found = false;
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === root) {
        found = true;
        break;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      const slots = current.subEmitters.subEmitters;
      for (let i = 0, n = slots.length; i < n; i++) {
        const child = slots[i].emitter?.generator;
        if (child && !visited.has(child)) {
          stack.push(child);
        }
      }
    }

    visited.clear();
    stack.length = 0;
    return found;
  }
}
